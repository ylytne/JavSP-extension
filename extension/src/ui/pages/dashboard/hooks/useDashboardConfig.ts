import { useState, useEffect, useCallback } from "react";
import { TranslatorConfig } from "../../../../translators";
import { wsService } from "../../../../services/backend-ws";
import { serverConfig } from "../../../../services/serverConfig";
import { LogEntry } from "../../../components/LogDrawer";
import { CrawlerRuntimeConfig, OrganizeMode } from "../types";
import { DEFAULT_DIMENSION_ROUTING } from "../../../../crawlers/dimensionSlots";
import { ResidentTabManager } from "../../../../crawlers/tabBridge";

const DEFAULT_CRAWLER_CONFIG: CrawlerRuntimeConfig = {
  retry: 3,
  timeout: 10,
  sleepAfterScraping: 2.0,
  sleepJitter: 2.0,
  extraFanartsEnabled: true,
  extraFanartsInterval: 0,
  extraFanartsConcurrency: 4,
  extraFanartsMaxCount: 0,
  extraFanartsUniformSampling: true,
  extraFanartsTimeout: 10,
  includeTrailer: false,
  crawlers: ["javbus", "javdb", "airav"],
  useJavdbCover: "fallback",
  dimensionRouting: DEFAULT_DIMENSION_ROUTING,
  burstProtectionEnabled: true,
  burstLimit: 10,
  burstJitter: 2,
  burstCooldown: 60.0,
  burstCooldownJitter: 10.0,
  proxyFree: {},
};

