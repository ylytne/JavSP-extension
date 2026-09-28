import React from "react";
import { FullAppConfig } from "../types";

interface MediaTabProps {
  formConfig: FullAppConfig;
  updateForm: (updater: (prev: FullAppConfig) => FullAppConfig) => void;
}

export const MediaTab: React.FC<MediaTabProps> = ({ formConfig, updateForm }) => {
  return (
    <div className="space-y-4">

      {/* 海报与角标 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">合成字幕/无码透明角标水印</span>
            <input
              type="checkbox"
              checked={formConfig.summarizer.cover.add_label}
              onChange={(e) =>
                updateForm((cfg) => {
                  cfg.summarizer.cover.add_label = e.target.checked;
                  return cfg;
                })
              }
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
          </div>
          <p className="text-[11px] text-slate-400">
            在生成的 poster.jpg 左上角叠加 -C（中文字幕）或 -U（无码流出）半透明角标标识。
          </p>
        </div>

        <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            海报纵向裁剪比例 (高/宽，默认 1.5 对应 2:3)
          </label>
          <input
            type="number"
            step="0.05"
            min="1.0"
            max="2.0"
            value={formConfig.summarizer.cover.crop.ratio}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.summarizer.cover.crop.ratio = parseFloat(e.target.value) || 1.5;
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* FANZA 大厂标准封面优化裁剪 */}
        <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2 col-span-1 md:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              FANZA/大厂标准封面优化裁剪 (800×538 正面偏移居中)
            </span>
            <input
              type="checkbox"
              checked={formConfig.summarizer.cover.crop.standard_fanza_crop ?? true}
              onChange={(e) =>
                updateForm((cfg) => {
                  cfg.summarizer.cover.crop.standard_fanza_crop = e.target.checked;
                  return cfg;
                })
              }
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
          </div>
          <p className="text-[11px] text-slate-400">
            针对 FANZA/DMM 等大厂标准的 800×538（及同比例高清展开图），自动从正面起点（421px）开始保留右侧正面并居中裁剪为 2:3，有效避免切除右侧出血位与文字。不满足标准比例时平滑降级为常规裁剪。
          </p>
        </div>

        {/* JavDB 水印封面策略 */}
        <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2 col-span-1 md:col-span-2">
          <label className="block text-xs font-bold text-slate-700">
            JavDB 水印封面策略 (use_javdb_cover)
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition ${
              (formConfig.summarizer.cover.use_javdb_cover ?? "fallback") === "fallback"
                ? "bg-indigo-50/50 border-indigo-300 text-indigo-950 font-medium"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}>
              <input
                type="radio"
                name="use_javdb_cover"
                value="fallback"
                checked={(formConfig.summarizer.cover.use_javdb_cover ?? "fallback") === "fallback"}
                onChange={() =>
                  updateForm((cfg) => {
                    cfg.summarizer.cover.use_javdb_cover = "fallback";
                    return cfg;
                  })
                }
                className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="font-semibold">允许作为最终保底 (fallback)</span>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  仅当 JavBus 与 AirAV 均无可用封面时，才采用 JavDB 的带水印封面兜底。
                </p>
              </div>
            </label>
            <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition ${
              formConfig.summarizer.cover.use_javdb_cover === "never"
                ? "bg-indigo-50/50 border-indigo-300 text-indigo-950 font-medium"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}>
              <input
                type="radio"
                name="use_javdb_cover"
                value="never"
                checked={formConfig.summarizer.cover.use_javdb_cover === "never"}
                onChange={() =>
                  updateForm((cfg) => {
                    cfg.summarizer.cover.use_javdb_cover = "never";
                    return cfg;
                  })
                }
                className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <span className="font-semibold">坚决禁用，宁缺毋滥 (never)</span>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  绝不采用 JavDB 带水印海报。若其它站点无封面则保持留空，以便后续手动补充。
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* 剧照下载设置 */}
      <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formConfig.summarizer.extra_fanarts.enabled}
              onChange={(e) =>
                updateForm((cfg) => {
                  cfg.summarizer.extra_fanarts.enabled = e.target.checked;
                  return cfg;
                })
              }
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-bold text-slate-800">
              开启剧照下载 (Extra Fanarts)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {formConfig.summarizer.extra_fanarts.enabled ? "已开启" : "已禁用"}
          </span>
        </div>

        {formConfig.summarizer.extra_fanarts.enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                并发下载通道数 (Concurrency)
              </label>
              <input
                type="number"
                min="1"
                max="8"
                step="1"
                value={formConfig.summarizer.extra_fanarts.concurrency ?? 4}
                onChange={(e) =>
                  updateForm((cfg) => {
                    const parsed = parseInt(e.target.value, 10);
                    cfg.summarizer.extra_fanarts.concurrency = isNaN(parsed)
                      ? 4
                      : Math.max(1, Math.min(8, parsed));
                    return cfg;
                  })
                }
                className="w-full text-xs font-mono px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                最大抓取张数 (0 为不限制)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={formConfig.summarizer.extra_fanarts.max_count}
                onChange={(e) =>
                  updateForm((cfg) => {
                    cfg.summarizer.extra_fanarts.max_count = parseInt(e.target.value, 10) || 0;
                    return cfg;
                  })
                }
                className="w-full text-xs font-mono px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                单通道间隔延时 (秒，并发模式推荐 0)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={formConfig.summarizer.extra_fanarts.scrap_interval}
                onChange={(e) =>
                  updateForm((cfg) => {
                    const parsed = parseFloat(e.target.value);
                    cfg.summarizer.extra_fanarts.scrap_interval = isNaN(parsed) ? 0 : Math.max(0, parsed);
                    return cfg;
                  })
                }
                className="w-full text-xs font-mono px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                超限时均匀抽样
              </label>
              <div className="flex items-center gap-2 pt-1.5">
                <input
                  type="checkbox"
                  checked={formConfig.summarizer.extra_fanarts.uniform_sampling}
                  onChange={(e) =>
                    updateForm((cfg) => {
                      cfg.summarizer.extra_fanarts.uniform_sampling = e.target.checked;
                      return cfg;
                    })
                  }
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-600">全片跨度均匀抽取</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
