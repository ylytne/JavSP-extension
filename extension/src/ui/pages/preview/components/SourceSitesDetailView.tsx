import React, { useState } from "react";
import {
  Globe,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ExternalLink,
  Code2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  Image as ImageIcon,
  Tag,
  Star,
  User,
  Magnet,
} from "lucide-react";
import { ScrapePreviewReport, SiteScrapeResult } from "../types";
import { CRAWLER_SITE_INFO } from "../../dashboard/types";
import { sanitizeHttpUrl } from "../../../../utils/security";

export interface SourceSitesDetailViewProps {
  report: ScrapePreviewReport;
}

export const SourceSitesDetailView: React.FC<SourceSitesDetailViewProps> = ({ report }) => {
  const [selectedSite, setSelectedSite] = useState<string>("all");
  const [copiedSite, setCopiedSite] = useState<string | null>(null);
  const [expandedJsonSites, setExpandedJsonSites] = useState<Record<string, boolean>>({});

  const { siteResults, summarized } = report;
  const sitesList = Object.keys(siteResults);

  const toggleJsonExpand = (site: string) => {
    setExpandedJsonSites((prev) => ({
      ...prev,
      [site]: !prev[site],
    }));
  };

  const handleCopyJson = async (site: string, data: any) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopiedSite(site);
      setTimeout(() => setCopiedSite(null), 2000);
    } catch (e) {
      console.error("复制 JSON 失败", e);
    }
  };

  const filteredSites =
    selectedSite === "all" ? sitesList : sitesList.filter((s) => s === selectedSite);

  return (
    <div className="space-y-5">
      {/* 顶部过滤控制与多源统计 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-indigo-600" />
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            数据源抓取与解析明细
          </span>
          <span className="text-xs text-slate-400">
            (共配置 {sitesList.length} 个站点)
          </span>
        </div>

        {/* 站点筛选标签 */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setSelectedSite("all")}
            className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
              selectedSite === "all"
                ? "bg-white text-indigo-700 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            全部站点
          </button>
          {sitesList.map((site) => (
            <button
              key={site}
              type="button"
              onClick={() => setSelectedSite(site)}
              className={`px-3 py-1 rounded-md transition font-medium cursor-pointer ${
                selectedSite === site
                  ? "bg-white text-indigo-700 shadow-2xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {siteResults[site]?.siteLabel || site.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 站点卡片列表 */}
      <div className="grid grid-cols-1 gap-5">
        {filteredSites.map((siteKey) => {
          const res = siteResults[siteKey];
          if (!res) return null;

          const data = res.data;
          const isJsonExpanded = !!expandedJsonSites[siteKey];
          const isCopied = copiedSite === siteKey;
          const siteFallbackUrl =
            CRAWLER_SITE_INFO[siteKey]?.url ||
            (siteKey === "javbus"
              ? "https://www.javbus.com"
              : siteKey === "javdb"
              ? "https://javdb.com"
              : siteKey === "airav"
              ? "https://airav.io"
              : undefined);

          return (
            <div
              key={siteKey}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* 卡片头部 */}
              <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-900">
                    {res.siteLabel}
                  </span>

                  {/* 状态徽标 */}
                  {res.status === "success" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                      <span>抓取成功</span>
                    </span>
                  )}
                  {res.status === "blocked" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full animate-pulse">
                      <ShieldAlert size={12} className="text-rose-600" />
                      <span>WAF / 403 阻断</span>
                    </span>
                  )}
                  {res.status === "error" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                      <XCircle size={12} className="text-rose-600" />
                      <span>解析/网络异常</span>
                    </span>
                  )}
                  {res.status === "skipped" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                      <AlertTriangle size={12} className="text-slate-400" />
                      <span>已跳过 / 未启用</span>
                    </span>
                  )}

                  {res.durationMs > 0 && (
                    <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                      <Clock size={12} />
                      {res.durationMs}ms
                    </span>
                  )}
                </div>

                {/* 外部来源跳转 (详情页 URL 或站点主页) */}
                {(() => {
                  const safeDataUrl = sanitizeHttpUrl(data?.url);
                  const safeFallbackUrl = sanitizeHttpUrl(siteFallbackUrl);
                  if (safeDataUrl) {
                    return (
                      <a
                        href={safeDataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium shrink-0"
                      >
                        <span>访问数据源网页</span>
                        <ExternalLink size={12} />
                      </a>
                    );
                  }
                  if (safeFallbackUrl) {
                    return (
                      <a
                        href={safeFallbackUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium shrink-0"
                      >
                        <span>访问站点主页</span>
                        <ExternalLink size={12} />
                      </a>
                    );
                  }
                  return null;
                })()}
              </div>

              {/* 卡片主体内容 */}
              <div className="p-5 space-y-4">
                {res.status === "blocked" && (
                  <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
                    <p className="font-bold flex items-center gap-1.5">
                      <ShieldAlert size={14} className="text-rose-600" />
                      数据源触发了 Cloudflare 等人机验证阻断
                    </p>
                    <p className="text-rose-700 text-[11px] leading-relaxed">
                      详情: {res.errorMsg || "HTTP 403 Forbidden"}。请在 Chrome 新标签页打开该站点通过验证，TabBridge 会自动复用浏览器登录会话。
                    </p>
                    {sanitizeHttpUrl(siteFallbackUrl) && (
                      <div className="pt-1">
                        <a
                          href={sanitizeHttpUrl(siteFallbackUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-semibold shadow-2xs transition"
                        >
                          <span>在新标签页打开 {res.siteLabel}</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {res.status === "error" && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    <span className="font-semibold">抓取错误提示: </span>
                    <span>{res.errorMsg || "未能成功获取页面数据"}</span>
                  </div>
                )}

                {res.status === "skipped" && (
                  <p className="text-xs text-slate-400 italic">
                    {res.errorMsg || "此站点未在配置的 crawlers 列表中启用。"}
                  </p>
                )}

                {data && (
                  <div className="space-y-3">
                    {/* 抓取到的标题 */}
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        抓取标题
                      </span>
                      <p className="text-xs text-slate-800 font-medium mt-0.5">
                        {data.title || data.ori_title || "（无有效标题）"}
                      </p>
                    </div>

                    {/* 抓取字段统计卡片 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-0.5">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Star size={11} className="text-amber-500" /> 评分
                        </span>
                        <p className="font-bold text-slate-800 font-mono">
                          {data.score ? `${data.score}` : "无"}
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-0.5">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Tag size={11} className="text-indigo-500" /> 分类标签
                        </span>
                        <p className="font-bold text-slate-800 font-mono">
                          {data.genre?.length || 0} 个
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-0.5">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <ImageIcon size={11} className="text-pink-500" /> 剧照池
                        </span>
                        <p className="font-bold text-slate-800 font-mono">
                          {data.preview_pics?.length || 0} 张
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-0.5">
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Magnet size={11} className="text-blue-500" /> 磁链资源
                        </span>
                        <p className="font-bold text-slate-800 font-mono">
                          {data.magnet?.length || 0} 条
                        </p>
                      </div>
                    </div>

                    {/* 出演女优 */}
                    {data.actress && data.actress.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                          识别女优
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {data.actress.map((a, i) => (
                            <span
                              key={i}
                              className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium"
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 原始 JSON 查看器抽屉 */}
                {data && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleJsonExpand(siteKey)}
                        className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                      >
                        {isJsonExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <Code2 size={13} className="text-indigo-500" />
                        <span>{isJsonExpanded ? "收起原始解析数据 (JSON)" : "展开查看原始解析数据 (JSON)"}</span>
                      </button>

                      {isJsonExpanded && (
                        <button
                          type="button"
                          onClick={() => handleCopyJson(siteKey, data)}
                          className="flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                        >
                          {isCopied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          <span>{isCopied ? "已复制 JSON" : "复制 JSON"}</span>
                        </button>
                      )}
                    </div>

                    {isJsonExpanded && (
                      <div className="mt-2 rounded-lg bg-slate-900 p-3 overflow-x-auto max-h-72 text-xs font-mono text-emerald-300">
                        <pre>
                          <code>{JSON.stringify(data, null, 2)}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
