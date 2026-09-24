import React from "react";
import { Folder, Film, FileText, Image, MessageSquare, Tv, Eye, Sparkles, HardDrive, Server } from "lucide-react";

/**
 * 模板动态预览所用的标准真实元数据样例。
 */
export const TEMPLATE_SAMPLE_MOVIE: Record<string, string> = {
  num: "IPX-177",
  dvdid: "IPX-177",
  cid: "ipx00177",
  title: " 讓高傲妹妹穿過膝襪露絕對領域",
  rawtitle: "生意気な妹にニーハイを履かせ僕だけの「絶対領域」",
  actress: "相沢みなみ",
  publisher: "IDEA POCKET",
  producer: "IDEA POCKET",
  studio: "IDEA POCKET",
  director: "押切伸之",
  serial: "大人の純愛",
  year: "2021",
  date: "2021-08-13",
  score: "8.5",
  censor: "有码",
  label: "Tissue",
  genre: "单体作品,美少女",
};

/**
 * 模板变量替换函数（模拟后端 SafeDict 行为）。
 * 未知或未识别的变量花括号保持原样。
 */
export function formatTemplate(
  pattern: string,
  data: Record<string, string> = TEMPLATE_SAMPLE_MOVIE
): string {
  if (!pattern) return "";
  return pattern.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return key in data ? data[key] : match;
  });
}

export interface PathInfo {
  isAbsolute: boolean;
  rootLabel: string;
  rootType: "drive" | "posix_root" | "unc" | "relative";
  segments: string[];
  fullDisplayPath: string;
}

/**
 * 解析路径层级，智能区分 Windows 绝对盘符、POSIX/NAS 根路径、UNC 共享及相对路径。
 */
