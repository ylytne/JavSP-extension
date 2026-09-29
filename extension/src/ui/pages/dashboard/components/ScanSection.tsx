import React from "react";
import {
  FolderOpen,
  Search,
  FlaskConical,
  FolderArchive,
  Move,
  Link2,
  FileBox,
  Copy,
  Sliders,
} from "lucide-react";
import { ProgressBar } from "../../../components/ProgressBar";
import { OrganizeMode, ScanProgress } from "../types";

export interface ScanSectionProps {
  scanDir: string;
  onChangeScanDir: (dir: string) => void;
  outputDir?: string;
  onChangeOutputDir?: (dir: string) => void;
  organizeMode?: OrganizeMode;
  onChangeOrganizeMode?: (mode: OrganizeMode) => void;
  onStartScan: () => void;
  isScanning: boolean;
  wsConnected: boolean;
  scanProgress: ScanProgress | null;
  onNavigatePreview?: () => void;
  onNavigateSettings?: () => void;
}

export const ScanSection: React.FC<ScanSectionProps> = ({
  scanDir,
  onChangeScanDir,
  outputDir = "",
  onChangeOutputDir,
  organizeMode = "move",
  onChangeOrganizeMode,
  onStartScan,
  isScanning,
  wsConnected,
  scanProgress,
  onNavigatePreview,
  onNavigateSettings,
}) => {
  const isSameAsScan = !outputDir.trim() || outputDir.trim() === scanDir.trim();

  return (
    <div className="space-y-4">
      {/* 路径设置区 (扫描输入目录 + 输出归档目录) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* 输入扫描目录 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FolderOpen size={14} className="text-indigo-600" />
              <span>待整理视频文件夹路径 (扫描目录)</span>
            </label>
            <span className="text-[11px] text-slate-400">支持 NAS / 本地绝对路径</span>
          </div>
          <div className="relative">
            <FolderOpen size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={scanDir}
              onChange={(e) => onChangeScanDir(e.target.value)}
              placeholder="例如: D:\Downloads\Unsorted 或 /volume1/video"
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
          </div>
        </div>

        {/* 输出目标目录 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FolderArchive size={14} className="text-indigo-600" />
              <span>整理后输出根目录 (归档路径)</span>
            </label>
            {onChangeOutputDir && (
              <button
                type="button"
                onClick={() => {
                  if (isSameAsScan) {
                    onChangeOutputDir("");
                  } else {
                    onChangeOutputDir(scanDir);
                  }
                }}
                className="text-[11px] text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer transition"
                title="快速将输出目录设为同扫描目录"
              >
                <Copy size={11} />
                <span>{isSameAsScan ? "同扫描目录 (默认)" : "设为同扫描目录"}</span>
              </button>
            )}
          </div>
          <div className="relative">
            <FolderArchive size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={outputDir}
              disabled={!onChangeOutputDir || organizeMode === "inplace"}
              onChange={(e) => onChangeOutputDir?.(e.target.value)}
              placeholder={
                organizeMode === "inplace"
                  ? "原地就地生成模式下无需指定输出目录（将在原视频同级目录生成）"
                  : scanDir
                  ? `留空则默认输出至: ${scanDir}`
                  : "例如: E:\\Movies\\Organized 或 /volume1/video/movies (留空同扫描目录)"
              }
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono disabled:bg-slate-100 disabled:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* 文件整理模式与子目录规则提示 */}
      <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80 space-y-2.5">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <span className="text-xs font-bold text-slate-700">文件整理模式</span>
          {onNavigateSettings && (
            <button
              type="button"
              onClick={onNavigateSettings}
              className="text-[11px] text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
              title="前往系统设置修改子目录模板、NFO 命名规则等详细参数"
            >
              <Sliders size={12} />
              <span>设置子目录与命名规则</span>
            </button>
          )}
        </div>

        {/* 三种整理模式选项卡 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            {
              mode: "move" as const,
              title: "移动并归档",
              desc: "原文件安全移动至输出目录下的分类子文件夹",
              icon: Move,
            },
            {
              mode: "hard_link" as const,
              title: "创建硬链接",
              desc: "不占用双倍磁盘空间，原文件不受影响 (PT推荐)",
              icon: Link2,
            },
            {
              mode: "inplace" as const,
              title: "原地就地生成",
              desc: "不移动视频，仅在当前同级目录生成 NFO 与图片",
              icon: FileBox,
            },
          ].map((item) => {
            const Icon = item.icon;
            const active = organizeMode === item.mode;
            return (
              <div
                key={item.mode}
                data-testid={`organize-mode-${item.mode}`}
                role="button"
                onClick={() => onChangeOrganizeMode?.(item.mode)}
                className={`p-2.5 rounded-lg border text-xs cursor-pointer transition select-none flex items-start gap-2.5 ${
                  active
                    ? "bg-indigo-50 border-indigo-400 text-indigo-950 font-medium ring-1 ring-indigo-400/40 shadow-2xs"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                <div
                  className={`p-1.5 rounded-md shrink-0 mt-0.5 ${
                    active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  <Icon size={13} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold leading-tight mb-0.5 text-slate-800">{item.title}</div>
                  <div className="text-[11px] text-slate-500 leading-tight">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 操作按钮区 */}
      <div className="flex gap-2.5 flex-col sm:flex-row items-center justify-between pt-0.5">
        <div className="text-[11px] text-slate-500">
          {organizeMode === "inplace" ? (
            <span>当前为原地生成模式，整理后媒体信息将与视频存放在同一文件夹中。</span>
          ) : (
            <span>
              整理输出目标:{" "}
              <code className="font-mono bg-slate-100 text-indigo-700 px-1 py-0.5 rounded text-[10.5px]">
                {outputDir.trim() || scanDir.trim() || "未指定（默认扫描目录）"}
              </code>
              <span className="text-slate-400 ml-1">/ [子目录模板]</span>
            </span>
          )}
        </div>

        <div className="flex gap-2 w-full sm:w-auto shrink-0">
          <button
            onClick={onStartScan}
            disabled={isScanning || !wsConnected}
            className="flex-1 sm:flex-initial px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm cursor-pointer"
          >
            <Search size={14} />
            {isScanning ? "正在遍历磁盘..." : "扫描目录"}
          </button>
          {onNavigatePreview && (
            <button
              type="button"
              onClick={onNavigatePreview}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-2xs shrink-0 cursor-pointer"
              title="输入测试番号快速验证完整抓取与模拟落盘产物"
            >
              <FlaskConical size={14} />
              <span>刮削测试与预览</span>
            </button>
          )}
        </div>
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
    </div>
  );
};
