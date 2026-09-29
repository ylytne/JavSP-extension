/**
 * 本地管理模块类型定义
 */

export type LocalTabType = "nfo_cleaner" | "poster_recrop";

export interface RecropPosterItem {
  fanart_path: string;
  poster_path: string;
  width: number;
  height: number;
  aspect_ratio: number;
  is_standard_fanza: boolean;
  status: "success" | "skipped" | "error";
  message: string;
  backed_up: boolean;
  backup_path: string | null;
}

export interface RecropPostersResponse {
  status: string;
  directory: string;
  scanned_files: number;
  matched_files: number;
  cropped_files: number;
  skipped_files: number;
  backed_up_files: number;
  error_files: number;
  dry_run: boolean;
  results: RecropPosterItem[];
}

export interface RewriteRule {
  id: string;
  name: string;
  rule_type: "remove_node" | "replace_node" | "replace_text" | "append_node";
  target: string;
  replacement?: string;
  scope?: string;
  enabled: boolean;
}

export interface CleanNfoFileResultItem {
  path: string;
  changed: boolean;
  trailer_removed: number;
  actor_thumb_removed: number;
  art_removed?: number;
  rule_hits?: Record<string, number>;
  error: string | null;
}

export interface CleanNfoResponse {
  status: string;
  directory: string;
  scanned_files: number;
  modified_files: number;
  total_trailer_removed: number;
  total_actor_thumb_removed: number;
  total_art_removed?: number;
  total_rule_hits?: Record<string, number>;
  error_files: number;
  dry_run: boolean;
  results: CleanNfoFileResultItem[];
}

export interface PreviewNfoResponse {
  status: string;
  path: string;
  original: string;
  cleaned: string;
  trailer_removed: number;
  actor_thumb_removed: number;
  art_removed?: number;
  rule_hits?: Record<string, number>;
  changed: boolean;
}
