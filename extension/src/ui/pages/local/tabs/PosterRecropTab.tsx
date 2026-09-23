import React, { useState, useMemo, useEffect } from "react";
import {
  Crop,
  Play,
  Eye,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  FolderInput,
  ShieldCheck,
  Filter,
  Search,
  Image as ImageIcon,
  Check,
  HardDrive,
} from "lucide-react";
import { serverConfig } from "../../../../services/serverConfig";
import { RecropPostersResponse, RecropPosterItem } from "../types";

interface PosterRecropTabProps {
  wsState: "disconnected" | "connecting" | "connected";
  addLog?: (level: "info" | "warn" | "error" | "step", message: string) => void;
}

export const PosterRecropTab: React.FC<PosterRecropTabProps> = ({ wsState, addLog }) => {
  const [directory, setDirectory] = useState("");
  const [recursive, setRecursive] = useState(true);
  const [backup, setBackup] = useState(true);
  const [onlyStandardFanza, setOnlyStandardFanza] = useState(true);
  const [dryRun, setDryRun] = useState(false);

  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [fetchingDefaultDir, setFetchingDefaultDir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecropPostersResponse | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "success" | "skipped" | "error">("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [displayLimit, setDisplayLimit] = useState(100);

  // 任务耗时秒表计时器
  useEffect(() => {
    let timer: any = null;
    if (loading) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [loading]);

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

  // 提交执行重裁剪或预检
  const handleExecute = async (overrideDryRun?: boolean) => {
    if (!directory.trim()) {
      setError("请填写需要扫描的目标目录路径");
      return;
    }

    const isDry = overrideDryRun !== undefined ? overrideDryRun : dryRun;
    setLoading(true);
    setError(null);
    setResult(null);

    const actionName = isDry ? "预览扫描" : "执行重裁剪";
    addLog?.("step", `开始对目录 [${directory.trim()}] 发起海报 ${actionName}...`);

    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const headers = {
        ...serverConfig.getAuthHeaders(),
        "Content-Type": "application/json",
      };

      // 设置 10 分钟宽容超时，允许海量文件在机械硬盘/NAS 环境中平稳完成
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 600_000);

      const resp = await fetch(`${baseUrl}/api/tools/recrop-posters`, {
        method: "POST",
        headers,
        signal: abortController.signal,
        body: JSON.stringify({
          directory: directory.trim(),
          recursive,
          dry_run: isDry,
          backup,
          only_standard_fanza: onlyStandardFanza,
          tolerance: 0.02,
          ratio: 1.5,
        }),
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        throw new Error(errJson?.detail || `请求失败 (HTTP ${resp.status})`);
      }

      const data: RecropPostersResponse = await resp.json();
      setResult(data);
      addLog?.(
        "info",
        `海报 ${actionName}完成：扫描到 ${data.scanned_files} 个 fanart，命中待处理 ${data.matched_files} 个，已裁剪 ${data.cropped_files} 个，跳过 ${data.skipped_files} 个，备份旧海报 ${data.backed_up_files} 个`
      );
    } catch (err: any) {
      let msg = err.message || "执行海报重裁剪失败";
      if (err.name === "AbortError") {
        msg = "请求处理超时（超过 10 分钟）。由于后端已采用独立线程与原子写盘保护，后端可能仍在平稳写入磁盘中，建议稍后点击“仅预览扫描”检查最新文件状态。";
      }
      setError(msg);
      addLog?.("error", `海报 ${actionName}失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // 过滤后的明细列表
  const filteredResults = useMemo(() => {
    return (result?.results || []).filter((item: RecropPosterItem) => {
      if (filterMode === "success" && item.status !== "success") return false;
      if (filterMode === "skipped" && item.status !== "skipped") return false;
      if (filterMode === "error" && item.status !== "error") return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        if (
          !item.fanart_path.toLowerCase().includes(kw) &&
          !item.poster_path.toLowerCase().includes(kw)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [result, filterMode, searchKeyword]);

  const displayedResults = useMemo(() => {
    return filteredResults.slice(0, displayLimit);
  }, [filteredResults, displayLimit]);

  return (
    <div className="space-y-6">
      {/* 操作配置卡片 */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Crop className="text-indigo-600" size={18} />
            <h2 className="font-bold text-slate-800 text-sm">海报批量重裁剪设置</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span
              className={`w-2 h-2 rounded-full ${
                wsState === "connected" ? "bg-emerald-500" : "bg-amber-500"
              }`}
            />
            {wsState === "connected" ? "后端就绪" : "未连接后端"}
          </div>
        </div>

        {/* 目录输入行 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700">扫描目标文件夹路径</label>
            <button
              type="button"
              onClick={handleFetchDefaultDirectory}
              disabled={fetchingDefaultDir || loading}
              className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium cursor-pointer"
            >
              {fetchingDefaultDir ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <FolderInput size={12} />
              )}
              读取系统默认扫描目录
            </button>
          </div>
          <input
            type="text"
            placeholder="例如: D:/Videos/Organized 或 /mnt/media"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            disabled={loading}
            className="w-full text-xs font-mono px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[11px] text-slate-400">
            后端将检索该目录下所有文件名中包含 &quot;fanart&quot; 的横版图片（例如 fanart.jpg、IPX-111-fanart.jpg）。
          </p>
        </div>

        {/* 选项复选框矩阵 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition">
            <input
              type="checkbox"
              checked={onlyStandardFanza}
              onChange={(e) => setOnlyStandardFanza(e.target.checked)}
              disabled={loading}
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-xs font-bold text-slate-700">仅限标准大厂比例</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                仅处理 800×538（及同比例高清展开图），其它非标准展开图自动跳过。
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition">
            <input
              type="checkbox"
              checked={backup}
              onChange={(e) => setBackup(e.target.checked)}
              disabled={loading}
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <ShieldCheck size={13} className="text-emerald-600" />
                自动备份原海报
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                若目标 poster 文件已存在，将其重命名为 .bak 备份后再生成新海报。
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
              disabled={loading}
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-xs font-bold text-slate-700">递归子目录</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                同时深度扫描子文件夹中的所有关联横版海报。
              </p>
            </div>
          </label>
        </div>

        {/* 机械硬盘与大批量操作建议卡片 */}
        <div className="p-3 bg-amber-50/60 border border-amber-200/70 rounded-lg text-[11px] text-amber-900 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-amber-800">
            <HardDrive size={13} className="text-amber-600 shrink-0" />
            <span>大批量重裁剪与机械硬盘 (HDD) / NAS 操作须知：</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-amber-700/90 pl-1 leading-relaxed">
            <li>
              <strong>建议先预检</strong>：处理数百上千部影片前，强烈建议先点击“<strong>仅预览扫描 (Dry Run)</strong>”，确认待裁剪与跳过项目无误后再正式执行。
            </li>
            <li>
              <strong>安全原子写盘</strong>：后端内置“原子临时文件安全替换”，即使任务中途被手动终止或电脑断电，原海报绝不会损坏。
            </li>
            <li>
              <strong>平稳顺序处理</strong>：机械硬盘磁头顺序寻道耗时较长（处理千张图通常耗时 1~3 分钟），已采用独立工作线程运行，期间 WebSocket 心跳与浏览器操作均不会被卡死。
            </li>
          </ul>
        </div>

        {/* 运行中动态提示与实时计时器 */}
        {loading && (
          <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-lg text-xs text-indigo-900 flex items-center justify-between animate-pulse">
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0" />
              <div>
                <span className="font-bold">
                  {dryRun ? "正在执行快速预检扫描..." : "正在批量重裁剪并安全写入磁盘..."}
                </span>
                <span className="text-[11px] text-indigo-600 block mt-0.5">
                  若位于机械硬盘或网络共享盘，磁头正在按序寻道与高质量重编码，请耐心等待，切勿重复点击。
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 font-mono text-indigo-700 font-bold ml-3">
              已耗时 {elapsedSeconds} 秒
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-start gap-2">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 操作执行按钮 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkles size={14} className="text-amber-500" />
            <span>
              使用 421px 正面起点与 2:3 对称居中算法，完美保留左侧厂牌与右侧文字留白。
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleExecute(true)}
              disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              {loading && dryRun ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Eye size={14} />
              )}
              仅预览扫描 (Dry Run)
            </button>

            <button
              type="button"
              onClick={() => handleExecute(false)}
              disabled={loading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition shadow-xs cursor-pointer"
            >
              {loading && !dryRun ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              开始批量重裁剪
            </button>
          </div>
        </div>
      </div>

      {/* 结果汇总面板 */}
      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-medium text-slate-500">扫描横版图</span>
              <div className="text-lg font-bold text-slate-800 mt-0.5">
                {result.scanned_files}
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-indigo-100 bg-indigo-50/20 shadow-xs">
              <span className="text-[11px] font-medium text-indigo-700">
                {result.dry_run ? "待裁剪海报" : "已成功重裁剪"}
              </span>
              <div className="text-lg font-bold text-indigo-600 mt-0.5">
                {result.dry_run ? result.matched_files : result.cropped_files}
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-amber-100 bg-amber-50/20 shadow-xs">
              <span className="text-[11px] font-medium text-amber-700">非标准比例跳过</span>
              <div className="text-lg font-bold text-amber-600 mt-0.5">
                {result.skipped_files}
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/20 shadow-xs">
              <span className="text-[11px] font-medium text-emerald-700">原海报已备份</span>
              <div className="text-lg font-bold text-emerald-600 mt-0.5">
                {result.backed_up_files}
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-medium text-slate-500">处理异常</span>
              <div
                className={`text-lg font-bold mt-0.5 ${
                  result.error_files > 0 ? "text-red-600" : "text-slate-800"
                }`}
              >
                {result.error_files}
              </div>
            </div>
          </div>

          {/* 筛选与明细表格卡片 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* 表格工具栏 */}
            <div className="p-3.5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <Filter size={14} className="text-slate-400" />
                <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs">
                  {(
                    [
                      { id: "all", label: `全部 (${result.results.length})` },
                      {
                        id: "success",
                        label: `待裁剪/已成功 (${result.matched_files})`,
                      },
                      { id: "skipped", label: `已跳过 (${result.skipped_files})` },
                      { id: "error", label: `异常 (${result.error_files})` },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setFilterMode(m.id)}
                      className={`px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                        filterMode === m.id
                          ? "bg-white text-indigo-700 shadow-xs font-bold"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 搜索框 */}
              <div className="relative w-full sm:w-64">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  placeholder="搜索文件名或路径..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* 明细列表 */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2.5 px-3.5">原始横版封面 (fanart)</th>
                    <th className="py-2.5 px-3">原始尺寸</th>
                    <th className="py-2.5 px-3.5">目标竖版海报 (poster)</th>
                    <th className="py-2.5 px-3 text-center">状态</th>
                    <th className="py-2.5 px-3.5">处理说明</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedResults.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        没有符合筛选条件的项目
                      </td>
                    </tr>
                  ) : (
                    displayedResults.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-700 max-w-xs truncate" title={item.fanart_path}>
                          {item.fanart_path.split(/[/\\]/).pop()}
                          <span className="block text-[10px] text-slate-400 truncate">
                            {item.fanart_path}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {item.width > 0 ? `${item.width}×${item.height}` : "-"}
                          {item.is_standard_fanza && (
                            <span className="ml-1 px-1 py-0.2 text-[9px] bg-indigo-50 text-indigo-600 font-sans rounded">
                              标准
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-700 max-w-xs truncate" title={item.poster_path}>
                          {item.poster_path.split(/[/\\]/).pop()}
                          {item.backed_up && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] text-emerald-600 font-sans">
                              <Check size={10} /> 已备份
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {item.status === "success" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">
                              <CheckCircle2 size={11} />
                              {result.dry_run ? "待裁剪" : "已裁剪"}
                            </span>
                          )}
                          {item.status === "skipped" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">
                              <RotateCcw size={11} />
                              已跳过
                            </span>
                          )}
                          {item.status === "error" && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700">
                              <AlertTriangle size={11} />
                              异常
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5 text-[11px] text-slate-500">
                          {item.message}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页加载更多提示 */}
            {filteredResults.length > displayedResults.length && (
              <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => prev + 100)}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium cursor-pointer"
                >
                  加载更多 ({displayedResults.length} / {filteredResults.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PosterRecropTab;
