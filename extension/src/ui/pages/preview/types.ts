/**
 * 刮削测试与预览数据类型契约
 */

import { MovieInfo } from "../../../crawlers/types";

export type SiteScrapeStatus = "success" | "error" | "blocked" | "skipped";

export interface SiteScrapeResult {
  site: string;
  siteLabel: string;
  status: SiteScrapeStatus;
  durationMs: number;
  data?: Partial<MovieInfo>;
  errorMsg?: string;
}

export interface SimulatedLandingData {
  targetDir: string;
  relFolder: string;
  baseName: string;
  videoFilename: string;
  nfoFilename: string;
  nfoContent: string;
  posterFilename: string;
  fanartFilename: string;
  extrafanartsFiles: string[];
  cleanedDict: Record<string, string>;
  croppedPosterBase64?: string;
  genreNorm?: string[];
  normalizedActresses?: string[];
}

export interface ScrapePreviewReport {
  dvdid: string;
  durationMs: number;
  siteResults: Record<string, SiteScrapeResult>;
  summarized: MovieInfo;
  coverBase64?: string;
  sampleFanartBase64?: string;
  sampleFanartUrl?: string;
  landingData: SimulatedLandingData;
}

export interface ScrapePreviewOptions {
  dvdid: string;
  hardSub?: boolean;
  uncensored?: boolean;
  testFilename?: string;
  baseOutputDir?: string;
}
