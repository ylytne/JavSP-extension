import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { normalizeSiteUrl, testSiteConnectivity } from "../proxyfree";

describe("proxyfree 镜像站与 Base URL 规范化工具", () => {
  describe("normalizeSiteUrl", () => {
    it("空值或纯空格时应回退使用默认 fallbackUrl", () => {
      expect(normalizeSiteUrl("", "https://javdb.com")).toBe("https://javdb.com");
      expect(normalizeSiteUrl("   ", "https://javdb.com")).toBe("https://javdb.com");
      expect(normalizeSiteUrl(null, "https://airav.io")).toBe("https://airav.io");
      expect(normalizeSiteUrl(undefined, "https://www.javbus.com/")).toBe("https://www.javbus.com");
    });

    it("缺失协议头时应自动补全 https://", () => {
      expect(normalizeSiteUrl("javdb580.com", "https://javdb.com")).toBe("https://javdb580.com");
      expect(normalizeSiteUrl("airavplus2.cc", "https://airav.io")).toBe("https://airavplus2.cc");
      expect(normalizeSiteUrl("seedmm.help", "https://www.javbus.com")).toBe("https://seedmm.help");
    });

    it("已有 http:// 或 https:// 协议头时应保持原协议", () => {
      expect(normalizeSiteUrl("http://javdb580.com", "https://javdb.com")).toBe("http://javdb580.com");
      expect(normalizeSiteUrl("https://airavplus2.cc", "https://airav.io")).toBe("https://airavplus2.cc");
    });

    it("末尾包含单个或多个斜杠时应正确清洗剔除", () => {
      expect(normalizeSiteUrl("https://javdb580.com/", "https://javdb.com")).toBe("https://javdb580.com");
      expect(normalizeSiteUrl("airavplus2.cc///", "https://airav.io")).toBe("https://airavplus2.cc");
    });

    it("两端含有空白字符时应自动 trim 清理", () => {
      expect(normalizeSiteUrl("   javdb580.com/  ", "https://javdb.com")).toBe("https://javdb580.com");
    });
  });

  describe("testSiteConnectivity 连通性测速探针", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("空输入时应直接返回错误", async () => {
      const res = await testSiteConnectivity("");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("不可为空");
    });

    it("站点响应 200 正常时应返回 ok=true 且带有延迟", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as any);

      const res = await testSiteConnectivity("javdb580.com");
      expect(res.ok).toBe(true);
      expect(res.status).toBe(200);
      expect(typeof res.latency).toBe("number");
      expect(res.error).toBeUndefined();
    });

    it("站点遇到 WAF 403 质询时也应判定为网络可达 (状态码 < 500)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      } as any);

      const res = await testSiteConnectivity("https://airavplus2.cc");
      expect(res.ok).toBe(true);
      expect(res.status).toBe(403);
    });

    it("站点返回 502/500 服务器错误时应判定为异常", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      } as any);

      const res = await testSiteConnectivity("https://broken-mirror.com");
      expect(res.ok).toBe(false);
      expect(res.status).toBe(502);
      expect(res.error).toBe("HTTP 502");
    });

    it("网络断开抛错时应返回对应错误信息", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch (DNS error)"));

      const res = await testSiteConnectivity("https://non-existent-site-12345.cc");
      expect(res.ok).toBe(false);
      expect(res.error).toContain("DNS error");
    });
  });
});
