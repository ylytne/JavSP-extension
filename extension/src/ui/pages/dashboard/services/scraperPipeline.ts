import { ScanMovieItem, MovieInfo, RequestRetryConfig } from "../../../../crawlers/types";
import { JavBusCrawler } from "../../../../crawlers/javbus";
import { JavDBCrawler } from "../../../../crawlers/javdb";
import { AirAVCrawler } from "../../../../crawlers/airav";
import { summarizeMovieResults } from "../../../../crawlers/summarizer";
import { BaseCrawler, SiteBlockedError } from "../../../../crawlers/base";
import { TranslatorConfig, translateMovieInfo } from "../../../../translators";
import { wsService } from "../../../../services/backend-ws";
import { sampleEvenly } from "../../../../utils/sampling";
import { LogEntry } from "../../../components/LogDrawer";
import { CrawlerRuntimeConfig } from "../types";

export interface ScrapePipelineContext {
  item: ScanMovieItem;
  crawlerConfig: CrawlerRuntimeConfig;
  translatorConfig: TranslatorConfig | null;
  scanDir: string;
  addLog: (level: LogEntry["level"], message: string) => void;
  onUpdateTask: (patch: Partial<ScanMovieItem>) => void;
}

/**
 * 根据图片 URL 识别来源站点
 */
export function getSourceLabel(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("javbus")) return "JavBus";
    if (u.hostname.includes("javdb") || u.hostname.includes("jdbstatic")) return "JavDB";
    if (u.hostname.includes("dmm.co.jp")) return "DMM";
    if (u.hostname.includes("arzon")) return "Arzon";
    if (u.hostname.includes("airav")) return "AirAV";
    return u.hostname;
  } catch {
    return "外部源";
  }
}

/**
 * 候选封面多源回退下载
 */
export async function downloadCoversWithFallback(
  candidateUrls: string[],
  dvdid: string,
  retryConfig: RequestRetryConfig,
  addLog: (level: LogEntry["level"], message: string) => void
): Promise<{ coverBase64: string; matchedCoverUrl?: string }> {
  let coverBase64 = "";
  let matchedCoverUrl: string | undefined;

  if (candidateUrls.length === 0) {
    addLog("warn", `[${dvdid}] 元数据中未包含任何封面图片地址，将使用默认无图模式`);
    return { coverBase64: "" };
  }

  addLog("step", `[${dvdid}] 准备下载封面，共发现 ${candidateUrls.length} 个候选图片源`);
  console.groupCollapsed?.(`[JavSP] 封面下载队列: ${dvdid}`);
  console.log("候选封面列表:", candidateUrls);

  for (let i = 0; i < candidateUrls.length; i++) {
    const targetUrl = candidateUrls[i];
    const sourceName = getSourceLabel(targetUrl);
    const progressLabel = `(${i + 1}/${candidateUrls.length})`;

    addLog("step", `[${dvdid}] 正在下载封面 ${progressLabel} [${sourceName}]...`);
    console.log(`[JavSP] 尝试候选 ${progressLabel} [${sourceName}]:`, targetUrl);

    try {
      coverBase64 = await BaseCrawler.fetchImageAsBase64(targetUrl, retryConfig);
      const sizeKb = Math.round((coverBase64.length * 0.75) / 1024);
      addLog("info", `[${dvdid}] 封面下载成功 ${progressLabel} [${sourceName}]: 约 ${sizeKb} KB`);
      console.log(`[JavSP] 封面下载成功:`, targetUrl, `${sizeKb} KB`);
      matchedCoverUrl = targetUrl;
      break;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.warn(`[JavSP] 候选封面下载失败 ${progressLabel} [${sourceName}]:`, targetUrl, err);

      if (i < candidateUrls.length - 1) {
        addLog(
          "warn",
          `[${dvdid}] 候选封面下载失败 ${progressLabel} [${sourceName}]: ${errMsg}，正在尝试下一个备选源...`
        );
      } else {
        addLog("error", `[${dvdid}] 候选封面下载失败 ${progressLabel} [${sourceName}]: ${errMsg}`);
        addLog("warn", `[${dvdid}] 所有候选封面均下载失败，将使用默认无图模式`);
      }
    }
  }
  console.groupEnd?.();

  return { coverBase64, matchedCoverUrl };
}

/**
 * 剧照均匀抽样下载
 */
