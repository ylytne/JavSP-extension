/**
 * JavSP 数据契约与核心类型定义
 */

export interface MovieInfo {
  dvdid: string;               // DVD ID (如 IPX-177)
  cid?: string;                // DMM Content ID
  url: string;                 // 详情页来源 URL
  title: string;               // 影片标题（已剔除番号与尾部女优名）
  ori_title?: string;          // 原始标题
  title_break?: string[];      // 译文标题断句列表（用于路径智能截断）
  ori_title_break?: string[];  // 原文标题断句列表
  title_translated?: boolean;  // 标题是否已执行过翻译
  plot?: string;               // 剧情简介
  ori_plot?: string;           // 原始剧情简介
  plot_translated?: boolean;   // 剧情简介是否已执行过翻译
  cover: string;               // 主封面图 URL
  big_cover?: string;          // 高清大图 URL (若有)
  covers: string[];            // 候选封面列表
  big_covers: string[];        // 候选高清大图列表
  score?: string;              // 10分制评分字符串 (如 "8.40")
  publish_date?: string;       // 发行日期 (YYYY-MM-DD)
  duration?: string;           // 时长 (纯数字字符串，如 "120")
  director?: string;           // 导演
  producer?: string;           // 制作商 / 片商
  publisher?: string;          // 发行商
  serial?: string;             // 系列名
  genre: string[];             // 分类标签列表
  genre_id?: string[];         // 站点原始分类 ID
  actress: string[];           // 出演女优列表
  actress_pics?: Record<string, string>; // 女优头像映射表
  preview_pics: string[];      // 剧照预览图 URL 列表
  preview_video?: string;      // 预告视频 URL
  uncensored?: boolean;        // 是否无码
  magnet?: string[];           // 磁力链接列表
}

export interface ScanMovieItem {
  taskId: string;           // 任务唯一 UUID
  dvdid: string;            // 识别出的番号 (如 IPX-177)
  cid?: string;             // 若为 DMM 内容 ID
  files: string[];          // 本地关联的绝对路径列表 (支持分片 CD1, CD2)
  data_src: "normal" | "fc2" | "cid"; // 影片分类
  hard_sub: boolean;        // 是否有内嵌字幕 (-C)
  uncensored: boolean;      // 是否为无码流出 (-U)
  status: "pending" | "scraping" | "organizing" | "completed" | "error";
  errorMsg?: string;
  scrapedData?: MovieInfo;
  coverBase64?: string; // 本地内存缓存的 Base64 封面数据，避免前端重复请求远程图
  finalPath?: string;
}

export interface RequestRetryConfig {
  maxRetries?: number;      // 最大重试次数（默认 3）
  timeoutMs?: number;       // 单次超时时间毫秒数（默认 10000）
  baseDelayMs?: number;     // 重试退避基准毫秒数（默认 1000）
  onRetry?: (attempt: number, maxRetries: number, reason: string) => void; // 重试时的通知回调
}

export interface ICrawler {
  name: string;
  scrape(dvdid: string, config?: RequestRetryConfig): Promise<Partial<MovieInfo>>;
}

export type WsEvent =
  | "SCAN_START"
  | "SCAN_PROGRESS"
  | "SCAN_RESULT"
  | "ORGANIZATION_SUBMIT"
  | "STEP_PROGRESS"
  | "TASK_FINISHED"
  | "CONFIG_UPDATED"
  | "PING"
  | "PONG"
  | "AUTH_ERROR";

export interface WsMessage<T = any> {
  event: WsEvent | string;
  taskId?: string;
  data: T;
}
