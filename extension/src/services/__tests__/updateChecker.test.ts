import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  compareVersions,
  generateBackendUpgradeGuide,
  UpdateCheckerService,
  CACHE_STORAGE_KEY,
  CACHE_TTL_MS,
} from "../updateChecker";
import { serverConfig } from "../serverConfig";

describe("UpdateCheckerService 核心服务测试", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("compareVersions 语义化版本比对算法", () => {
    it("相等版本返回 0", () => {
      expect(compareVersions("0.1.0", "0.1.0")).toBe(0);
      expect(compareVersions("v0.1.0", "0.1.0")).toBe(0);
      expect(compareVersions("1.0.0", "1.0")).toBe(0);
    });

    it("v1 大于 v2 返回 1", () => {
      expect(compareVersions("0.2.0", "0.1.9")).toBe(1);
      expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
      expect(compareVersions("0.1.1", "0.1.0")).toBe(1);
      expect(compareVersions("v0.1.5-beta", "0.1.4")).toBe(1);
    });

    it("v1 小于 v2 返回 -1", () => {
      expect(compareVersions("0.1.0", "0.1.1")).toBe(-1);
      expect(compareVersions("0.1.9", "0.2.0")).toBe(-1);
      expect(compareVersions("0.9.0", "1.0.0")).toBe(-1);
    });
  });

  describe("generateBackendUpgradeGuide 跨平台环境定制指引生成", () => {
    it("针对 macOS / Linux 源码运行模式生成 git pull && uv sync", () => {
      const guide = generateBackendUpgradeGuide(
        "source",
        "Darwin",
        "arm64",
        "0.2.0"
      );
      expect(guide.type).toBe("command");
      expect(guide.title).toContain("源码运行环境");
      expect(guide.copyCommand).toBe("git pull && uv sync");
      expect(guide.description).toContain("Darwin");
      expect(guide.description).toContain("arm64");
    });

    it("针对 Docker 容器运行模式生成 docker compose pull", () => {
      const guide = generateBackendUpgradeGuide(
        "docker",
        "Linux",
        "x86_64",
        "0.2.0"
      );
      expect(guide.type).toBe("docker");
      expect(guide.title).toContain("Docker");
      expect(guide.copyCommand).toBe("docker compose pull && docker compose up -d");
    });

    it("针对 Windows 绿色包模式生成 zip 下载直链", () => {
      const guide = generateBackendUpgradeGuide(
        "binary",
        "Windows",
        "AMD64",
        "0.2.0",
        "https://github.com/download/backend.zip"
      );
      expect(guide.type).toBe("download");
      expect(guide.title).toContain("Windows 绿色免安装版");
      expect(guide.downloadUrl).toBe("https://github.com/download/backend.zip");
    });
  });

  describe("checkUpdate GitHub API 解析与双端解耦比对", () => {
    it("能正确解析 release-manifest.json 资产并完成前端新版与安全预警判定", async () => {
      // 模拟后端信息
      vi.spyOn(serverConfig, "getLastBackendInfo").mockReturnValue({
        version: "0.1.0",
        is_docker: false,
        run_mode: "source",
        platform: "Darwin",
        arch: "arm64",
      });

      const mockManifest = {
        extension: {
          version: "0.2.0",
          min_backend_version: "0.1.0",
          download_url: "https://example.com/ext-v0.2.0.zip",
          changelog: "修复 JavBus 演员列表解析",
        },
        backend: {
          version: "0.1.0",
          is_critical: true,
          security_warning: "修复潜在远程路径逃逸漏洞",
          download_url: "https://example.com/backend.zip",
          changelog: "安全修复",
        },
      };

      const mockRelease = {
        tag_name: "v0.2.0",
        html_url: "https://github.com/test/releases/v0.2.0",
        body: "Release v0.2.0",
        assets: [
          {
            name: "release-manifest.json",
            browser_download_url: "https://example.com/manifest.json",
          },
        ],
      };

      // 模拟 fetch
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
        if (url.toString().includes("manifest.json")) {
          return {
            ok: true,
            json: async () => mockManifest,
          } as any;
        }
        return {
          ok: true,
          json: async () => mockRelease,
        } as any;
      });

      const service = new UpdateCheckerService();
      const res = await service.checkUpdate({ force: true });

      expect(res.success).toBe(true);
      expect(res.extension.hasUpdate).toBe(true);
      expect(res.extension.latestVersion).toBe("0.2.0");
      expect(res.extension.changelog).toBe("修复 JavBus 演员列表解析");

      // 后端版本同为 0.1.0，但标记了 critical
      expect(res.backend.hasUpdate).toBe(false);
      expect(res.backend.isCritical).toBe(true);
      expect(res.backend.securityWarning).toBe("修复潜在远程路径逃逸漏洞");
      expect(res.backend.upgradeGuide.copyCommand).toBe("git pull && uv sync");

      fetchSpy.mockRestore();
    });

    it("在无 manifest 时通过 assets 资产文件名进行正则降级提取", async () => {
      vi.spyOn(serverConfig, "getLastBackendInfo").mockReturnValue({
        version: "0.1.0",
        is_docker: true,
        run_mode: "docker",
        platform: "Linux",
        arch: "x86_64",
      });

      const mockRelease = {
        tag_name: "v0.3.0",
        html_url: "https://github.com/test/releases/v0.3.0",
        body: "### 变更日志\n- 改进了剧照抽样算法",
        assets: [
          {
            name: "javsp-extension-v0.3.0.zip",
            browser_download_url: "https://example.com/javsp-extension-v0.3.0.zip",
          },
          {
            name: "javsp-backend-v0.2.0-windows-x64.zip",
            browser_download_url: "https://example.com/javsp-backend-v0.2.0-windows-x64.zip",
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return {
          ok: true,
          json: async () => mockRelease,
        } as any;
      });

      const service = new UpdateCheckerService();
      const res = await service.checkUpdate({ force: true });

      expect(res.success).toBe(true);
      expect(res.extension.hasUpdate).toBe(true);
      expect(res.extension.latestVersion).toBe("0.3.0");
      expect(res.extension.downloadUrl).toBe("https://example.com/javsp-extension-v0.3.0.zip");

      expect(res.backend.hasUpdate).toBe(true);
      expect(res.backend.latestVersion).toBe("0.2.0");
      expect(res.backend.runMode).toBe("docker");
      expect(res.backend.upgradeGuide.type).toBe("docker");
      expect(res.backend.upgradeGuide.copyCommand).toBe("docker compose pull && docker compose up -d");

      fetchSpy.mockRestore();
    });

    it("检测版本跨协议不兼容时给出清晰警示", async () => {
      vi.spyOn(serverConfig, "getLastBackendInfo").mockReturnValue({
        version: "0.1.0",
        is_docker: false,
        run_mode: "source",
        platform: "Windows",
      });

      const mockManifest = {
        extension: {
          version: "0.5.0",
          min_backend_version: "0.3.0", // 要求最低后端为 0.3.0，当前为 0.1.0
        },
        backend: {
          version: "0.3.0",
        },
      };

      const mockRelease = {
        tag_name: "v0.5.0",
        assets: [
          {
            name: "release-manifest.json",
            browser_download_url: "https://example.com/manifest.json",
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
        if (url.toString().includes("manifest.json")) {
          return { ok: true, json: async () => mockManifest } as any;
        }
        return { ok: true, json: async () => mockRelease } as any;
      });

      const service = new UpdateCheckerService();
      const res = await service.checkUpdate({ force: true });

      expect(res.compatibility.isCompatible).toBe(false);
      expect(res.compatibility.warningMessage).toContain("低于扩展要求的最低版本");
    });

    it("缓存机制：有效期内直接返回缓存，force=true 穿透缓存", async () => {
      let callCount = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            tag_name: "v0.1.0",
            assets: [],
          }),
        } as any;
      });

      const service = new UpdateCheckerService();
      // 第一次请求，会发起 fetch
      const res1 = await service.checkUpdate();
      expect(callCount).toBe(1);
      expect(res1.fromCache).toBe(false);

      // 第二次请求（未过 TTL），直接返回缓存
      const res2 = await service.checkUpdate();
      expect(callCount).toBe(1);
      expect(res2.fromCache).toBe(true);

      // 强制刷新，穿透缓存
      const res3 = await service.checkUpdate({ force: true });
      expect(callCount).toBe(2);
      expect(res3.fromCache).toBe(false);
    });

    it("网络异常时优雅降级并返回错误信息不引发页面崩溃", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("网络未连通"));

      const service = new UpdateCheckerService();
      const res = await service.checkUpdate({ force: true });

      expect(res.success).toBe(false);
      expect(res.error).toContain("网络未连通");
    });
  });
});
