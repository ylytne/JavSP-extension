/**
 * 刮削测试核心服务：真实环境多源抓取、翻译、单张剧照采样及后端模拟落盘
 */

import { MovieInfo, RequestRetryConfig } from "../../../../crawlers/types";
import { BaseCrawler, SiteBlockedError } from "../../../../crawlers/base";
import { JavBusCrawler } from "../../../../crawlers/javbus";
import { JavDBCrawler } from "../../../../crawlers/javdb";
import { AirAVCrawler } from "../../../../crawlers/airav";
import { summarizeMovieResults } from "../../../../crawlers/summarizer";
import { translateMovieInfo, TranslatorConfig } from "../../../../translators";
import { downloadCoversWithFallback } from "../../dashboard/services/scraperPipeline";
import { serverConfig } from "../../../../services/serverConfig";
import { LogEntry } from "../../../components/LogDrawer";
import { CrawlerRuntimeConfig } from "../../dashboard/types";
import {
  ScrapePreviewOptions,
  ScrapePreviewReport,
  SimulatedLandingData,
  SiteScrapeResult,
} from "../types";

export async function executeScrapePreview(
  options: ScrapePreviewOptions,
  crawlerConfig: CrawlerRuntimeConfig,
  translatorConfig: TranslatorConfig | null,
  addLog: (level: LogEntry["level"], message: string) => void,
  signal?: AbortSignal
): Promise<ScrapePreviewReport> {
  const totalStart = performance.now();
  const dvdid = (options.dvdid || "").trim().toUpperCase();

  if (!dvdid) {
    throw new Error("请输入有效的测试番号 (如 IPX-177, SSIS-001)");
  }

  addLog("info", `========== 启动刮削测试流水线: ${dvdid} ==========`);

  const retryConfig: RequestRetryConfig = {
    maxRetries: crawlerConfig.retry,
    timeoutMs: crawlerConfig.timeout * 1000,
    onRetry: (attempt, maxRetries, reason) => {
      addLog("warn", `[${dvdid}] 网络请求抖动 (${reason})，正在重试 (${attempt}/${maxRetries})...`);
    },
  };

  const enabledCrawlers =
    crawlerConfig.crawlers && crawlerConfig.crawlers.length > 0
      ? crawlerConfig.crawlers
      : ["javbus", "javdb", "airav"];
  const siteResults: Record<string, SiteScrapeResult> = {};
  const siteData: Record<string, Partial<MovieInfo>> = {};

  // 1. JavBus 抓取
  if (enabledCrawlers.includes("javbus")) {
    const t0 = performance.now();
    try {
      addLog("step", `[${dvdid}] [1/3: JavBus] 正在抓取基础物料...`);
      const busCrawler = new JavBusCrawler(crawlerConfig.proxyFree?.javbus);
      const bData = await busCrawler.scrape(dvdid, retryConfig);
      const dur = Math.round(performance.now() - t0);
      siteData["javbus"] = bData;
      siteResults["javbus"] = {
        site: "javbus",
        siteLabel: "JavBus",
        status: "success",
        durationMs: dur,
        data: bData,
      };
      const picCount = bData.preview_pics?.length || 0;
      addLog(
        "info",
        `[${dvdid}] [JavBus] 抓取完成 (${dur}ms): 锁定原名 "${bData.title || ""}"` +
          (bData.cover ? "、封面" : "") +
          (picCount > 0 ? `、${picCount}张剧照` : "")
      );
    } catch (err: any) {
      const dur = Math.round(performance.now() - t0);
      const isBlocked = err instanceof SiteBlockedError;
      const errMsg = err?.message || String(err);
      siteResults["javbus"] = {
        site: "javbus",
        siteLabel: "JavBus",
        status: isBlocked ? "blocked" : "error",
        durationMs: dur,
        errorMsg: errMsg,
      };
      addLog(isBlocked ? "error" : "warn", `[${dvdid}] [JavBus] 抓取失败 (${dur}ms): ${errMsg}`);
    }
  } else {
    siteResults["javbus"] = {
      site: "javbus",
      siteLabel: "JavBus",
      status: "skipped",
      durationMs: 0,
      errorMsg: "已在设置中禁用此站点",
    };
  }

  // 2 & 3. JavDB 与 AirAV 并发辅助抓取
  const secondaryTasks: Promise<void>[] = [];

  if (enabledCrawlers.includes("javdb")) {
    secondaryTasks.push(
      (async () => {
        const t0 = performance.now();
        try {
          addLog("step", `[${dvdid}] [2/3: JavDB] 正在抓取分类与评分...`);
          const dbCrawler = new JavDBCrawler(crawlerConfig.proxyFree?.javdb);
          const dData = await dbCrawler.scrape(dvdid, retryConfig);
          const dur = Math.round(performance.now() - t0);
          siteData["javdb"] = dData;
          siteResults["javdb"] = {
            site: "javdb",
            siteLabel: "JavDB",
            status: "success",
            durationMs: dur,
            data: dData,
          };
          addLog("info", `[${dvdid}] [JavDB] 抓取完成 (${dur}ms): 评分 ${dData.score || "无"}、${dData.genre?.length || 0}个分类`);
        } catch (err: any) {
          const dur = Math.round(performance.now() - t0);
          const isBlocked = err instanceof SiteBlockedError;
          const errMsg = err?.message || String(err);
          siteResults["javdb"] = {
            site: "javdb",
            siteLabel: "JavDB",
            status: isBlocked ? "blocked" : "error",
            durationMs: dur,
            errorMsg: errMsg,
          };
          addLog(isBlocked ? "error" : "warn", `[${dvdid}] [JavDB] 抓取失败 (${dur}ms): ${errMsg}`);
        }
      })()
    );
  } else {
    siteResults["javdb"] = {
      site: "javdb",
      siteLabel: "JavDB",
      status: "skipped",
      durationMs: 0,
      errorMsg: "已在设置中禁用此站点",
    };
  }

  if (enabledCrawlers.includes("airav")) {
    secondaryTasks.push(
      (async () => {
        const t0 = performance.now();
        try {
          addLog("step", `[${dvdid}] [3/3: AirAV] 正在探测中文本土化标题与剧情简介...`);
          const airavCrawler = new AirAVCrawler(crawlerConfig.proxyFree?.airav);
          const aData = await airavCrawler.scrape(dvdid, retryConfig);
          const dur = Math.round(performance.now() - t0);
          siteData["airav"] = aData;
          siteResults["airav"] = {
            site: "airav",
            siteLabel: "AirAV",
            status: "success",
            durationMs: dur,
            data: aData,
          };
          addLog(
            "info",
            `[${dvdid}] [AirAV] 抓取完成 (${dur}ms)` +
              (aData.title ? `: "${aData.title}"` : "") +
              (aData.plot ? " (含中文简介)" : "")
          );
        } catch (err: any) {
          const dur = Math.round(performance.now() - t0);
          const isBlocked = err instanceof SiteBlockedError;
          const errMsg = err?.message || String(err);
          siteResults["airav"] = {
            site: "airav",
            siteLabel: "AirAV",
            status: isBlocked ? "blocked" : "error",
            durationMs: dur,
            errorMsg: errMsg,
          };
          addLog(isBlocked ? "error" : "warn", `[${dvdid}] [AirAV] 抓取跳过 (${dur}ms): ${errMsg}`);
        }
      })()
    );
  } else {
    siteResults["airav"] = {
      site: "airav",
      siteLabel: "AirAV",
      status: "skipped",
      durationMs: 0,
      errorMsg: "已在设置中禁用此站点",
    };
  }

  if (secondaryTasks.length > 0) {
    await Promise.allSettled(secondaryTasks);
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  if (Object.keys(siteData).length === 0) {
    throw new Error(`所有启用的站点均未能成功返回【${dvdid}】的数据，请检查番号是否正确或站点是否被阻断`);
  }

  // 4. 多源数据合并与清洗
  addLog("step", `[${dvdid}] 正在执行目标驱动多源清洗与优先级仲裁...`);
  const summarized = summarizeMovieResults(siteData, enabledCrawlers, {
    hardSub: options.hardSub,
    uncensored: options.uncensored,
    useJavdbCover: crawlerConfig.useJavdbCover,
  });

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // 5. 翻译处理 (若启用)
  if (translatorConfig && translatorConfig.engine) {
    const engineName =
      typeof translatorConfig.engine === "string"
        ? translatorConfig.engine
        : translatorConfig.engine.name;
    addLog("step", `[${dvdid}] 启动 ${engineName} 翻译引擎处理标题与简介...`);
    try {
      await translateMovieInfo(summarized, translatorConfig, (level, msg) => {
        addLog(level, `[${dvdid}] ${msg}`);
      });
    } catch (tErr: any) {
      addLog("warn", `[${dvdid}] 翻译时发生异常: ${tErr.message || tErr}`);
    }
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // 预告片策略
  if (!crawlerConfig.includeTrailer && summarized.preview_video) {
    delete summarized.preview_video;
  }

  // 6. 封面下载为 Base64
  const rawCandidates: string[] = [
    summarized.cover,
    ...(summarized.big_covers || []),
    ...(summarized.covers || []),
  ];
  const candidateUrls = Array.from(new Set(rawCandidates.filter(Boolean)));
  const { coverBase64 } = await downloadCoversWithFallback(
    candidateUrls,
    dvdid,
    retryConfig,
    addLog,
    crawlerConfig.proxyFree
  );

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // 7. 剧照测试单张采样：若当前开启了 extra_fanarts 且存在剧照列表，严格只抓取 1 张作为测试验证
  let sampleFanartBase64: string | undefined;
  let sampleFanartUrl: string | undefined;

  if (crawlerConfig.extraFanartsEnabled && summarized.preview_pics && summarized.preview_pics.length > 0) {
    sampleFanartUrl = summarized.preview_pics[0];
    addLog("step", `[${dvdid}] [剧照测试模式] 严格仅下载第 1 张剧照样本以验证图片通道...`);
    try {
      sampleFanartBase64 = await BaseCrawler.fetchImageAsBase64(sampleFanartUrl, {
        maxRetries: 2,
        baseDelayMs: 1000,
        timeoutMs: (crawlerConfig.extraFanartsTimeout || 10) * 1000,
        onRetry: (attempt, max, reason) => {
          addLog("warn", `[${dvdid}] 剧照下载遇到网络抖动 (${reason})，正在重试 (${attempt}/${max})...`);
        },
      });
      const fanartSizeKb = Math.round((sampleFanartBase64.length * 0.75) / 1024);
      addLog("info", `[${dvdid}] [剧照测试模式] 成功获取剧照样本 (1/1): 约 ${fanartSizeKb} KB`);
    } catch (err: any) {
      addLog("warn", `[${dvdid}] [剧照测试模式] 测试剧照下载跳过: ${err?.message || err}`);
    }
  } else if (!crawlerConfig.extraFanartsEnabled) {
    addLog("info", `[${dvdid}] [剧照测试模式] 当前设置已停用剧照下载，跳过剧照抓取`);
  } else {
    addLog("info", `[${dvdid}] [剧照测试模式] 数据源未提供剧照预览图，跳过剧照抓取`);
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  // 8. 调用 Python 后端进行纯内存模拟落盘与海报角标合成
  addLog("step", `[${dvdid}] 正在请求 Python 后端 (/api/organize/preview) 计算目录树与生成 NFO XML...`);
  const httpBaseUrl = serverConfig.getHttpBaseUrl();
  const authHeaders = serverConfig.getAuthHeaders();

  const previewPayload = {
    metadata: summarized,
    cover_base64: coverBase64 || undefined,
    hard_sub: !!options.hardSub,
    uncensored: !!options.uncensored,
    base_output_dir: options.baseOutputDir,
    test_filename: options.testFilename || `${dvdid}.mp4`,
    has_sample_fanart: !!sampleFanartBase64,
  };

  const resp = await fetch(`${httpBaseUrl}/api/organize/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(previewPayload),
    signal,
  });

  if (!resp.ok) {
    let errDetail = "";
    try {
      const errJson = await resp.json();
      errDetail = errJson.detail || JSON.stringify(errJson);
    } catch {
      errDetail = await resp.text();
    }
    throw new Error(`后端模拟整理请求失败 (${resp.status}): ${errDetail || resp.statusText}`);
  }

  const rawLanding = await resp.json();
  const landingData: SimulatedLandingData = {
    targetDir: rawLanding.target_dir,
    relFolder: rawLanding.rel_folder,
    baseName: rawLanding.base_name,
    videoFilename: rawLanding.video_filename,
    nfoFilename: rawLanding.nfo_filename,
    nfoContent: rawLanding.nfo_content,
    posterFilename: rawLanding.poster_filename,
    fanartFilename: rawLanding.fanart_filename,
    extrafanartsFiles: rawLanding.extrafanarts_files || [],
    cleanedDict: rawLanding.cleaned_dict || {},
    croppedPosterBase64: rawLanding.cropped_poster_base64,
    genreNorm: rawLanding.genre_norm || [],
    normalizedActresses: rawLanding.normalized_actresses || [],
  };

  // 同步后端规范化清洗后的分类与女优回写至 summarized
  if (rawLanding.genre_norm && rawLanding.genre_norm.length > 0) {
    summarized.genre_norm = rawLanding.genre_norm;
  }
  if (rawLanding.normalized_actresses && rawLanding.normalized_actresses.length > 0) {
    summarized.actress = rawLanding.normalized_actresses;
  }

  const totalDurationMs = Math.round(performance.now() - totalStart);
  addLog("info", `========== 刮削测试完成！耗时: ${totalDurationMs}ms ==========`);

  return {
    dvdid,
    durationMs: totalDurationMs,
    siteResults,
    summarized,
    coverBase64: coverBase64 || undefined,
    sampleFanartBase64,
    sampleFanartUrl,
    landingData,
  };
}
