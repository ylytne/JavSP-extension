import { LogEntry } from "../../components/LogDrawer";

export interface CrawlerRuntimeConfig {
  retry: number;
  timeout: number;
  sleepAfterScraping: number;
  sleepJitter: number;
  extraFanartsEnabled: boolean;
  extraFanartsInterval: number;
  extraFanartsMaxCount: number;
  extraFanartsUniformSampling: boolean;
  extraFanartsTimeout: number;
  actressAvatarEnabled: boolean;
  actressAvatarInterval: number;
  actressAvatarTimeout: number;
  includeTrailer: boolean;
  crawlers: string[];
  useJavdbCover: "fallback" | "never";
  burstProtectionEnabled: boolean;
  burstLimit: number;
  burstJitter: number;
  burstCooldown: number;
  burstCooldownJitter: number;
}

export type StatusFilter = "all" | "pending" | "completed" | "error";

export interface ScanProgress {
  current: number;
  scanned_files: number;
}

export interface DashboardProps {
  wsState: "disconnected" | "connecting" | "connected";
  addLog: (level: LogEntry["level"], message: string) => void;
  onProcessingChange?: (processing: boolean) => void;
}

export const CRAWLER_SITE_INFO: Record<string, { name: string; url: string }> = {
  airav: { name: "AirAV", url: "https://airav.io" },
  javdb: { name: "JavDB", url: "https://javdb.com" },
  javbus: { name: "JavBus", url: "https://javbus.com" },
};
