import React, { useState, useEffect } from "react";
import {
  Film,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FolderCheck,
  Maximize2,
  X,
  Check,
  Edit3,
} from "lucide-react";
import { ScanMovieItem } from "../../crawlers/types";

interface TaskCardProps {
  item: ScanMovieItem;
  onScrapeSingle: (item: ScanMovieItem) => void;
  onUpdateDvdid?: (taskId: string, newDvdid: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ item, onScrapeSingle, onUpdateDvdid }) => {
  const [expanded, setExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDvdid, setEditDvdid] = useState(item.dvdid || "");

  // 外部番号发生变更且未在编辑时自动同步
  useEffect(() => {
    if (!isEditing) {
      setEditDvdid(item.dvdid || "");
    }
  }, [item.dvdid, isEditing]);

  // 当任务进入刮削或整理状态时自动退出编辑态
  useEffect(() => {
    if (item.status === "scraping" || item.status === "organizing") {
      setIsEditing(false);
    }
  }, [item.status]);

  const handleSaveDvdid = () => {
    const trimmed = editDvdid.trim().toUpperCase();
    if (trimmed && onUpdateDvdid) {
      onUpdateDvdid(item.taskId, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditDvdid(item.dvdid || "");
    setIsEditing(false);
  };

  const canEdit = item.status !== "scraping" && item.status !== "organizing";


  // 优先使用已下载至本地内存的 Base64 数据，避免重复向远程网络拉取
  const displayCover = item.coverBase64 || item.scrapedData?.cover;

  // 当封面地址或 Base64 缓存更新时重置图片错误状态
  useEffect(() => {
    setImgError(false);
  }, [item.coverBase64, item.scrapedData?.cover]);

  // 支持 ESC 键关闭大图预览
  useEffect(() => {
    if (!previewOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen]);

  const getStatusBadge = () => {
    switch (item.status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            待处理
          </span>
        );
      case "scraping":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 animate-pulse">
            <Loader2 size={12} className="animate-spin" />
            正在刮削
          </span>
        );
      case "organizing":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            <Loader2 size={12} className="animate-spin" />
            正在落盘整理
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={12} />
            整理完成
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
            <AlertCircle size={12} />
            处理失败
          </span>
        );
    }
  };

  return (
    <div
      className={`bg-white rounded-xl border transition-all shadow-sm hover:shadow ${
        item.status === "error"
          ? "border-rose-200 bg-rose-50/20"
          : item.status === "completed"
          ? "border-emerald-200"
          : "border-slate-200"
      }`}
    >
      <div className="p-3.5 flex gap-3 items-start">
        {/* 封面预览或占位：横版 800:538 比例，避免竖向 1:2 挤压拉伸 */}
        <div className="w-28 sm:w-32 aspect-[800/538] rounded-lg bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center relative self-start">
          {displayCover && !imgError ? (
            <div
              className="relative w-full h-full cursor-pointer group"
              onClick={() => setPreviewOpen(true)}
              title="点击查看高清横向原图"
            >
              <img
                src={displayCover}
                alt={item.dvdid || "封面"}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <Maximize2 size={16} className="text-white drop-shadow-md" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-300 gap-1 p-1">
              <Film size={20} className="text-slate-300" />
              <span className="text-[9px] text-slate-400 font-medium text-center">
                {imgError ? "图片加载失败" : "横版封面"}
              </span>
            </div>
          )}
        </div>

        {/* 核心信息区 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 番号展示与行内手动编辑更正 */}
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={editDvdid}
                    onChange={(e) => setEditDvdid(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveDvdid();
                      if (e.key === "Escape") handleCancelEdit();
                    }}
                    onBlur={(e) => {
                      if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest(".edit-dvdid-actions")) {
                        return;
                      }
                      handleSaveDvdid();
                    }}
                    className="px-1.5 py-0.5 text-xs font-bold font-mono uppercase bg-slate-50 border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 w-28 sm:w-36"
                    placeholder="输入番号如 IPX-177"
                    autoFocus
                  />
                  <div className="edit-dvdid-actions flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleSaveDvdid}
                      className="p-1 rounded hover:bg-emerald-100 text-emerald-600 transition"
                      title="保存番号 (Enter)"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="p-1 rounded hover:bg-slate-200 text-slate-500 transition"
                      title="取消修改 (Esc)"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1 group/id">
                  <span
                    onClick={() => {
                      if (canEdit) setIsEditing(true);
                    }}
                    className={`font-bold text-sm tracking-wide ${
                      item.dvdid ? "text-slate-800" : "text-amber-700 font-medium"
                    } ${canEdit ? "cursor-pointer hover:underline" : ""}`}
                    title={canEdit ? "点击更正番号" : undefined}
                  >
                    {item.dvdid || "未知番号 (点击填写)"}
                  </span>

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className={`p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-opacity ${
                        !item.dvdid ? "opacity-100 text-amber-600" : "opacity-0 group-hover/id:opacity-100"
                      }`}
                      title="更正番号"
                    >
                      <Edit3 size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* 分类标签 */}
              {item.data_src === "fc2" && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-orange-100 text-orange-700 font-semibold">
                  FC2
                </span>
              )}
              {item.data_src === "cid" && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-100 text-cyan-700 font-semibold">
                  CID
                </span>
              )}

              {/* -C / -U 标签 */}
              {item.hard_sub && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 font-semibold">
                  字幕 (-C)
                </span>
              )}
              {item.uncensored && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 font-semibold">
                  无码 (-U)
                </span>
              )}

              {/* 多分片标识 */}
              {item.files.length > 1 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-medium">
                  {item.files.length}分片
                </span>
              )}
            </div>

            {getStatusBadge()}
          </div>

          {/* 标题或文件名 */}
          <div className="text-xs text-slate-600 line-clamp-1 mb-1 font-medium">
            {item.scrapedData?.title || (
              <span className="text-slate-400 font-mono text-[11px] truncate block">
                {item.files[0]?.split(/[/\\]/).pop()}
              </span>
            )}
          </div>

          {/* 女优与评分 */}
          {item.scrapedData && (
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1.5">
              {item.scrapedData.actress && item.scrapedData.actress.length > 0 && (
                <span className="text-indigo-600 font-medium truncate max-w-[140px]">
                  {item.scrapedData.actress.join(", ")}
                </span>
              )}
              {item.scrapedData.score && (
                <span className="text-amber-600 font-semibold">
                  ★ {item.scrapedData.score}
                </span>
              )}
            </div>
          )}

          {/* 错误提示 */}
          {item.errorMsg && (
            <div className="text-[11px] text-rose-600 bg-rose-50 px-2 py-1 rounded mb-1.5 border border-rose-100">
              {item.errorMsg}
            </div>
          )}

          {/* 整理后最终路径 */}
          {item.finalPath && (
            <div className="text-[11px] text-emerald-600 flex items-center gap-1 font-mono truncate">
              <FolderCheck size={12} className="shrink-0" />
              <span className="truncate">{item.finalPath}</span>
            </div>
          )}

          {/* 操作区 */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5"
            >
              <span>{expanded ? "收起文件" : `关联文件 (${item.files.length})`}</span>
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>

            <div>
              {item.status === "pending" && (
                <button
                  onClick={() => onScrapeSingle(item)}
                  disabled={!item.dvdid || isEditing}
                  className={`px-2.5 py-1 text-xs rounded-lg flex items-center gap-1 font-medium transition shadow-sm ${
                    item.dvdid && !isEditing
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                  title={
                    isEditing
                      ? "请先确认保存番号 (按 Enter)"
                      : !item.dvdid
                      ? "请先点击上方更正填写番号"
                      : undefined
                  }
                >
                  <Play size={11} fill="currentColor" />
                  开始刮削
                </button>
              )}

              {(item.status === "error" || item.status === "completed") && (
                <button
                  onClick={() => onScrapeSingle(item)}
                  disabled={!item.dvdid || isEditing}
                  className={`px-2.5 py-1 text-xs rounded-lg flex items-center gap-1 font-medium transition shadow-sm ${
                    !item.dvdid || isEditing
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : item.status === "error"
                      ? "bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                  }`}
                  title={
                    isEditing
                      ? "请先确认保存番号 (按 Enter)"
                      : item.status === "error"
                      ? "重试"
                      : "重新刮削"
                  }
                >
                  <RotateCcw size={11} />
                  {item.status === "error" ? "重试" : "重新刮削"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 展开的关联文件列表 */}
      {expanded && (
        <div className="bg-slate-50 border-t border-slate-100 px-3.5 py-2 text-[11px] font-mono text-slate-500 space-y-1 rounded-b-xl">
          {item.files.map((filePath, idx) => (
            <div key={idx} className="truncate text-slate-600">
              {item.files.length > 1 && (
                <span className="font-semibold text-indigo-500 mr-1.5">[CD{idx + 1}]</span>
              )}
              {filePath}
            </div>
          ))}
        </div>
      )}

      {/* 封面高清大图预览 Modal (800 x 538 原始横向海报) */}
      {previewOpen && displayCover && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
          onClick={() => setPreviewOpen(false)}
        >
          <div
            className="relative max-w-lg w-full bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗顶栏 */}
            <div className="px-3.5 py-2.5 bg-slate-800/90 flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-white font-bold text-xs tracking-wider">
                  {item.dvdid}
                </span>
                <span className="text-slate-400 text-xs truncate max-w-[200px]">
                  {item.scrapedData?.title}
                </span>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
                title="关闭预览"
              >
                <X size={16} />
              </button>
            </div>

            {/* 大图主体 */}
            <div className="p-2 flex items-center justify-center bg-black/60 max-h-[70vh] overflow-hidden">
              <img
                src={displayCover}
                alt={item.dvdid || "封面高清图"}
                className="max-w-full max-h-[65vh] object-contain rounded shadow"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* 弹窗底栏信息 */}
            <div className="px-3.5 py-2 bg-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span className="text-slate-300">横向原图 (800 × 538)</span>
              <span className="text-slate-500 text-[10px]">按 ESC 或点击遮罩关闭</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
