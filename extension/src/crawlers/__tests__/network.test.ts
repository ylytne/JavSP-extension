import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithRetry,
  TimeoutError,
  SiteBlockedError,
  MovieNotFoundError,
  CrawlerError,
  BaseCrawler,
} from "../base";

describe("fetchWithRetry - 超时与智能重试机制", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("应在请求超时时精确中止并抛出 TimeoutError", async () => {
    // 模拟一个挂起超时的 fetch
    const mockFetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        if (init?.signal) {
          init.signal.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const retryLog: string[] = [];
    const promise = fetchWithRetry(
      "https://example.com/hang",
      {},
      {
        maxRetries: 2,
        timeoutMs: 50, // 50ms 快速超时
        baseDelayMs: 10,
        onRetry: (attempt, max, reason) => {
          retryLog.push(`重试第 ${attempt}/${max} 次: ${reason}`);
        },
      },
      "TestCrawler"
    );

    await expect(promise).rejects.toThrow(TimeoutError);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(retryLog.length).toBe(1);
    expect(retryLog[0]).toContain("单次请求超过 0.05 秒未响应");
  });

  it("遭遇网络断开/抛错时应自动重试并在重试成功后返回", async () => {
    let callCount = 0;
    const fakeSuccessResponse = {
      ok: true,
      status: 200,
      text: async () => "<html>ok</html>",
    };

    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw new TypeError("Failed to fetch (Network connection reset)");
      }
      return fakeSuccessResponse;
    });
    vi.stubGlobal("fetch", mockFetch);

    const retryRecords: number[] = [];
    const resp = await fetchWithRetry(
      "https://example.com/api",
      {},
      {
        maxRetries: 3,
        timeoutMs: 500,
        baseDelayMs: 10,
        onRetry: (attempt) => retryRecords.push(attempt),
      },
      "TestCrawler"
    );

    expect(callCount).toBe(3);
    expect(retryRecords).toEqual([1, 2]);
    expect(resp.status).toBe(200);
  });

  it("遭遇 404 (MovieNotFoundError) 时应快速失败，绝不执行重试", async () => {
    const fake404Response = {
      ok: false,
      status: 404,
      statusText: "Not Found",
    };
    const mockFetch = vi.fn().mockResolvedValue(fake404Response);
    vi.stubGlobal("fetch", mockFetch);

    const retryFn = vi.fn();
    await expect(
      fetchWithRetry(
        "https://example.com/nonexistent",
        {},
        { maxRetries: 3, onRetry: retryFn },
        "TestCrawler"
      )
    ).rejects.toThrow(MovieNotFoundError);

    // 严禁重试，必须仅调用 1 次
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(retryFn).not.toHaveBeenCalled();
  });

  it("遭遇 403/503 (SiteBlockedError) 时应快速阻断，绝不执行重试", async () => {
    const fake403Response = {
      ok: false,
      status: 403,
      statusText: "Forbidden",
    };
    const mockFetch = vi.fn().mockResolvedValue(fake403Response);
    vi.stubGlobal("fetch", mockFetch);

    const retryFn = vi.fn();
    await expect(
      fetchWithRetry(
        "https://example.com/blocked",
        {},
        { maxRetries: 3, onRetry: retryFn },
        "TestCrawler"
      )
    ).rejects.toThrow(SiteBlockedError);

    // 反爬阻断立即抛出，绝不浪费重试
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(retryFn).not.toHaveBeenCalled();
  });

  it("遭遇 429 Too Many Requests 时应触发退避重试", async () => {
    const fake429Response = {
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    };
    const mockFetch = vi.fn().mockResolvedValue(fake429Response);
    vi.stubGlobal("fetch", mockFetch);

    const retryFn = vi.fn();
    await expect(
      fetchWithRetry(
        "https://example.com/rate-limit",
        {},
        { maxRetries: 2, baseDelayMs: 10, onRetry: retryFn },
        "TestCrawler"
      )
    ).rejects.toThrow(CrawlerError);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(retryFn).toHaveBeenCalledTimes(1);
  });
});
