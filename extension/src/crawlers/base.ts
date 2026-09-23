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
  isTabBridgeHost,
  markHostAsTabBridge,
  initTabBridgeHosts,
  getTabBridgeHosts,
  unmarkHostAsTabBridge,
} from "./tabBridge";
export {
  fetchDocumentViaTab,
  fetchImageViaTab,
  isTabBridgeHost,
  markHostAsTabBridge,
  initTabBridgeHosts,
  getTabBridgeHosts,
  unmarkHostAsTabBridge,
};

export * from "./dvdid";

export abstract class BaseCrawler implements ICrawler {
  abstract name: string;
  abstract scrape(dvdid: string, config?: RequestRetryConfig): Promise<Partial<MovieInfo>>;

  /**
   * 发起网络请求并解析为 DOM Document（支持域名级 TabBridge 绕过、超时控制与智能重试；遭遇反爬阻断时自动记录并永久降级）。
   */
  async fetchDocument(url: string, retryConfig?: RequestRetryConfig): Promise<Document> {
    // 1. 前置短路：若已知目标域名必须走 TabBridge，免试探直接走标签页通道
    if (isTabBridgeHost(url) && typeof chrome !== "undefined" && chrome.tabs) {
      return await fetchDocumentViaTab(url, retryConfig?.timeoutMs ?? 15000);
    }

    try {
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
    } catch (err) {
      // 2. 动态学习：若普通 fetch 遭遇 403 / 503 阻断，记录该站点永久走 TabBridge，并异步持久化到 config.yml
      if (err instanceof SiteBlockedError && typeof chrome !== "undefined" && chrome.tabs) {
        markHostAsTabBridge(url).catch(() => {});
        return await fetchDocumentViaTab(url, retryConfig?.timeoutMs ?? 15000);
      }
      throw err;
    }
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
   * 将远程图片二进制转为 Base64 字符串（支持域名短路、超时、重试与 Tab 桥接永久回退）。
   */
  static async fetchImageAsBase64(
    imageUrl: string,
    retryConfig?: RequestRetryConfig
  ): Promise<string> {
    // 1. 前置短路：若已知目标域名必须走 TabBridge，直接走标签页同源通道
    if (isTabBridgeHost(imageUrl) && typeof chrome !== "undefined" && chrome.tabs) {
      return await fetchImageViaTab(imageUrl, retryConfig?.timeoutMs ?? 15000);
    }

    try {
      let response: Response;
      const headers = {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      };

      try {
        // 优先尝试携带凭据请求（复用登录态与过盾 Cookie）
        response = await fetchWithRetry(
          imageUrl,
          {
            credentials: "include",
            headers,
          },
          retryConfig,
          "Image"
        );
      } catch (err) {
        // 若是 404 则无需重试直接抛出
        if (err instanceof MovieNotFoundError) {
          throw err;
        }
        // 若遭遇 403 / 503 等反爬阻断，记录域名并走 Tab 桥接
        if (err instanceof SiteBlockedError && typeof chrome !== "undefined" && chrome.tabs) {
          markHostAsTabBridge(imageUrl).catch(() => {});
          return await fetchImageViaTab(imageUrl, retryConfig?.timeoutMs ?? 15000);
        }
        // 若因 CORS 限制等偶发异常，降级不带凭据尝试
        response = await fetchWithRetry(
          imageUrl,
          {
            credentials: "omit",
            headers,
          },
          retryConfig,
          "Image"
        );
      }

      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = () => reject(new Error(`读取图片数据失败 (${imageUrl})`));
        reader.readAsDataURL(blob);
      });
    } catch (finalErr) {
      if (finalErr instanceof SiteBlockedError && typeof chrome !== "undefined" && chrome.tabs) {
        markHostAsTabBridge(imageUrl).catch(() => {});
        return await fetchImageViaTab(imageUrl, retryConfig?.timeoutMs ?? 15000);
      }
      throw finalErr;
    }
  }
}
