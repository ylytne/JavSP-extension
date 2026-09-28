/**
 * 全站点 TabBridge-First 架构与常驻标签页生命周期管理器
 *
 * 核心原理：
 * 浏览器沙盒中发起的跨域 fetch 会被强制注入 Origin: chrome-extension://<id>
 * 和 Sec-Fetch-Site: cross-site 标记，目标网站（JavBus, JavDB, AirAV 等）CDN 会直接阻断。
 *
 * 本模块作为默认传输层，在 UI 会话单例（ResidentTabManager）中管理各站点的常驻标签页：
 * 1. 同源执行：直接在目标站点/生效镜像站的 Tab 上下文内同源执行 fetch 与图片读取，天然具备合法 Referer 与 Cookie；
 * 2. 来源上下文透传 (Source Attribution)：下游图片下载认站不认图床 CDN 域名；
 * 3. 内容级就绪探测：识别多语言 Cloudflare 5 秒盾与 Turnstile 验证码容器，引导用户过盾；
 * 4. 导航漂移与休眠防护：比对 Tab 当前 URL 并过滤 discarded 标签页。
 */

import { SiteBlockedError, TimeoutError, MovieNotFoundError } from "./base";

export interface SiteReadinessItem {
  id: string;
  name: string;
  url: string;
  reason: "missing" | "cf_challenge" | "discarded";
}

export interface SiteReadinessResult {
  ready: boolean;
  missingOrBlockedSites: SiteReadinessItem[];
}

export interface TargetSiteConfig {
  id: string;
  baseUrl: string;
  name?: string;
}

const DEFAULT_BASE_URLS: Record<string, string> = {
  javbus: "https://www.javbus.com",
  javdb: "https://javdb.com",
  airav: "https://airav.io",
};

const DEFAULT_SITE_NAMES: Record<string, string> = {
  javbus: "JavBus",
  javdb: "JavDB",
  airav: "AirAV",
};

/**
 * 标准化提取 hostname（支持纯域名或完整 URL）
 */
export function extractHostname(urlOrHost: string): string {
  const raw = urlOrHost.trim().toLowerCase();
  if (raw.includes("://")) {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch {
      // 容错处理
    }
  }
  return raw.split("/")[0].split(":")[0].trim();
}

/**
 * 校验标签页 URL 是否与目标站点基准地址/域名匹配（支持根域模糊兼容）
 */
export function matchDomain(tabUrl: string | undefined, targetBaseUrlOrHost: string): boolean {
  if (!tabUrl) return false;
  try {
    const tabHost = new URL(tabUrl).hostname.toLowerCase().replace(/^www\./, "");
    const targetHost = extractHostname(targetBaseUrlOrHost).replace(/^www\./, "");
    if (!tabHost || !targetHost) return false;
    return tabHost === targetHost || tabHost.endsWith("." + targetHost) || targetHost.endsWith("." + tabHost);
  } catch {
    return false;
  }
}

/**
 * 等待指定标签页完成加载 (status === "complete")
 */
