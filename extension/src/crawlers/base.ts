/**
 * 爬虫基类与通用工具
 */

import { ICrawler, MovieInfo, RequestRetryConfig } from "./types";

export class CrawlerError extends Error {
  constructor(public crawler: string, message: string) {
    super(`[${crawler}] ${message}`);
    this.name = "CrawlerError";
  }
}

export class MovieNotFoundError extends CrawlerError {
  constructor(crawler: string, dvdid: string) {
    super(crawler, `未找到番号对应影片: ${dvdid}`);
    this.name = "MovieNotFoundError";
  }
}

export class SiteBlockedError extends CrawlerError {
  constructor(crawler: string, message: string) {
    super(crawler, `触发反爬虫或访问受限: ${message}`);
    this.name = "SiteBlockedError";
  }
}
export class TimeoutError extends CrawlerError {
  constructor(crawler: string, message: string) {
    super(crawler, `网络请求超时: ${message}`);
    this.name = "TimeoutError";
  }
}

/**
 * 带有超时中断与智能退避重试的高可靠网络请求器
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  config: RequestRetryConfig = {},
  crawlerName = "Network"
): Promise<Response> {
  const maxRetries = config.maxRetries ?? 3;
  const timeoutMs = config.timeoutMs ?? 10000;
  const baseDelayMs = config.baseDelayMs ?? 1000;

  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);

      // 404: 目标未收录，快速失败，绝不重复重试
      if (response.status === 404) {
        throw new MovieNotFoundError(crawlerName, url);
      }

      // 403 / 503: 反爬拦截或访问受限，快速失败
      if (response.status === 403 || response.status === 503) {
        throw new SiteBlockedError(crawlerName, `HTTP ${response.status}`);
      }

      // 429: 限流，属于可重试的频率限制
      if (response.status === 429) {
        throw new CrawlerError(crawlerName, `HTTP 429 (Too Many Requests 请求过于频繁)`);
      }

      if (!response.ok) {
        throw new CrawlerError(crawlerName, `HTTP 异常: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (err: any) {
      clearTimeout(timer);

      // 判定错误类型
      let currentError: any = err;
      let errorReason = err?.message || String(err);

      if (err?.name === "AbortError") {
        errorReason = `单次请求超过 ${timeoutMs / 1000} 秒未响应`;
        currentError = new TimeoutError(crawlerName, errorReason);
      }

      // 关键：MovieNotFoundError 与 SiteBlockedError 快速失败，不作无意义重试
      if (
        currentError instanceof MovieNotFoundError ||
        currentError instanceof SiteBlockedError
      ) {
        throw currentError;
      }

      lastError = currentError;

      // 如果未达到最大尝试次数，执行退避等待后进入下一次尝试
      if (attempt < maxRetries) {
        config.onRetry?.(attempt, maxRetries, errorReason);
        // 指数退避 + 随机微扰动
        const backoffDelay =
          Math.min(baseDelayMs * Math.pow(1.5, attempt - 1), 6000) + Math.random() * 300;
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError;
}

/**
 * 解码 HTML 实体转义字符（如 &amp;, &quot;, &#39;, &lt;, &gt; 等）
 */