export async function downloadExtraFanarts(
  previewPics: string[],
  dvdid: string,
  crawlerConfig: CrawlerRuntimeConfig,
  addLog: (level: LogEntry["level"], message: string) => void
): Promise<string[]> {
  const extraFanartsBase64: string[] = [];
  const maxCount = crawlerConfig.extraFanartsMaxCount;
  const totalPics = previewPics.length;
  let targetPics: string[];
  let isSampled = false;

  if (maxCount > 0 && totalPics > maxCount) {
    if (crawlerConfig.extraFanartsUniformSampling) {
      targetPics = sampleEvenly(previewPics, maxCount);
      isSampled = true;
    } else {
      targetPics = previewPics.slice(0, maxCount);
    }
  } else {
    targetPics = previewPics;
  }

  const planMsg = isSampled
    ? `准备下载剧照 (从 ${totalPics} 张中均匀抽样选取 ${targetPics.length} 张)...`
    : `准备下载剧照 (计划下载 ${targetPics.length} 张)...`;
  addLog("step", `[${dvdid}] ${planMsg}`);

  const imageRetryConfig: RequestRetryConfig = {
    maxRetries: 1,
    timeoutMs: (crawlerConfig.extraFanartsTimeout || 8) * 1000,
    baseDelayMs: 1000,
    onRetry: (attempt, max, reason) => {
      addLog(
        "warn",
        `[${dvdid}] 剧照下载遇到网络抖动 (${reason})，正在快速重试 (${attempt}/${max})...`
      );
    },
  };

  for (let pIdx = 0; pIdx < targetPics.length; pIdx++) {
    const pUrl = targetPics[pIdx];
    try {
      const pB64 = await BaseCrawler.fetchImageAsBase64(pUrl, imageRetryConfig);
      extraFanartsBase64.push(pB64);
      addLog("step", `[${dvdid}] 剧照下载成功 (${pIdx + 1}/${targetPics.length})`);
    } catch (pErr: any) {
      addLog(
        "warn",
        `[${dvdid}] 剧照 (${pIdx + 1}/${targetPics.length}) 下载跳过: ${
          pErr?.message || pErr
        }`
      );
    }

    if (crawlerConfig.extraFanartsInterval > 0 && pIdx < targetPics.length - 1) {
      await new Promise((r) =>
        setTimeout(r, crawlerConfig.extraFanartsInterval * 1000)
      );
    }
  }
  addLog(
    "info",
    `[${dvdid}] 剧照下载完成，成功下载 ${extraFanartsBase64.length}/${targetPics.length} 张`
  );

  return extraFanartsBase64;
}

/**
 * 女优头像批量下载
 */
export async function downloadActressAvatars(
  actressPics: Record<string, string>,
  dvdid: string,
  crawlerConfig: CrawlerRuntimeConfig,
  addLog: (level: LogEntry["level"], message: string) => void
): Promise<Record<string, string>> {
  const actressPicsBase64: Record<string, string> = {};
  const actressEntries = Object.entries(actressPics);
  addLog(
    "step",
    `[${dvdid}] 准备下载女优本地头像 (计划下载 ${actressEntries.length} 位)...`
  );

  const avatarRetryConfig: RequestRetryConfig = {
    maxRetries: 1,
    timeoutMs: (crawlerConfig.actressAvatarTimeout || 8) * 1000,
    baseDelayMs: 1000,
    onRetry: (attempt, max, reason) => {
      addLog(
        "warn",
        `[${dvdid}] 女优头像下载遇到网络抖动 (${reason})，正在快速重试 (${attempt}/${max})...`
      );
    },
  };

  for (let aIdx = 0; aIdx < actressEntries.length; aIdx++) {
    const [actName, actUrl] = actressEntries[aIdx];
    if (!actUrl) continue;
    try {
      const aB64 = await BaseCrawler.fetchImageAsBase64(actUrl, avatarRetryConfig);
      actressPicsBase64[actName] = aB64;
      addLog(
        "step",
        `[${dvdid}] 女优头像下载成功: ${actName} (${aIdx + 1}/${actressEntries.length})`
      );
    } catch (aErr: any) {
      addLog(
        "warn",
        `[${dvdid}] 女优头像 (${actName}) 下载跳过: ${aErr?.message || aErr}`
      );
    }

    if (crawlerConfig.actressAvatarInterval > 0 && aIdx < actressEntries.length - 1) {
      await new Promise((r) =>
        setTimeout(r, crawlerConfig.actressAvatarInterval * 1000)
      );
    }
  }

  addLog(
    "info",
    `[${dvdid}] 女优头像下载完成，成功下载 ${Object.keys(actressPicsBase64).length}/${actressEntries.length} 位`
  );

  return actressPicsBase64;
}

