import React, { useState } from "react";
import {
  X,
  Plus,
  AlertCircle,
  Info,
  Check,
  Coffee,
  Globe,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Sliders,
} from "lucide-react";
import { FullAppConfig } from "../types";
import { extractHostname } from "../../../../crawlers/tabBridge";
import {
  normalizeSiteUrl,
  testSiteConnectivity,
  ConnectivityTestResult,
} from "../../../../crawlers/base";
import {
  DimensionRoutingConfig,
  DEFAULT_DIMENSION_ROUTING,
  SLOT_ELIGIBLE_SITES,
} from "../../../../crawlers/dimensionSlots";

interface NetworkTabProps {
  formConfig: FullAppConfig;
  updateForm: (updater: (prev: FullAppConfig) => FullAppConfig) => void;
}

interface CrawlerMeta {
  id: string;
  name: string;
  role: string;
  badgeClass: string;
  desc: string;
  features: string[];
}

const KNOWN_CRAWLERS: CrawlerMeta[] = [
  {
    id: "javbus",
    name: "JavBus",
    role: "官方基石物料",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "抓取官方日文原名、高清无水印海报、官方整套剧照及女优头像映射。",
    features: ["日文原名", "高清大图", "完整剧照", "女优头像"],
  },
  {
    id: "javdb",
    name: "JavDB",
    role: "规范分类与评分",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    desc: "独占提供标准番号分类标签体系与社区综合评分。",
    features: ["分类标签独占", "社区评分", "无水印海报兜底"],
  },
  {
    id: "airav",
    name: "AirAV",
    role: "中文本土化增强",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    desc: "探测试探人工翻译繁体中文标题与详细中文剧情简介。",
    features: ["繁体中文标题", "中文剧情简介", "语言感知分流"],
  },
];

const CRAWLER_NAMES: Record<string, string> = {
  javbus: "JavBus",
  javdb: "JavDB",
  airav: "AirAV",
};

interface DimensionSlotMeta {
  key: keyof DimensionRoutingConfig;
  name: string;
  fields: string;
  desc: string;
  tip: string;
}

const DIMENSION_SLOTS: DimensionSlotMeta[] = [
  {
    key: "cover",
    name: "封面海报",
    fields: "cover, big_cover",
    desc: "追求官方高清、无水印展开大图。",
    tip: "首个非空有效图片 URL。若配置了过滤 JavDB 水印封面，将尊重该安全策略。",
  },
  {
    key: "previews",
    name: "剧照样张",
    fields: "preview_pics",
    desc: "追求独占、成套高清官方剧照样张。",
    tip: "单源整套独占采纳（AirAV 无剧照物料，不参与此插槽）。",
  },
  {
    key: "chinese",
    name: "中文译名与简介",
    fields: "title(zh), plot(zh)",
    desc: "追求自然人工翻译繁中标题与剧情简介。",
    tip: "当前由 AirAV 提供自然人工繁中，未命中或缺失时保留原文走外部机翻引擎。",
  },
  {
    key: "genre",
    name: "分类标签",
    fields: "genre, genre_id",
    desc: "追求权威番号标签闭包与分类映射。",
    tip: "分类文本与站点分类 ID 同源原子提取，绝不跨站混杂；后端支持传递闭包清洗。",
  },
  {
    key: "actress",
    name: "出演女优",
    fields: "actress",
    desc: "追求规范日文名、杜绝中日译名混杂。",
    tip: "单源整套独占采纳。若前置站点未收录该影片或未收录女优，自动顺位向下穿透回退。",
  },
  {
    key: "meta",
    name: "基础发售物料",
    fields: "日期/时长/导演/片商/发行商/系列/评分/磁链",
    desc: "追求权威发售信息与物料完整度。",
    tip: "逐字段降级遍历补全缺失项，评分顺位采纳首个有效值，磁链全源累加合并。",
  },
];

interface ProxyFreeSiteMeta {
  id: string;
  name: string;
  defaultUrl: string;
  placeholder: string;
  badgeClass: string;
}