export function unescapeHtml(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

import {
  fetchDocumentViaTab,
  fetchImageViaTab,
  ResidentTabManager,
} from "./tabBridge";
export {
  fetchDocumentViaTab,
  fetchImageViaTab,
  ResidentTabManager,
};

export * from "./dvdid";
export * from "./proxyfree";
import {
  cleanMovieInfoTitle,
  extractActorVariants,
  removeTrailingActorName,
  cleanActressName,
} from "./summarizer";

export {
  cleanMovieInfoTitle,
  extractActorVariants,
  removeTrailingActorName,
  cleanActressName,
};

export abstract class BaseCrawler implements ICrawler {
  abstract name: string;
  abstract baseUrl: string;
  abstract scrape(dvdid: string, config?: RequestRetryConfig): Promise<Partial<MovieInfo>>;

  /**
   * 对爬取的单源元数据执行标题尾部女优名清洗 (第 1 重：单源就地自清洗)
   */
  protected cleanTitle<T extends Partial<MovieInfo>>(info: T): T {
    return cleanMovieInfoTitle(info);
  }

  /**
   * 发起网络请求并解析为 DOM Document（扩展环境下 100% 默认走 TabBridge 标签页通道；非扩展环境走降级原生 fetch）。
   */
  async fetchDocument(url: string, retryConfig?: RequestRetryConfig): Promise<Document> {
    if (typeof chrome !== "undefined" && chrome.tabs) {
      return await fetchDocumentViaTab(url, this.name, retryConfig?.timeoutMs ?? 15000);
    }

    const response = await fetchWithRetry(
      url,
      {
        credentials: "include", // 携带浏览器已有的会话 Cookie 与登录凭据
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7",
          "Upgrade-Insecure-Requests": "1",
        },
      },
      retryConfig,
      this.name
    );

    const htmlText = await response.text();
    const parser = new DOMParser();
    return parser.parseFromString(htmlText, "text/html");
  }

  /**
   * 发起原生网络请求并解析为 JSON 对象（支持超时控制与智能重试）。
   */
  async fetchJson<T = any>(
    url: string,
    init: RequestInit = {},
    retryConfig?: RequestRetryConfig
  ): Promise<T> {
    const response = await fetchWithRetry(
      url,
      {
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7",
          ...(init.headers || {}),
        },
        ...init,
      },
      retryConfig,
      this.name
    );

    return (await response.json()) as T;
  }

  /**
   * 将远程图片二进制转为 Base64 字符串（扩展环境下 100% 默认走 TabBridge 标签页同源通道；非扩展环境兜底）。
   */
  static async fetchImageAsBase64(
    imageUrl: string,
    sourceSite: string = "javbus",
    retryConfig?: RequestRetryConfig
  ): Promise<string> {
    const timeoutMs = retryConfig?.timeoutMs ?? 15000;

    // 1. 优先尝试直接在扩展上下文中发起原生 fetch（依托 Manifest host_permissions 规避 Web 标签页的 CORS 限制，
    //    并配合 Service Worker DNR 自动注入的 Referer 防盗链头），具备毫秒级无损吞吐，且完美支持跨域第三方图床（如 DMM awsimgsrc）；
    try {
      let response: Response;
      const headers = {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      };

      try {
        response = await fetchWithRetry(
          imageUrl,
          {
            credentials: "include",
            headers,
          },
          { maxRetries: 1, baseDelayMs: 300, timeoutMs },
          "Image"
        );
      } catch (err: any) {
        if (err instanceof MovieNotFoundError) throw err;
        if (err instanceof SiteBlockedError) throw err;
        // 若因 CORS 限制抛错，降级为不带凭据尝试（在扩展 host_permissions 下完全豁免 CORS）
        response = await fetchWithRetry(
          imageUrl,
          {
            credentials: "omit",
            headers,
          },
          { maxRetries: 1, baseDelayMs: 300, timeoutMs },
          "Image"
        );
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result as string;
          if (res) resolve(res);
          else reject(new Error("FileReader 返回空结果"));
        };
        reader.onerror = () => reject(new Error(`读取图片数据失败 (${imageUrl})`));
        reader.readAsDataURL(blob);
      });
    } catch (err: any) {
      if (err instanceof MovieNotFoundError) {
        throw err;
      }

      // 2. 若直接 fetch 遭遇 403 / 503 等反爬阻断，且处于 Chrome 扩展环境中，则降级走 TabBridge 常驻标签页同源通道
      if (typeof chrome !== "undefined" && chrome.tabs) {
        try {
          return await fetchImageViaTab(imageUrl, sourceSite, timeoutMs);
        } catch (tabErr) {
          throw tabErr;
        }
      }

      throw err;
    }
  }
}
