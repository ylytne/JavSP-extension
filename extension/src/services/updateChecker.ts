/**
 * GitHub Release 自动检测更新与跨端差异化指引服务
 * 支持组件解耦比对、宿主运行环境（源码/Docker/二进制）自适应指引及防限流缓存
 */

import {
  BackendRunMode,
  BackendUpgradeGuide,
  UpdateCheckResult,
} from "../ui/pages/settings/types";
import { serverConfig } from "./serverConfig";

export const DEFAULT_GITHUB_REPO = "ylytne/JavSP-extension";
export const CACHE_STORAGE_KEY = "javsp_update_check_cache";
export const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时静默缓存
export const DEFAULT_MIN_BACKEND_VERSION = "0.1.0";

/**
 * 比较两个语义化版本号 (SemVer)
 * @returns 1: v1 > v2; -1: v1 < v2; 0: v1 == v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean = (v: string) =>
    v.trim().replace(/^v/i, "").split("-")[0]; // 忽略开头的 v 和末尾 prerelease 标识

  const parts1 = clean(v1).split(".").map((n) => parseInt(n, 10) || 0);
  const parts2 = clean(v2).split(".").map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

/**
 * 根据后端运行模式及宿主系统生成差异化升级指引
 */
export function generateBackendUpgradeGuide(
  runMode: BackendRunMode,
  platform: string,
  arch: string,
  latestBackendVersion: string,
  downloadUrl?: string
): BackendUpgradeGuide {
  const platStr = platform || "本机系统";
  const archStr = arch ? ` (${arch})` : "";

  if (runMode === "source") {
    return {
      type: "command",
      title: "源码运行环境升级指引",
      description: `检测到您在 ${platStr}${archStr} 下通过源码直接运行后端。只需进入源码目录拉取最新代码并同步依赖即可。`,
      actionText: "复制更新命令",
      copyCommand: "git pull && uv sync",
    };
  }

  if (runMode === "docker") {
    return {
      type: "docker",
      title: "Docker 容器镜像升级指引",
      description: `检测到后端运行于 Docker 容器环境中。请通过 Docker Compose 或命令行重新拉取最新镜像并重启服务容器。`,
      actionText: "复制镜像更新命令",
      copyCommand: "docker compose pull && docker compose up -d",
    };
  }

  if (runMode === "binary") {
    const isWindows = platStr.toLowerCase().includes("win");
    return {
      type: "download",
      title: isWindows ? "Windows 绿色免安装版升级指引" : "可执行程序升级指引",
      description: isWindows
        ? `检测到您正在使用 Windows 绿色版。请下载最新版压缩包，解压后覆盖替换当前程序目录（原有 config.yml 将自动保留）。`
        : `检测到您正在使用预编译可执行文件，请前往 Release 页面下载对应系统的最新二进制包。`,
      actionText: `下载新版可执行包 (v${latestBackendVersion})`,
      downloadUrl:
        downloadUrl ||
        `https://github.com/${DEFAULT_GITHUB_REPO}/releases/latest`,
    };
  }

  // 默认兜底未知模式
  return {
    type: "command",
    title: "通用升级指引",
    description: `若使用源码运行请执行 git pull；若使用 Docker 请拉取最新镜像；若使用 Windows 绿色版请下载最新发布包。`,
    actionText: "复制 Git 拉取命令",
    copyCommand: "git pull && cd backend && uv sync",
    downloadUrl:
      downloadUrl ||
      `https://github.com/${DEFAULT_GITHUB_REPO}/releases/latest`,
  };
}

/**
 * 获取当前前端扩展的实际版本号
 */
export function getCurrentExtensionVersion(): string {
  if (typeof chrome !== "undefined" && chrome.runtime?.getManifest) {
    const manifest = chrome.runtime.getManifest();
    if (manifest?.version) {
      return manifest.version;
    }
  }
  return "0.1.0";
}

interface StorageCacheData {
  timestamp: number;
  result: UpdateCheckResult;
}

export class UpdateCheckerService {
  private memoryCache: StorageCacheData | null = null;

