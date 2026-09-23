import { useState, useEffect, useCallback } from "react";
import { initTabBridgeHosts } from "../../../../crawlers/base";
import { TranslatorConfig } from "../../../../translators";
import { wsService } from "../../../../services/backend-ws";
import { serverConfig } from "../../../../services/serverConfig";
import { LogEntry } from "../../../components/LogDrawer";
import { CrawlerRuntimeConfig } from "../types";

const DEFAULT_CRAWLER_CONFIG: CrawlerRuntimeConfig = {
  retry: 3,
  timeout: 10,
  sleepAfterScraping: 2.0,
  sleepJitter: 2.0,
  extraFanartsEnabled: true,
  extraFanartsInterval: 0.5,
  extraFanartsMaxCount: 0,
  extraFanartsUniformSampling: true,
  extraFanartsTimeout: 10,
  actressAvatarEnabled: true,
  actressAvatarInterval: 0.5,
  actressAvatarTimeout: 10,
  includeTrailer: false,
  crawlers: ["javbus", "javdb", "airav"],
  useJavdbCover: "fallback",
  burstProtectionEnabled: true,
  burstLimit: 10,
  burstJitter: 2,
  burstCooldown: 60.0,
  burstCooldownJitter: 10.0,
};

export function useDashboardConfig(addLog: (level: LogEntry["level"], message: string) => void) {
  const [scanDir, setScanDir] = useState<string>("");
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
    if (cfg.translator) {
      setTranslatorConfig(cfg.translator);
    }
    const net = cfg.network || {};
    const crw = cfg.crawler || {};
    const extra = cfg.summarizer?.extra_fanarts || cfg.extra_fanarts || {};
    const actressAvatar = cfg.summarizer?.actress_avatar || cfg.actress_avatar || {};
    const nfoCfg = cfg.summarizer?.nfo || cfg.nfo || {};
    const coverCfg = cfg.summarizer?.cover || cfg.cover || {};

    if (crw.tab_bridge_hosts && Array.isArray(crw.tab_bridge_hosts)) {
      initTabBridgeHosts(crw.tab_bridge_hosts);
    }

    setCrawlerConfig((prev) => ({
      ...prev,
      retry: net.retry ?? prev.retry,
      timeout: net.timeout ?? prev.timeout,
      sleepAfterScraping: crw.sleep_after_scraping ?? prev.sleepAfterScraping,
      sleepJitter: crw.sleep_jitter ?? prev.sleepJitter,
      extraFanartsEnabled: typeof extra.enabled === "boolean" ? extra.enabled : prev.extraFanartsEnabled,
      extraFanartsInterval: extra.scrap_interval ?? prev.extraFanartsInterval,
      extraFanartsMaxCount: typeof extra.max_count === "number" ? extra.max_count : prev.extraFanartsMaxCount,
      extraFanartsUniformSampling: typeof extra.uniform_sampling === "boolean" ? extra.uniform_sampling : prev.extraFanartsUniformSampling,
      extraFanartsTimeout: typeof extra.timeout === "number" ? extra.timeout : prev.extraFanartsTimeout,
      actressAvatarEnabled: typeof actressAvatar.enabled === "boolean" ? actressAvatar.enabled : prev.actressAvatarEnabled,
      actressAvatarInterval: actressAvatar.scrap_interval ?? prev.actressAvatarInterval,
      actressAvatarTimeout: typeof actressAvatar.timeout === "number" ? actressAvatar.timeout : prev.actressAvatarTimeout,
      includeTrailer: typeof nfoCfg.include_trailer === "boolean" ? nfoCfg.include_trailer : prev.includeTrailer,
      crawlers: Array.isArray(cfg.crawlers) && cfg.crawlers.length > 0 ? cfg.crawlers : prev.crawlers,
      useJavdbCover: (coverCfg.use_javdb_cover === "never" ? "never" : "fallback") as "fallback" | "never",
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

  return {
    serverAddress,
    setServerAddress,
    isServerModalOpen,
    setIsServerModalOpen,
    scanDir,
    setScanDir,
    crawlerConfig,
    translatorConfig,
    applyConfig,
  };
}
