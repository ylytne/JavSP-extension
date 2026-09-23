/**
 * Chrome 扩展标签页同源桥接与过盾通道 (Tab Bridge)
 *
 * 核心原理：
 * 针对开启了 Cloudflare Super Bot Fight Mode 等严格跨域 WAF 拦截的站点（例如 AirAV、JavDB 等），
 * 跨域 fetch（Sec-Fetch-Site: cross-site）会被直接 403 阻断。
 *
 * 本模块利用 Chrome 扩展特权提供两大终极过盾通道：
 * 1. 优先探测当前浏览器中是否已打开目标站点的标签页。若已打开，利用 chrome.scripting
 *    在目标页面上下文中执行【同源请求 (same-origin)】，完全免受跨域拦截，耗时仅数十毫秒且无感。
 * 2. 若未打开，在后台静默创建一个未激活标签页 (active: false)，以真实浏览器页面导航形式
 *    (Sec-Fetch-Dest: document) 加载目标站点，提取所需数据后安全销毁。
 */

import { SiteBlockedError, TimeoutError } from "./base";
import { serverConfig } from "../services/serverConfig";

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

// 内存路由表，出厂默认包含已知必须过盾的站点
const tabBridgeHosts = new Set<string>(["airav.io"]);

/**
 * 批量初始化/同步 TabBridge 站点集合（通常在拉取后端配置后调用）
 */
export function initTabBridgeHosts(hosts: string[]): void {
  tabBridgeHosts.clear();
  tabBridgeHosts.add("airav.io");
  for (const h of hosts) {
    const normalized = extractHostname(h);
    if (normalized) {
      tabBridgeHosts.add(normalized);
    }
  }
}

/**
 * 获取当前所有已登记为 TabBridge 绕过的域名列表
 */
export function getTabBridgeHosts(): string[] {
  return Array.from(tabBridgeHosts);
}

/**
 * 判断指定 URL 或域名是否属于必须走 TabBridge 的站点
 */
export function isTabBridgeHost(urlOrHost: string): boolean {
  const host = extractHostname(urlOrHost);
  return tabBridgeHosts.has(host);
}

/**
 * 异步上报域名至后端写入 config.yml
 */
