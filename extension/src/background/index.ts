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

// 动态网络请求规则配置：为图床自动注入合法的 Referer 头以突破防盗链
async function setupNetRules() {
  if (!chrome.declarativeNetRequest || !chrome.declarativeNetRequest.updateDynamicRules) {
    return;
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

  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map((r) => r.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: rules,
    });
    console.log("[JavSP Background] DeclarativeNetRequest 防盗链请求头重写规则已注册生效");
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

// 监听前台（如侧边栏）发起的指令
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.action === "OPEN_WORKBENCH") {
    openWorkbenchTab().then(() => sendResponse({ success: true })).catch((err) => {
      console.error("[JavSP Background] 打开工作台失败:", err);
      sendResponse({ success: false, error: String(err) });
    });
    return true; // 保持异步通道
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

