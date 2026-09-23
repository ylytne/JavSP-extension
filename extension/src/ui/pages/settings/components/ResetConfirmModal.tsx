import React from "react";
import { AlertCircle } from "lucide-react";

interface ResetConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ResetConfirmModal: React.FC<ResetConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-slate-200 space-y-3 animate-in zoom-in-95">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-600" />
          确认重置为系统默认配置？
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          重置将覆盖当前 <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">backend/config.yml</code> 中的全部个性化配置（包括自定义输出路径与爬虫选项），此操作不可逆。
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-medium cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3.5 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-xs cursor-pointer"
          >
            确认重置
          </button>
        </div>
      </div>
    </div>
  );
};
