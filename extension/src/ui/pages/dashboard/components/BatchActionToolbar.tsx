import React from "react";
import { Layers, Clock, CheckCircle, AlertTriangle, Sparkles } from "lucide-react";
import { StatusFilter } from "../types";

export interface BatchActionToolbarProps {
  totalCount: number;
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  countPending: number;
  countCompleted: number;
  countError: number;
  isBatchRunning: boolean;
  onBatchStart: () => void;
  onBatchStop: () => void;
}

export const BatchActionToolbar: React.FC<BatchActionToolbarProps> = ({
  totalCount,
  statusFilter,
  onStatusFilterChange,
  countPending,
  countCompleted,
  countError,
  isBatchRunning,
  onBatchStart,
  onBatchStop,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm flex items-center justify-between flex-wrap gap-3">
      {/* 状态过滤切换 */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => onStatusFilterChange("all")}
          className={`px-3 py-1 text-xs rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
            statusFilter === "all"
              ? "bg-slate-800 text-white shadow-xs font-bold"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Layers size={13} />
          全部 ({totalCount})
        </button>
        <button
          onClick={() => onStatusFilterChange("pending")}
          className={`px-3 py-1 text-xs rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
            statusFilter === "pending"
              ? "bg-indigo-600 text-white shadow-xs font-bold"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Clock size={13} />
          待处理 ({countPending})
        </button>
        <button
          onClick={() => onStatusFilterChange("completed")}
          className={`px-3 py-1 text-xs rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
            statusFilter === "completed"
              ? "bg-emerald-600 text-white shadow-xs font-bold"
              : "bg-slate-100 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          <CheckCircle size={13} />
          已完成 ({countCompleted})
        </button>
        {countError > 0 && (
          <button
            onClick={() => onStatusFilterChange("error")}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition cursor-pointer flex items-center gap-1 ${
              statusFilter === "error"
                ? "bg-rose-600 text-white shadow-xs font-bold"
                : "bg-slate-100 text-rose-700 hover:bg-rose-100"
            }`}
          >
            <AlertTriangle size={13} />
            异常/失败 ({countError})
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isBatchRunning ? (
          <button
            onClick={onBatchStop}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition shadow-sm cursor-pointer"
          >
            停止批次处理
          </button>
        ) : (
          <button
            onClick={onBatchStart}
            disabled={countPending === 0 && countError === 0}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <Sparkles size={13} />
            一键批量刮削并整理
          </button>
        )}
      </div>
    </div>
  );
};
