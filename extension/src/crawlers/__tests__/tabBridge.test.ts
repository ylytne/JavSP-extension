import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractHostname,
  isTabBridgeHost,
  initTabBridgeHosts,
  getTabBridgeHosts,
  markHostAsTabBridge,
  unmarkHostAsTabBridge,
} from "../tabBridge";
import { BaseCrawler, SiteBlockedError } from "../base";
import * as tabBridgeModule from "../tabBridge";

// 构造一个简单的测试用 Crawler
class TestCrawler extends BaseCrawler {
  name = "TestCrawler";
  async scrape() {
    return {};
  }
}

describe("TabBridge 域名路由与状态持久化机制", () => {
  beforeEach(() => {
    // 恢复默认测试状态
    initTabBridgeHosts(["airav.io"]);
    vi.restoreAllMocks();
  });

  describe("extractHostname", () => {
    it("正确从完整 URL 中提取小写 hostname", () => {
      expect(extractHostname("https://airav.io/video?hid=123")).toBe("airav.io");
      expect(extractHostname("http://JAVDB.COM:8080/search")).toBe("javdb.com");
      expect(extractHostname("airav.io/path/to/res")).toBe("airav.io");
      expect(extractHostname("  my-site.com  ")).toBe("my-site.com");
    });
  });

  describe("域名判定与增删管理", () => {
    it("默认预置包含 airav.io", () => {
      expect(isTabBridgeHost("https://airav.io/video?hid=123")).toBe(true);
      expect(isTabBridgeHost("airav.io")).toBe(true);
      expect(isTabBridgeHost("https://javbus.com")).toBe(false);
    });

    it("通过 initTabBridgeHosts 批量同步列表", () => {
      initTabBridgeHosts(["javdb.com", "https://example.com/test"]);
      expect(isTabBridgeHost("javdb.com")).toBe(true);
      expect(isTabBridgeHost("example.com")).toBe(true);
      // airav.io 始终默认保留
      expect(isTabBridgeHost("airav.io")).toBe(true);
      expect(isTabBridgeHost("other.com")).toBe(false);
    });

    it("动态添加和移除 TabBridge 域名", async () => {
      expect(isTabBridgeHost("test-waf.com")).toBe(false);
      await markHostAsTabBridge("https://test-waf.com/abc");
      expect(isTabBridgeHost("test-waf.com")).toBe(true);

      await unmarkHostAsTabBridge("test-waf.com");
      expect(isTabBridgeHost("test-waf.com")).toBe(false);
    });
  });

  describe("BaseCrawler 短路与动态学习集成", () => {
    it("已知 TabBridge 域名直接路由至 fetchDocumentViaTab，跳过普通 fetch 撞墙", async () => {
      // 模拟 chrome.tabs 环境
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn(),
          create: vi.fn(),
        },
      };

      const mockDoc = new DOMParser().parseFromString("<html><body>Tab Content</body></html>", "text/html");
      const fetchViaTabSpy = vi
        .spyOn(tabBridgeModule, "fetchDocumentViaTab")
        .mockResolvedValue(mockDoc);

      const crawler = new TestCrawler();
      const doc = await crawler.fetchDocument("https://airav.io/video?hid=999");

      expect(fetchViaTabSpy).toHaveBeenCalledWith("https://airav.io/video?hid=999", 15000);
      expect(doc.body.textContent).toBe("Tab Content");
    });

    it("未记录域名在遭遇 403 后自动动态学习记录并降级至 TabBridge", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn(),
          create: vi.fn(),
        },
      };

      // 模拟目标域名不在列表
      const blockedUrl = "https://new-blocked-site.com/video";
      expect(isTabBridgeHost(blockedUrl)).toBe(false);

      // 模拟普通 fetch 返回 403
      vi.spyOn(globalThis, "fetch").mockResolvedValue({
        status: 403,
        ok: false,
        statusText: "Forbidden",
      } as any);

      const mockDoc = new DOMParser().parseFromString("<html><body>Bypassed Content</body></html>", "text/html");
      const fetchViaTabSpy = vi
        .spyOn(tabBridgeModule, "fetchDocumentViaTab")
        .mockResolvedValue(mockDoc);

      const crawler = new TestCrawler();
      const doc = await crawler.fetchDocument(blockedUrl);

      // 验证已降级成功
      expect(fetchViaTabSpy).toHaveBeenCalled();
      expect(doc.body.textContent).toBe("Bypassed Content");

      // 验证已被动态学习记录！
      expect(isTabBridgeHost(blockedUrl)).toBe(true);
    });
  });
});
