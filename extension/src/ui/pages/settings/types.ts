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
}

export interface CrawlerConfig {
  sleep_after_scraping: number;
  sleep_jitter: number;
  tab_bridge_hosts?: string[];
}

export interface SummarizerPathConfig {
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
  actress_thumb_mode?: "none" | "local";
  include_trailer?: boolean;
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
}

export interface SummarizerActressAvatarConfig {
  enabled: boolean;
  scrap_interval: number | string;
  timeout: number;
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
  actress_avatar?: SummarizerActressAvatarConfig;
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
  summarizer: SummarizerConfig;
  translator: TranslatorConfig;
  server: ServerProcessConfig;
  is_docker?: boolean;
}

export interface SettingsProps {
  wsState: "disconnected" | "connecting" | "connected";
}

export type TabType = "scanner" | "network" | "summarizer" | "media" | "translator" | "server";

export interface TestConnectionResult {
  success: boolean;
  latency: number;
  version?: string;
  is_docker?: boolean;
  error?: string;
}
