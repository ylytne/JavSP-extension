import { describe, it, expect, beforeEach, vi } from "vitest";
import { serverConfig, DEFAULT_SERVER_ADDRESS } from "../serverConfig";

describe("serverConfig 服务地址与鉴权管理", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("应具备正确的默认服务器地址", () => {
    expect(DEFAULT_SERVER_ADDRESS).toBe("127.0.0.1:8765");
  });

  describe("normalizeAddress", () => {
    it("应正确清洗普通 host:port", () => {
      expect(serverConfig.normalizeAddress("192.168.1.50:8765")).toBe("192.168.1.50:8765");
      expect(serverConfig.normalizeAddress("  192.168.1.50:8765  ")).toBe("192.168.1.50:8765");
    });

    it("应移除末尾多余斜杠", () => {
      expect(serverConfig.normalizeAddress("http://nas.local:8765///")).toBe("http://nas.local:8765");
      expect(serverConfig.normalizeAddress("192.168.1.100:8765/")).toBe("192.168.1.100:8765");
    });

    it("遇到空输入应回退为默认地址", () => {
      expect(serverConfig.normalizeAddress("")).toBe(DEFAULT_SERVER_ADDRESS);
      expect(serverConfig.normalizeAddress("   ")).toBe(DEFAULT_SERVER_ADDRESS);
    });
  });

  describe("getHttpBaseUrl", () => {
    it("无 http 前缀时自动补全 http://", () => {
      expect(serverConfig.getHttpBaseUrl("192.168.1.100:8765")).toBe("http://192.168.1.100:8765");
      expect(serverConfig.getHttpBaseUrl("nas.lan")).toBe("http://nas.lan");
    });

    it("已有 http 或 https 前缀时保持不变", () => {
      expect(serverConfig.getHttpBaseUrl("http://192.168.1.100:8765")).toBe("http://192.168.1.100:8765");
      expect(serverConfig.getHttpBaseUrl("https://nas.lan:8765/")).toBe("https://nas.lan:8765");
    });
  });

  describe("getWsUrl 与 Token 附带", () => {
    it("无协议前缀时自动生成 ws:// 地址并附带 /ws 路径", () => {
      expect(serverConfig.getWsUrl("192.168.1.100:8765")).toBe("ws://192.168.1.100:8765/ws");
    });

    it("已有 http:// 时转换为 ws://", () => {
      expect(serverConfig.getWsUrl("http://192.168.1.100:8765")).toBe("ws://192.168.1.100:8765/ws");
      expect(serverConfig.getWsUrl("http://192.168.1.100:8765/ws")).toBe("ws://192.168.1.100:8765/ws");
    });

    it("已有 https:// 时转换为 wss://", () => {
      expect(serverConfig.getWsUrl("https://nas.lan:8765")).toBe("wss://nas.lan:8765/ws");
      expect(serverConfig.getWsUrl("https://nas.lan:8765/ws/")).toBe("wss://nas.lan:8765/ws");
    });

    it("提供 Token 时自动附加 ?token= 查询参数", () => {
      expect(serverConfig.getWsUrl("192.168.1.100:8765", "my-secret-key")).toBe(
        "ws://192.168.1.100:8765/ws?token=my-secret-key"
      );
      expect(serverConfig.getWsUrl("https://nas.lan:8765", "token with space")).toBe(
        "wss://nas.lan:8765/ws?token=token%20with%20space"
      );
    });
  });

  describe("getAuthHeaders & getImageUrl", () => {
    it("Token 存在时返回 Bearer 鉴权头，留空时返回空对象", () => {
      expect(serverConfig.getAuthHeaders("token123")).toEqual({
        Authorization: "Bearer token123",
      });
      expect(serverConfig.getAuthHeaders("")).toEqual({});
      expect(serverConfig.getAuthHeaders("   ")).toEqual({});
    });

    it("getImageUrl 应正确构造包含 Token 的图片请求地址", () => {
      const url = serverConfig.getImageUrl("/volume1/movies/IPX-177", "192.168.1.100:8765", "sec888");
      expect(url).toBe(
        "http://192.168.1.100:8765/api/image?dir=%2Fvolume1%2Fmovies%2FIPX-177&token=sec888"
      );
    });
  });

  describe("setServerConfig 与变更通知", () => {
    it("更新地址与 Token 时应正确通知监听器", async () => {
      const listener = vi.fn();
      const unsub = serverConfig.onServerAddressChange(listener);

      await serverConfig.setServerConfig("10.0.0.88:9000", "nas-token-999");

      expect(serverConfig.getCurrentServerAddress()).toBe("10.0.0.88:9000");
      expect(serverConfig.getCurrentApiToken()).toBe("nas-token-999");
      expect(serverConfig.getHttpBaseUrl()).toBe("http://10.0.0.88:9000");
      expect(serverConfig.getWsUrl()).toBe("ws://10.0.0.88:9000/ws?token=nas-token-999");

      expect(listener).toHaveBeenCalledWith(
        "10.0.0.88:9000",
        "nas-token-999",
        "http://10.0.0.88:9000",
        "ws://10.0.0.88:9000/ws?token=nas-token-999"
      );

      unsub();
      await serverConfig.setServerConfig(DEFAULT_SERVER_ADDRESS, "");
    });
  });

  describe("testConnection 包含鉴权校验", () => {
    it("正确鉴权返回 200 ok 时应返回成功与延迟", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok", version: "0.1.0" }),
      });
      globalThis.fetch = mockFetch;

      const result = await serverConfig.testConnection("127.0.0.1:8765", "valid-token");
      expect(result.success).toBe(true);
      expect(result.version).toBe("0.1.0");
      expect(result.latency).toBeGreaterThanOrEqual(0);

      // 验证附带了 Authorization 头
      expect(mockFetch).toHaveBeenCalledWith(
        "http://127.0.0.1:8765/api/ping",
        expect.objectContaining({
          headers: { Authorization: "Bearer valid-token" },
        })
      );
    });

    it("返回 401 Unauthorized 时应友好提示 Token 错误", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });
      globalThis.fetch = mockFetch;

      const result = await serverConfig.testConnection("192.168.1.100:8765", "wrong-token");
      expect(result.success).toBe(false);
      expect(result.error).toContain("401 Unauthorized");
      expect(result.error).toContain("请填写正确的 API Token");
    });

    it("网络断开或超时时应返回错误信息", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
      globalThis.fetch = mockFetch;

      const result = await serverConfig.testConnection("192.168.1.99:8765");
      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection refused");
    });
  });
});
