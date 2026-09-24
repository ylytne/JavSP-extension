import React from "react";
import { FullAppConfig } from "../types";

interface MediaTabProps {
  formConfig: FullAppConfig;
  updateForm: (updater: (prev: FullAppConfig) => FullAppConfig) => void;
}

export const MediaTab: React.FC<MediaTabProps> = ({ formConfig, updateForm }) => {
  const insertTemplateVar = (varName: string) => {
    updateForm((cfg) => {
      cfg.summarizer.nfo.title_pattern += varName;
      return cfg;
    });
  };

  return (
    <div className="space-y-4">
      {/* NFO 模板 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-slate-700">
            NFO 影片标题模板 (nfo.title_pattern)
          </label>
          <div className="flex items-center gap-1">
            {["{num}", "{title}", "{censor}"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertTemplateVar(v)}
                className="px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-[10px] font-mono rounded text-slate-600 border border-slate-200 cursor-pointer"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <input
          type="text"
          value={formConfig.summarizer.nfo.title_pattern}
          onChange={(e) =>
            updateForm((cfg) => {
              cfg.summarizer.nfo.title_pattern = e.target.value;
              return cfg;
            })
          }
          className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
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
                抓取间隔 (秒)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={formConfig.summarizer.extra_fanarts.scrap_interval}
                onChange={(e) =>
                  updateForm((cfg) => {
                    cfg.summarizer.extra_fanarts.scrap_interval = parseFloat(e.target.value) || 0.5;
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

      {/* 女优头像本地下载设置 */}
      <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formConfig.summarizer.actress_avatar?.enabled ?? true}
              onChange={(e) =>
                updateForm((cfg) => {
                  if (!cfg.summarizer.actress_avatar) {
                    cfg.summarizer.actress_avatar = { enabled: true, scrap_interval: 0.5, timeout: 10.0 };
                  }
                  cfg.summarizer.actress_avatar.enabled = e.target.checked;
                  return cfg;
                })
              }
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-bold text-slate-800">
              开启女优本地头像下载 (Actress Avatar)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {(formConfig.summarizer.actress_avatar?.enabled ?? true) ? "已开启" : "已禁用"}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 leading-snug">
          由前端扩展在浏览器同源安全环境下下载女优头像，并在后端保存至影片同级目录下的 <code className="text-indigo-600 font-mono">.actors/女优名.jpg</code> 文件夹。Jellyfin / Emby / Kodi 原生完全支持，实现零外网依赖的离线本地头像。
        </p>

        {(formConfig.summarizer.actress_avatar?.enabled ?? true) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                抓取间隔 (秒)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={formConfig.summarizer.actress_avatar?.scrap_interval ?? 0.5}
                onChange={(e) =>
                  updateForm((cfg) => {
                    if (!cfg.summarizer.actress_avatar) {
                      cfg.summarizer.actress_avatar = { enabled: true, scrap_interval: 0.5, timeout: 10.0 };
                    }
                    cfg.summarizer.actress_avatar.scrap_interval = parseFloat(e.target.value) || 0.5;
                    return cfg;
                  })
                }
                className="w-full text-xs font-mono px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                单张下载超时 (秒)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={formConfig.summarizer.actress_avatar?.timeout ?? 10.0}
                onChange={(e) =>
                  updateForm((cfg) => {
                    if (!cfg.summarizer.actress_avatar) {
                      cfg.summarizer.actress_avatar = { enabled: true, scrap_interval: 0.5, timeout: 10.0 };
                    }
                    cfg.summarizer.actress_avatar.timeout = parseFloat(e.target.value) || 10.0;
                    return cfg;
                  })
                }
                className="w-full text-xs font-mono px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 联动进阶兼容项：NFO <thumb> 相对路径写入 */}
            <div className="sm:col-span-2 pt-2.5 mt-1 border-t border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  在 NFO 中显式写入本地相对路径 &lt;thumb&gt; (进阶兼容)
                </span>
                <input
                  type="checkbox"
                  checked={formConfig.summarizer.nfo.actress_thumb_mode === "local"}
                  onChange={(e) =>
                    updateForm((cfg) => {
                      cfg.summarizer.nfo.actress_thumb_mode = e.target.checked ? "local" : "none";
                      return cfg;
                    })
                  }
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                默认关闭（推荐）。Jellyfin / Emby / Kodi 原生会自动扫描并加载同级 <code className="text-indigo-600 font-mono">.actors/</code> 目录下的头像，大多数场景无需在 NFO 额外声明标签。仅用于极少数强制要求 NFO 必须存在 &lt;thumb&gt; 节点的特定旧版播放器做向下兼容。
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 预告视频链接写入设置 (<trailer>) */}
      <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formConfig.summarizer.nfo.include_trailer ?? false}
              onChange={(e) =>
                updateForm((cfg) => {
                  cfg.summarizer.nfo.include_trailer = e.target.checked;
                  return cfg;
                })
              }
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-bold text-slate-800">
              写入预告视频链接到 NFO (&lt;trailer&gt;)
            </span>
          </div>
          <span className={`text-[11px] font-mono ${
            (formConfig.summarizer.nfo.include_trailer ?? false)
              ? "text-amber-600 font-semibold"
              : "text-slate-400"
          }`}>
            {(formConfig.summarizer.nfo.include_trailer ?? false) ? "已开启 (有风险)" : "已禁用 (推荐)"}
          </span>
        </div>

        {/* 醒目风险提示框 */}
        <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-lg text-amber-900 text-[11px] space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-amber-950">
            <span className="text-sm">⚠️</span>
            <span>高危风险与不稳定性警示：</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-amber-900/90 pl-1">
            <li>
              <strong>切片流或在线全片风险</strong>：部分站点（如 AirAV）抓取到的视频流实为第三方在线播放站点的 m3u8 切片流，甚至是在线全片流，并非官方剪辑的 Sample 预告片；
            </li>
            <li>
              <strong>时效性与死链</strong>：第三方在线流通常带有防盗链鉴权、时效 Token 或动态 IP 绑定，数天后极易彻底失效（403/404），相关域名亦常遭 GFW 封锁；
            </li>
            <li>
              <strong>媒体服务器卡死</strong>：在 Jellyfin / Emby 中，若开启了“影院模式”（正片前播放预告片）或 TV 端的自动背景预览，遇到无法连通的 m3u8 时可能导致<strong>正片播放卡死 30~60 秒甚至抛出播放错误</strong>。
            </li>
          </ul>
          <p className="text-[10.5px] text-amber-800 pt-0.5 font-medium">
            💡 <strong>强烈建议保持禁用</strong>。直接抓取预告片/全片视频到本地不是本项目的目标，本项目的目标仅限于刮削信息。如需预告片，推荐在影片同级目录下手动放置本地离线文件（如 <code className="font-mono bg-amber-100/60 px-1 py-0.5 rounded">movie-trailer.mp4</code>）。
          </p>
        </div>
      </div>
    </div>
  );
};