  /**
   * 读取本地缓存
   */
  private async readCache(): Promise<StorageCacheData | null> {
    if (this.memoryCache) {
      return this.memoryCache;
    }

    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const stored = await chrome.storage.local.get([CACHE_STORAGE_KEY]);
        if (stored?.[CACHE_STORAGE_KEY]) {
          return stored[CACHE_STORAGE_KEY] as StorageCacheData;
        }
      } else if (typeof localStorage !== "undefined") {
        const item = localStorage.getItem(CACHE_STORAGE_KEY);
        if (item) {
          return JSON.parse(item) as StorageCacheData;
        }
      }
    } catch (e) {
      console.warn("[UpdateChecker] 读取更新缓存失败:", e);
    }
    return null;
  }

  /**
   * 写入本地缓存
   */
  private async writeCache(data: StorageCacheData): Promise<void> {
    this.memoryCache = data;
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: data });
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.warn("[UpdateChecker] 写入更新缓存失败:", e);
    }
  }

  /**
   * 清除本地缓存
   */
  public async clearCache(): Promise<void> {
    this.memoryCache = null;
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.remove([CACHE_STORAGE_KEY]);
      } else if (typeof localStorage !== "undefined") {
        localStorage.removeItem(CACHE_STORAGE_KEY);
      }
    } catch (e) {
      console.warn("[UpdateChecker] 清除更新缓存失败:", e);
    }
  }

  /**
   * 核心更新检查逻辑
   * @param options.force 是否穿透 12 小时缓存强制请求 GitHub API
   * @param options.repo 可选指定 GitHub 仓库 (owner/repo)
   */
  public async checkUpdate(options?: {
    force?: boolean;
    repo?: string;
  }): Promise<UpdateCheckResult> {
    const repo = options?.repo || DEFAULT_GITHUB_REPO;
    const now = Date.now();

    // 检查缓存（非强制刷新模式下）
    if (!options?.force) {
      const cached = await this.readCache();
      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        return {
          ...cached.result,
          fromCache: true,
        };
      }
    }

    const currentExtVer = getCurrentExtensionVersion();
    const backendInfo = serverConfig.getLastBackendInfo();
    const currentBackendVer = backendInfo?.version || "0.1.0";
    const runMode: BackendRunMode = backendInfo?.run_mode || (backendInfo?.is_docker ? "docker" : "source");
    const platform = backendInfo?.platform || "Unknown";
    const arch = backendInfo?.arch || "";

    const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;

    try {
      const resp = await fetch(apiUrl, {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!resp.ok) {
        throw new Error(
          `GitHub API 响应异常: ${resp.status} ${resp.statusText}`
        );
      }

      const releaseData = await resp.json();
      const tagName: string = releaseData.tag_name || "v0.1.0";
      const releaseUrl: string =
        releaseData.html_url || `https://github.com/${repo}/releases/latest`;
      const body: string = releaseData.body || "";
      const assets: any[] = releaseData.assets || [];

      // 1. 尝试寻找附带的 release-manifest.json 资产
      let manifestData: any = null;
      const manifestAsset = assets.find(
        (a) => a.name === "release-manifest.json"
      );

      if (manifestAsset && manifestAsset.browser_download_url) {
        try {
          const mResp = await fetch(manifestAsset.browser_download_url);
          if (mResp.ok) {
            manifestData = await mResp.json();
          }
        } catch (e) {
          console.warn("[UpdateChecker] 获取 release-manifest.json 失败，回退至正则解析:", e);
        }
      }

      // 2. 尝试从 body 中的隐藏注释解析元数据 <!-- JAVSP_MANIFEST: {...} -->
      if (!manifestData && body) {
        const match = body.match(/<!--\s*JAVSP_MANIFEST:\s*({[\s\S]*?})\s*-->/);
        if (match && match[1]) {
          try {
            manifestData = JSON.parse(match[1]);
          } catch (e) {
            console.warn("[UpdateChecker] 解析 body 内嵌 JAVSP_MANIFEST 失败:", e);
          }
        }
      }

      // 3. 提取版本信息 (优先使用 manifestData，其次从 assets 文件名回退提取)
      let extLatestVer = currentExtVer;
      let extChangelog = "";
      let extDownloadUrl = "";

      let backendLatestVer = currentBackendVer;
      let backendChangelog = "";
      let backendDownloadUrl = "";
      let minBackendVer = DEFAULT_MIN_BACKEND_VERSION;
      let isCritical = false;
      let securityWarning: string | null = null;

      if (manifestData) {
        if (manifestData.extension?.version) {
          extLatestVer = manifestData.extension.version;
        }
        extChangelog = manifestData.extension?.changelog || "";
        extDownloadUrl =
          manifestData.extension?.download_url ||
          assets.find((a) => a.name.includes("extension"))?.browser_download_url ||
          releaseUrl;

        if (manifestData.backend?.version) {
          backendLatestVer = manifestData.backend.version;
        }
        backendChangelog = manifestData.backend?.changelog || "";
        backendDownloadUrl =
          manifestData.backend?.download_url ||
          assets.find((a) => a.name.includes("backend") && a.name.includes("windows"))
            ?.browser_download_url ||
          releaseUrl;

        minBackendVer =
          manifestData.extension?.min_backend_version || DEFAULT_MIN_BACKEND_VERSION;
        isCritical = Boolean(manifestData.backend?.is_critical);
        securityWarning = manifestData.backend?.security_warning || null;
      } else {
        // 回退正则分析 Assets 文件名
        // 匹配形如 javsp-extension-v0.2.0.zip
        const extAsset = assets.find((a) =>
          /javsp-extension[-_]v?(\d+\.\d+\.\d+).*\.zip$/i.test(a.name)
        );
        if (extAsset) {
          const match = extAsset.name.match(
            /javsp-extension[-_]v?(\d+\.\d+\.\d+)/i
          );
          if (match && match[1]) {
            extLatestVer = match[1];
          }
          extDownloadUrl = extAsset.browser_download_url;
        } else {
          // 若没有专门资产，使用 release tag_name 作为前端版本号
          extLatestVer = tagName.replace(/^v/i, "");
          extDownloadUrl = releaseUrl;
        }

        // 匹配形如 javsp-backend-v0.1.0-windows-x64.zip
        const backendAsset = assets.find((a) =>
          /javsp-backend[-_]v?(\d+\.\d+\.\d+).*\.zip$/i.test(a.name)
        );
        if (backendAsset) {
          const match = backendAsset.name.match(
            /javsp-backend[-_]v?(\d+\.\d+\.\d+)/i
          );
          if (match && match[1]) {
            backendLatestVer = match[1];
          }
          backendDownloadUrl = backendAsset.browser_download_url;
        } else {
          // 后端如果未在 Release 中单独提供 zip，保持当前版本或标签版本
          backendLatestVer = currentBackendVer;
          backendDownloadUrl = releaseUrl;
        }

        // 直接使用 GitHub Release Notes 作为通用 changelog
        extChangelog = body;
        backendChangelog = body;
      }

      // 4. 比对版本差异
      const hasExtUpdate = compareVersions(extLatestVer, currentExtVer) > 0;
      const hasBackendUpdate =
        compareVersions(backendLatestVer, currentBackendVer) > 0;

      // 5. 校验双端兼容性
      const isCompatible =
        compareVersions(currentBackendVer, minBackendVer) >= 0;
      let warningMessage: string | undefined;
      if (!isCompatible) {
        warningMessage = `当前后端版本 (${currentBackendVer}) 低于扩展要求的最低版本 (${minBackendVer})，部分新功能或接口可能受限，建议升级后端。`;
      }

      // 6. 生成针对当前后端宿主环境的定制指引
      const upgradeGuide = generateBackendUpgradeGuide(
        runMode,
        platform,
        arch,
        backendLatestVer,
        backendDownloadUrl
      );

      const result: UpdateCheckResult = {
        success: true,
        checkedAt: now,
        fromCache: false,
        tag: tagName,
        releaseUrl,
        extension: {
          hasUpdate: hasExtUpdate,
          currentVersion: currentExtVer,
          latestVersion: extLatestVer,
          changelog: extChangelog,
          downloadUrl: extDownloadUrl,
        },
        backend: {
          hasUpdate: hasBackendUpdate,
          currentVersion: currentBackendVer,
          latestVersion: backendLatestVer,
          changelog: backendChangelog,
          downloadUrl: backendDownloadUrl,
          isCritical,
          securityWarning,
          runMode,
          platform,
          arch,
          upgradeGuide,
        },
        compatibility: {
          isCompatible,
          warningMessage,
        },
      };

      // 写入持久化缓存
      await this.writeCache({
        timestamp: now,
        result,
      });

      return result;
    } catch (err: any) {
      console.warn("[UpdateChecker] 检查更新失败:", err);
      return {
        success: false,
        checkedAt: now,
        fromCache: false,
        tag: "unknown",
        releaseUrl: `https://github.com/${repo}/releases`,
        extension: {
          hasUpdate: false,
          currentVersion: currentExtVer,
          latestVersion: currentExtVer,
        },
        backend: {
          hasUpdate: false,
          currentVersion: currentBackendVer,
          latestVersion: currentBackendVer,
          runMode,
          platform,
          arch,
          upgradeGuide: generateBackendUpgradeGuide(
            runMode,
            platform,
            arch,
            currentBackendVer
          ),
        },
        compatibility: {
          isCompatible: true,
        },
        error: err.message || "无法连接到 GitHub Release 服务",
      };
    }
  }
}

export const updateChecker = new UpdateCheckerService();
