import React, { useState, useMemo } from "react";
import {
  FileText,
  Play,
  Eye,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  FolderInput,
  ShieldCheck,
  Film,
  User,
  Filter,
  Columns2,
  Search,
} from "lucide-react";
import { serverConfig } from "../../../../services/serverConfig";
import { CleanNfoResponse, CleanNfoFileResultItem, PreviewNfoResponse } from "../types";
import { NfoDiffModal } from "../components/NfoDiffModal";

interface NfoCleanerTabProps {
  wsState: "disconnected" | "connecting" | "connected";
  addLog?: (level: "info" | "warn" | "error" | "step", message: string) => void;
}

export const NfoCleanerTab: React.FC<NfoCleanerTabProps> = ({ wsState, addLog }) => {
  const [directory, setDirectory] = useState("");
  const [cleanTrailer, setCleanTrailer] = useState(true);
  const [cleanActorThumb, setCleanActorThumb] = useState(true);
  const [recursive, setRecursive] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [backup, setBackup] = useState(false);

  const [loading, setLoading] = useState(false);
  const [fetchingDefaultDir, setFetchingDefaultDir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CleanNfoResponse | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "changed" | "error">("changed");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [displayLimit, setDisplayLimit] = useState(100);

  // 对比差异弹窗与按需懒加载缓存状态
  const [selectedFileForDiff, setSelectedFileForDiff] = useState<string | null>(null);
  const [diffCache, setDiffCache] = useState<Record<string, PreviewNfoResponse>>({});

  // 读取系统配置中的默认输入目录
  const handleFetchDefaultDirectory = async () => {
    setFetchingDefaultDir(true);
    setError(null);
    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const headers = serverConfig.getAuthHeaders();
      const resp = await fetch(`${baseUrl}/api/config`, { headers });
      if (!resp.ok) {
        throw new Error(`无法获取后端配置 (HTTP ${resp.status})`);
      }
      const cfg = await resp.json();
      const defaultDir = cfg?.scanner?.input_directory || cfg?.input_directory || "";
      if (defaultDir) {
        setDirectory(defaultDir);
        addLog?.("info", `已填充系统默认扫描目录: ${defaultDir}`);
      } else {
        setError("系统配置中未设置默认输入目录，请手动输入");
      }
    } catch (err: any) {
      setError(err.message || "读取默认目录失败");
    } finally {
      setFetchingDefaultDir(false);
    }
  };

  // 提交执行清理
  const handleExecute = async () => {
    if (!directory.trim()) {
      setError("请填写需要扫描的目标目录路径");
      return;
    }
    if (!cleanTrailer && !cleanActorThumb) {
      setError("请至少勾选一项需要清理的标签（Trailer 或 Actor Thumb）");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const actionName = dryRun ? "预览扫描" : "执行清理";
    addLog?.("step", `开始对目录 [${directory.trim()}] 发起 NFO ${actionName}...`);

    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const headers = {
        ...serverConfig.getAuthHeaders(),
        "Content-Type": "application/json",
      };

      const resp = await fetch(`${baseUrl}/api/tools/clean-nfo`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          directory: directory.trim(),
          clean_trailer: cleanTrailer,
          clean_actor_thumb: cleanActorThumb,
          recursive,
          dry_run: dryRun,
          backup,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        throw new Error(errJson?.detail || `请求失败 (HTTP ${resp.status})`);
      }

      const data: CleanNfoResponse = await resp.json();
      setResult(data);
      addLog?.(
        "info",
        `NFO ${actionName}完成：扫描 ${data.scanned_files} 个文件，涉及修改 ${data.modified_files} 个文件，清理 trailer x${data.total_trailer_removed}, actor.thumb x${data.total_actor_thumb_removed}`
      );
    } catch (err: any) {
      const msg = err.message || "执行 NFO 清理请求失败";
      setError(msg);
      addLog?.("error", `NFO ${actionName}失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // 过滤后的明细列表（支持状态模式与关键词搜索）
  const filteredResults = useMemo(() => {
    return (result?.results || []).filter((item: CleanNfoFileResultItem) => {
      if (filterMode === "changed" && !item.changed) return false;
      if (filterMode === "error" && !item.error) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        if (!item.path.toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  }, [result, filterMode, searchKeyword]);

  // 渲染限制切片，避免上千个节点同时挂载导致 DOM 卡顿
  const displayedResults = useMemo(() => {
    return filteredResults.slice(0, displayLimit);
  }, [filteredResults, displayLimit]);


  return (
    <div className="space-y-6">
      {/* 顶部功能说明 */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
            <FileText size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              NFO 标签清理工具
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-normal">
                本地工具
              </span>
            </h2>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">
              扫描指定磁盘目录下的全部 <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">.nfo</code>{" "}
              元数据文件，移除失效的预告片流地址（<code className="bg-slate-100 px-1 py-0.5 rounded text-xs">&lt;trailer&gt;</code>）或外链演员头像（
              <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">&lt;actor&gt;&lt;thumb&gt;</code>
              ），解决 Jellyfin / Emby / Kodi 媒体库扫描卡死与并发图床 403 阻断问题。
            </p>
          </div>
        </div>
      </div>

      {/* 参数配置卡片 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-5">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-600" />
          清理参数配置
        </h3>

        {/* 目标目录输入 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            目标扫描目录 (绝对路径)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="例如: D:\Videos\Jav 或 /media/movies"
              className="flex-1 px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
            />
            <button
              type="button"
              onClick={handleFetchDefaultDirectory}
              disabled={fetchingDefaultDir || wsState !== "connected"}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title="读取后端配置中的 scanner.input_directory"
            >
              {fetchingDefaultDir ? <Loader2 size={16} className="animate-spin" /> : <FolderInput size={16} />}
              读取系统输入目录
            </button>
          </div>
        </div>

        {/* 清理与运行选项 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
          {/* 清理 trailer */}
          <label className="flex items-start gap-3 p-3.5 border rounded-lg cursor-pointer transition hover:bg-slate-50 border-slate-200 bg-white">
            <input
              type="checkbox"
              checked={cleanTrailer}
              onChange={(e) => {
                setCleanTrailer(e.target.checked);
                setDiffCache({});
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <Film size={15} className="text-slate-600" />
                清理 &lt;trailer&gt; 标签
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                移除 NFO 中的预告片视频地址，防止外部 m3u8 卡死播放器
              </p>
            </div>
          </label>

          {/* 清理 actor.thumb */}
          <label className="flex items-start gap-3 p-3.5 border rounded-lg cursor-pointer transition hover:bg-slate-50 border-slate-200 bg-white">
            <input
              type="checkbox"
              checked={cleanActorThumb}
              onChange={(e) => {
                setCleanActorThumb(e.target.checked);
                setDiffCache({});
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />

            <div>
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <User size={15} className="text-slate-600" />
                清理 &lt;actor&gt;&lt;thumb&gt;
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                移除演员外链头像（保留演员名），规避媒体库图床风控
              </p>
            </div>
          </label>

          {/* 递归子目录 */}
          <label className="flex items-start gap-3 p-3.5 border rounded-lg cursor-pointer transition hover:bg-slate-50 border-slate-200 bg-white">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-semibold text-slate-800">
                递归扫描子目录
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                深入子文件夹批量检索所有 .nfo 文件
              </p>
            </div>
          </label>

          {/* 预览模式 */}
          <label className="flex items-start gap-3 p-3.5 border rounded-lg cursor-pointer transition hover:bg-slate-50 border-slate-200 bg-white">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <Eye size={15} className="text-amber-600" />
                仅试运行预览 (Dry-run)
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                仅统计改动和展示列表，不向磁盘写入任何文件
              </p>
            </div>
          </label>

          {/* 备份原文件 */}
          <label className="flex items-start gap-3 p-3.5 border rounded-lg cursor-pointer transition hover:bg-slate-50 border-slate-200 bg-white">
            <input
              type="checkbox"
              checked={backup}
              onChange={(e) => setBackup(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-emerald-600" />
                生成备份文件 (.bak)
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                修改前自动将原文件另存为 filename.nfo.bak
              </p>
            </div>
          </label>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 执行按钮组 */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <div className="text-xs text-slate-500">
            后端状态:{" "}
            <span
              className={
                wsState === "connected"
                  ? "text-emerald-600 font-semibold"
                  : "text-rose-500 font-semibold"
              }
            >
              {wsState === "connected" ? "在线" : "离线"}
            </span>
          </div>
          <div className="flex gap-3">
            {result && (
              <button
                type="button"
                onClick={() => setResult(null)}
                className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:text-slate-800 transition cursor-pointer"
              >
                <RotateCcw size={15} />
                清空结果
              </button>
            )}
            <button
              type="button"
              onClick={handleExecute}
              disabled={loading || wsState !== "connected"}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                dryRun
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  处理中...
                </>
              ) : dryRun ? (
                <>
                  <Eye size={16} />
                  开始预览扫描
                </>
              ) : (
                <>
                  <Play size={16} />
                  开始执行清理
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 清理结果展示面板 */}
      {result && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={20} className="text-emerald-600" />
              <h3 className="text-base font-semibold text-slate-800">
                处理结果汇总 {result.dry_run && <span className="text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">仅试运行预览</span>}
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-mono">{result.directory}</span>
          </div>

          {/* 统计指标卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500">已扫描文件</div>
              <div className="text-xl font-bold text-slate-800 mt-1">{result.scanned_files}</div>
            </div>
            <div className="p-3.5 bg-indigo-50/60 rounded-lg border border-indigo-100">
              <div className="text-xs text-indigo-600 font-medium">涉及修改文件</div>
              <div className="text-xl font-bold text-indigo-700 mt-1">{result.modified_files}</div>
            </div>
            <div className="p-3.5 bg-sky-50/60 rounded-lg border border-sky-100">
              <div className="text-xs text-sky-600 font-medium">清理 Trailer 数</div>
              <div className="text-xl font-bold text-sky-700 mt-1">{result.total_trailer_removed}</div>
            </div>
            <div className="p-3.5 bg-purple-50/60 rounded-lg border border-purple-100">
              <div className="text-xs text-purple-600 font-medium">清理 Thumb 数</div>
              <div className="text-xl font-bold text-purple-700 mt-1">{result.total_actor_thumb_removed}</div>
            </div>
            <div className="p-3.5 bg-rose-50/60 rounded-lg border border-rose-100">
              <div className="text-xs text-rose-600 font-medium">异常错误文件</div>
              <div className="text-xl font-bold text-rose-700 mt-1">{result.error_files}</div>
            </div>
          </div>

          {/* 明细过滤与列表 */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-sm">
              <div className="flex items-center gap-2 font-medium text-slate-700">
                <Filter size={15} />
                <span>文件列表 ({filteredResults.length})</span>
                <span className="text-xs text-slate-400 font-normal">
                  (点击任意文件可对比修改前/修改后)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* 搜索框 */}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="按文件名搜索..."
                    className="pl-8 pr-2.5 py-1 text-xs border border-slate-200 rounded-md focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-36 sm:w-48 bg-slate-50 focus:bg-white"
                  />
                  {searchKeyword && (
                    <button
                      type="button"
                      onClick={() => setSearchKeyword("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* 过滤模式 */}
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode("changed");
                      setDisplayLimit(100);
                    }}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      filterMode === "changed"
                        ? "bg-white text-indigo-700 font-semibold shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    仅修改 ({result.modified_files})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode("all");
                      setDisplayLimit(100);
                    }}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      filterMode === "all"
                        ? "bg-white text-indigo-700 font-semibold shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    全部 ({result.scanned_files})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterMode("error");
                      setDisplayLimit(100);
                    }}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                      filterMode === "error"
                        ? "bg-white text-rose-700 font-semibold shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    仅异常 ({result.error_files})
                  </button>
                </div>
              </div>
            </div>

            {/* 文件明细列表 */}
            {filteredResults.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm bg-slate-50 rounded-lg border border-dashed border-slate-200">
                当前筛选条件下无文件
              </div>
            ) : (
              <div className="space-y-2">
                <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                  {displayedResults.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => !item.error && setSelectedFileForDiff(item.path)}
                      className={`p-3 flex items-center justify-between transition ${
                        item.error
                          ? "bg-white"
                          : "hover:bg-indigo-50/40 cursor-pointer group"
                      }`}
                      title={item.error ? item.error : "点击查看修改前后两栏对比"}
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="font-mono text-slate-800 truncate group-hover:text-indigo-700 transition-colors">
                          {item.path}
                        </div>
                        {item.error ? (
                          <div className="text-rose-600 mt-0.5">错误: {item.error}</div>
                        ) : (
                          <div className="text-slate-500 mt-0.5 flex gap-2">
                            {item.trailer_removed > 0 && (
                              <span className="text-sky-600">trailer x{item.trailer_removed}</span>
                            )}
                            {item.actor_thumb_removed > 0 && (
                              <span className="text-purple-600">thumb x{item.actor_thumb_removed}</span>
                            )}
                            {!item.changed && <span>未包含待清理标签</span>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!item.error && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFileForDiff(item.path);
                            }}
                            className="hidden group-hover:flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition cursor-pointer"
                            title="对比前后修改差异"
                          >
                            <Columns2 size={12} />
                            对比差异
                          </button>
                        )}
                        {item.error ? (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md font-medium">
                            失败
                          </span>
                        ) : item.changed ? (
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md font-medium">
                            {result.dry_run ? "将修改" : "已修改"}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                            无变动
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 性能优化：海量文件时分页加载更多 */}
                {filteredResults.length > displayLimit && (
                  <div className="flex items-center justify-between px-2 pt-1 text-xs text-slate-500">
                    <span>
                      已显示前 {displayLimit} 项（共 {filteredResults.length} 项）
                    </span>
                    <button
                      type="button"
                      onClick={() => setDisplayLimit((prev) => prev + 100)}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-md transition cursor-pointer"
                    >
                      加载更多 100 项
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 按需懒加载对比弹窗 */}
      <NfoDiffModal
        isOpen={!!selectedFileForDiff}
        filePath={selectedFileForDiff}
        onClose={() => setSelectedFileForDiff(null)}
        cleanTrailer={cleanTrailer}
        cleanActorThumb={cleanActorThumb}
        cachedData={selectedFileForDiff ? diffCache[selectedFileForDiff] : null}
        onDataLoaded={(path, data) => {
          setDiffCache((prev) => ({ ...prev, [path]: data }));
        }}
      />
    </div>
  );
};

