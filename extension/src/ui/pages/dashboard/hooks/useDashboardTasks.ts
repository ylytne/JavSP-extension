import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ScanMovieItem } from "../../../../crawlers/types";
import { wsService } from "../../../../services/backend-ws";
import { serverConfig } from "../../../../services/serverConfig";
import { TranslatorConfig } from "../../../../translators";
import { LogEntry } from "../../../components/LogDrawer";
import { CrawlerRuntimeConfig, ScanProgress, StatusFilter } from "../types";
import { executeScrapePipeline } from "../services/scraperPipeline";
import {
  calculateNextBurstTarget,
  calculateBurstCooldown,
  interruptibleSleep,
} from "../services/burstProtection";

export interface UseDashboardTasksOptions {
  scanDir: string;
  crawlerConfig: CrawlerRuntimeConfig;
  translatorConfig: TranslatorConfig | null;
  addLog: (level: LogEntry["level"], message: string) => void;
  onProcessingChange?: (processing: boolean) => void;
}

export function useDashboardTasks({
  scanDir,
  crawlerConfig,
  translatorConfig,
  addLog,
  onProcessingChange,
}: UseDashboardTasksOptions) {
  const [tasks, setTasks] = useState<ScanMovieItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const batchCancelRef = useRef(false);

  // 状态变动时通知上层组件以支持防误关保护
  useEffect(() => {
    onProcessingChange?.(isScanning || isBatchRunning);
  }, [isScanning, isBatchRunning, onProcessingChange]);

  // 注册 WebSocket 事件监听器
  useEffect(() => {
    const unsubAuthError = wsService.on("AUTH_ERROR", (data) => {
      addLog("error", `[鉴权失败] ${data.message}`);
    });

    const unsubProgress = wsService.on("SCAN_PROGRESS", (data) => {
      setScanProgress({ current: data.current, scanned_files: data.scanned_files });
    });

    const unsubResult = wsService.on("SCAN_RESULT", (data) => {
      setIsScanning(false);
      setScanProgress(null);
      if (data.error) {
        addLog("error", `扫描失败: ${data.error}`);
        return;
      }
      const movies: ScanMovieItem[] = data.movies || [];
      setTasks(movies);
      addLog("info", `扫描完成，共发现 ${movies.length} 部待整理影片`);
    });

    const unsubStep = wsService.on("STEP_PROGRESS", (data, taskId) => {
      addLog("step", `[${taskId?.slice(0, 8)}] ${data.step}: ${data.message}`);
    });

    const unsubFinished = wsService.on("TASK_FINISHED", (data, taskId) => {
      const id = taskId || data.taskId;
      setTasks((prev) =>
        prev.map((t) => {
          if (t.taskId === id) {
            const finalPath = data.finalPath || undefined;
            // 整理成功后，封面切换为本地后端流式服务，实现本地持久化回显
            const localCoverUrl =
              data.success && finalPath
                ? serverConfig.getImageUrl(finalPath)
                : t.scrapedData?.cover;

            return {
              ...t,
              status: data.success ? "completed" : "error",
              finalPath,
              errorMsg: data.error || undefined,
              // 立即释放内存中常驻的巨型 Base64 字符串，实现大批量任务 O(1) 内存占用
              coverBase64: undefined,
              scrapedData: t.scrapedData
                ? {
                    ...t.scrapedData,
                    cover: localCoverUrl || t.scrapedData.cover,
                  }
                : undefined,
            };
          }
          return t;
        })
      );

      if (data.success) {
        addLog("info", `[${id?.slice(0, 8)}] 整理完成! 保存至: ${data.finalPath}`);
      } else {
        addLog("error", `[${id?.slice(0, 8)}] 整理失败: ${data.error}`);
      }
    });

    return () => {
      unsubAuthError();
      unsubProgress();
      unsubResult();
      unsubStep();
      unsubFinished();
    };
  }, [addLog]);

  // 触发扫描
  const handleStartScan = useCallback(() => {
    if (!scanDir.trim()) {
      addLog("warn", "请先输入待扫描的文件夹绝对路径");
      return;
    }
    setIsScanning(true);
    setScanProgress({ current: 0, scanned_files: 0 });
    addLog("info", `开始扫描目录: ${scanDir}`);
    wsService.scanStart(scanDir.trim());
  }, [scanDir, addLog]);

  // 单部影片抓取并整理流程
  const handleScrapeSingle = useCallback(
    async (item: ScanMovieItem) => {
      const updateCurrentTask = (patch: Partial<ScanMovieItem>) => {
        setTasks((prev) =>
          prev.map((t) => (t.taskId === item.taskId ? { ...t, ...patch } : t))
        );
      };

      await executeScrapePipeline({
        item,
        crawlerConfig,
        translatorConfig,
        scanDir,
        addLog,
        onUpdateTask: updateCurrentTask,
      });
    },
    [crawlerConfig, translatorConfig, scanDir, addLog]
  );

  // 手动修改更正番号
  const handleUpdateDvdid = useCallback(
    (taskId: string, newDvdid: string) => {
      let cleanId = newDvdid.trim().toUpperCase();
      if (!cleanId) return;

      // 智能识别并提取 -C / -U / -UC 特征后缀
      let hardSubUpdate: boolean | undefined;
      let uncensoredUpdate: boolean | undefined;
      if (/[-_]UC$/i.test(cleanId)) {
        hardSubUpdate = true;
        uncensoredUpdate = true;
        cleanId = cleanId.replace(/[-_]UC$/i, "").trim();
      } else if (/[-_]C$/i.test(cleanId)) {
        hardSubUpdate = true;
        cleanId = cleanId.replace(/[-_]C$/i, "").trim();
      } else if (/[-_]U$/i.test(cleanId)) {
        uncensoredUpdate = true;
        cleanId = cleanId.replace(/[-_]U$/i, "").trim();
      }

      // 自动补齐缺失的分隔符 (如 IPX177 -> IPX-177)
      if (/^([A-Z]{2,10})(\d{2,5})$/.test(cleanId)) {
        cleanId = `${RegExp.$1}-${RegExp.$2}`;
      }

      setTasks((prev) =>
        prev.map((t) => {
          if (t.taskId === taskId) {
            let newSrc: "normal" | "fc2" | "cid" = "normal";
            if (/^FC2-?\d{5,7}$/i.test(cleanId)) {
              newSrc = "fc2";
            } else if (/^[a-z\d_]{7,25}$/i.test(cleanId) && !/-/.test(cleanId)) {
              newSrc = "cid";
            } else {
              newSrc = "normal";
            }

            return {
              ...t,
              dvdid: cleanId,
              data_src: newSrc,
              hard_sub: hardSubUpdate !== undefined ? hardSubUpdate : t.hard_sub,
              uncensored: uncensoredUpdate !== undefined ? uncensoredUpdate : t.uncensored,
              status: "pending",
              errorMsg: undefined,
              scrapedData: undefined,
              coverBase64: undefined,
              finalPath: undefined,
            };
          }
          return t;
        })
      );
      addLog("info", `[${taskId.slice(0, 8)}] 手动更正番号为: ${cleanId}，已重置为待刮削状态`);
    },
    [addLog]
  );

  // 批量执行
  const handleBatchStart = useCallback(async () => {
    const pendingTasks = tasks.filter(
      (t) => (t.status === "pending" || t.status === "error") && Boolean(t.dvdid)
    );
    if (pendingTasks.length === 0) {
      addLog("info", "当前无待处理或失败任务");
      return;
    }

    setIsBatchRunning(true);
    batchCancelRef.current = false;
    addLog("info", `开始批量处理，共有 ${pendingTasks.length} 部影片入队`);

    let processedCountInCurrentBurst = 0;
    let currentBurstTarget = calculateNextBurstTarget(
      crawlerConfig.burstLimit,
      crawlerConfig.burstJitter
    );

    for (let i = 0; i < pendingTasks.length; i++) {
      if (batchCancelRef.current) {
        addLog("warn", "批量处理已被用户手动中止");
        break;
      }
      const task = pendingTasks[i];
      await handleScrapeSingle(task);
      processedCountInCurrentBurst++;

      // 非最后一项且未中止时，执行等待控制
      if (i < pendingTasks.length - 1 && !batchCancelRef.current) {
        // 检查是否触发大批量请求冷却防风控保护
        if (
          crawlerConfig.burstProtectionEnabled &&
          processedCountInCurrentBurst >= currentBurstTarget
        ) {
          const cooldownSec = calculateBurstCooldown(
            crawlerConfig.burstCooldown,
            crawlerConfig.burstCooldownJitter
          );
          addLog(
            "warn",
            `[大批量防爬保护] 已连续处理 ${processedCountInCurrentBurst} 部影片 (达到本批次上限 ${currentBurstTarget} 部)，系统将休眠冷却 ${cooldownSec.toFixed(1)} 秒以规避站点风控阻断...`
          );

          const completed = await interruptibleSleep(cooldownSec * 1000, batchCancelRef);
          if (!completed || batchCancelRef.current) {
            addLog("warn", "批量处理已被用户手动中止");
            break;
          }

          addLog("info", `[大批量防爬保护] 冷却休眠结束，继续按正常节奏恢复抓取`);
          processedCountInCurrentBurst = 0;
          currentBurstTarget = calculateNextBurstTarget(
            crawlerConfig.burstLimit,
            crawlerConfig.burstJitter
          );
        } else {
          // 基础文明爬取延时
          const waitSec =
            crawlerConfig.sleepAfterScraping + Math.random() * crawlerConfig.sleepJitter;
          addLog(
            "step",
            `等待 ${waitSec.toFixed(1)} 秒后开始处理下一部影片（基础 ${crawlerConfig.sleepAfterScraping}s + 随机浮动）...`
          );
          const completed = await interruptibleSleep(waitSec * 1000, batchCancelRef);
          if (!completed || batchCancelRef.current) {
            addLog("warn", "批量处理已被用户手动中止");
            break;
          }
        }
      }
    }

    setIsBatchRunning(false);
    addLog("info", "批量处理队列已全部执行完毕");
  }, [
    tasks,
    handleScrapeSingle,
    crawlerConfig.burstProtectionEnabled,
    crawlerConfig.burstLimit,
    crawlerConfig.burstJitter,
    crawlerConfig.burstCooldown,
    crawlerConfig.burstCooldownJitter,
    crawlerConfig.sleepAfterScraping,
    crawlerConfig.sleepJitter,
    addLog,
  ]);

  const handleBatchStop = useCallback(() => {
    batchCancelRef.current = true;
    setIsBatchRunning(false);
  }, []);

  // 统计数据
  const counts = useMemo(
    () => ({
      pending: tasks.filter((t) => t.status === "pending").length,
      running: tasks.filter((t) => t.status === "scraping" || t.status === "organizing").length,
      completed: tasks.filter((t) => t.status === "completed").length,
      error: tasks.filter((t) => t.status === "error").length,
    }),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return t.status === "pending";
      if (statusFilter === "completed") return t.status === "completed";
      if (statusFilter === "error") return t.status === "error";
      return true;
    });
  }, [tasks, statusFilter]);

  return {
    tasks,
    setTasks,
    isScanning,
    scanProgress,
    isBatchRunning,
    statusFilter,
    setStatusFilter,
    counts,
    filteredTasks,
    handleStartScan,
    handleScrapeSingle,
    handleUpdateDvdid,
    handleBatchStart,
    handleBatchStop,
  };
}