export async function waitForTabComplete(tabId: number, timeoutMs = 8000): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.tabs) return false;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return true;
  } catch {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    let timer: any;
    const listener = (tid: number, change: chrome.tabs.TabChangeInfo) => {
      if (tid === tabId && change.status === "complete") {
        clearTimeout(timer);
        if (chrome.tabs?.onUpdated) {
          chrome.tabs.onUpdated.removeListener(listener);
        }
        resolve(true);
      }
    };
    timer = setTimeout(() => {
      if (chrome.tabs?.onUpdated) {
        chrome.tabs.onUpdated.removeListener(listener);
      }
      resolve(false);
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * 常驻标签页生命周期管理器（单例，运行于 UI 前端进程中）
 */
export class ResidentTabManager {
  private static instance: ResidentTabManager | null = null;
  private tabs = new Map<string, number>(); // siteId -> tabId
  private siteBaseUrls = new Map<string, string>(); // siteId -> effectiveBaseUrl

  private constructor() {
    this.registerListeners();
  }

  public static getInstance(): ResidentTabManager {
    if (!ResidentTabManager.instance) {
      ResidentTabManager.instance = new ResidentTabManager();
    }
    return ResidentTabManager.instance;
  }

  public static resetInstance(): void {
    ResidentTabManager.instance = null;
  }

  private registerListeners(): void {
    if (typeof chrome !== "undefined" && chrome.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener((closedTabId: number) => {
        for (const [siteId, tabId] of this.tabs.entries()) {
          if (tabId === closedTabId) {
            this.tabs.delete(siteId);
          }
        }
      });
    }
  }

  public setSiteBaseUrl(siteId: string, baseUrl: string): void {
    if (!baseUrl) return;
    const current = this.siteBaseUrls.get(siteId);
    if (current && extractHostname(current) !== extractHostname(baseUrl)) {
      // 域名发生变更，逐出原有 Tab 句柄缓存
      this.tabs.delete(siteId);
    }
    this.siteBaseUrls.set(siteId, baseUrl);
  }

  public getSiteBaseUrl(siteId: string): string {
    return this.siteBaseUrls.get(siteId) || DEFAULT_BASE_URLS[siteId] || "";
  }

  public getCachedTabId(siteId: string): number | undefined {
    return this.tabs.get(siteId);
  }

  public evictTab(siteId: string): void {
    this.tabs.delete(siteId);
  }

  /**
   * 内容级探测标签页是否遇到 Cloudflare 盾或 Turnstile 人机验证
   */
  public async probeTabReadiness(tabId: number): Promise<boolean> {
    if (typeof chrome === "undefined" || !chrome.scripting?.executeScript) {
      return true;
    }

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            const title = (document.title || "").toLowerCase();
            // 1. 标题特征检查（覆盖英文、中文环境拦截页）
            const isShieldTitle =
              title.includes("just a moment") ||
              title.includes("attention required") ||
              title.includes("cloudflare") ||
              title.includes("请稍候") ||
              title.includes("安全检查");

            // 2. DOM 节点特征检查（覆盖 Turnstile、Challenge 表单与 CF iframe）
            const isShieldDom = !!document.querySelector(
              "#challenge-running, #cf-turnstile, #cf-challenge-running, " +
                ".cf-turnstile-wrapper, iframe[src*='challenges.cloudflare.com'], " +
                "iframe[src*='cloudflare.com']"
            );

            return !isShieldTitle && !isShieldDom;
          } catch {
            return false; // 出现注入异常保守判定为未就绪
          }
        },
      });

      return Boolean(results?.[0]?.result);
    } catch {
      return false;
    }
  }

  /**
   * 检查所需站点的环境就绪状态（基于生效基准地址与内容级验盾）
   */
  public async checkSitesReadiness(
    sites: TargetSiteConfig[]
  ): Promise<SiteReadinessResult> {
    if (typeof chrome === "undefined" || !chrome.tabs?.query) {
      // 非扩展环境（如 Vitest 测试）默认直通
      return { ready: true, missingOrBlockedSites: [] };
    }

    const missingOrBlockedSites: SiteReadinessItem[] = [];
    const allTabs = await chrome.tabs.query({});

    for (const site of sites) {
      const siteId = site.id;
      const effectiveBaseUrl =
        site.baseUrl || this.getSiteBaseUrl(siteId) || DEFAULT_BASE_URLS[siteId];
      this.setSiteBaseUrl(siteId, effectiveBaseUrl);

      const siteName =
        site.name ||
        DEFAULT_SITE_NAMES[siteId] ||
        siteId.toUpperCase();

      const candidateTabs = allTabs.filter(
        (t) => t.id && t.url && matchDomain(t.url, effectiveBaseUrl)
      );

      if (candidateTabs.length === 0) {
        missingOrBlockedSites.push({
          id: siteId,
          name: siteName,
          url: effectiveBaseUrl,
          reason: "missing",
        });
        this.tabs.delete(siteId);
        continue;
      }

      const nonDiscarded = candidateTabs.filter((t) => !t.discarded);
      if (nonDiscarded.length === 0) {
        missingOrBlockedSites.push({
          id: siteId,
          name: siteName,
          url: effectiveBaseUrl,
          reason: "discarded",
        });
        this.tabs.delete(siteId);
        continue;
      }

      // 多标签页择优排序：status === "complete" 优先，其次按 lastAccessed 降序
      nonDiscarded.sort((a, b) => {
        if (a.status === "complete" && b.status !== "complete") return -1;
        if (b.status === "complete" && a.status !== "complete") return 1;
        return ((b as any).lastAccessed || 0) - ((a as any).lastAccessed || 0);
      });

      let foundReadyTab = false;
      for (const candidateTab of nonDiscarded) {
        const tabId = candidateTab.id!;
        if (candidateTab.status !== "complete") {
          await waitForTabComplete(tabId, 5000);
        }

        const isReady = await this.probeTabReadiness(tabId);
        if (isReady) {
          this.tabs.set(siteId, tabId);
          foundReadyTab = true;
          break;
        }
      }

      if (!foundReadyTab) {
        missingOrBlockedSites.push({
          id: siteId,
          name: siteName,
          url: effectiveBaseUrl,
          reason: "cf_challenge",
        });
        this.tabs.delete(siteId);
      }
    }

    return {
      ready: missingOrBlockedSites.length === 0,
      missingOrBlockedSites,
    };
  }

  /**
   * 针对缺失或休眠的站点批量打开标签页
   */
  public async openMissingSiteTabs(
    sites: Array<{ id: string; baseUrl?: string; url?: string; name?: string; reason?: string }>,
    forceReopen = false
  ): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.tabs?.create) return;

    const allTabs = chrome.tabs.query ? await chrome.tabs.query({}) : [];

    for (const site of sites) {
      let rawUrl =
        site.baseUrl || site.url || this.getSiteBaseUrl(site.id) || DEFAULT_BASE_URLS[site.id];
      if (!rawUrl) continue;
      if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = `https://${rawUrl}`;
      }

      // 1. 若标签页处于休眠/冻结状态，尝试重新加载唤醒
      const existingDiscarded = allTabs.find(
        (t) => t.id && t.discarded && t.url && matchDomain(t.url, rawUrl)
      );
      if (existingDiscarded?.id && chrome.tabs.reload) {
        try {
          await chrome.tabs.reload(existingDiscarded.id);
          this.tabs.set(site.id, existingDiscarded.id);
          continue;
        } catch {
          // reload 异常则降级重新创建
        }
      }

      // 2. 若标签页已存在且未休眠（如 CF 质询中），非强制重新打开时避免产生重复标签页
      if (!forceReopen && site.reason === "cf_challenge") {
        const existingNonDiscarded = allTabs.find(
          (t) => t.id && !t.discarded && t.url && matchDomain(t.url, rawUrl)
        );
        if (existingNonDiscarded?.id) {
          this.tabs.set(site.id, existingNonDiscarded.id);
          continue;
        }
      }

      // 3. 若用户显式点击重新打开且标签页已存在，优先刷新该标签页
      if (forceReopen) {
        const existingTab = allTabs.find(
          (t) => t.id && t.url && matchDomain(t.url, rawUrl)
        );
        if (existingTab?.id && chrome.tabs.reload) {
          try {
            await chrome.tabs.reload(existingTab.id);
            this.tabs.set(site.id, existingTab.id);
            continue;
          } catch {}
        }
      }

      // 4. 标签页缺失或刷新失败，创建新后台标签页
      try {
        const createdTab = await chrome.tabs.create({ url: rawUrl, active: false });
        if (createdTab.id) {
          this.tabs.set(site.id, createdTab.id);
        }
      } catch (err) {
        console.warn(`[TabBridge] 打开站点标签页失败 (${site.id}):`, err);
      }
    }
  }

  /**
   * 获取站点可用的合法标签页 ID（内置防导航漂移防护与即时探测）
   */
  public async getValidTab(siteId: string, fallbackUrl?: string): Promise<number> {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      throw new SiteBlockedError("TabBridge", "当前环境不支持 chrome.tabs 扩展 API");
    }

    let effectiveBaseUrl = this.siteBaseUrls.get(siteId);
    if (!effectiveBaseUrl) {
      if (fallbackUrl) {
        try {
          const fallbackOrigin = new URL(fallbackUrl).origin;
          const defaultBase = DEFAULT_BASE_URLS[siteId];
          // 若 fallbackUrl 域名与默认主站不一致，说明用户配置了 proxy_free 镜像
          if (!defaultBase || !matchDomain(fallbackOrigin, defaultBase)) {
            effectiveBaseUrl = fallbackOrigin;
            this.setSiteBaseUrl(siteId, effectiveBaseUrl);
          }
        } catch {}
      }
      if (!effectiveBaseUrl) {
        effectiveBaseUrl = DEFAULT_BASE_URLS[siteId] || "";
      }
    }

    const cachedTabId = this.tabs.get(siteId);
    if (cachedTabId !== undefined) {
      try {
        const tab = await chrome.tabs.get(cachedTabId);
        // 防导航漂移比对与休眠检测
        if (!tab.discarded && tab.url && matchDomain(tab.url, effectiveBaseUrl)) {
          return cachedTabId;
        }
      } catch {
        // Tab 已关闭或无效
      }
      this.tabs.delete(siteId);
    }

    // 从所有打开标签页中匹配有效 Tab
    const allTabs = await chrome.tabs.query({});
    const matching = allTabs.filter(
      (t) => t.id && !t.discarded && t.url && matchDomain(t.url, effectiveBaseUrl)
    );

    if (matching.length > 0) {
      matching.sort((a, b) => {
        if (a.status === "complete" && b.status !== "complete") return -1;
        if (b.status === "complete" && a.status !== "complete") return 1;
        return ((b as any).lastAccessed || 0) - ((a as any).lastAccessed || 0);
      });
      const chosen = matching[0];
      this.tabs.set(siteId, chosen.id!);
      return chosen.id!;
    }

    // 若存在被休眠冻结的标签页，尝试唤醒重载
    const discardedMatching = allTabs.filter(
      (t) => t.id && t.discarded && t.url && matchDomain(t.url, effectiveBaseUrl)
    );
    if (discardedMatching.length > 0 && chrome.tabs.reload) {
      const toReload = discardedMatching[0];
      try {
        await chrome.tabs.reload(toReload.id!);
        await waitForTabComplete(toReload.id!, 8000);
        this.tabs.set(siteId, toReload.id!);
        return toReload.id!;
      } catch {}
    }

    // 若无可用标签页，新建未激活标签页
    let urlToOpen = effectiveBaseUrl;
    if (!urlToOpen) {
      urlToOpen = fallbackUrl || DEFAULT_BASE_URLS[siteId] || "";
    }
    if (!urlToOpen) {
      throw new Error(`无法推导站点 ${siteId} 的有效入口 URL`);
    }
    if (!/^https?:\/\//i.test(urlToOpen)) {
      urlToOpen = `https://${urlToOpen}`;
    }

    const newTab = await chrome.tabs.create({ url: urlToOpen, active: false });
    if (!newTab.id) {
      throw new Error(`无法为站点 ${siteId} 创建常驻标签页`);
    }

    await waitForTabComplete(newTab.id, 8000);
    this.tabs.set(siteId, newTab.id);
    return newTab.id;
  }
}

