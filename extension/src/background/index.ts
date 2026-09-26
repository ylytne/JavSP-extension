/**
 * Chrome MV3 Service Worker (Background)
 */

function setupSidePanel() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error("设置 SidePanel 行为失败:", error));
  }
}

// 动态网络请求规则配置：为官方图床及自定义镜像站自动注入合法的 Referer 头以突破防盗链
async function setupNetRules(customProxies?: Record<string, string>) {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) {
    return;
  }

  // 若未直接传入，优先尝试从 chrome.storage.local 读取持久化镜像配置
  let proxies = customProxies;
  if (!proxies && chrome.storage?.local) {
    try {
      const stored = await chrome.storage.local.get("proxy_free");
      if (stored && stored.proxy_free) {
        proxies = stored.proxy_free;
      }
    } catch {}
  }

  if (customProxies && chrome.storage?.local) {
    try {
      await chrome.storage.local.set({ proxy_free: customProxies });
    } catch {}
  }

  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: 1001,
      priority: 1,
      action: {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          {
            header: "Referer",
            operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
            value: "https://www.javbus.com/",
          },
        ],
      },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?javbus\\.com/.*",
        resourceTypes: [
          "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
          "image" as chrome.declarativeNetRequest.ResourceType,
          "other" as chrome.declarativeNetRequest.ResourceType,
        ],
      },
    },
    {
      id: 1002,
      priority: 1,
      action: {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          {
            header: "Referer",
            operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
            value: "https://www.dmm.co.jp/",
          },
        ],
      },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?dmm\\.co\\.jp/.*",
        resourceTypes: [
          "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
          "image" as chrome.declarativeNetRequest.ResourceType,
          "other" as chrome.declarativeNetRequest.ResourceType,
        ],
      },
    },
    {
      id: 1003,
      priority: 1,
      action: {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          {
            header: "Referer",
            operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
            value: "https://javdb.com/",
          },
        ],
      },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?(jdbstatic\\.com|javdb\\.com)/.*",
        resourceTypes: [
          "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
          "image" as chrome.declarativeNetRequest.ResourceType,
          "other" as chrome.declarativeNetRequest.ResourceType,
        ],
      },
    },
    {
      id: 1004,
      priority: 1,
      action: {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          {
            header: "Referer",
            operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
            value: "https://www.arzon.jp/",
          },
        ],
      },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?arzon\\.jp/.*",
        resourceTypes: [
          "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
          "image" as chrome.declarativeNetRequest.ResourceType,
          "other" as chrome.declarativeNetRequest.ResourceType,
        ],
      },
    },
    {
      id: 1005,
      priority: 1,
      action: {
        type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
        requestHeaders: [
          {
            header: "Referer",
            operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
            value: "https://airav.io/",
          },
        ],
      },
      condition: {
        regexFilter: "^https?://([^/]+\\.)?airav\\.(io|wiki|cc)/.*",
        resourceTypes: [
          "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
          "image" as chrome.declarativeNetRequest.ResourceType,
          "other" as chrome.declarativeNetRequest.ResourceType,
        ],
      },
    },
  ];

  // 为每个配置的自定义镜像站动态注册 Referer 头防盗链绕过规则
  if (proxies) {
    let customRuleId = 1010;
    for (const [_site, rawUrl] of Object.entries(proxies)) {
      if (!rawUrl || !rawUrl.trim()) continue;
      try {
        const fullUrl = /^https?:\/\//i.test(rawUrl.trim())
          ? rawUrl.trim()
          : `https://${rawUrl.trim()}`;
        const u = new URL(fullUrl);
        const host = u.hostname.toLowerCase();
        if (
          !host ||
          host.includes("javbus.com") ||
          host.includes("javdb.com") ||
          host.includes("airav.io")
        ) {
          // 官方主站已涵盖在静态基础规则中
          continue;
        }

        const escapedHost = host.replace(/\./g, "\\.");
        rules.push({
          id: customRuleId++,
          priority: 2,
          action: {
            type: "modifyHeaders" as chrome.declarativeNetRequest.RuleActionType,
            requestHeaders: [
              {
                header: "Referer",
                operation: "set" as chrome.declarativeNetRequest.HeaderOperation,
                value: `https://${host}/`,
              },
            ],
          },
          condition: {
            regexFilter: `^https?://([^/]+\\.)?${escapedHost}/.*`,
            resourceTypes: [
              "xmlhttprequest" as chrome.declarativeNetRequest.ResourceType,
              "image" as chrome.declarativeNetRequest.ResourceType,
              "other" as chrome.declarativeNetRequest.ResourceType,
            ],
          },
        });
      } catch {}
    }
  }

  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map((r) => r.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: rules,
    });
    console.log(
      `[JavSP Background] DeclarativeNetRequest 防盗链请求头重写规则已注册生效 (共 ${rules.length} 条规则)`
    );
  } catch (err) {
    console.error("[JavSP Background] 注册 DeclarativeNetRequest 规则失败:", err);
  }
}

// 安全打开或激活全功能工作台标签页
async function openWorkbenchTab() {
  const workbenchUrl = chrome.runtime.getURL("workbench.html");
  try {
    const tabs = await chrome.tabs.query({});
    const existingTab = tabs.find((t) => t.url && t.url.startsWith(workbenchUrl));
    if (existingTab && existingTab.id) {
      await chrome.tabs.update(existingTab.id, { active: true });
      if (existingTab.windowId) {
        await chrome.windows.update(existingTab.windowId, { focused: true });
      }
      return;
    }
  } catch (e) {
    console.warn("[JavSP Background] 查找已有工作台标签页失败，将直接新建:", e);
  }

  await chrome.tabs.create({ url: workbenchUrl });
}

function setupContextMenu() {
  if (chrome.contextMenus && chrome.contextMenus.create) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "open_workbench",
        title: "🚀 打开 JavSP 全功能工作台",
        contexts: ["action"],
      });
    });
  }
}

// 顶层初始化与安装监听
setupSidePanel();
setupNetRules();
setupContextMenu();

chrome.runtime.onInstalled.addListener(() => {
  console.log("[JavSP Background] 扩展已安装/更新");
  setupSidePanel();
  setupNetRules();
  setupContextMenu();
});

// 监听前台发起的指令
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.action === "OPEN_WORKBENCH") {
    openWorkbenchTab()
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error("[JavSP Background] 打开工作台失败:", err);
        sendResponse({ success: false, error: String(err) });
      });
    return true; // 保持异步通道
  }

  if (message && message.action === "UPDATE_NET_RULES") {
    setupNetRules(message.proxy_free)
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error("[JavSP Background] 更新动态网络规则失败:", err);
        sendResponse({ success: false, error: String(err) });
      });
    return true;
  }
});

// 右键快捷菜单点击
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
  chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "open_workbench") {
      openWorkbenchTab().catch(() => {});
    }
  });
}

// 若浏览器环境未自动响应 openPanelOnActionClick，增加备用 action 点击处理器
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener((tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open && tab.windowId) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
  });
}
