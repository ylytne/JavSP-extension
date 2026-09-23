import React, { useState, useEffect, useCallback } from "react";
import {
  ExternalLink,
  Wifi,
  WifiOff,
  Film,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FolderSync,
  Sparkles,
  Server,
  AlertCircle,
} from "lucide-react";
import { wsService } from "../services/backend-ws";
import { serverConfig } from "../services/serverConfig";
import { LogDrawer, LogEntry } from "./components/LogDrawer";
import { ProgressBar } from "./components/ProgressBar";
import { ServerConnectionModal } from "./components/ServerConnectionModal";

interface RecentTask {
  taskId: string;
  dvdid: string;
  time: string;
  success: boolean;
  finalPath?: string;
  error?: string;
}

export const SidepanelApp: React.FC = () => {
  const [wsState, setWsState] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [serverAddress, setServerAddress] = useState<string>(serverConfig.getCurrentServerAddress());
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // 监控状态
  const [currentScan, setCurrentScan] = useState<{ scanned: number; found: number } | null>(null);
  const [activeTask, setActiveTask] = useState<{
    taskId: string;
    dvdid?: string;
    step: string;
    message: string;
  } | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
  });
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);

  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [
      ...prev.slice(-150),
      { id: Math.random().toString(36).substring(2, 9), time, level, message },
    ]);
  }, []);

  // 打开全功能工作台
  const handleOpenWorkbench = () => {
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: "OPEN_WORKBENCH" }, (res) => {
        if (chrome.runtime.lastError || !res?.success) {
          // 回退方式
          if (chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: chrome.runtime.getURL("workbench.html") });
          }
        }
      });
    } else {
      window.open("workbench.html", "_blank");
    }
  };

  useEffect(() => {
    serverConfig.getServerAddress().then((addr) => setServerAddress(addr));
    const unsubAddr = serverConfig.onServerAddressChange((addr) => setServerAddress(addr));

    const unsubState = wsService.onStateChange((state) => {
      setWsState(state);
      if (state === "connected") {
        addLog("info", `已连接服务网关 ${serverConfig.getCurrentServerAddress()}`);
      } else if (state === "connecting") {
        addLog("info", `正在尝试连接服务网关 (${serverConfig.getCurrentServerAddress()})...`);
      } else {
        addLog("warn", "与服务网关连接断开");
      }
    });

    const unsubScanProgress = wsService.on("SCAN_PROGRESS", (data) => {
      setCurrentScan({ scanned: data.scanned_files, found: data.current });
      addLog("step", `扫描目录中: 已遍历 ${data.scanned_files} 文件，发现 ${data.current} 部待整理`);
    });

    const unsubScanResult = wsService.on("SCAN_RESULT", (data) => {
      setCurrentScan(null);
      if (data.movies) {
        setStats({
          total: data.movies.length,
          completed: 0,
          failed: 0,
        });
        addLog("info", `扫描完成，发现 ${data.movies.length} 部影片`);
      }
    });

    const unsubStep = wsService.on("STEP_PROGRESS", (data, taskId) => {
      const id = taskId || data.taskId || "unknown";
      setActiveTask({
        taskId: id,
        step: data.step,
        message: data.message,
      });
      addLog("step", `[${id.slice(0, 8)}] ${data.step}: ${data.message}`);
    });

    const unsubFinished = wsService.on("TASK_FINISHED", (data, taskId) => {
      const id = taskId || data.taskId || "unknown";
      setActiveTask(null);

      const success = !!data.success;
      setStats((prev) => ({
        ...prev,
        completed: success ? prev.completed + 1 : prev.completed,
        failed: !success ? prev.failed + 1 : prev.failed,
      }));

      const record: RecentTask = {
        taskId: id,
        dvdid: data.dvdid || id.slice(0, 8),
        time: new Date().toLocaleTimeString(),
        success,
        finalPath: data.finalPath,
        error: data.error,
      };

      setRecentTasks((prev) => [record, ...prev.slice(0, 9)]);

      if (success) {
        addLog("info", `[${record.dvdid}] 归档成功 -> ${data.finalPath || "已落盘"}`);
      } else {
        addLog("error", `[${record.dvdid}] 整理失败: ${data.error || "未知异常"}`);
      }
    });

    wsService.connect();

    return () => {
      unsubState();
      unsubAddr();
      unsubScanProgress();
      unsubScanResult();
      unsubStep();
      unsubFinished();
      wsService.disconnect();
    };
  }, [addLog]);

  const progressPercent =
    stats.total > 0
      ? Math.min(100, Math.round(((stats.completed + stats.failed) / stats.total) * 100))
      : 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 select-none">
      {/* 顶部主导航栏 */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-3.5 py-2 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-xs">
            J
          </div>
          <div>
            <h1 className="text-xs font-bold text-slate-800 leading-tight">
              JavSP 侧边栏监控
            </h1>
          </div>
        </div>

        {/* 连接状态指示（可点击直接配置后端） */}
        <button
          type="button"
          onClick={() => setIsServerModalOpen(true)}
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium transition cursor-pointer hover:opacity-85 shadow-2xs ${
            wsState === "connected"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : wsState === "connecting"
              ? "bg-amber-50 text-amber-700 border border-amber-200"
              : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}
          title="点击配置后端连接地址"
        >
          {wsState === "connected" ? (
            <>
              <Wifi size={11} className="text-emerald-600" />
              <span>在线</span>
            </>
          ) : (
            <>
              <WifiOff size={11} className="text-rose-500" />
              <span>{wsState === "connecting" ? "连接中" : "离线(点击配置)"}</span>
            </>
          )}
        </button>
      </header>

      {/* 主视图区域 */}
      <main className="flex-1 p-3 space-y-3 overflow-y-auto">
        {/* 离线时醒目的快速配置引导条 */}
        {wsState !== "connected" && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <AlertCircle size={15} className="text-rose-600 shrink-0" />
              <div className="truncate text-[11px] leading-tight">
                <div className="font-bold">服务未连接</div>
                <div className="text-rose-600 truncate">目标: {serverAddress}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsServerModalOpen(true)}
              className="text-[11px] bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 font-bold px-2.5 py-1 rounded-lg shrink-0 cursor-pointer shadow-2xs transition"
            >
              配置 NAS 地址
            </button>
          </div>
        )}

        {/* 核心工作台入口大卡片 */}
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-xl p-4 text-white shadow-md relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 opacity-10 pointer-events-none">
            <Sparkles size={120} />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-200 uppercase tracking-wider mb-1">
              <Sparkles size={13} />
              全功能大屏空间
            </div>
            <h2 className="text-base font-bold mb-1 leading-snug">
              JavSP 刮削与整理工作台
            </h2>
            <p className="text-xs text-indigo-100/80 mb-3 leading-relaxed">
              侧边栏专用于状态监控。批量刮削、海报大图预览、手动番号修改及完整配置中心请在独立标签页中操作。
            </p>
            <button
              onClick={handleOpenWorkbench}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-white text-indigo-700 font-bold text-xs rounded-lg shadow-sm hover:bg-indigo-50 active:scale-[0.98] transition cursor-pointer"
            >
              <span>🚀 打开全功能工作台</span>
              <ExternalLink size={13} />
            </button>
          </div>
        </div>

        {/* 状态统计卡片 */}
        <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              <Film size={14} className="text-indigo-600" />
              任务执行进度
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {stats.completed + stats.failed} / {stats.total} 部
            </span>
          </div>

          <ProgressBar
            current={stats.completed + stats.failed}
            total={stats.total}
            label={stats.total > 0 ? "整理任务整体进度" : "等待任务"}
          />

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-400 font-medium">总发现</div>
              <div className="text-sm font-bold text-slate-800">{stats.total}</div>
            </div>
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-2 text-center">
              <div className="text-[10px] text-emerald-600 font-medium">已完成</div>
              <div className="text-sm font-bold text-emerald-700">{stats.completed}</div>
            </div>
            <div className="bg-rose-50/60 border border-rose-100 rounded-lg p-2 text-center">
              <div className="text-[10px] text-rose-600 font-medium">异常/失败</div>
              <div className="text-sm font-bold text-rose-700">{stats.failed}</div>
            </div>
          </div>
        </div>

        {/* 当前活跃执行中状态 */}
        {currentScan ? (
          <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-900 flex items-center gap-2.5 shadow-xs">
            <Loader2 size={16} className="text-indigo-600 animate-spin shrink-0" />
            <div>
              <div className="font-semibold">正在遍历磁盘目录...</div>
              <div className="text-[11px] text-indigo-600">
                已扫描 {currentScan.scanned} 个文件，命中 {currentScan.found} 部
              </div>
            </div>
          </div>
        ) : activeTask ? (
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 shadow-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center gap-1.5 text-amber-800">
                <Loader2 size={13} className="text-amber-600 animate-spin" />
                正在落盘整理:
              </span>
              <span className="font-mono text-[10px] bg-amber-200/60 text-amber-900 px-1.5 py-0.5 rounded">
                {activeTask.step}
              </span>
            </div>
            <div className="text-[11px] text-amber-800 line-clamp-2">
              {activeTask.message}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-xs flex items-center gap-2.5 text-xs text-slate-500">
            <Clock size={14} className="text-slate-400" />
            <span>当前无运行中任务，请在工作台发起扫描</span>
          </div>
        )}

        {/* 最近整理动态 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
            <span>最近整理动态</span>
            <span className="text-[10px] font-normal text-slate-400">
              最新 10 条
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {recentTasks.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                暂无整理历史
              </div>
            ) : (
              recentTasks.map((t, idx) => (
                <div
                  key={`${t.taskId}-${idx}`}
                  className="px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    {t.success ? (
                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle size={13} className="text-rose-500 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-800 truncate font-mono text-[11px]">
                      {t.dvdid}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                    {t.time}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 底部环境提示卡片 */}
        <div className="p-2.5 rounded-lg bg-slate-200/50 border border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono truncate mr-2">
            <Server size={12} className="text-slate-400 shrink-0" />
            <span className="truncate">网关: {serverAddress}</span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsServerModalOpen(true)}
              className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
            >
              修改
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={() => wsService.send("PING", { time: Date.now() })}
              className="text-slate-600 hover:text-slate-800 font-medium cursor-pointer"
            >
              心跳
            </button>
          </div>
        </div>
      </main>

      {/* 底部折叠日志抽屉 */}
      <LogDrawer logs={logs} onClear={() => setLogs([])} />

      {/* 后端服务连接配置弹窗 */}
      <ServerConnectionModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onSaved={(newAddr) => {
          setServerAddress(newAddr);
          wsService.reconnect();
        }}
      />
    </div>
  );
};

export default SidepanelApp;