/**
 * 通过常驻标签页获取目标网页 DOM Document
 */
export async function fetchDocumentViaTab(
  url: string,
  siteId: string,
  timeoutMs = 15000
): Promise<Document> {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    throw new SiteBlockedError("TabBridge", "当前环境不支持 chrome.tabs 扩展 API");
  }

  const tabManager = ResidentTabManager.getInstance();
  const tabId = await tabManager.getValidTab(siteId, url);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (targetUrl: string, timeout: number) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const res = await fetch(targetUrl, {
            credentials: "include",
            signal: controller.signal,
            headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
              "Accept-Language": "zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7",
            },
          });
          if (res.status === 403 || res.status === 503) {
            throw new Error(`BLOCKED_${res.status}`);
          }
          if (res.status === 404) {
            throw new Error("NOT_FOUND_404");
          }
          if (!res.ok) {
            throw new Error(`HTTP_${res.status}`);
          }
          return await res.text();
        } finally {
          clearTimeout(timer);
        }
      },
      args: [url, timeoutMs],
    });

    const html = results?.[0]?.result;
    if (typeof html === "string") {
      const lower = html.slice(0, 4096).toLowerCase();
      if (
        lower.includes("just a moment") ||
        lower.includes("attention required") ||
        lower.includes("#challenge-running") ||
        lower.includes("cf-turnstile") ||
        (lower.includes("cloudflare") && lower.includes("challenge"))
      ) {
        throw new SiteBlockedError(siteId, "页面内容检测到 Cloudflare 质询拦截");
      }
      return new DOMParser().parseFromString(html, "text/html");
    }
    throw new Error("未能从常驻标签页中提取页面 HTML 内容");
  } catch (err: any) {
    if (err instanceof SiteBlockedError) {
      throw err;
    }
    const msg = err?.message || String(err);
    if (msg.includes("BLOCKED_403") || msg.includes("BLOCKED_503")) {
      throw new SiteBlockedError(siteId, `页面访问触发站点拦截 (${msg})`);
    }
    if (msg.includes("AbortError") || msg.includes("timeout")) {
      throw new TimeoutError(siteId, `标签页加载超过 ${timeoutMs / 1000} 秒`);
    }
    if (msg.includes("NOT_FOUND_404")) {
      throw new MovieNotFoundError(siteId, `页面未找到 (404)`);
    }
    // 若标签页意外关闭或失效，逐出缓存
    tabManager.evictTab(siteId);
    throw err;
  }
}

