import React, { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  Download,
  Copy,
  Check,
  ExternalLink,
  Server,
  Puzzle,
  Terminal,
  Clock,
  Loader2,
  Info,
  Layers,
} from "lucide-react";
import {
  UpdateCheckResult,
  BackendRunMode,
} from "../types";
import {
  updateChecker,
  getCurrentExtensionVersion,
  DEFAULT_GITHUB_REPO,
} from "../../../../services/updateChecker";
import { serverConfig } from "../../../../services/serverConfig";

interface AboutTabProps {
  serverAddress: string;
}

export const AboutTab: React.FC<AboutTabProps> = ({ serverAddress }) => {
  const [loading, setLoading] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [backendMeta, setBackendMeta] = useState<{
    version?: string;
    is_docker?: boolean;
    run_mode?: BackendRunMode;
    platform?: string;
    arch?: string;
  } | null>(serverConfig.getLastBackendInfo());

  // 执行更新检查
  const handleCheckUpdate = useCallback(async (force = true) => {
    setLoading(true);
    try {
      // 若后端尚未探测过，顺带测一次连接刷新 meta
      if (!serverConfig.getLastBackendInfo()) {
        const testRes = await serverConfig.testConnection();
        if (testRes.success) {
          setBackendMeta({
            version: testRes.version,
            is_docker: testRes.is_docker,
            run_mode: testRes.run_mode,
            platform: testRes.platform,
            arch: testRes.arch,
          });
        }
      } else {
        setBackendMeta(serverConfig.getLastBackendInfo());
      }

      const res = await updateChecker.checkUpdate({ force });
      setUpdateResult(res);
    } catch (e) {
      console.warn("更新检查抛出异常:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // 挂载时尝试从缓存读取（非强制检查）
  useEffect(() => {
    handleCheckUpdate(false);
  }, [handleCheckUpdate]);

  // 复制命令剪贴板
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const extCurrentVer = getCurrentExtensionVersion();
  const backendCurrentVer = backendMeta?.version || "未连接";
  const runMode = backendMeta?.run_mode || (backendMeta?.is_docker ? "docker" : "source");
  const platform = backendMeta?.platform || "Unknown";
  const arch = backendMeta?.arch || "";

  // 格式化运行环境标签
  const formatEnvLabel = () => {
    if (!backendMeta?.version) return "服务未连接";
    if (runMode === "docker") return "🐳 Docker 容器环境";
    if (runMode === "binary") return `📦 预编译二进制 (${platform})`;
    const platName = platform === "Darwin" ? "macOS" : platform;
    return `🖥️ 源码运行 (${platName} ${arch})`.trim();
  };

  return (
    <div className="space-y-5">
      {/* 顶部环境总览卡片 */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm border border-indigo-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-44 h-44 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 font-bold text-sm">
                <Layers size={18} />
              </span>
              <h3 className="text-base font-bold tracking-tight">JavSP 架构与版本信息</h3>
              <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                双端协同架构
              </span>
            </div>
            <p className="text-xs text-indigo-200/80 leading-relaxed max-w-xl">
              前端扩展专注于目标站 DOM 爬取、防盗链与过盾，后端专注于本地文件管理、NFO 节点生成与多媒体智能裁切。两端遵循语义化版本及最低兼容契约。
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleCheckUpdate(true)}
            className="self-start sm:self-center inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {loading ? "正在检查..." : "立即检查更新"}
          </button>
        </div>

        {/* 核心版本状态网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-indigo-800/50 text-xs">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Puzzle size={16} className="text-indigo-400" />
              <div>
                <div className="text-[11px] text-indigo-200/70">浏览器扩展端</div>
                <div className="font-bold font-mono text-sm text-white">v{extCurrentVer}</div>
              </div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
              运行中 (MV3)
            </span>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Server size={16} className="text-indigo-400" />
              <div>
                <div className="text-[11px] text-indigo-200/70">本地/远程后端</div>
                <div className="font-bold font-mono text-sm text-white">
                  {backendMeta?.version ? `v${backendCurrentVer}` : "未连接"}
                </div>
              </div>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${
                backendMeta?.version
                  ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                  : "bg-rose-500/20 text-rose-300 border-rose-500/30"
              }`}
            >
              {formatEnvLabel()}
            </span>
          </div>
        </div>
      </div>

      {/* 状态通知行 (上次检测时间 / 缓存标识 / 报错信息) */}
      {updateResult && (
        <div className="flex items-center justify-between text-xs px-1 text-slate-500">
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-slate-400" />
            <span>
              上次检查: {new Date(updateResult.checkedAt).toLocaleTimeString()}
            </span>
            {updateResult.fromCache && (
              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                12 小时静默缓存
              </span>
            )}
          </div>
          {updateResult.releaseUrl && (
            <a
              href={updateResult.releaseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 hover:text-indigo-700 flex items-center gap-1 hover:underline"
            >
              前往 GitHub Release 页面
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* 高危安全漏洞提醒 Banner (最高优先级) */}
      {updateResult?.backend?.isCritical && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 text-xs text-rose-900 flex items-start gap-3 shadow-xs animate-in fade-in">
          <ShieldAlert size={20} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <div className="font-bold text-sm text-rose-800 flex items-center gap-2">
              【高危安全预警】后端服务发现重要安全修复
              <span className="text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded font-mono font-bold">
                CRITICAL
              </span>
            </div>
            <p className="leading-relaxed text-rose-700">
              {updateResult.backend.securityWarning ||
                "官方已发布包含严重安全漏洞修复的后端版本，强烈建议立即按照下方升级指引更新后端服务！"}
            </p>
          </div>
        </div>
      )}

      {/* 接口协议不兼容警告 Banner */}
      {updateResult && !updateResult.compatibility.isCompatible && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3 shadow-xs">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-amber-800">
              后端协议版本过低（兼容性警告）
            </div>
            <p className="leading-relaxed text-amber-700">
              {updateResult.compatibility.warningMessage}
            </p>
          </div>
        </div>
      )}

      {/* 检查失败提示 */}
      {updateResult && !updateResult.success && updateResult.error && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 flex items-center gap-2.5">
          <AlertCircle size={16} className="text-slate-400 shrink-0" />
          <span>检查更新失败: {updateResult.error}（可能是未连接公网或触发了 GitHub API 匿名访问频控）</span>
        </div>
      )}

      {/* 左右分栏：前端扩展更新 vs 后端服务更新 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 卡片 A：前端扩展更新 */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-2xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                  <Puzzle size={15} />
                </span>
                <span className="text-xs font-bold text-slate-800">前端扩展更新</span>
              </div>
              {updateResult?.extension.hasUpdate ? (
                <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">
                  发现新版 v{updateResult.extension.latestVersion}
                </span>
              ) : (
                <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  已是最新
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              主要负责目标站（JavDB / JavBus / FC2 等）爬虫解析、防盗链规则及翻译调度。若爬虫失效请及时更新前端。
            </p>

            {updateResult?.extension.hasUpdate && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-3 text-xs space-y-2">
                <div className="font-semibold text-indigo-900 text-[11px]">
                  更新说明 (v{updateResult.extension.latestVersion}):
                </div>
                <div className="text-slate-600 text-[11px] max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {updateResult.extension.changelog || "包含爬虫解析优化与问题修复。"}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2">
            {updateResult?.extension.hasUpdate ? (
              <>
                <a
                  href={updateResult.extension.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                >
                  <Download size={14} />
                  下载前端扩展包 (.zip)
                </a>
                <div className="text-[10px] text-slate-400 text-center leading-normal">
                  提示: 下载后解压覆盖原有扩展目录，并在{" "}
                  <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">
                    chrome://extensions
                  </code>{" "}
                  点击刷新。
                </div>
              </>
            ) : (
              <div className="text-[11px] text-slate-400 text-center py-1">
                当前安装的扩展版本已是最新，爬虫与过盾规则保持最佳状态。
              </div>
            )}
          </div>
        </div>

        {/* 卡片 B：后端服务更新（环境自适应定制指引） */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5 shadow-2xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                  <Server size={15} />
                </span>
                <span className="text-xs font-bold text-slate-800">后端服务更新</span>
              </div>
              {updateResult?.backend.hasUpdate ? (
                <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                  发现新版 v{updateResult.backend.latestVersion}
                </span>
              ) : (
                <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  已是最新
                </span>
              )}
            </div>

            <div className="text-[11px] text-slate-500 leading-relaxed">
              负责文件扫描、重命名、NFO 节点生成与海报裁剪。当前宿主环境：
              <span className="font-semibold text-slate-700 ml-1 font-mono">
                {formatEnvLabel()}
              </span>
            </div>

            {/* 跨平台定制升级操作区 */}
            {updateResult?.backend && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
                <div className="font-bold text-slate-800 text-[11px] flex items-center gap-1.5">
                  <Terminal size={13} className="text-indigo-600" />
                  {updateResult.backend.upgradeGuide.title}
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  {updateResult.backend.upgradeGuide.description}
                </p>

                {/* 命令复制块 */}
                {updateResult.backend.upgradeGuide.copyCommand && (
                  <div className="relative group">
                    <pre className="bg-slate-900 text-indigo-300 p-2.5 rounded-md font-mono text-[11px] overflow-x-auto select-all">
                      {updateResult.backend.upgradeGuide.copyCommand}
                    </pre>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          updateResult.backend.upgradeGuide.copyCommand!,
                          "backend_cmd"
                        )
                      }
                      className="absolute right-1.5 top-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] font-medium flex items-center gap-1 transition cursor-pointer border border-slate-700 shadow-xs"
                    >
                      {copiedKey === "backend_cmd" ? (
                        <>
                          <Check size={11} className="text-emerald-400" />
                          <span className="text-emerald-400">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>复制</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* 二进制下载链接 */}
                {updateResult.backend.upgradeGuide.downloadUrl && (
                  <a
                    href={updateResult.backend.upgradeGuide.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition shadow-xs"
                  >
                    <Download size={14} />
                    {updateResult.backend.upgradeGuide.actionText || "下载新版后端包"}
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 text-center">
            后端服务保持高内聚，在没有 API 协议变更或安全漏洞时，无需频繁重启更新。
          </div>
        </div>
      </div>

      {/* 底部帮助与社区外链 */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3.5 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-indigo-600 shrink-0" />
          <span>遇到抓取异常或疑问？请访问官方 GitHub 仓库提交 Issue。</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href={`https://github.com/${DEFAULT_GITHUB_REPO}`}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 hover:underline"
          >
            项目主页
            <ExternalLink size={11} />
          </a>
          <span>·</span>
          <a
            href={`https://github.com/${DEFAULT_GITHUB_REPO}/releases`}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 hover:underline"
          >
            全量发布历史
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
};
