import React from "react";
import { Settings as SettingsIcon, Sliders, FileCode, RefreshCw } from "lucide-react";

interface SettingsHeaderProps {
  viewMode: "form" | "yaml";
  setViewMode: (mode: "form" | "yaml") => void;
  isDirty: boolean;
  loading: boolean;
  onRefresh: () => void;
}

export const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  viewMode,
  setViewMode,
  isDirty,
  loading,
  onRefresh,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
          <SettingsIcon size={18} />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            在线配置管理中心
            {isDirty && (
              <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 animate-pulse">
                ● 有未保存的改动
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-500">
            单一事实来源 (SSOT)：修改后立即持久化至本地{" "}
            <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">
              backend/config.yml
            </code>{" "}
            并即时热生效
          </p>
        </div>
      </div>

      {/* 模式选择与刷新 */}
      <div className="flex items-center gap-2 self-end sm:self-center">
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
          <button
            onClick={() => setViewMode("form")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
              viewMode === "form"
                ? "bg-white text-indigo-700 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sliders size={13} />
            可视化表单
          </button>
          <button
            onClick={() => setViewMode("yaml")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition cursor-pointer ${
              viewMode === "yaml"
                ? "bg-white text-indigo-700 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <FileCode size={13} />
            YAML 源码
          </button>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition cursor-pointer"
          title="重新拉取后端配置"
        >
          <RefreshCw size={15} className={loading ? "animate-spin text-indigo-600" : ""} />
        </button>
      </div>
    </div>
  );
};
