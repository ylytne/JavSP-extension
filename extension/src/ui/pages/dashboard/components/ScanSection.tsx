import React from "react";
import { FolderOpen, Search } from "lucide-react";
import { ProgressBar } from "../../../components/ProgressBar";
import { ScanProgress } from "../types";

export interface ScanSectionProps {
  scanDir: string;
  onChangeScanDir: (dir: string) => void;
  onStartScan: () => void;
  isScanning: boolean;
  wsConnected: boolean;
  scanProgress: ScanProgress | null;
}

export const ScanSection: React.FC<ScanSectionProps> = ({
  scanDir,
  onChangeScanDir,
  onStartScan,
  isScanning,
  wsConnected,
  scanProgress,
}) => {
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-1">
        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
          待整理视频文件夹路径
        </label>
        <span className="text-[11px] text-slate-400">
          远程/NAS 后端请填写其宿主机内部路径（如{" "}
          <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">
            /volume1/video
          </code>
          ）
        </span>
      </div>
      <div className="flex gap-2.5 flex-col sm:flex-row">
        <div className="relative flex-1">
          <FolderOpen size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={scanDir}
            onChange={(e) => onChangeScanDir(e.target.value)}
            placeholder="例如: E:\Movies 或 /volume1/video 或 /data/downloads"
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
          />
        </div>
        <button
          onClick={onStartScan}
          disabled={isScanning || !wsConnected}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm shrink-0 cursor-pointer"
        >
          <Search size={14} />
          {isScanning ? "正在遍历磁盘..." : "扫描目录"}
        </button>
      </div>

      {/* 扫描进度 */}
      {isScanning && scanProgress && (
        <div className="pt-2">
          <ProgressBar
            current={scanProgress.scanned_files}
            total={Math.max(scanProgress.scanned_files, 100)}
            label="磁盘深度遍历中"
            detail={`已发现 ${scanProgress.current} 部待整理影片，已遍历 ${scanProgress.scanned_files} 个文件`}
          />
        </div>
      )}
    </>
  );
};