export function parsePathSegments(rawPath: string, baseDirectory?: string | null): PathInfo {
  const formatted = formatTemplate(rawPath).trim();
  const defaultLabel = baseDirectory?.trim()
    ? `[扫描目标目录: ${baseDirectory.trim()}]`
    : `[扫描目标目录 (如 D:/download)]`;

  if (!formatted) {
    return {
      isAbsolute: false,
      rootLabel: defaultLabel,
      rootType: "relative",
      segments: [],
      fullDisplayPath: "",
    };
  }

  // 1. Windows UNC path: \\server\share or //server/share
  const uncMatch = formatted.match(/^([\\/]{2}[^\\/]+[\\/][^\\/]+)(?:[\\/](.*))?$/);
  if (uncMatch) {
    const root = uncMatch[1].replace(/\//g, "\\");
    const rest = uncMatch[2] || "";
    const segments = rest.split(/[/\\]+/).filter(Boolean);
    return {
      isAbsolute: true,
      rootLabel: root,
      rootType: "unc",
      segments,
      fullDisplayPath: formatted,
    };
  }

  // 2. Windows drive letter: E:/... or E:\... or E:
  const winMatch = formatted.match(/^([a-zA-Z]:)(?:[/\\](.*))?$/);
  if (winMatch) {
    const drive = winMatch[1].toUpperCase() + "\\";
    const rest = winMatch[2] || "";
    const segments = rest.split(/[/\\]+/).filter(Boolean);
    return {
      isAbsolute: true,
      rootLabel: drive,
      rootType: "drive",
      segments,
      fullDisplayPath: formatted,
    };
  }

  // 3. POSIX root path: /path/to/folder or \path\to\folder (Linux/Docker/NAS)
  if (/^[/\\]/.test(formatted)) {
    const segments = formatted.split(/[/\\]+/).filter(Boolean);
    return {
      isAbsolute: true,
      rootLabel: "/",
      rootType: "posix_root",
      segments,
      fullDisplayPath: formatted,
    };
  }

  // 4. Relative path: #整理完成/{actress}/... (基于用户输入的扫描整理目录)
  const segments = formatted.split(/[/\\]+/).filter(Boolean);
  return {
    isAbsolute: false,
    rootLabel: defaultLabel,
    rootType: "relative",
    segments,
    fullDisplayPath: formatted,
  };
}

export interface TemplateVariableInfo {
  token: string;
  label: string;
  example: string;
  description: string;
}

export const FOLDER_VARS: TemplateVariableInfo[] = [
  { token: "{actress}", label: "女优", example: "相沢みなみ", description: "出演女优姓名（多女优逗号分隔）" },
  { token: "{num}", label: "番号", example: "IPX-177", description: "标准番号（中字自动带 -C 后缀）" },
  { token: "{title}", label: "标题", example: "纯情女友大变身...", description: "翻译清洗后的标题" },
  { token: "{publisher}", label: "发行商", example: "IDEA POCKET", description: "影片发行商" },
  { token: "{year}", label: "年份", example: "2021", description: "发行年份 (4位数字)" },
  { token: "{serial}", label: "系列", example: "大人の純愛", description: "所属企划系列名" },
];

export const BASENAME_VARS: TemplateVariableInfo[] = [
  { token: "{num}", label: "番号", example: "IPX-177", description: "标准番号（中字自动带 -C 后缀）" },
  { token: "{title}", label: "标题", example: "纯情女友大变身...", description: "影片标题" },
  { token: "{actress}", label: "女优", example: "相沢みなみ", description: "主要出演女优姓名" },
  { token: "{year}", label: "年份", example: "2021", description: "发行年份" },
];

export const NFO_TITLE_VARS: TemplateVariableInfo[] = [
  { token: "{num}", label: "番号", example: "IPX-177", description: "标准番号" },
  { token: "{title}", label: "标题", example: "纯情女友大变身...", description: "影片标题" },
  { token: "{actress}", label: "女优", example: "相沢みなみ", description: "出演女优" },
  { token: "{censor}", label: "分类", example: "有码", description: "有码 / 无码 / 打码情况未知" },
  { token: "{year}", label: "年份", example: "2021", description: "发行年份" },
  { token: "{publisher}", label: "发行商", example: "IDEA POCKET", description: "影片发行商" },
];

interface VariablePillSelectorProps {
  vars: TemplateVariableInfo[];
  onInsert: (token: string) => void;
}

/**
 * 变量药丸选择器，提供直观的中文标识与示例气泡提示。
 */
export const VariablePillSelector: React.FC<VariablePillSelectorProps> = ({ vars, onInsert }) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] text-slate-400 select-none">点击插入变量:</span>
      {vars.map((v) => (
        <button
          key={v.token}
          type="button"
          onClick={() => onInsert(v.token)}
          title={`${v.label} (${v.token}): 示例 "${v.example}" — ${v.description}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 text-[10px] font-mono rounded text-slate-600 border border-slate-200 transition-colors cursor-pointer select-none"
        >
          <span className="text-indigo-500 font-bold leading-none">+</span>
          <span>{v.token}</span>
          <span className="text-[9px] text-slate-400 font-sans">({v.label})</span>
        </button>
      ))}
    </div>
  );
};

interface FolderBreadcrumbPreviewProps {
  pattern: string;
  baseDirectory?: string | null;
}

/**
 * 输出目录层级效果预览条，支持区分绝对路径与基于扫描目录的相对路径。
 */
export const FolderBreadcrumbPreview: React.FC<FolderBreadcrumbPreviewProps> = ({
  pattern,
  baseDirectory,
}) => {
  const pathInfo = parsePathSegments(pattern, baseDirectory);

  return (
    <div className="mt-2 p-2.5 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs space-y-1.5">
      <div className="flex items-center justify-between text-indigo-900 font-medium">
        <div className="flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span className="text-[11px] font-semibold">生成文件夹层级预览：</span>
        </div>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium select-none ${
            pathInfo.isAbsolute
              ? "bg-blue-100 text-blue-800 border border-blue-200"
              : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}
        >
          {pathInfo.isAbsolute ? "绝对路径模式" : "相对路径模式 (基于扫描目录)"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[11px] font-mono text-slate-700 pt-0.5">
        <span
          className={`px-1.5 py-0.5 bg-white border rounded flex items-center gap-1 shadow-xs ${
            pathInfo.isAbsolute
              ? "border-blue-300 text-blue-950 font-bold"
              : "border-slate-200 text-slate-600 font-medium"
          }`}
          title={
            pathInfo.isAbsolute
              ? "直接输出到指定磁盘或系统绝对路径"
              : "相对路径将基于您在首页输入的待整理扫描目录进行归档"
          }
        >
          {pathInfo.rootType === "drive" ? (
            <HardDrive className="w-3 h-3 text-blue-600 shrink-0" />
          ) : pathInfo.rootType === "unc" || pathInfo.rootType === "posix_root" ? (
            <Server className="w-3 h-3 text-blue-600 shrink-0" />
          ) : (
            <Folder className="w-3 h-3 text-amber-500 shrink-0" />
          )}
          <span>{pathInfo.rootLabel}</span>
        </span>
        {pathInfo.segments.length === 0 ? (
          <span className="text-slate-400 italic text-[10px]">
            {pathInfo.isAbsolute ? "" : "（未定义子目录，将直接存放在扫描目标目录下）"}
          </span>
        ) : (
          pathInfo.segments.map((p, idx) => (
            <React.Fragment key={idx}>
              <span className="text-indigo-300 font-bold">/</span>
              <span className="px-1.5 py-0.5 bg-white border border-indigo-200 text-indigo-950 rounded font-medium shadow-xs flex items-center gap-1">
                <Folder className="w-3 h-3 text-indigo-400" />
                <span>{p}</span>
              </span>
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
};

interface DiskStructurePreviewProps {
  folderPattern: string;
  basenamePattern: string;
  baseDirectory?: string | null;
}

/**
 * 最终落盘文件与目录结构完整模拟预览，根据相对/绝对路径智能适配展示。
 */
export const DiskStructurePreview: React.FC<DiskStructurePreviewProps> = ({
  folderPattern,
  basenamePattern,
  baseDirectory,
}) => {
  const pathInfo = parsePathSegments(folderPattern, baseDirectory);
  const formattedBasename = formatTemplate(basenamePattern) || "IPX-177";
  const cleanFolder = pathInfo.fullDisplayPath.replace(/[/\\]+$/, "");
  const baseDisplay = baseDirectory?.trim() || "D:/download";

  return (
    <div className="p-3 bg-slate-50/80 border border-slate-200 rounded-lg text-xs space-y-2">
      <div className="flex items-center justify-between text-slate-700 font-semibold border-b border-slate-200/80 pb-1.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          <span className="text-slate-800 font-bold">落盘文件结构动态模拟效果</span>
        </div>
        <span className="text-[10px] text-slate-400 font-normal">基于当前文件夹与主文件名模板计算</span>
      </div>

      <div className="space-y-1 font-mono text-[11px] bg-white p-2.5 rounded border border-slate-200 text-slate-700 overflow-x-auto">
        <div className="flex items-center justify-between gap-2 text-indigo-950 font-bold">
          <div className="flex items-center gap-1.5 truncate">
            {pathInfo.isAbsolute ? (
              pathInfo.rootType === "drive" ? (
                <HardDrive className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              ) : (
                <Server className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              )
            ) : (
              <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )}
            <span>
              {pathInfo.isAbsolute
                ? `${cleanFolder} /`
                : `${baseDisplay} / ${cleanFolder ? `${cleanFolder} /` : ""}`}
            </span>
          </div>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-medium font-sans shrink-0 ${
              pathInfo.isAbsolute
                ? "bg-blue-50 text-blue-700 border border-blue-200"
                : "bg-slate-100 text-slate-500 border border-slate-200"
            }`}
          >
            {pathInfo.isAbsolute ? "绝对路径" : "相对路径 (基于扫描目录)"}
          </span>
        </div>

        <div className="pl-4 space-y-1.5 border-l-2 border-indigo-100 ml-1.5 mt-1.5 pt-1 text-slate-600">
          <div className="flex items-center justify-between gap-2 hover:bg-slate-50 px-1 py-0.5 rounded">
            <div className="flex items-center gap-1.5 truncate">
              <Film className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="font-semibold text-slate-800">{formattedBasename}.mp4</span>
            </div>
            <span className="text-[10px] text-slate-400 shrink-0 font-sans">正片视频（分片自动为 -CD1, -CD2）</span>
          </div>

          <div className="flex items-center justify-between gap-2 hover:bg-slate-50 px-1 py-0.5 rounded">
            <div className="flex items-center gap-1.5 truncate">
              <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-slate-700">{formattedBasename}.nfo</span>
            </div>
            <span className="text-[10px] text-slate-400 shrink-0 font-sans">媒体信息文件（Kodi / Emby 刮削）</span>
          </div>

          <div className="flex items-center justify-between gap-2 hover:bg-slate-50 px-1 py-0.5 rounded">
            <div className="flex items-center gap-1.5 truncate">
              <Image className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="text-slate-700">{formattedBasename}-poster.jpg</span>
            </div>
            <span className="text-[10px] text-slate-400 shrink-0 font-sans">裁剪海报封面（可附加 -C/-U 角标）</span>
          </div>

          <div className="flex items-center justify-between gap-2 hover:bg-slate-50 px-1 py-0.5 rounded">
            <div className="flex items-center gap-1.5 truncate">
              <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-slate-700">{formattedBasename}.zh.srt</span>
            </div>
            <span className="text-[10px] text-slate-400 shrink-0 font-sans">同名外挂字幕文件（若开启归档字幕）</span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface MediaTitlePreviewProps {
  pattern: string;
}

/**
 * 媒体中心 (Emby / Jellyfin / Kodi) 显示效果实时预览卡片。
 */
export const MediaTitlePreview: React.FC<MediaTitlePreviewProps> = ({ pattern }) => {
  const formattedTitle = formatTemplate(pattern);

  return (
    <div className="mt-2 p-3 bg-gradient-to-r from-slate-900 to-indigo-950 rounded-lg text-white shadow-sm border border-slate-800 space-y-2">
      <div className="flex items-center justify-between text-xs text-indigo-200">
        <div className="flex items-center gap-1.5 font-medium">
          <Tv className="w-3.5 h-3.5 text-indigo-400" />
          <span>媒体中心 (Emby / Jellyfin / Kodi) 显示效果实时预览</span>
        </div>
        <span className="text-[10px] text-indigo-300/70 font-mono">NFO &lt;title&gt; 节点</span>
      </div>

      <div className="flex items-start gap-3 bg-white/5 p-2.5 rounded-md border border-white/10">
        {/* 模拟海报缩略图 */}
        <div className="w-11 h-15 bg-indigo-900/60 rounded border border-indigo-400/30 flex flex-col items-center justify-center shrink-0 text-[10px] text-indigo-200">
          <Film className="w-4 h-4 text-indigo-300 mb-0.5" />
          <span className="text-[8px] font-mono">POSTER</span>
        </div>

        {/* 标题与元数据信息 */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white tracking-wide truncate">
            {formattedTitle || <span className="text-slate-400 italic font-normal text-xs">（未设置标题模板）</span>}
          </div>
          <div className="text-[11px] text-indigo-200/80 mt-1 flex flex-wrap items-center gap-1.5 font-sans">
            <span className="bg-white/10 px-1 py-0.2 rounded text-[10px]">2021</span>
            <span>·</span>
            <span>相沢みなみ</span>
            <span>·</span>
            <span>IDEA POCKET</span>
            <span>·</span>
            <span className="text-amber-400 font-medium">★ 8.5</span>
            <span>·</span>
            <span className="bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 px-1 py-0.2 rounded text-[10px]">有码</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
            这是播放器海报墙与影片详情页顶部展示的影视标题。建议保留番号与标题，方便检索。
          </p>
        </div>
      </div>
    </div>
  );
};
