import React from "react";

interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
  detail?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  current,
  total,
  label,
  detail,
}) => {
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="w-full bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
      <div className="flex justify-between items-center text-xs font-medium text-slate-600 mb-1.5">
        <span>{label || "进度"}</span>
        <span className="font-semibold text-indigo-600">
          {percent}% ({current}/{total})
        </span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      {detail && <div className="mt-1.5 text-[11px] text-slate-400 truncate">{detail}</div>}
    </div>
  );
};
