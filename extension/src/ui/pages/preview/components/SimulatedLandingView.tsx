import React, { useState } from "react";
import {
  Folder,
  FileVideo,
  FileCode,
  Image as ImageIcon,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  User,
  Star,
  Clock,
  Calendar,
  Building,
  Film,
  Tag,
  ExternalLink,
} from "lucide-react";
import { ScrapePreviewReport } from "../types";

export interface SimulatedLandingViewProps {
  report: ScrapePreviewReport;
}

export const SimulatedLandingView: React.FC<SimulatedLandingViewProps> = ({ report }) => {
  const [copiedNfo, setCopiedNfo] = useState(false);
  const [isNfoExpanded, setIsNfoExpanded] = useState(false);

  const { summarized, landingData, coverBase64, sampleFanartBase64 } = report;

  const handleCopyNfo = async () => {
    try {
      await navigator.clipboard.writeText(landingData.nfoContent);
      setCopiedNfo(true);
      setTimeout(() => setCopiedNfo(false), 2000);
    } catch (e) {
      console.error("复制 NFO 失败", e);
    }
  };

  const posterSrc = landingData.croppedPosterBase64 || coverBase64;
  const fanartSrc = coverBase64 || summarized.big_cover || summarized.cover;
  const leafFolderName =
    landingData.relFolder.split(/[/|\\]/).filter(Boolean).pop() || landingData.baseName;

  return (
    <div className="space-y-6">
      {/* 顶部概览指标与目标路径 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xl font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-lg">
              {report.dvdid}
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-800 leading-snug">
                {summarized.title || summarized.ori_title || "未知标题"}
              </h3>
              {summarized.ori_title && summarized.ori_title !== summarized.title && (
                <p className="text-xs text-slate-400 mt-0.5">
                  原名: {summarized.ori_title}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
            <span className="bg-slate-100 px-2.5 py-1 rounded-md font-mono">
              总耗时: {report.durationMs}ms
            </span>
          </div>
        </div>

        {/* 虚拟目标路径展现 */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs space-y-1 font-mono">
          <div className="flex items-center gap-2 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
            <Folder size={13} className="text-amber-500" />
            <span>模拟归档绝对目标路径 (Target Directory):</span>
          </div>
          <p className="text-indigo-950 font-bold break-all selection:bg-indigo-100">
            {landingData.targetDir}
          </p>
          <p className="text-slate-400 text-[11px]">
            相对层级: {landingData.relFolder}
          </p>
        </div>
      </div>

      {/* 左右分栏：左侧文件落盘树与产物预览，右侧元数据结构化看板 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧：落盘文件树与图像预览 (占 5 列) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 文件结构树 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>📁 模拟落盘文件清单</span>
              <span className="text-[10px] text-slate-400 font-normal">基于当前后端整理规则计算</span>
            </h4>

            <div className="border border-slate-200 rounded-lg bg-slate-50/70 p-3 text-xs font-mono space-y-2 text-slate-700">
              {/* 归档主文件夹 */}
              <div className="flex items-center gap-2 font-bold text-indigo-900 border-b border-slate-200/80 pb-2">
                <Folder size={15} className="text-amber-500 shrink-0" />
                <span className="truncate">{leafFolderName} /</span>
              </div>

              {/* 视频文件 */}
              <div className="pl-4 flex items-center gap-2">
                <FileVideo size={14} className="text-blue-500 shrink-0" />
                <span className="truncate text-slate-800 font-semibold">{landingData.videoFilename}</span>
              </div>

              {/* NFO 文件 */}
              <div className="pl-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <FileCode size={14} className="text-emerald-600 shrink-0" />
                  <span className="truncate">{landingData.nfoFilename}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNfoExpanded(!isNfoExpanded)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 underline font-sans shrink-0 cursor-pointer"
                >
                  {isNfoExpanded ? "收起 XML" : "查看 XML"}
                </button>
              </div>

              {/* 竖版海报 */}
              <div className="pl-4 flex items-center gap-2">
                <ImageIcon size={14} className="text-purple-500 shrink-0" />
                <span className="truncate">{landingData.posterFilename}</span>
                {landingData.croppedPosterBase64 && (
                  <span className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded font-sans">
                    合成角标
                  </span>
                )}
              </div>

              {/* 横版大封面 */}
              <div className="pl-4 flex items-center gap-2">
                <ImageIcon size={14} className="text-pink-500 shrink-0" />
                <span className="truncate">{landingData.fanartFilename}</span>
              </div>

              {/* 剧照目录与文件 */}
              {landingData.extrafanartsFiles.length > 0 && (
                <div className="pl-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Folder size={13} className="text-amber-400 shrink-0" />
                    <span>extrafanart /</span>
                    <span className="text-[10px] text-slate-400 font-sans">(测试抽样 1 张)</span>
                  </div>
                  {landingData.extrafanartsFiles.map((f, i) => (
                    <div key={i} className="pl-4 flex items-center gap-2 text-slate-600">
                      <ImageIcon size={12} className="text-slate-400 shrink-0" />
                      <span>{f.replace("extrafanart/", "")}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 女优本地头像 */}
              {landingData.actorAvatarFiles.length > 0 && (
                <div className="pl-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <Folder size={13} className="text-amber-400 shrink-0" />
                    <span>.actors /</span>
                  </div>
                  {landingData.actorAvatarFiles.map((f, i) => (
                    <div key={i} className="pl-4 flex items-center gap-2 text-slate-600">
                      <User size={12} className="text-slate-400 shrink-0" />
                      <span>{f.replace(".actors/", "")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 图片可视化预览卡片 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              🖼️ 模拟落盘图片产物预览
            </h4>

            {/* 裁切竖版海报 + 横版背景图 */}
            <div className="grid grid-cols-2 gap-3 items-start">
              {/* 竖版 Poster */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-600 block">
                  裁剪竖版海报 ({landingData.posterFilename})
                </span>
                <div className="aspect-[2/3] bg-slate-100 rounded-lg overflow-hidden border border-slate-200 relative group shadow-2xs">
                  {posterSrc ? (
                    <img
                      src={posterSrc}
                      alt="Cropped Poster"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs p-2 text-center">
                      <ImageIcon size={24} className="mb-1 opacity-50" />
                      <span>未生成海报</span>
                    </div>
                  )}
                  {landingData.croppedPosterBase64 && (
                    <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-xs text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                      2:3 裁切
                    </div>
                  )}
                </div>
              </div>

              {/* 横版 Fanart */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-600 block">
                  原始横版封面 ({landingData.fanartFilename})
                </span>
                <div className="aspect-[3/2] bg-slate-100 rounded-lg overflow-hidden border border-slate-200 relative shadow-2xs">
                  {fanartSrc ? (
                    <img
                      src={fanartSrc}
                      alt="Original Fanart"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs p-2 text-center">
                      <ImageIcon size={24} className="mb-1 opacity-50" />
                      <span>未获取到横版</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 抽样测试剧照 (若存在) */}
            {sampleFanartBase64 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-600">
                    📸 抽样测试剧照 (extrafanart/0.jpg)(即便设置为多张，在测试时也只下载一张)
                  </span>
                  <span className="text-indigo-600 font-medium">真实通道验证成功</span>
                </div>
                <div className="max-h-48 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs">
                  <img
                    src={sampleFanartBase64}
                    alt="Sample Fanart"
                    className="w-full h-auto object-cover max-h-48"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：清洗后元数据对比看板 + NFO XML 预览 (占 7 列) */}
        <div className="lg:col-span-7 space-y-5">
          {/* NFO XML 代码抽屉 */}
          {isNfoExpanded && (
            <div className="bg-slate-900 text-slate-100 rounded-xl p-4 shadow-md space-y-2 border border-slate-800">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <FileCode size={14} className="text-emerald-400" />
                  <span className="font-mono font-bold text-slate-200">
                    {landingData.nfoFilename} (Kodi/Jellyfin/Emby 兼容 XML)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyNfo}
                  className="flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1 rounded transition cursor-pointer"
                >
                  {copiedNfo ? (
                    <>
                      <Check size={12} className="text-emerald-400" />
                      <span className="text-emerald-400">已复制</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      <span>复制 XML</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-xs font-mono overflow-x-auto max-h-96 p-2 rounded bg-black/40 text-emerald-300 leading-relaxed">
                <code>{landingData.nfoContent}</code>
              </pre>
            </div>
          )}

          {/* 结构化元数据看板 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                📊 清洗汇总后的 MovieInfo 元数据
              </h4>
              <button
                type="button"
                onClick={handleCopyNfo}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
              >
                {copiedNfo ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                <span>{copiedNfo ? "NFO 已复制到剪贴板" : "复制生成之 NFO"}</span>
              </button>
            </div>

            {/* 关键字段栅格 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Star size={12} className="text-amber-500" /> 评分
                </span>
                <p className="font-bold text-slate-800 font-mono text-sm">
                  {summarized.score ? `${summarized.score} / 10` : "暂无评分"}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Clock size={12} className="text-blue-500" /> 时长
                </span>
                <p className="font-bold text-slate-800 font-mono text-sm">
                  {summarized.duration ? `${summarized.duration} 分钟` : "未知"}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Calendar size={12} className="text-emerald-500" /> 发行日期
                </span>
                <p className="font-bold text-slate-800 font-mono text-sm">
                  {summarized.publish_date || "未知"}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Building size={12} className="text-purple-500" /> 片商 / 制作商
                </span>
                <p className="font-semibold text-slate-800 truncate" title={summarized.producer}>
                  {summarized.producer || "未知"}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Film size={12} className="text-indigo-500" /> 发行商
                </span>
                <p className="font-semibold text-slate-800 truncate" title={summarized.publisher}>
                  {summarized.publisher || "未知"}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <User size={12} className="text-slate-500" /> 导演
                </span>
                <p className="font-semibold text-slate-800 truncate" title={summarized.director}>
                  {summarized.director || "未知"}
                </p>
              </div>
            </div>

            {/* 女优列表 */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-600 block">
                出演女优 ({summarized.actress?.length || 0} 位)
              </span>
              <div className="flex flex-wrap gap-2">
                {summarized.actress && summarized.actress.length > 0 ? (
                  summarized.actress.map((act, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-200/70"
                    >
                      <User size={12} className="text-indigo-500" />
                      <span>{act}</span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">无记录 / 素人或多人</span>
                )}
              </div>
            </div>

            {/* 分类标签体系 (规范化清洗对比) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">
                  分类标签 (规范清洗后: {summarized.genre_norm?.length || summarized.genre?.length || 0} 个)
                </span>
                {summarized.genre_norm && summarized.genre_norm.length > 0 && (
                  <span className="text-[10px] text-emerald-600 font-medium">已执行 GenreMap 闭包规范化</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(summarized.genre_norm && summarized.genre_norm.length > 0
                  ? summarized.genre_norm
                  : summarized.genre || []
                ).map((g: string, i: number) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200"
                  >
                    <Tag size={10} className="text-slate-400" />
                    <span>{g}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* 剧情简介 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">剧情简介</span>
                {summarized.plot_translated && (
                  <span className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                    已翻译
                  </span>
                )}
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap selection:bg-indigo-100">
                {summarized.plot || summarized.ori_plot || "暂无剧情简介"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
