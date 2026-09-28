import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractHostname,
  matchDomain,
  ResidentTabManager,
  waitForTabComplete,
  checkSitesReadiness,
  fetchDocumentViaTab,
  fetchImageViaTab,
  TargetSiteConfig,
} from "../tabBridge";
import {
  downloadExtraFanarts,
  downloadCoversWithFallback,
} from "../../ui/pages/dashboard/services/scraperPipeline";
import { BaseCrawler, SiteBlockedError, TimeoutError, MovieNotFoundError } from "../base";
import { AttributedCover } from "../types";

describe("TabBridge-First 架构核心单元测试", () => {
  beforeEach(() => {
    ResidentTabManager.resetInstance();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  describe("extractHostname", () => {
    it("正确从完整 URL 中提取小写 hostname", () => {
      expect(extractHostname("https://airav.io/video?hid=123")).toBe("airav.io");
      expect(extractHostname("http://JAVDB.COM:8080/search")).toBe("javdb.com");
      expect(extractHostname("airav.io/path/to/res")).toBe("airav.io");
      expect(extractHostname("  my-site.com  ")).toBe("my-site.com");
      expect(extractHostname("https://c0.jdbstatic.com/covers/123.jpg")).toBe("c0.jdbstatic.com");
    });
  });

  describe("matchDomain", () => {
    it("正确判定标签页 URL 与目标站点的域名匹配关系", () => {
      expect(matchDomain("https://www.javbus.com/IPX-177", "https://javbus.com")).toBe(true);
      expect(matchDomain("https://javbus.com/IPX-177", "https://www.javbus.com")).toBe(true);
      expect(matchDomain("https://pics.javbus.com/sample.jpg", "javbus.com")).toBe(true);
      expect(matchDomain("https://airavplus2.cc/video/1", "https://airavplus2.cc")).toBe(true);
      expect(matchDomain("https://google.com", "https://javbus.com")).toBe(false);
      expect(matchDomain(undefined, "https://javbus.com")).toBe(false);
      expect(matchDomain("invalid-url", "https://javbus.com")).toBe(false);
    });
  });

  describe("ResidentTabManager 单例生命周期与缓存管理", () => {
    it("单例模式保证同一会话内实例唯一", () => {
      const instance1 = ResidentTabManager.getInstance();
      const instance2 = ResidentTabManager.getInstance();
      expect(instance1).toBe(instance2);

      ResidentTabManager.resetInstance();
      const instance3 = ResidentTabManager.getInstance();
      expect(instance3).not.toBe(instance1);
    });

    it("更新站点基准地址时若域名变化应逐出旧 Tab 缓存", () => {
      const manager = ResidentTabManager.getInstance();
      (manager as any).tabs.set("airav", 101);
      (manager as any).siteBaseUrls.set("airav", "https://airav.io");

      expect(manager.getCachedTabId("airav")).toBe(101);

      // 域名相同，不逐出
      manager.setSiteBaseUrl("airav", "https://airav.io/sub");
      expect(manager.getCachedTabId("airav")).toBe(101);

      // 域名不同（如配置了 proxy_free 镜像），逐出缓存
      manager.setSiteBaseUrl("airav", "https://airavplus2.cc");
      expect(manager.getCachedTabId("airav")).toBeUndefined();
      expect(manager.getSiteBaseUrl("airav")).toBe("https://airavplus2.cc");
    });

    it("监听 chrome.tabs.onRemoved 并在标签页关闭时自动清理缓存", () => {
      let removeCallback: ((tabId: number) => void) | null = null;
      (globalThis as any).chrome = {
        tabs: {
          onRemoved: {
            addListener: vi.fn((cb) => {
              removeCallback = cb;
            }),
          },
        },
      };

      const manager = ResidentTabManager.getInstance();
      (manager as any).tabs.set("javbus", 201);
      (manager as any).tabs.set("javdb", 202);

      expect(manager.getCachedTabId("javbus")).toBe(201);
      expect(manager.getCachedTabId("javdb")).toBe(202);

      // 触发 tab 201 关闭事件
      removeCallback!(201);

      expect(manager.getCachedTabId("javbus")).toBeUndefined();
      expect(manager.getCachedTabId("javdb")).toBe(202);
    });
  });

  describe("probeTabReadiness 内容级验盾", () => {
    it("非扩展环境下默认返回 true", async () => {
      delete (globalThis as any).chrome;
      const manager = ResidentTabManager.getInstance();
      const ready = await manager.probeTabReadiness(1);
      expect(ready).toBe(true);
    });

    it("检测到 Cloudflare 盾页面特征时判定为未就绪", async () => {
      (globalThis as any).chrome = {
        scripting: {
          executeScript: vi.fn().mockResolvedValue([{ result: false }]),
        },
      };

      const manager = ResidentTabManager.getInstance();
      const ready = await manager.probeTabReadiness(123);
      expect(ready).toBe(false);
    });

    it("无盾正常页面判定为就绪", async () => {
      (globalThis as any).chrome = {
        scripting: {
          executeScript: vi.fn().mockResolvedValue([{ result: true }]),
        },
      };

      const manager = ResidentTabManager.getInstance();
      const ready = await manager.probeTabReadiness(123);
      expect(ready).toBe(true);
    });
  });

  describe("checkSitesReadiness 站点就绪感知检测", () => {
    it("非扩展环境直接放行", async () => {
      delete (globalThis as any).chrome;
      const result = await checkSitesReadiness([
        { id: "javbus", baseUrl: "https://www.javbus.com" },
      ]);
      expect(result.ready).toBe(true);
      expect(result.missingOrBlockedSites).toEqual([]);
    });

    it("缺少对应站点标签页时标记为 missing", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 1, url: "https://google.com", discarded: false, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
      };

      const result = await checkSitesReadiness([
        { id: "javbus", baseUrl: "https://www.javbus.com", name: "JavBus" },
      ]);

      expect(result.ready).toBe(false);
      expect(result.missingOrBlockedSites).toHaveLength(1);
      expect(result.missingOrBlockedSites[0]).toEqual({
        id: "javbus",
        name: "JavBus",
        url: "https://www.javbus.com",
        reason: "missing",
      });
    });

    it("所有标签页处于休眠/冻结 (discarded) 时标记为 discarded", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 1, url: "https://www.javbus.com", discarded: true, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
      };

      const result = await checkSitesReadiness([
        { id: "javbus", baseUrl: "https://www.javbus.com" },
      ]);

      expect(result.ready).toBe(false);
      expect(result.missingOrBlockedSites[0].reason).toBe("discarded");
    });

    it("标签页存在但处于 Cloudflare 质询状态时标记为 cf_challenge", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 10, url: "https://javdb.com", discarded: false, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
        scripting: {
          executeScript: vi.fn().mockResolvedValue([{ result: false }]),
        },
      };

      const result = await checkSitesReadiness([
        { id: "javdb", baseUrl: "https://javdb.com", name: "JavDB" },
      ]);

      expect(result.ready).toBe(false);
      expect(result.missingOrBlockedSites[0].reason).toBe("cf_challenge");
    });

    it("所有站点均有存活且无盾 Tab 时返回 ready: true 并缓存句柄", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 11, url: "https://www.javbus.com", discarded: false, status: "complete" },
            { id: 12, url: "https://airavplus2.cc", discarded: false, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
        scripting: {
          executeScript: vi.fn().mockResolvedValue([{ result: true }]),
        },
      };

      const sites: TargetSiteConfig[] = [
        { id: "javbus", baseUrl: "https://www.javbus.com" },
        { id: "airav", baseUrl: "https://airavplus2.cc" },
      ];

      const result = await checkSitesReadiness(sites);

      expect(result.ready).toBe(true);
      expect(result.missingOrBlockedSites).toHaveLength(0);

      const manager = ResidentTabManager.getInstance();
      expect(manager.getCachedTabId("javbus")).toBe(11);
      expect(manager.getCachedTabId("airav")).toBe(12);
    });
  });

  describe("getValidTab 标签页获取与防漂移", () => {
    it("命中缓存且 URL 未漂移时直接复用缓存句柄", async () => {
      const getSpy = vi.fn().mockResolvedValue({
        id: 301,
        url: "https://www.javbus.com/list",
        discarded: false,
      });

      (globalThis as any).chrome = {
        tabs: {
          get: getSpy,
          query: vi.fn(),
          create: vi.fn(),
          onRemoved: { addListener: vi.fn() },
        },
      };

      const manager = ResidentTabManager.getInstance();
      (manager as any).tabs.set("javbus", 301);

      const tabId = await manager.getValidTab("javbus", "https://www.javbus.com");
      expect(tabId).toBe(301);
      expect(getSpy).toHaveBeenCalledWith(301);
    });

    it("缓存的标签页已关闭或发生导航漂移时重新 query 并更新缓存", async () => {
      const getSpy = vi.fn().mockResolvedValue({
        id: 301,
        url: "https://other-site.com", // 发生漂移
        discarded: false,
      });
      const querySpy = vi.fn().mockResolvedValue([
        { id: 302, url: "https://www.javbus.com/home", discarded: false, status: "complete" },
      ]);

      (globalThis as any).chrome = {
        tabs: {
          get: getSpy,
          query: querySpy,
          create: vi.fn(),
          onRemoved: { addListener: vi.fn() },
        },
      };

      const manager = ResidentTabManager.getInstance();
      (manager as any).tabs.set("javbus", 301);

      const tabId = await manager.getValidTab("javbus", "https://www.javbus.com");
      expect(tabId).toBe(302);
      expect(manager.getCachedTabId("javbus")).toBe(302);
    });

    it("无可用标签页时自动新建标签页", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([]),
          get: vi.fn().mockResolvedValue({ id: 303, status: "complete" }),
          create: vi.fn().mockResolvedValue({ id: 303 }),
          onRemoved: { addListener: vi.fn() },
          onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      };

      const manager = ResidentTabManager.getInstance();
      const tabId = await manager.getValidTab("javbus", "https://www.javbus.com");
      expect(tabId).toBe(303);
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: "https://www.javbus.com",
        active: false,
      });
    });
  });

  describe("fetchDocumentViaTab & fetchImageViaTab 同源执行", () => {
    it("fetchDocumentViaTab 成功提取页面 DOM", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 401, url: "https://www.javbus.com", discarded: false, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
        scripting: {
          executeScript: vi.fn().mockResolvedValue([
            { result: "<html><body><h1 id='title'>Test Movie</h1></body></html>" },
          ]),
        },
      };

      const doc = await fetchDocumentViaTab("https://www.javbus.com/IPX-177", "javbus");
      expect(doc.querySelector("#title")?.textContent).toBe("Test Movie");
    });

    it("fetchDocumentViaTab 遇到 BLOCKED_403 时抛出 SiteBlockedError", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 401, url: "https://www.javbus.com", discarded: false, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
        scripting: {
          executeScript: vi.fn().mockRejectedValue(new Error("BLOCKED_403")),
        },
      };

      await expect(
        fetchDocumentViaTab("https://www.javbus.com/IPX-177", "javbus")
      ).rejects.toThrow(SiteBlockedError);
    });

    it("fetchImageViaTab 成功将图片转换为 Base64", async () => {
      const mockBase64 = "data:image/jpeg;base64,sampleImageData123";
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 501, url: "https://javdb.com", discarded: false, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
        scripting: {
          executeScript: vi.fn().mockResolvedValue([{ result: mockBase64 }]),
        },
      };

      const result = await fetchImageViaTab(
        "https://c0.jdbstatic.com/covers/test.jpg",
        "javdb"
      );
      expect(result).toBe(mockBase64);
    });

    it("fetchImageViaTab 遇到 404 抛出 MovieNotFoundError", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 501, url: "https://javdb.com", discarded: false, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
        scripting: {
          executeScript: vi.fn().mockRejectedValue(new Error("NOT_FOUND_404")),
        },
      };

      await expect(
        fetchImageViaTab("https://c0.jdbstatic.com/covers/notfound.jpg", "javdb")
      ).rejects.toThrow(MovieNotFoundError);
    });
  });

  describe("流水线图片下载调度测试 (并发池与来源透传)", () => {
    it("downloadCoversWithFallback 严格透传 candidate.sourceSite", async () => {
      const candidates: AttributedCover[] = [
        { url: "https://pics.javbus.com/cover1.jpg", sourceSite: "javbus" },
        { url: "https://c0.jdbstatic.com/cover2.jpg", sourceSite: "javdb" },
      ];

      const fetchSpy = vi
        .spyOn(BaseCrawler, "fetchImageAsBase64")
        .mockRejectedValueOnce(new Error("JavBus cover failed"))
        .mockResolvedValueOnce("data:image/jpeg;base64,javdbCoverData");

      const logFn = vi.fn();
      const result = await downloadCoversWithFallback(
        candidates,
        "IPX-177",
        { timeoutMs: 5000 },
        logFn
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        "https://pics.javbus.com/cover1.jpg",
        "javbus",
        expect.anything()
      );
      expect(fetchSpy).toHaveBeenNthCalledWith(
        2,
        "https://c0.jdbstatic.com/cover2.jpg",
        "javdb",
        expect.anything()
      );

      expect(result.coverBase64).toBe("data:image/jpeg;base64,javdbCoverData");
      expect(result.matchedCoverUrl).toBe("https://c0.jdbstatic.com/cover2.jpg");
      expect(result.matchedSource).toBe("javdb");
    });

    it("downloadExtraFanarts 满足并发池限制且严格按原始顺序返回结果", async () => {
      const previewPics = [
        "https://pics.javbus.com/sample0.jpg",
        "https://pics.javbus.com/sample1.jpg",
        "https://pics.javbus.com/sample2.jpg",
        "https://pics.javbus.com/sample3.jpg",
      ];

      let activeWorkers = 0;
      let maxActiveObserved = 0;

      vi.spyOn(BaseCrawler, "fetchImageAsBase64").mockImplementation(
        async (url: string, _site?: string) => {
          activeWorkers++;
          if (activeWorkers > maxActiveObserved) {
            maxActiveObserved = activeWorkers;
          }
          // 故意让 index 0 延迟更久，使得 index 1 先完成，测试乱序完成后的保序重组
          const delay = url.includes("sample0") ? 50 : 10;
          await new Promise((r) => setTimeout(r, delay));
          activeWorkers--;
          return `data:image/jpeg;base64,data_for_${url}`;
        }
      );

      const logFn = vi.fn();
      const results = await downloadExtraFanarts(
        previewPics,
        "IPX-177",
        "javbus",
        {
          retry: 1,
          timeout: 5,
          sleepAfterScraping: 0,
          sleepJitter: 0,
          extraFanartsEnabled: true,
          extraFanartsMaxCount: 4,
          extraFanartsConcurrency: 2, // 并发数限制为 2
          extraFanartsInterval: 0,
          extraFanartsUniformSampling: true,
          extraFanartsTimeout: 5,
          includeTrailer: false,
          crawlers: ["javbus"],
          useJavdbCover: "fallback",
          burstProtectionEnabled: false,
          burstLimit: 10,
          burstJitter: 0,
          burstCooldown: 0,
          burstCooldownJitter: 0,
          proxyFree: {},
        },
        logFn
      );

      expect(maxActiveObserved).toBeLessThanOrEqual(2);
      expect(results).toHaveLength(4);
      // 验证虽然 sample0 较慢，最终数组依然严格保序
      expect(results[0]).toBe("data:image/jpeg;base64,data_for_https://pics.javbus.com/sample0.jpg");
      expect(results[1]).toBe("data:image/jpeg;base64,data_for_https://pics.javbus.com/sample1.jpg");
      expect(results[2]).toBe("data:image/jpeg;base64,data_for_https://pics.javbus.com/sample2.jpg");
      expect(results[3]).toBe("data:image/jpeg;base64,data_for_https://pics.javbus.com/sample3.jpg");
    });

    it("downloadExtraFanarts 单张失败错误隔离不影响整批", async () => {
      const previewPics = [
        "https://pics.javbus.com/sample0.jpg",
        "https://pics.javbus.com/fail404.jpg",
        "https://pics.javbus.com/sample2.jpg",
      ];

      vi.spyOn(BaseCrawler, "fetchImageAsBase64").mockImplementation(async (url: string) => {
        if (url.includes("fail404")) {
          throw new MovieNotFoundError("javbus", "404 Not Found");
        }
        return `data:image/jpeg;base64,ok_${url}`;
      });

      const logFn = vi.fn();
      const results = await downloadExtraFanarts(
        previewPics,
        "IPX-177",
        "javbus",
        {
          retry: 1,
          timeout: 5,
          sleepAfterScraping: 0,
          sleepJitter: 0,
          extraFanartsEnabled: true,
          extraFanartsMaxCount: 3,
          extraFanartsConcurrency: 2,
          extraFanartsInterval: 0,
          extraFanartsUniformSampling: true,
          extraFanartsTimeout: 5,
          includeTrailer: false,
          crawlers: ["javbus"],
          useJavdbCover: "fallback",
          burstProtectionEnabled: false,
          burstLimit: 10,
          burstJitter: 0,
          burstCooldown: 0,
          burstCooldownJitter: 0,
          proxyFree: {},
        },
        logFn
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toBe("data:image/jpeg;base64,ok_https://pics.javbus.com/sample0.jpg");
      expect(results[1]).toBe("data:image/jpeg;base64,ok_https://pics.javbus.com/sample2.jpg");
      expect(logFn).toHaveBeenCalledWith(
        "warn",
        expect.stringContaining("剧照 (2/3) 下载失败跳过")
      );
    });

    it("downloadCoversWithFallback 当传入字符串 URL 且匹配 proxyFree 自定义域名时正确推导 sourceSite", async () => {
      const candidates = [
        "https://airavplus2.cc/media/covers/cover1.jpg",
      ];

      const fetchSpy = vi
        .spyOn(BaseCrawler, "fetchImageAsBase64")
        .mockResolvedValueOnce("data:image/jpeg;base64,airavCustomCover");

      const logFn = vi.fn();
      const result = await downloadCoversWithFallback(
        candidates,
        "IPX-177",
        { timeoutMs: 5000 },
        logFn,
        { airav: "https://airavplus2.cc" }
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://airavplus2.cc/media/covers/cover1.jpg",
        "airav",
        expect.anything()
      );
      expect(result.matchedSource).toBe("airav");
      expect(result.coverBase64).toBe("data:image/jpeg;base64,airavCustomCover");
    });
  });

  describe("高阶鲁棒性与边界场景验证 (TabBridge-First 防御测试)", () => {
    it("getValidTab 优先采纳 fallbackUrl 生效镜像域名，而非被写死常量覆盖", async () => {
      const querySpy = vi.fn().mockResolvedValue([
        { id: 601, url: "https://airavplus2.cc/search", discarded: false, status: "complete" },
      ]);

      (globalThis as any).chrome = {
        tabs: {
          get: vi.fn(),
          query: querySpy,
          create: vi.fn(),
          onRemoved: { addListener: vi.fn() },
        },
      };

      const manager = ResidentTabManager.getInstance();
      // 未预先调用 setSiteBaseUrl，验证 fallbackUrl 的绝对生效
      const tabId = await manager.getValidTab("airav", "https://airavplus2.cc/video?hid=123");
      expect(tabId).toBe(601);
      expect(manager.getSiteBaseUrl("airav")).toBe("https://airavplus2.cc");
    });

    it("getValidTab 若所有匹配标签页均被休眠，自动调用 chrome.tabs.reload 唤醒而非盲目新建", async () => {
      const reloadSpy = vi.fn().mockResolvedValue(undefined);
      const querySpy = vi.fn().mockResolvedValue([
        { id: 701, url: "https://www.javbus.com/home", discarded: true, status: "complete" },
      ]);

      (globalThis as any).chrome = {
        tabs: {
          get: vi.fn().mockResolvedValue({ id: 701, status: "complete" }),
          query: querySpy,
          create: vi.fn(),
          reload: reloadSpy,
          onRemoved: { addListener: vi.fn() },
          onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
        },
      };

      const manager = ResidentTabManager.getInstance();
      const tabId = await manager.getValidTab("javbus", "https://www.javbus.com");

      expect(tabId).toBe(701);
      expect(reloadSpy).toHaveBeenCalledWith(701);
      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it("checkSitesReadiness 多标签择优时若第一个标签页遇盾但后续标签页已过盾，应成功判定就绪", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 801, url: "https://javdb.com/login", discarded: false, status: "complete", lastAccessed: 200 },
            { id: 802, url: "https://javdb.com/rankings", discarded: false, status: "complete", lastAccessed: 100 },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
        scripting: {
          executeScript: vi.fn().mockImplementation(({ target }: { target: { tabId: number } }) => {
            if (target.tabId === 801) return Promise.resolve([{ result: false }]); // 801 遇盾
            if (target.tabId === 802) return Promise.resolve([{ result: true }]); // 802 已就绪
            return Promise.resolve([{ result: false }]);
          }),
        },
      };

      const result = await checkSitesReadiness([
        { id: "javdb", baseUrl: "https://javdb.com", name: "JavDB" },
      ]);

      expect(result.ready).toBe(true);
      expect(result.missingOrBlockedSites).toHaveLength(0);
      expect(ResidentTabManager.getInstance().getCachedTabId("javdb")).toBe(802);
    });

    it("openMissingSiteTabs 不会对已有 CF 盾标签页盲目新建重复标签页", async () => {
      const createSpy = vi.fn().mockResolvedValue({ id: 902 });
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 901, url: "https://javdb.com", discarded: false, status: "complete" },
          ]),
          create: createSpy,
          onRemoved: { addListener: vi.fn() },
        },
      };

      const manager = ResidentTabManager.getInstance();
      await manager.openMissingSiteTabs([
        { id: "javdb", baseUrl: "https://javdb.com", reason: "cf_challenge" },
      ]);

      // 已有存活标签页且非强制模式，不应再次调用 create 制造重复标签页
      expect(createSpy).not.toHaveBeenCalled();
      expect(manager.getCachedTabId("javdb")).toBe(901);
    });

    it("openMissingSiteTabs 在 forceReopen 模式下刷新已有标签页", async () => {
      const reloadSpy = vi.fn().mockResolvedValue(undefined);
      const createSpy = vi.fn().mockResolvedValue({ id: 903 });
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 901, url: "https://javdb.com", discarded: false, status: "complete" },
          ]),
          create: createSpy,
          reload: reloadSpy,
          onRemoved: { addListener: vi.fn() },
        },
      };

      const manager = ResidentTabManager.getInstance();
      await manager.openMissingSiteTabs(
        [{ id: "javdb", baseUrl: "https://javdb.com", reason: "cf_challenge" }],
        true // forceReopen
      );

      expect(reloadSpy).toHaveBeenCalledWith(901);
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("fetchImageViaTab 兼容识别 data:application/octet-stream;base64 图床数据流", async () => {
      const octetBase64 = "data:application/octet-stream;base64,binaryImageData789";
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 950, url: "https://pics.javbus.com", discarded: false, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
        scripting: {
          executeScript: vi.fn().mockResolvedValue([{ result: octetBase64 }]),
        },
      };

      const result = await fetchImageViaTab(
        "https://pics.javbus.com/covers/test.jpg",
        "javbus"
      );
      expect(result).toBe(octetBase64);
    });

    it("fetchDocumentViaTab 遭遇 HTTP 200 的 Cloudflare 质询内容时精准抛出 SiteBlockedError", async () => {
      (globalThis as any).chrome = {
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 960, url: "https://javdb.com", discarded: false, status: "complete" },
          ]),
          onRemoved: { addListener: vi.fn() },
        },
        scripting: {
          executeScript: vi.fn().mockResolvedValue([
            {
              result:
                "<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><div id='challenge-running'></div></body></html>",
            },
          ]),
        },
      };

      await expect(
        fetchDocumentViaTab("https://javdb.com/v/123", "javdb")
      ).rejects.toThrow(SiteBlockedError);
    });
  });
});