/**
 * 单部影片刮削与多媒体处理主流水线
 */
export async function executeScrapePipeline(ctx: ScrapePipelineContext): Promise<void> {
  const { item, crawlerConfig, translatorConfig, scanDir, addLog, onUpdateTask } = ctx;

  if (!item.dvdid) {
    addLog("error", `[${item.taskId.slice(0, 8)}] 无法执行刮削：该视频文件未能推测出有效番号`);
    return;
  }

  onUpdateTask({ status: "scraping", errorMsg: undefined });

  const enabledCrawlers =
    crawlerConfig.crawlers.length > 0 ? crawlerConfig.crawlers : ["javbus", "javdb", "airav"];
  const enabledLabels = enabledCrawlers
    .map((c) =>
      c === "javbus"
        ? "JavBus(物料)"
        : c === "javdb"
        ? "JavDB(分类/评分)"
        : c === "airav"
        ? "AirAV(中文)"
        : c
    )
    .join(" + ");
  addLog("info", `[${item.dvdid}] 启动目标驱动流水线抓取 (${enabledLabels})...`);

  const javbus = new JavBusCrawler();
  const javdb = new JavDBCrawler();
  const airav = new AirAVCrawler();
  const siteResults: Record<string, Partial<MovieInfo>> = {};

  const retryConfig: RequestRetryConfig = {
    maxRetries: crawlerConfig.retry,
    timeoutMs: crawlerConfig.timeout * 1000,
    onRetry: (attempt, maxRetries, reason) => {
      addLog(
        "warn",
        `[${item.dvdid}] 请求出现抖动/超时 (${reason})，正在自动重试 (${attempt}/${maxRetries})...`
      );
    },
  };

  // 阶段 1: JavBus (基石物料：锁定日文原名、高清大封面、整套剧照池及女优头像)
  if (enabledCrawlers.includes("javbus")) {
    try {
      addLog("step", `[${item.dvdid}] [阶段 1: JavBus] 正在抓取基础物料...`);
      const bData = await javbus.scrape(item.dvdid, retryConfig);
      siteResults["javbus"] = bData;
      const picCount = bData.preview_pics?.length || 0;
      addLog(
        "step",
        `[${item.dvdid}] [JavBus] 基础物料抓取成功: 锁定原名 "${bData.title || ""}"` +
          (bData.cover ? "、高清海报" : "") +
          (picCount > 0 ? `、${picCount}张剧照` : "")
      );
    } catch (err: any) {
      if (err instanceof SiteBlockedError) {
        addLog(
          "error",
          `[${item.dvdid}] JavBus 触发反爬阻断 (${err.message})！建议在浏览器新标签页访问 www.javbus.com 完成人机验证`
        );
      } else {
        addLog("warn", `[${item.dvdid}] JavBus 抓取跳过: ${err.message}`);
      }
    }
  }

  // 阶段 2 与阶段 3: 并发请求辅助数据源 (JavDB 规范分类/评分 + AirAV 中文本土化)
  const secondaryTasks: Promise<void>[] = [];

  // 分支 A: JavDB (规范分类体系与社区评分)
  if (enabledCrawlers.includes("javdb")) {
    secondaryTasks.push(
      (async () => {
        try {
          const dData = await javdb.scrape(item.dvdid, retryConfig);
          siteResults["javdb"] = dData;
          addLog(
            "step",
            `[${item.dvdid}] [JavDB] 分类与评分抓取完成: 评分 ${dData.score || "无"}、${
              dData.genre?.length || 0
            }个分类`
          );
        } catch (err: any) {
          if (err instanceof SiteBlockedError) {
            addLog(
              "error",
              `[${item.dvdid}] JavDB 触发反爬阻断 (${err.message})！建议在浏览器新标签页访问 javdb.com 完成人机验证`
            );
          } else {
            addLog("warn", `[${item.dvdid}] JavDB 抓取跳过: ${err.message}`);
          }
        }
      })()
    );
  }

  // 分支 B: AirAV (探测试探人工中文标题与剧情简介)
  if (enabledCrawlers.includes("airav")) {
    secondaryTasks.push(
      (async () => {
        try {
          const aData = await airav.scrape(item.dvdid, retryConfig);
          siteResults["airav"] = aData;
          addLog(
            "step",
            `[${item.dvdid}] [AirAV] 中文本土化抓取完成` +
              (aData.title ? `: "${aData.title}"` : "") +
              (aData.plot ? " (含中文简介)" : "")
          );
        } catch (err: any) {
          if (err instanceof SiteBlockedError) {
            addLog(
              "error",
              `[${item.dvdid}] AirAV 触发反爬阻断 (${err.message})！建议在浏览器新标签页访问 airav.io 完成人机验证`
            );
          } else {
            addLog("warn", `[${item.dvdid}] AirAV 抓取跳过: ${err.message}`);
          }
        }
      })()
    );
  }

  if (secondaryTasks.length > 0) {
    addLog("step", `[${item.dvdid}] [阶段 2 & 3] 正在并发请求辅助数据源 (JavDB / AirAV)...`);
    await Promise.allSettled(secondaryTasks);
  }

  // 阶段 4: 多源目标驱动清洗汇总
  let summarized: MovieInfo;
  try {
    summarized = summarizeMovieResults(siteResults, enabledCrawlers, {
      hardSub: item.hard_sub,
      uncensored: item.uncensored,
      useJavdbCover: crawlerConfig.useJavdbCover,
    });
    addLog("step", `[${item.dvdid}] 数据多源清洗汇总完成: "${summarized.title}"`);
  } catch (err: any) {
    addLog("error", `[${item.dvdid}] 元数据汇总失败: ${err.message}`);
    onUpdateTask({ status: "error", errorMsg: err.message });
    return;
  }

  // 阶段 4.5: 翻译影片标题与剧情简介（若配置启用了翻译引擎）
  if (translatorConfig && translatorConfig.engine) {
    const engineName =
      typeof translatorConfig.engine === "string"
        ? translatorConfig.engine
        : translatorConfig.engine.name;
    addLog("step", `[${item.dvdid}] 启动 ${engineName} 翻译引擎处理元数据...`);
    try {
      await translateMovieInfo(summarized, translatorConfig, (level, msg) => {
        addLog(level, `[${item.dvdid}] ${msg}`);
      });
    } catch (tErr: any) {
      addLog("warn", `[${item.dvdid}] 翻译时出现未捕获异常: ${tErr.message || tErr}`);
    }
  }

  // 若未开启 include_trailer，则剔除抓取到的预告视频链接，阻断外部不稳定 m3u8 流注入
  if (!crawlerConfig.includeTrailer && summarized.preview_video) {
    delete summarized.preview_video;
  }

  // 更新任务状态（暂不暴露外链 cover，避免浏览器 img 标签与 fetch 发起重复请求）
  onUpdateTask({
    status: "organizing",
    scrapedData: { ...summarized, cover: "" },
  });

  // 阶段 5: 下载高清封面并转为 Base64 (多源候选回退机制，确保只下载一次)
  const rawCandidates: string[] = [
    summarized.cover,
    ...(summarized.big_covers || []),
    ...(summarized.covers || []),
  ];
  const candidateUrls = Array.from(new Set(rawCandidates.filter(Boolean)));

  const { coverBase64, matchedCoverUrl } = await downloadCoversWithFallback(
    candidateUrls,
    item.dvdid,
    retryConfig,
    addLog
  );

  if (matchedCoverUrl) {
    summarized.cover = matchedCoverUrl;
  }

  // 封面下载完成：更新任务并注入 Base64 供界面实时预览
  onUpdateTask({
    scrapedData: summarized,
    coverBase64: coverBase64 || undefined,
    status: "organizing",
  });

  // 阶段 6: 剧照 (extra_fanarts) 下载
  let extraFanartsBase64: string[] = [];
  if (
    crawlerConfig.extraFanartsEnabled &&
    summarized.preview_pics &&
    summarized.preview_pics.length > 0
  ) {
    extraFanartsBase64 = await downloadExtraFanarts(
      summarized.preview_pics,
      item.dvdid,
      crawlerConfig,
      addLog
    );
  }

  // 阶段 7: 女优头像本地下载
  let actressPicsBase64: Record<string, string> = {};
  if (
    crawlerConfig.actressAvatarEnabled &&
    summarized.actress_pics &&
    Object.keys(summarized.actress_pics).length > 0
  ) {
    actressPicsBase64 = await downloadActressAvatars(
      summarized.actress_pics,
      item.dvdid,
      crawlerConfig,
      addLog
    );
  }

  // 阶段 8: 提交后端落盘整理
  addLog("step", `[${item.dvdid}] 正在提交至本地后端整理落盘...`);
  wsService.submitOrganization(item.taskId, summarized, coverBase64, {
    files: item.files,
    hardSub: item.hard_sub,
    uncensored: item.uncensored,
    baseOutputDir: scanDir.trim() || undefined,
    extraFanartsBase64,
    actressPicsBase64,
  });
}
