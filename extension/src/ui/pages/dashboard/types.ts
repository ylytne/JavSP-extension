import { LogEntry } from "../../components/LogDrawer";
import { DimensionRoutingConfig } from "../../../crawlers/dimensionSlots";

export interface CrawlerRuntimeConfig {
  retry: number;
  timeout: number;
  sleepAfterScraping: number;
  sleepJitter: number;
  extraFanartsEnabled: boolean;
  extraFanartsInterval: number;
  extraFanartsConcurrency: number;
  extraFanartsMaxCount: number;
  extraFanartsUniformSampling: boolean;
  extraFanartsTimeout: number;
  includeTrailer: boolean;
  crawlers: string[];
  useJavdbCover: "fallback" | "never";
  dimensionRouting?: DimensionRoutingConfig;
  burstProtectionEnabled: boolean;
  burstLimit: number;
  burstJitter: number;
  burstCooldown: number;
  burstCooldownJitter: number;
  proxyFree: Record<string, string>;
}

export type StatusFilter = "all" | "pending" | "completed" | "error";

export type OrganizeMode = "move" | "hard_link" | "inplace";

export interface ScanProgress {
  current: number;
  scanned_files: number;
}

export interface DashboardProps {
  wsState: "disconnected" | "connecting" | "connected";
  addLog: (level: LogEntry["level"], message: string) => void;
  onProcessingChange?: (processing: boolean) => void;
  onNavigateTab?: (tab: "dashboard" | "local" | "settings" | "preview") => void;
}

export const CRAWLER_SITE_INFO: Record<string, { name: string; url: string }> = {
  airav: { name: "AirAV", url: "https://airav.io" },
  javdb: { name: "JavDB", url: "https://javdb.com" },
  javbus: { name: "JavBus", url: "https://www.javbus.com" },
};

export function getCrawlerSiteInfo(
  siteId: string,
  proxyFree?: Record<string, string>
): { name: string; url: string } {
  const def = CRAWLER_SITE_INFO[siteId] || { name: siteId, url: "" };
  const custom = proxyFree?.[siteId];
  if (!custom || !custom.trim()) {
    return def;
  }
  let trimmed = custom.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return {
    name: def.name,
    url: trimmed.replace(/\/+$/, ""),
  };
}