const PROXY_FREE_SITES: ProxyFreeSiteMeta[] = [
  {
    id: "javbus",
    name: "JavBus",
    defaultUrl: "https://www.javbus.com",
    placeholder: "例如 seedmm.help 或 https://... (留空使用官方默认)",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    id: "javdb",
    name: "JavDB",
    defaultUrl: "https://javdb.com",
    placeholder: "例如 javdb580.com 或 https://... (留空使用官方默认)",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    id: "airav",
    name: "AirAV",
    defaultUrl: "https://airav.io",
    placeholder: "例如 airavplus2.cc 或 https://... (留空使用官方默认)",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
];

export const NetworkTab: React.FC<NetworkTabProps> = ({ formConfig, updateForm }) => {
  const [newHostInput, setNewHostInput] = useState("");
  const [testingSites, setTestingSites] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, ConnectivityTestResult | null>>({});

  const handleTestSite = async (siteId: string, defaultUrl: string) => {
    const currentVal = formConfig.network.proxy_free?.[siteId];
    const targetUrl = normalizeSiteUrl(currentVal, defaultUrl);
    setTestingSites((prev) => ({ ...prev, [siteId]: true }));
    setTestResults((prev) => ({ ...prev, [siteId]: null }));
    try {
      const res = await testSiteConnectivity(targetUrl);
      setTestResults((prev) => ({ ...prev, [siteId]: res }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [siteId]: { ok: false, latency: 0, error: err?.message || "测试失败" },
      }));
    } finally {
      setTestingSites((prev) => ({ ...prev, [siteId]: false }));
    }
  };

  const handleUpdateProxy = (siteId: string, value: string) => {
    updateForm((cfg) => {
      const currentProxy = { ...(cfg.network.proxy_free || {}) };
      currentProxy[siteId] = value;
      cfg.network.proxy_free = currentProxy;
      return cfg;
    });
    setTestResults((prev) => ({ ...prev, [siteId]: null }));
  };

  const handleResetProxy = (siteId: string) => {
    handleUpdateProxy(siteId, "");
  };

  const handleAddHost = () => {
    const raw = newHostInput.trim();
    if (!raw) return;
    const host = extractHostname(raw);
    if (!host) return;

    updateForm((cfg) => {
      const current = cfg.crawler.tab_bridge_hosts || [];
      if (!current.includes(host)) {
        cfg.crawler.tab_bridge_hosts = [...current, host];
      }
      return cfg;
    });
    setNewHostInput("");
  };

  const enabledCrawlerIds = formConfig.crawlers || [];

  const moveCrawlerOrder = (id: string, direction: -1 | 1, e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateForm((cfg) => {
      const current = [...(cfg.crawlers || [])];
      const index = current.indexOf(id);
      if (index === -1) return cfg;
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return cfg;
      const temp = current[index];
      current[index] = current[targetIndex];
      current[targetIndex] = temp;
      cfg.crawlers = current;
      return cfg;
    });
  };

  const toggleCrawler = (id: string) => {
    updateForm((cfg) => {
      const current = cfg.crawlers || [];
      if (current.includes(id)) {
        cfg.crawlers = current.filter((c) => c !== id);
      } else {
        cfg.crawlers = [...current, id];
      }
      return cfg;
    });
  };

  // 防崩空值保护 (Undefined Defense) 与白名单能力约束
  const currentRouting: DimensionRoutingConfig =
    formConfig.dimension_routing ?? DEFAULT_DIMENSION_ROUTING;

  const getSlotActiveCandidates = (slot: keyof DimensionRoutingConfig): string[] => {
    const eligible = SLOT_ELIGIBLE_SITES[slot] || [];
    const rawOrder = currentRouting[slot]?.length
      ? currentRouting[slot]
      : DEFAULT_DIMENSION_ROUTING[slot] || [];
    const result = rawOrder.filter((s) => eligible.includes(s));
    for (const s of eligible) {
      if (!result.includes(s)) {
        result.push(s);
      }
    }
    return result;
  };

  const handleMoveSlot = (
    slot: keyof DimensionRoutingConfig,
    index: number,
    direction: -1 | 1
  ) => {
    const current = [...getSlotActiveCandidates(slot)];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    const temp = current[index];
    current[index] = current[targetIndex];
    current[targetIndex] = temp;

    updateForm((prev) => ({
      ...prev,
      dimension_routing: {
        ...(prev.dimension_routing || DEFAULT_DIMENSION_ROUTING),
        [slot]: current,
      },
    }));
  };

  const handleResetRouting = () => {
    updateForm((prev) => ({
      ...prev,
      dimension_routing: { ...DEFAULT_DIMENSION_ROUTING },
    }));
  };

  return (
    <div className="space-y-5">
      {/* 目标驱动数据源协同与启闭管理 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-700">
            数据源协同与启闭管理
          </label>
          <span className="text-[11px] text-slate-400">
            目标驱动流水线：各站点各司其职、专精协同
          </span>
        </div>

        {/* 站点卡片列表 */}
        <div className="grid grid-cols-1 gap-2.5">
          {KNOWN_CRAWLERS.map((meta) => {
            const isEnabled = enabledCrawlerIds.includes(meta.id);

            return (
              <div
                key={meta.id}
                data-testid={`crawler-card-${meta.id}`}
                aria-label={`切换 ${meta.name}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleCrawler(meta.id);
                  }
                }}
                onClick={() => toggleCrawler(meta.id)}
                className={`flex items-start justify-between p-3.5 rounded-xl border transition cursor-pointer select-none ${
                  isEnabled
                    ? "bg-white border-slate-200 hover:border-indigo-300 shadow-2xs"
                    : "bg-slate-50/60 border-slate-200/80 hover:border-slate-300 opacity-60"
                }`}
              >
                <div className="space-y-1.5 min-w-0 pr-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-xs ${isEnabled ? "text-slate-800" : "text-slate-500"}`}>
                      {meta.name}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.badgeClass}`}
                    >
                      {meta.role}
                    </span>
                    {isEnabled && (
                      <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-0.5">
                        <Check size={11} className="stroke-[2.5]" />
                        已启用
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {meta.desc}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    {meta.features.map((feat) => (
                      <span
                        key={feat}
                        className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200"
                      >
                        {feat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 顺位微调与 Switch 开关 */}
                <div
                  className="shrink-0 flex items-center gap-2 pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isEnabled && (
                    <div className="flex items-center gap-1 bg-slate-100/90 px-1.5 py-0.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] font-semibold text-slate-500">
                        #{enabledCrawlerIds.indexOf(meta.id) + 1}
                      </span>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={enabledCrawlerIds.indexOf(meta.id) === 0}
                          onClick={(e) => moveCrawlerOrder(meta.id, -1, e)}
                          title="上移全局兜底顺位"
                          className="text-[9px] leading-none text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-500 p-0.5 cursor-pointer disabled:cursor-not-allowed"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={
                            enabledCrawlerIds.indexOf(meta.id) ===
                            enabledCrawlerIds.length - 1
                          }
                          onClick={(e) => moveCrawlerOrder(meta.id, 1, e)}
                          title="下移全局兜底顺位"
                          className="text-[9px] leading-none text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-500 p-0.5 cursor-pointer disabled:cursor-not-allowed"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  )}

                  <label
                    className="relative inline-flex items-center cursor-pointer pointer-events-none"
                    aria-label={`启用 ${meta.name}`}
                  >
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      readOnly
                      aria-label={`启用 ${meta.name}`}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {enabledCrawlerIds.length === 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <span>当前未启用任何数据源，请至少启用一个数据源以执行刮削。</span>
          </div>
        )}

        {/* 数据源顺位与兜底基准说明 */}
        <div className="p-2.5 bg-blue-50/70 rounded-xl border border-blue-200/80 text-[11px] text-blue-800 space-y-1">
          <div className="font-semibold text-blue-900 flex items-center gap-1.5">
            <Info size={13} className="text-blue-600 shrink-0" />
            <span>数据源顺位说明：</span>
          </div>
          <p className="text-blue-700 leading-relaxed pl-4">
            此顺位作为未显式配置插槽、新加入站点或冷门长尾物料的<strong>全局兜底顺位（Fallback Baseline）</strong>。在绝大多数情况下，封面、女优、分类等维度的实际物料优先权将由下方各维度的专属插槽优先级独立决定并优先覆盖。
          </p>
        </div>

        {/* 目标驱动流水线机制说明 */}
        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 space-y-1">
          <div className="font-semibold text-slate-700 flex items-center gap-1">
            <Info size={12} className="text-indigo-500" />
            <span>目标驱动流水线运作说明：</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-slate-500">
            <li><strong>专精分工协同</strong>：各站点不再进行粗暴的单维顺序覆盖。系统自动从 JavBus 提取官方基础物料与原名、从 JavDB 提取独占规范分类体系与社区评分、从 AirAV 探测试探人工中文标题与简介。</li>
            <li><strong>分阶段并发加速</strong>：JavBus 优先锁定基石物料后，JavDB 与 AirAV 自动通过并发调度异步请求，大幅缩短单部影片的抓取等待耗时。</li>
            <li><strong>灵活按需启闭</strong>：如担心特定站点风控严苛，可在此随时一键关闭该站点；关闭后系统会自动由其余可用数据源智能兜底补全。</li>
          </ul>
        </div>
      </div>

      {/* 2. 各维度插槽优先级调序看板 (Dimension Slot Routing) */}
      <div className="pt-2 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-indigo-600 shrink-0" />
            <label className="block text-xs font-bold text-slate-700">
              各维度插槽优先级调序看板 (Dimension Slot Routing)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              独立配置 6 大核心物料维度的专属回退顺位
            </span>
            <button
              type="button"
              onClick={handleResetRouting}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-800 rounded-lg transition cursor-pointer"
              title="一键将 6 大插槽恢复至系统默认推荐顺序"
            >
              <RotateCcw size={11} />
              <span>恢复默认推荐</span>
            </button>
          </div>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          当某维度物料在首选站点未收录或数据为空时，系统将严格按照您配置的站点路线顺位向下穿透降级。若某站点在上方总开关中被关闭，在下方队列中会自动显示为已停用并在实际抓取中跳过。
        </p>

        {/* 6 大维度卡片化陈列 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {DIMENSION_SLOTS.map((slot) => {
            const currentOrder = getSlotActiveCandidates(slot.key);
            const isSingle = currentOrder.length <= 1;

            return (
              <div
                key={slot.key}
                data-testid={`dimension-slot-${slot.key}`}
                className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-2xs hover:border-slate-300 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-slate-800">
                        {slot.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        ({slot.key})
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {slot.desc}
                    </p>
                  </div>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded border border-slate-200 shrink-0">
                    {slot.fields}
                  </span>
                </div>

                {/* 站点顺位徽章流 */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {currentOrder.map((siteId, idx) => {
                    const isSiteActive = enabledCrawlerIds.includes(siteId);
                    const isFirst = idx === 0;
                    const isLast = idx === currentOrder.length - 1;
                    const siteName = CRAWLER_NAMES[siteId] || siteId;

                    return (
                      <React.Fragment key={siteId}>
                        <div
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition ${
                            isSiteActive
                              ? "bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                              : "bg-slate-100/60 border-dashed border-slate-300 text-slate-400 opacity-60"
                          }`}
                        >
                          <span>{idx + 1}. {siteName}</span>
                          {!isSiteActive && (
                            <span className="text-[8px] px-1 py-0.2 bg-slate-200 text-slate-500 rounded">
                              已停用
                            </span>
                          )}
                          {!isSingle && (
                            <div className="flex items-center gap-0.5 ml-0.5">
                              <button
                                type="button"
                                disabled={isFirst}
                                onClick={() => handleMoveSlot(slot.key, idx, -1)}
                                title={`将 ${siteName} 顺位前移`}
                                className="w-4 h-4 flex items-center justify-center text-[9px] text-slate-500 hover:text-indigo-600 disabled:opacity-20 disabled:hover:text-slate-500 rounded hover:bg-slate-200/60 cursor-pointer disabled:cursor-not-allowed"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                disabled={isLast}
                                onClick={() => handleMoveSlot(slot.key, idx, 1)}
                                title={`将 ${siteName} 顺位后移`}
                                className="w-4 h-4 flex items-center justify-center text-[9px] text-slate-500 hover:text-indigo-600 disabled:opacity-20 disabled:hover:text-slate-500 rounded hover:bg-slate-200/60 cursor-pointer disabled:cursor-not-allowed"
                              >
                                ▼
                              </button>
                            </div>
                          )}
                        </div>
                        {idx < currentOrder.length - 1 && (
                          <span className="text-slate-300 text-[10px]">➔</span>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* 业务提示 */}
                <div className="text-[10px] text-slate-400 leading-normal pt-0.5">
                  {slot.tip}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 站点反向代理与免代理镜像 (Proxy-Free Mirrors) */}
      <div className="pt-2 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-indigo-600 shrink-0" />
            <label className="block text-xs font-bold text-slate-700">
              站点反向代理与免代理镜像 (Proxy-Free Mirrors)
            </label>
          </div>
          <span className="text-[11px] text-slate-400">
            自定义各站点的访问入口与反向代理域名
          </span>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          当官方主站受阻、不可访问或被墙时，可在此为各站点指定反向代理或免代理镜像站地址（例如{" "}
          <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded font-mono text-[10px]">
            javdb580.com
          </code>
          、
          <code className="text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded font-mono text-[10px]">
            airavplus2.cc
          </code>
          ）。爬虫刮削、剧照与封面下载将自动以指定的镜像地址发起请求，并自动继承 Referer 防盗链重写。留空则表示直接使用官方主站。
        </p>

        <div className="space-y-3">
          {PROXY_FREE_SITES.map((site) => {
            const rawVal = formConfig.network.proxy_free?.[site.id] || "";
            const isCustom = Boolean(rawVal.trim());
            const effectiveUrl = normalizeSiteUrl(rawVal, site.defaultUrl);
            const isTesting = Boolean(testingSites[site.id]);
            const testResult = testResults[site.id];

            return (
              <div
                key={site.id}
                className="p-3 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-2xs hover:border-slate-300 transition"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-800">
                      {site.name}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${site.badgeClass}`}
                    >
                      官方默认: {site.defaultUrl}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isCustom ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                        <Check size={10} className="stroke-[2.5]" />
                        镜像生效: {effectiveUrl}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono">
                        使用官方默认
                      </span>
                    )}

                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => handleResetProxy(site.id)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 transition cursor-pointer"
                        title="清空并恢复为官方主站"
                      >
                        <RotateCcw size={11} />
                        恢复默认
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder={site.placeholder}
                      value={rawVal}
                      onChange={(e) => handleUpdateProxy(site.id, e.target.value)}
                      className="w-full text-xs font-mono px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleTestSite(site.id, site.defaultUrl)}
                    disabled={isTesting}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    {isTesting ? (
                      <>
                        <Loader2 size={12} className="animate-spin text-indigo-600" />
                        <span>测试中...</span>
                      </>
                    ) : (
                      <span>测试连通</span>
                    )}
                  </button>

                  <a
                    href={effectiveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      if (typeof chrome !== "undefined" && chrome?.tabs?.create) {
                        e.preventDefault();
                        chrome.tabs.create({ url: effectiveUrl });
                      }
                    }}
                    title={`在浏览器新标签页打开 ${effectiveUrl}`}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition shrink-0"
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>

                {/* 连通性测试结果提示 */}
                {testResult && (
                  <div
                    className={`p-2 rounded-lg text-[11px] flex items-center justify-between gap-2 animate-in fade-in duration-150 ${
                      testResult.ok
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-rose-50 text-rose-800 border border-rose-200"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {testResult.ok ? (
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                      ) : (
                        <XCircle size={13} className="text-rose-600 shrink-0" />
                      )}
                      <span>
                        {testResult.ok
                          ? `连通正常！响应延迟 ${testResult.latency}ms (HTTP ${testResult.status || 200})`
                          : `连通异常: ${testResult.error || "无法访问"} (${testResult.latency}ms)`}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 truncate max-w-[200px]">
                      {effectiveUrl}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 网络重试与超时 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            单次网络请求超时时间 (秒)
          </label>
          <input
            type="number"
            step="0.5"
            min="1"
            value={formConfig.network.timeout}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.network.timeout = parseFloat(e.target.value) || 10;
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            网络异常或反爬超限自动重试次数
          </label>
          <input
            type="number"
            min="0"
            max="10"
            value={formConfig.network.retry}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.network.retry = parseInt(e.target.value, 10) || 0;
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 友好文明爬取延时 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            刮削影片后的基础等待时间 (秒)
          </label>
          <input
            type="number"
            step="0.5"
            min="0"
            value={formConfig.crawler.sleep_after_scraping}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.crawler.sleep_after_scraping = parseFloat(e.target.value) || 0;
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            等待时间随机浮动上限 (秒, Jitter)
          </label>
          <input
            type="number"
            step="0.5"
            min="0"
            value={formConfig.crawler.sleep_jitter}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.crawler.sleep_jitter = parseFloat(e.target.value) || 0;
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* 大批量请求冷却防风控保护 (Burst Protection) */}
      <div className="pt-2 border-t border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <label className="block text-xs font-bold text-slate-700">
                大批量请求冷却防风控保护 (Burst Protection)
              </label>
              <span className="text-[10px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">
                推荐开启
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              大批量处理时按批次强制休眠较长时间，模拟真实人类浏览间隔，强效规避 Cloudflare / WAF 行为特征判定与 IP 封禁
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formConfig.crawler.burst_protection_enabled ?? true}
              onChange={(e) =>
                updateForm((cfg) => {
                  cfg.crawler.burst_protection_enabled = e.target.checked;
                  return cfg;
                })
              }
              aria-label="启用大批量请求冷却保护"
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {(formConfig.crawler.burst_protection_enabled ?? true) && (
          <div className="p-3.5 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  连续抓取基准数量 (部)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={formConfig.crawler.burst_limit ?? 10}
                  onChange={(e) =>
                    updateForm((cfg) => {
                      cfg.crawler.burst_limit = Math.max(1, parseInt(e.target.value, 10) || 1);
                      return cfg;
                    })
                  }
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  批次随机浮动范围 (±部, Jitter)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formConfig.crawler.burst_jitter ?? 2}
                  onChange={(e) =>
                    updateForm((cfg) => {
                      cfg.crawler.burst_jitter = Math.max(0, parseInt(e.target.value, 10) || 0);
                      return cfg;
                    })
                  }
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  批次休眠冷却基准时长 (秒)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formConfig.crawler.burst_cooldown ?? 60}
                  onChange={(e) =>
                    updateForm((cfg) => {
                      cfg.crawler.burst_cooldown = Math.max(0, parseFloat(e.target.value) || 0);
                      return cfg;
                    })
                  }
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  冷却时长随机浮动 (秒, Jitter)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formConfig.crawler.burst_cooldown_jitter ?? 10}
                  onChange={(e) =>
                    updateForm((cfg) => {
                      cfg.crawler.burst_cooldown_jitter = Math.max(0, parseFloat(e.target.value) || 0);
                      return cfg;
                    })
                  }
                  className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
              </div>
            </div>

            {/* 动态计算结果与效果说明 */}
            <div className="p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-lg text-[11px] text-indigo-900 leading-relaxed flex items-center gap-2">
              <Coffee size={14} className="text-indigo-600 shrink-0" />
              <span>
                <strong>当前动态保护节奏</strong>：每连续抓取{" "}
                <span className="font-mono font-bold text-indigo-700">
                  {Math.max(
                    1,
                    (formConfig.crawler.burst_limit ?? 10) - (formConfig.crawler.burst_jitter ?? 2)
                  )}
                  {" ~ "}
                  {(formConfig.crawler.burst_limit ?? 10) + (formConfig.crawler.burst_jitter ?? 2)}
                </span>{" "}
                部影片，系统自动进入长时休眠冷却{" "}
                <span className="font-mono font-bold text-indigo-700">
                  {(formConfig.crawler.burst_cooldown ?? 60).toFixed(0)}
                  {" ~ "}
                  {(
                    (formConfig.crawler.burst_cooldown ?? 60) +
                    (formConfig.crawler.burst_cooldown_jitter ?? 10)
                  ).toFixed(0)}
                </span>{" "}
                秒，随后继续按正常单部延时恢复抓取。
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 标签页桥接 (TabBridge) 站点名单 */}
      <div className="pt-3 border-t border-slate-100">
        <div className="mb-2">
          <label className="block text-xs font-bold text-slate-700">
            标签页桥接 (TabBridge) 绕过名单
          </label>
          <div className="text-[11px] text-slate-500 mt-0.5">
            当站点开启严格 WAF（如 Cloudflare 跨域拦截 HTTP 403）时，系统会自动将域名持久化登记在此处，此后将直接使用真实浏览器标签页同源通道抓取，免受拦截。
          </div>
        </div>

        {/* 标签列表 */}
        <div className="flex flex-wrap gap-2 mb-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg min-h-[44px] items-center">
          {formConfig.crawler.tab_bridge_hosts && formConfig.crawler.tab_bridge_hosts.length > 0 ? (
            formConfig.crawler.tab_bridge_hosts.map((host) => (
              <span
                key={host}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-indigo-200 text-indigo-900 rounded-md text-xs font-mono shadow-2xs"
              >
                {host}
                <button
                  type="button"
                  title={`移除 ${host}`}
                  onClick={() =>
                    updateForm((cfg) => {
                      cfg.crawler.tab_bridge_hosts = (cfg.crawler.tab_bridge_hosts || []).filter(
                        (h) => h !== host
                      );
                      return cfg;
                    })
                  }
                  className="text-slate-400 hover:text-rose-600 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-400 italic">暂无记录的 Tab 桥接站点</span>
          )}
        </div>

        {/* 手动添加输入框 */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="输入域名，例如 airav.io 或 https://..."
            value={newHostInput}
            onChange={(e) => setNewHostInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddHost();
              }
            }}
            className="flex-1 text-xs font-mono px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleAddHost}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            添加域名
          </button>
        </div>
      </div>
    </div>
  );
};
