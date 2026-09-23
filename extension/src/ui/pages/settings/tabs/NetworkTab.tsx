import React, { useState } from "react";
import { X, Plus, AlertCircle, Info, Check, Coffee } from "lucide-react";
import { FullAppConfig } from "../types";
import { extractHostname } from "../../../../crawlers/tabBridge";

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

export const NetworkTab: React.FC<NetworkTabProps> = ({ formConfig, updateForm }) => {
  const [newHostInput, setNewHostInput] = useState("");

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

                {/* Switch 开关 */}
                <div className="shrink-0 pt-0.5">
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