export function useDashboardConfig(addLog: (level: LogEntry["level"], message: string) => void) {
  const [scanDir, setScanDir] = useState<string>("");
  const [outputDir, setOutputDir] = useState<string>("");
  const [organizeMode, setOrganizeMode] = useState<OrganizeMode>("move");
  const [serverAddress, setServerAddress] = useState<string>(serverConfig.getCurrentServerAddress());
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);

  // 网络与文明爬取延时配置（SSOT 动态同步，并保留默认安全值）
  const [crawlerConfig, setCrawlerConfig] = useState<CrawlerRuntimeConfig>(DEFAULT_CRAWLER_CONFIG);

  // 翻译服务配置 (SSOT 同步)
  const [translatorConfig, setTranslatorConfig] = useState<TranslatorConfig | null>(null);

  // 统一应用后端配置至状态
  const applyConfig = useCallback((cfg: any) => {
    if (!cfg) return;
    const inputDir = cfg.scanner?.input_directory ?? cfg.input_directory;
    if (inputDir) {
      setScanDir(inputDir);
    }
    const outDir = cfg.summarizer?.path?.output_directory ?? "";
    if (outDir) {
      setOutputDir(outDir);
    }
    const moveFiles = cfg.summarizer?.move_files !== false && cfg.move_files !== false;
    const hardLink = !!(cfg.summarizer?.path?.hard_link || cfg.hard_link);
    if (hardLink) {
      setOrganizeMode("hard_link");
    } else if (!moveFiles) {
      setOrganizeMode("inplace");
    } else {
      setOrganizeMode("move");
    }
    if (cfg.translator) {
      setTranslatorConfig(cfg.translator);
    }
    const net = cfg.network || {};
    const crw = cfg.crawler || {};
    const extra = cfg.summarizer?.extra_fanarts || cfg.extra_fanarts || {};
    const nfoCfg = cfg.summarizer?.nfo || cfg.nfo || {};
    const coverCfg = cfg.summarizer?.cover || cfg.cover || {};

    if (net.proxy_free) {
      for (const [siteId, rawUrl] of Object.entries(net.proxy_free)) {
        if (rawUrl && typeof rawUrl === "string" && rawUrl.trim()) {
          const trimmed = rawUrl.trim();
          const full = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
          ResidentTabManager.getInstance().setSiteBaseUrl(siteId, full.replace(/\/+$/, ""));
        }
      }
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        chrome.runtime
          .sendMessage({
            action: "UPDATE_NET_RULES",
            proxy_free: net.proxy_free,
          })
          .catch(() => {});
      }
    }

    setCrawlerConfig((prev) => ({
      ...prev,
      retry: net.retry ?? prev.retry,
      timeout: net.timeout ?? prev.timeout,
      sleepAfterScraping: crw.sleep_after_scraping ?? prev.sleepAfterScraping,
      sleepJitter: crw.sleep_jitter ?? prev.sleepJitter,
      extraFanartsEnabled: typeof extra.enabled === "boolean" ? extra.enabled : prev.extraFanartsEnabled,
      extraFanartsInterval: extra.scrap_interval ?? prev.extraFanartsInterval,
      extraFanartsConcurrency:
        typeof extra.concurrency === "number" ? extra.concurrency : prev.extraFanartsConcurrency,
      extraFanartsMaxCount: typeof extra.max_count === "number" ? extra.max_count : prev.extraFanartsMaxCount,
      extraFanartsUniformSampling: typeof extra.uniform_sampling === "boolean" ? extra.uniform_sampling : prev.extraFanartsUniformSampling,
      extraFanartsTimeout: typeof extra.timeout === "number" ? extra.timeout : prev.extraFanartsTimeout,
      includeTrailer: typeof nfoCfg.include_trailer === "boolean" ? nfoCfg.include_trailer : prev.includeTrailer,
      crawlers: Array.isArray(cfg.crawlers) && cfg.crawlers.length > 0 ? cfg.crawlers : prev.crawlers,
      useJavdbCover: (coverCfg.use_javdb_cover === "never" ? "never" : "fallback") as "fallback" | "never",
      dimensionRouting:
        cfg.dimension_routing ?? prev.dimensionRouting ?? DEFAULT_DIMENSION_ROUTING,
      burstProtectionEnabled:
        typeof crw.burst_protection_enabled === "boolean"
          ? crw.burst_protection_enabled
          : prev.burstProtectionEnabled,
      burstLimit: typeof crw.burst_limit === "number" ? crw.burst_limit : prev.burstLimit,
      burstJitter: typeof crw.burst_jitter === "number" ? crw.burst_jitter : prev.burstJitter,
      burstCooldown:
        typeof crw.burst_cooldown === "number" ? crw.burst_cooldown : prev.burstCooldown,
      burstCooldownJitter:
        typeof crw.burst_cooldown_jitter === "number"
          ? crw.burst_cooldown_jitter
          : prev.burstCooldownJitter,
      proxyFree: net.proxy_free ?? prev.proxyFree ?? {},
    }));
  }, []);

  // 监听服务器地址变更
  useEffect(() => {
    serverConfig.getServerAddress().then((addr) => setServerAddress(addr));
    const unsub = serverConfig.onServerAddressChange((addr) => setServerAddress(addr));
    return () => unsub();
  }, []);

  // 初始化拉取默认配置路径及爬虫/网络保护/翻译参数
  useEffect(() => {
    const fetchAppConfig = () => {
      const baseUrl = serverConfig.getHttpBaseUrl();
      fetch(`${baseUrl}/api/config`, {
        headers: serverConfig.getAuthHeaders(),
      })
        .then((res) => res.json())
        .then((cfg) => {
          applyConfig(cfg);
        })
        .catch(() => {});
    };

    fetchAppConfig();

    const unsub = serverConfig.onServerAddressChange(() => {
      fetchAppConfig();
    });

    return () => unsub();
  }, [applyConfig]);

  // 监听后端 WebSocket 配置热更新
  useEffect(() => {
    const unsubConfigUpdated = wsService.on("CONFIG_UPDATED", (data) => {
      if (data && data.config) {
        applyConfig(data.config);
        addLog("info", "检测到后端配置在线更新，已自动同步最新运行参数");
      }
    });

    return () => {
      unsubConfigUpdated();
    };
  }, [applyConfig, addLog]);

  // 同步输出目录与整理模式至后端持久化配置
  const saveOrganizeSettings = useCallback(
    async (newMode: OrganizeMode, newOutputDir: string) => {
      try {
        const baseUrl = serverConfig.getHttpBaseUrl();
        const authHeaders = serverConfig.getAuthHeaders();
        const currentResp = await fetch(`${baseUrl}/api/config`, { headers: authHeaders });
        if (!currentResp.ok) return;
        const cfg = await currentResp.json();

        if (!cfg.summarizer) cfg.summarizer = {};
        if (!cfg.summarizer.path) cfg.summarizer.path = {};

        cfg.summarizer.path.output_directory = newOutputDir.trim() || null;
        if (newMode === "move") {
          cfg.summarizer.move_files = true;
          cfg.summarizer.path.hard_link = false;
        } else if (newMode === "hard_link") {
          cfg.summarizer.move_files = true;
          cfg.summarizer.path.hard_link = true;
        } else if (newMode === "inplace") {
          cfg.summarizer.move_files = false;
          cfg.summarizer.path.hard_link = false;
        }

        const putResp = await fetch(`${baseUrl}/api/config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(cfg),
        });
        if (putResp.ok) {
          addLog(
            "info",
            `文件整理设置已热生效: 模式=${
              newMode === "move" ? "移动归档" : newMode === "hard_link" ? "硬链接" : "原地生成"
            }，输出目录=${newOutputDir.trim() || "同扫描目录"}`
          );
        }
      } catch (e: any) {
        console.warn("[JavSP] 同步整理设置失败:", e);
      }
    },
    [addLog]
  );

  return {
    serverAddress,
    setServerAddress,
    isServerModalOpen,
    setIsServerModalOpen,
    scanDir,
    setScanDir,
    outputDir,
    setOutputDir,
    organizeMode,
    setOrganizeMode,
    saveOrganizeSettings,
    crawlerConfig,
    translatorConfig,
    applyConfig,
  };
}
