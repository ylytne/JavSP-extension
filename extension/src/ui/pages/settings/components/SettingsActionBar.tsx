import React from "react";
import { Save, Undo2, RotateCcw } from "lucide-react";

interface SettingsActionBarProps {
  saving: boolean;
  isDirty: boolean;
  onSave: () => void;
  onUndo: () => void;
  onShowResetConfirm: () => void;
}

export const SettingsActionBar: React.FC<SettingsActionBarProps> = ({
  saving,
  isDirty,
  onSave,
  onUndo,
  onShowResetConfirm,
}) => {
  return (
    <div className="sticky bottom-4 z-20 bg-white/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 shadow-lg flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !isDirty}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
        >
          <Save size={14} />
          {saving ? "正在校验并保存..." : "保存并应用配置"}
        </button>

        <button
          type="button"
          onClick={onUndo}
          disabled={!isDirty}
          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
        >
          <Undo2 size={14} />
          放弃修改
        </button>
      </div>

      <div>
        <button
          type="button"
          onClick={onShowResetConfirm}
          className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer"
        >
          <RotateCcw size={13} />
          恢复系统默认配置
        </button>
      </div>
    </div>
  );
};