export async function reportBlockedHostToBackend(host: string): Promise<void> {
  try {
    const baseUrl = serverConfig.getHttpBaseUrl();
    const authHeaders = serverConfig.getAuthHeaders();
    await fetch(`${baseUrl}/api/config/tab-bridge-hosts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({ host }),
    });
  } catch (e) {
    console.warn(`[TabBridge] 自动持久化域名 ${host} 到后端失败:`, e);
  }
}

/**
 * 异步从后端 config.yml 中移除域名
 */
export async function deleteBlockedHostFromBackend(host: string): Promise<void> {
  try {
    const baseUrl = serverConfig.getHttpBaseUrl();
    const authHeaders = serverConfig.getAuthHeaders();
    await fetch(`${baseUrl}/api/config/tab-bridge-hosts/${encodeURIComponent(host)}`, {
      method: "DELETE",
      headers: authHeaders,
    });
  } catch (e) {
    console.warn(`[TabBridge] 从后端删除域名 ${host} 失败:`, e);
  }
}

/**
 * 动态登记域名为 TabBridge 站点：
 * 1. 立即更新内存路由表，确保本轮批量抓取后续请求零延迟短路；
 * 2. 异步上报后端写入 config.yml 实现永久持久化。
 */
export async function markHostAsTabBridge(urlOrHost: string): Promise<void> {
  const host = extractHostname(urlOrHost);
  if (!host) return;

  if (!tabBridgeHosts.has(host)) {
    tabBridgeHosts.add(host);
    console.info(`[TabBridge] 域名 ${host} 已加入 Tab 桥接白名单，后续将免试探直接走标签页通道`);
    await reportBlockedHostToBackend(host);
  }
}

/**
 * 从 TabBridge 站点名单中移除域名，并同步后端持久化
 */
export async function unmarkHostAsTabBridge(urlOrHost: string): Promise<void> {
  const host = extractHostname(urlOrHost);
  if (!host) return;

  tabBridgeHosts.delete(host);
  await deleteBlockedHostFromBackend(host);
}

/**
 * 通过真实浏览器标签页通道获取网页 DOM Document
 */
export async function fetchDocumentViaTab(
  url: string,
  timeoutMs = 15000
): Promise<Document> {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    throw new SiteBlockedError("TabBridge", "当前环境不支持 chrome.tabs 扩展 API");
  }

  // 1. 优先尝试复用已有同源标签页进行同源 fetch（速度极快且完全静默无感）
  try {
    const parsedUrl = new URL(url);
    const domainPattern = `*://${parsedUrl.hostname}/*`;
    const tabs = await chrome.tabs.query({ url: domainPattern });
    const completedTab = tabs.find((t) => t.id && t.status === "complete");

    if (completedTab && completedTab.id && chrome.scripting && chrome.scripting.executeScript) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: completedTab.id },
        func: async (targetUrl: string) => {
          const res = await fetch(targetUrl, {
            credentials: "include",
            headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return await res.text();
        },
        args: [url],
      });

      const html = results?.[0]?.result;
      if (html && typeof html === "string") {
        return new DOMParser().parseFromString(html, "text/html");
      }
    }
  } catch (err) {
    console.warn("[TabBridge] 复用同源标签页抓取失败，降级到后台静默标签页导航:", err);
  }

  // 2. 若无可用标签页，在后台静默创建一个未激活标签页进行真实导航（Sec-Fetch-Dest: document）
  return new Promise<Document>((resolve, reject) => {
    let tabId: number | undefined;
    let timer: any;

    const cleanup = () => {
      clearTimeout(timer);
      if (typeof chrome !== "undefined" && chrome.tabs?.onUpdated) {
        chrome.tabs.onUpdated.removeListener(onUpdatedListener);
      }
      if (tabId && typeof chrome !== "undefined" && chrome.tabs?.remove) {
        chrome.tabs.remove(tabId).catch(() => {});
      }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new TimeoutError("TabBridge", `页面加载超过 ${timeoutMs / 1000} 秒`));
    }, timeoutMs);

    const onUpdatedListener = async (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;

      try {
        if (chrome.scripting && chrome.scripting.executeScript) {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => document.documentElement.outerHTML,
          });
          const html = results?.[0]?.result;
          cleanup();
          if (html && typeof html === "string") {
            resolve(new DOMParser().parseFromString(html, "text/html"));
          } else {
            reject(new Error("未能从标签页中提取页面 HTML 内容"));
          }
        } else {
          cleanup();
          reject(new Error("缺少 chrome.scripting 权限"));
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdatedListener);

    chrome.tabs
      .create({ url, active: false })
      .then((createdTab) => {
        tabId = createdTab.id;
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
}

/**
 * 通过真实浏览器标签页通道下载图片并转换为 Base64
 */
export async function fetchImageViaTab(
  imageUrl: string,
  timeoutMs = 15000
): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    throw new SiteBlockedError("TabBridge", "当前环境不支持 chrome.tabs 扩展 API");
  }

  // 1. 优先尝试复用已有同源标签页进行同源 fetch 转 Base64
  try {
    const parsedUrl = new URL(imageUrl);
    const domainPattern = `*://${parsedUrl.hostname}/*`;
    const tabs = await chrome.tabs.query({ url: domainPattern });
    const completedTab = tabs.find((t) => t.id && t.status === "complete");

    if (completedTab && completedTab.id && chrome.scripting && chrome.scripting.executeScript) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: completedTab.id },
        func: async (imgUrl: string) => {
          const res = await fetch(imgUrl, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("FileReader error in tab"));
            reader.readAsDataURL(blob);
          });
        },
        args: [imageUrl],
      });

      const base64 = results?.[0]?.result;
      if (base64 && typeof base64 === "string" && base64.startsWith("data:image/")) {
        return base64;
      }
    }
  } catch (err) {
    console.warn("[TabBridge] 同源标签页下载图片失败，降级到后台静默标签页:", err);
  }

  // 2. 若无同源标签页，在后台静默打开该站点的首页，在其同源上下文中执行 fetch 并转换为 Base64
  return new Promise<string>((resolve, reject) => {
    let tabId: number | undefined;
    let timer: any;

    const cleanup = () => {
      clearTimeout(timer);
      if (typeof chrome !== "undefined" && chrome.tabs?.onUpdated) {
        chrome.tabs.onUpdated.removeListener(onUpdatedListener);
      }
      if (tabId && typeof chrome !== "undefined" && chrome.tabs?.remove) {
        chrome.tabs.remove(tabId).catch(() => {});
      }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new TimeoutError("TabBridge", `图片加载超过 ${timeoutMs / 1000} 秒`));
    }, timeoutMs);

    const onUpdatedListener = async (
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;

      try {
        if (chrome.scripting && chrome.scripting.executeScript) {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: async (imgUrl: string) => {
              const res = await fetch(imgUrl, { credentials: "include" });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const blob = await res.blob();
              return new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error("FileReader error in tab"));
                reader.readAsDataURL(blob);
              });
            },
            args: [imageUrl],
          });
          const base64 = results?.[0]?.result;
          cleanup();
          if (base64 && typeof base64 === "string" && base64.startsWith("data:image/")) {
            resolve(base64);
          } else {
            reject(new Error("未能从后台标签页转换图片为 Base64"));
          }
        } else {
          cleanup();
          reject(new Error("缺少 chrome.scripting 权限"));
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    chrome.tabs.onUpdated.addListener(onUpdatedListener);

    const parsedUrl = new URL(imageUrl);
    const originUrl = `${parsedUrl.origin}/`;

    chrome.tabs
      .create({ url: originUrl, active: false })
      .then((createdTab) => {
        tabId = createdTab.id;
      })
      .catch((err) => {
        cleanup();
        reject(err);
      });
  });
}
