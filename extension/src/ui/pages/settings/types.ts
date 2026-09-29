import { DimensionRoutingConfig } from "../../../crawlers/dimensionSlots";

export interface ScannerConfig {
  ignored_id_pattern: string[];
  input_directory: string | null;
  filename_extensions: string[];
  ignored_folder_name_pattern: string[];
  minimum_size: string | number;
  skip_nfo_dir: boolean;
}

export interface NetworkConfig {
  retry: number;
  timeout: number;
  proxy_free?: Record<string, string>;
}

export interface CrawlerConfig {
  sleep_after_scraping: number;
  sleep_jitter: number;
  burst_protection_enabled?: boolean;
  burst_limit?: number;
  burst_jitter?: number;
  burst_cooldown?: number;
  burst_cooldown_jitter?: number;
}

export interface SummarizerPathConfig {
  output_directory?: string | null;
  output_folder_pattern: string;
  basename_pattern: string;
  length_maximum: number;
  length_by_byte: boolean;
  max_actress_count: number;
  hard_link: boolean;
}

export interface SummarizerTitleConfig {
  remove_trailing_actor_name: boolean;
}

export interface SummarizerDefaultConfig {
  title: string;
  actress: string;
  series: string;
  director: string;
  producer: string;
  publisher: string;
}

export interface SummarizerNfoConfig {
  basename_pattern: string;
  title_pattern: string;
  custom_genres_fields: string[];
  custom_tags_fields: string[];
  serial_as_tag_and_genre?: boolean;
  include_trailer?: boolean;
  clean_plot?: boolean;
  clean_plot_num?: boolean;
  plot_clean_patterns?: string[];
}

export interface SummarizerCoverCropConfig {
  ratio: number;
  engine: string | null;
  standard_fanza_crop?: boolean;
}

export interface SummarizerCoverConfig {
  basename_pattern: string;
  add_label: boolean;
  use_javdb_cover?: "fallback" | "never";
  crop: SummarizerCoverCropConfig;
}

export interface SummarizerFanartConfig {
  basename_pattern: string;
}

export interface SummarizerExtraFanartsConfig {
  enabled: boolean;
  scrap_interval: number | string;
  timeout: number;
  max_count: number;
  uniform_sampling: boolean;
  concurrency?: number;
}

export interface SummarizerSubtitleConfig {
  enabled: boolean;
  auto_c_suffix?: boolean;
  filename_extensions?: string[];
}

export interface SummarizerConfig {
  move_files: boolean;
  path: SummarizerPathConfig;
  title: SummarizerTitleConfig;
  default: SummarizerDefaultConfig;
  nfo: SummarizerNfoConfig;
  censor_options_representation: string[];
  cover: SummarizerCoverConfig;
  fanart: SummarizerFanartConfig;
  extra_fanarts: SummarizerExtraFanartsConfig;
  subtitle?: SummarizerSubtitleConfig;
}

export interface TranslatorFieldsConfig {
  title: boolean;
  plot: boolean;
}

export interface TranslatorConfig {
  target_lang?: string;
  engine: any;
  fields: TranslatorFieldsConfig;
}

export interface ServerProcessConfig {
  host: string;
  port: number;
  token?: string;
}

export interface FullAppConfig {
  scanner: ScannerConfig;
  network: NetworkConfig;
  crawler: CrawlerConfig;
  crawlers: string[];
  dimension_routing?: DimensionRoutingConfig;
  summarizer: SummarizerConfig;
  translator: TranslatorConfig;
  server: ServerProcessConfig;
  is_docker?: boolean;
}

export interface SettingsProps {
  wsState: "disconnected" | "connecting" | "connected";
}

export type TabType =
  | "scanner"
  | "network"
  | "summarizer"
  | "media"
  | "nfo"
  | "translator"
  | "server"
  | "about";

export type BackendRunMode = "source" | "binary" | "docker" | "unknown";

export interface TestConnectionResult {
  success: boolean;
  latency: number;
  version?: string;
  is_docker?: boolean;
  run_mode?: BackendRunMode;
  platform?: string;
  arch?: string;
  min_extension_version?: string;
  error?: string;
}

export interface BackendUpgradeGuide {
  type: "command" | "download" | "docker";
  title: string;
  description: string;
  actionText?: string;
  copyCommand?: string;
  downloadUrl?: string;
}

export interface ComponentUpdateStatus {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
  downloadUrl?: string;
  isCritical?: boolean;
  securityWarning?: string | null;
}

export interface UpdateCheckResult {
  success: boolean;
  checkedAt: number;
  fromCache: boolean;
  tag: string;
  releaseUrl: string;
  extension: ComponentUpdateStatus;
  backend: ComponentUpdateStatus & {
    runMode: BackendRunMode;
    platform: string;
    arch: string;
    upgradeGuide: BackendUpgradeGuide;
  };
  compatibility: {
    isCompatible: boolean;
    warningMessage?: string;
  };
  error?: string;
}