/**
 * 直接通过 sourceSite 对应的生效 Tab 同源拉取图片并转换为 Base64
 */
export async function fetchImageViaTab(
  imageUrl: string,
  sourceSite: string = "javbus",
  timeoutMs = 15000
): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    throw new SiteBlockedError("TabBridge", "当前环境不支持 chrome.tabs 扩展 API");
  }

  const tabManager = ResidentTabManager.getInstance();
  const effectiveSite = sourceSite || "javbus";
  const tabId = await tabManager.getValidTab(effectiveSite);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (imgUrl: string, timeout: number) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
          const res = await fetch(imgUrl, {
            credentials: "include",
            signal: controller.signal,
          });
          if (res.status === 404) {
            throw new Error("NOT_FOUND_404");
          }
          if (res.status === 403 || res.status === 503) {
            throw new Error(`BLOCKED_${res.status}`);
          }
          if (!res.ok) {
            throw new Error(`HTTP_${res.status}`);
          }
          const blob = await res.blob();
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const resUrl = reader.result as string;
              if (resUrl) resolve(resUrl);
              else reject(new Error("FileReader 返回空结果"));
            };
            reader.onerror = () => reject(new Error("FileReader error in tab"));
            reader.readAsDataURL(blob);
          });
        } finally {
          clearTimeout(timer);
        }
      },
      args: [imageUrl, timeoutMs],
    });

    const base64 = results?.[0]?.result;
    if (
      typeof base64 === "string" &&
      (base64.startsWith("data:image/") ||
        base64.startsWith("data:application/octet-stream") ||
        (base64.startsWith("data:") && base64.includes(";base64,")))
    ) {
      return base64;
    }
    throw new Error(`未能从常驻标签页转换图片为 Base64 (${imageUrl})`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("NOT_FOUND_404")) {
      throw new MovieNotFoundError(effectiveSite, `图片不存在 (404): ${imageUrl}`);
    }
    if (msg.includes("BLOCKED_403") || msg.includes("BLOCKED_503")) {
      throw new SiteBlockedError(effectiveSite, `图片访问受阻 (${msg}): ${imageUrl}`);
    }
    if (msg.includes("AbortError") || msg.includes("timeout")) {
      throw new TimeoutError(effectiveSite, `图片下载超时 (${timeoutMs / 1000}s): ${imageUrl}`);
    }
    // 若标签页意外关闭或失效，逐出缓存
    tabManager.evictTab(effectiveSite);
    throw err;
  }
}

/**
 * 站点就绪探测便捷调用接口
 */
export async function checkSitesReadiness(
  sites: TargetSiteConfig[]
): Promise<SiteReadinessResult> {
  return ResidentTabManager.getInstance().checkSitesReadiness(sites);
}

/**
 * 批量打开缺失站点标签页便捷调用接口
 */
export async function openMissingSiteTabs(
  sites: Array<{ id: string; baseUrl?: string; url?: string; name?: string; reason?: string }>,
  forceReopen = false
): Promise<void> {
  return ResidentTabManager.getInstance().openMissingSiteTabs(sites, forceReopen);
}

