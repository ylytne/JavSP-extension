import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  Copy,
  Check,
  Loader2,
  FileCode2,
  AlertCircle,
  Film,
  User,
} from "lucide-react";
import { serverConfig } from "../../../../services/serverConfig";
import { PreviewNfoResponse } from "../types";

interface NfoDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  filePath: string | null;
  cleanTrailer: boolean;
  cleanActorThumb: boolean;
  cachedData?: PreviewNfoResponse | null;
  onDataLoaded?: (path: string, data: PreviewNfoResponse) => void;
}

interface DiffRow {
  type: "equal" | "delete" | "insert";
  origLineNo: number | null;
  origText: string;
  cleanLineNo: number | null;
  cleanText: string;
}

/**
 * 经典 LCS (最长公共子序列) 文本行对齐差分算法
 */
function computeSideBySideDiff(origText: string, cleanText: string): DiffRow[] {
  const origLines = origText.split(/\r?\n/);
  const cleanLines = cleanText.split(/\r?\n/);

  const m = origLines.length;
  const n = cleanLines.length;

  // 保护性上限，防止异常极端巨大文件导致卡顿
  if (m > 2000 || n > 2000) {
    const maxLen = Math.max(m, n);
    const simpleRows: DiffRow[] = [];
    for (let k = 0; k < maxLen; k++) {
      simpleRows.push({
        type: origLines[k] === cleanLines[k] ? "equal" : "delete",
        origLineNo: k < m ? k + 1 : null,
        origText: origLines[k] ?? "",
        cleanLineNo: k < n ? k + 1 : null,
        cleanText: cleanLines[k] ?? "",
      });
    }
    return simpleRows;
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (origLines[i] === cleanLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const rows: DiffRow[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === cleanLines[j - 1]) {
      rows.push({
        type: "equal",
        origLineNo: i,
        origText: origLines[i - 1],
        cleanLineNo: j,
        cleanText: cleanLines[j - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rows.push({
        type: "insert",
        origLineNo: null,
        origText: "",
        cleanLineNo: j,
        cleanText: cleanLines[j - 1],
      });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      rows.push({
        type: "delete",
        origLineNo: i,
        origText: origLines[i - 1],
        cleanLineNo: null,
        cleanText: "",
      });
      i--;
    }
  }

  return rows.reverse();
}

export const NfoDiffModal: React.FC<NfoDiffModalProps> = ({
  isOpen,
  onClose,
  filePath,
  cleanTrailer,
  cleanActorThumb,
  cachedData,
  onDataLoaded,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewNfoResponse | null>(null);
  const [copied, setCopied] = useState(false);

  // 监听键盘 ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // 按需懒加载预览数据
  useEffect(() => {
    if (!isOpen || !filePath) {
      setData(null);
      setError(null);
      return;
    }

    if (cachedData && cachedData.path === filePath) {
      setData(cachedData);
      return;
    }

    let isMounted = true;
    const fetchPreview = async () => {
      setLoading(true);
      setError(null);
      try {
        const baseUrl = serverConfig.getHttpBaseUrl();
        const headers = {
          ...serverConfig.getAuthHeaders(),
          "Content-Type": "application/json",
        };

        const resp = await fetch(`${baseUrl}/api/tools/preview-nfo`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            path: filePath,
            clean_trailer: cleanTrailer,
            clean_actor_thumb: cleanActorThumb,
          }),
        });

        if (!resp.ok) {
          const errJson = await resp.json().catch(() => null);
          throw new Error(errJson?.detail || `加载对比失败 (HTTP ${resp.status})`);
        }

        const resData: PreviewNfoResponse = await resp.json();
        if (isMounted) {
          setData(resData);
          onDataLoaded?.(filePath, resData);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "无法获取文件对比数据");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [isOpen, filePath, cleanTrailer, cleanActorThumb, cachedData, onDataLoaded]);

  // 计算行级对比
  const diffRows = useMemo(() => {
    if (!data) return [];
    return computeSideBySideDiff(data.original, data.cleaned);
  }, [data]);

  // 一键复制修改后内容
  const handleCopyCleaned = async () => {
    if (!data?.cleaned) return;
    try {
      await navigator.clipboard.writeText(data.cleaned);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 容错降级
      const textarea = document.createElement("textarea");
      textarea.value = data.cleaned;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
              <FileCode2 size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800 truncate" title={filePath || ""}>
                  {filePath ? filePath.split(/[/\\]/).pop() : "文件对比预览"}
                </h3>
                {data && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {data.trailer_removed > 0 && (
                      <span className="flex items-center gap-1 text-[11px] bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full font-medium">
                        <Film size={12} />
                        trailer -{data.trailer_removed}
                      </span>
                    )}
                    {data.actor_thumb_removed > 0 && (
                      <span className="flex items-center gap-1 text-[11px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                        <User size={12} />
                        thumb -{data.actor_thumb_removed}
                      </span>
                    )}
                    {!data.changed && (
                      <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        文件无需修改
                      </span>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 font-mono truncate mt-0.5" title={filePath || ""}>
                {filePath}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {data?.cleaned && (
              <button
                type="button"
                onClick={handleCopyCleaned}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition cursor-pointer shadow-2xs"
                title="复制清理后的 XML 文本内容"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    <span className="text-emerald-700 font-semibold">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>复制修改后</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition cursor-pointer"
              title="关闭 (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 双栏列头 */}
        <div className="grid grid-cols-2 bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700 divide-x divide-slate-200 shrink-0 select-none">
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
              修改前 (原文件内容)
            </span>
            <span className="text-slate-400 font-mono font-normal">Original</span>
          </div>
          <div className="px-4 py-2 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
              修改后 (清理后内容)
            </span>
            <span className="text-slate-400 font-mono font-normal">Cleaned</span>
          </div>
        </div>

        {/* 差异内容滚动主体 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden font-mono text-xs">
          {loading ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 size={32} className="animate-spin text-indigo-600" />
              <p className="text-sm">正在读取并实时分析 NFO 差异...</p>
            </div>
          ) : error ? (
            <div className="h-96 flex flex-col items-center justify-center gap-3 text-rose-600 p-6 text-center">
              <AlertCircle size={36} />
              <p className="text-base font-semibold">加载预览对比失败</p>
              <p className="text-xs text-rose-500 max-w-md">{error}</p>
            </div>
          ) : diffRows.length === 0 ? (
            <div className="h-96 flex items-center justify-center text-slate-400 text-sm">
              暂无对比内容
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {diffRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-2 divide-x divide-slate-200">
                  {/* 左栏：修改前 */}
                  <div
                    className={`flex items-start px-2 py-0.5 overflow-hidden ${
                      row.type === "delete"
                        ? "bg-rose-50/90 text-rose-950 font-medium"
                        : "text-slate-800 hover:bg-slate-50/80"
                    }`}
                  >
                    <span className="w-9 text-right pr-2 text-slate-400 select-none shrink-0 leading-5">
                      {row.origLineNo ?? ""}
                    </span>
                    <span
                      className={`w-4 select-none shrink-0 text-center leading-5 font-bold ${
                        row.type === "delete" ? "text-rose-600" : "text-transparent"
                      }`}
                    >
                      {row.type === "delete" ? "-" : " "}
                    </span>
                    <span className="whitespace-pre-wrap break-all leading-5 pl-1 flex-1">
                      {row.origText}
                    </span>
                  </div>

                  {/* 右栏：修改后 */}
                  <div
                    className={`flex items-start px-2 py-0.5 overflow-hidden ${
                      row.type === "delete"
                        ? "bg-slate-100/50"
                        : row.type === "insert"
                        ? "bg-emerald-50 text-emerald-950 font-medium"
                        : "text-slate-800 hover:bg-slate-50/80"
                    }`}
                  >
                    <span className="w-9 text-right pr-2 text-slate-400 select-none shrink-0 leading-5">
                      {row.cleanLineNo ?? ""}
                    </span>
                    <span
                      className={`w-4 select-none shrink-0 text-center leading-5 font-bold ${
                        row.type === "insert" ? "text-emerald-600" : "text-transparent"
                      }`}
                    >
                      {row.type === "insert" ? "+" : " "}
                    </span>
                    <span className="whitespace-pre-wrap break-all leading-5 pl-1 flex-1">
                      {row.cleanText}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部信息栏 */}
        <div className="px-6 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-rose-200 border border-rose-400 rounded-xs"></span>
              红色背景为已被清除的标签行
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-slate-100 border border-slate-300 rounded-xs"></span>
              灰白为空缺对齐占位
            </span>
          </div>
          <div>按 ESC 或点击右上角关闭</div>
        </div>
      </div>
    </div>
  );
};
export default NfoDiffModal;
