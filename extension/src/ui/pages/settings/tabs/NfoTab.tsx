import React, { useState } from "react";
import { Plus, Trash2, HelpCircle, FileText, AlertTriangle, BookmarkCheck } from "lucide-react";
import { FullAppConfig } from "../types";
import {
  NFO_TITLE_VARS,
  VariablePillSelector,
  MediaTitlePreview,
  formatTemplate,
  TEMPLATE_SAMPLE_MOVIE,
} from "../components/TemplatePreview";

interface NfoTabProps {
  formConfig: FullAppConfig;
  updateForm: (updater: (prev: FullAppConfig) => FullAppConfig) => void;
}

export const NfoTab: React.FC<NfoTabProps> = ({ formConfig, updateForm }) => {
  const [newPattern, setNewPattern] = useState("");

  const insertTemplateVar = (varName: string) => {
    updateForm((cfg) => {
      cfg.summarizer.nfo.title_pattern += varName;
      return cfg;
    });
  };

  const handleAddPattern = () => {
    const trimmed = newPattern.trim();
    if (!trimmed) return;
    updateForm((cfg) => {
      if (!cfg.summarizer.nfo.plot_clean_patterns) {
        cfg.summarizer.nfo.plot_clean_patterns = [];
      }
      if (!cfg.summarizer.nfo.plot_clean_patterns.includes(trimmed)) {
        cfg.summarizer.nfo.plot_clean_patterns.push(trimmed);
      }
      return cfg;
    });
    setNewPattern("");
  };

  const handleRemovePattern = (index: number) => {
    updateForm((cfg) => {
      if (cfg.summarizer.nfo.plot_clean_patterns) {
        cfg.summarizer.nfo.plot_clean_patterns.splice(index, 1);
      }
      return cfg;
    });
  };

  const patterns = formConfig.summarizer.nfo.plot_clean_patterns || [];

  return (
    <div className="space-y-4">
      {/* 1. NFO 影片标题模板配置卡片 */}
      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="space-y-1.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <label className="text-xs font-bold text-slate-700">
                NFO 影片标题模板 (nfo.title_pattern)
              </label>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                写入影片 NFO 的 <code className="text-indigo-600 font-mono font-semibold">&lt;title&gt;</code> 节点。Emby / Jellyfin / Kodi 等媒体中心导入后，海报墙与详情页展示的影视标题以此为准。
              </p>
            </div>
            <VariablePillSelector
              vars={NFO_TITLE_VARS}
              onInsert={insertTemplateVar}
            />
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
            placeholder="{num} {title}"
            className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {/* 实时媒体库标题显示效果预览 */}
          <MediaTitlePreview pattern={formConfig.summarizer.nfo.title_pattern} />
        </div>
      </div>

      {/* 3. 系列元数据写入设置 (serial_as_tag_and_genre) */}
      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookmarkCheck size={16} className="text-indigo-600" />
            <span className="text-xs font-bold text-slate-800">
              系列 (Serial) 标签与分类写入
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              data-testid="serial-as-tag-and-genre-checkbox"
              checked={formConfig.summarizer.nfo.serial_as_tag_and_genre ?? true}
              onChange={(e) =>
                updateForm((cfg) => {
                  cfg.summarizer.nfo.serial_as_tag_and_genre = e.target.checked;
                  return cfg;
                })
              }
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>添加系列至 &lt;tag&gt; 与 &lt;genre&gt;</span>
          </label>
        </div>
        <p className="text-[11px] text-slate-500 leading-snug">
          默认情况下，抓取到的影片“系列”（前端解析对应 <code className="text-slate-600 font-mono">serial</code>）会写入 NFO 的 <code className="text-indigo-600 font-mono">&lt;set&gt;</code> 集合节点中。
          开启此选项后，还将自动把系列名称同时添加为 NFO 的 <code className="text-indigo-600 font-mono">&lt;tag&gt;</code> 标签与 <code className="text-indigo-600 font-mono">&lt;genre&gt;</code> 流派分类，方便在 Jellyfin、Emby、Kodi 等媒体库中直接按系列筛选和检索影片。
        </p>
      </div>

      {/* 4. 剧情简介 (Plot) 脏数据清理设置卡片 */}
      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-indigo-600" />
            <span className="text-xs font-bold text-slate-800">
              剧情简介 (Plot) 清理设置
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={formConfig.summarizer.nfo.clean_plot ?? true}
              onChange={(e) =>
                updateForm((cfg) => {
                  cfg.summarizer.nfo.clean_plot = e.target.checked;
                  return cfg;
                })
              }
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>开启简介脏数据清洗</span>
          </label>
        </div>

        <p className="text-[11px] text-slate-500 leading-snug">
          部分数据源站点（如 AirAV）抓取回来的剧情简介常包含番号前缀及站点广告后缀（如 <code className="text-slate-600 font-mono">SNOS-030 实际简介 - airav.io</code>）。开启后将在生成 NFO 的 <code className="text-indigo-600 font-mono">&lt;plot&gt;</code> 标签时自动剔除。
        </p>

        {/* 详细清洗选项 */}
        {(formConfig.summarizer.nfo.clean_plot ?? true) && (
          <div className="space-y-3 pt-2 border-t border-slate-200">
            {/* 开头番号清理开关 */}
            <div className="flex items-start justify-between gap-4 p-3 bg-white rounded-lg border border-slate-200">
              <div>
                <label className="text-xs font-bold text-slate-700 block">
                  清理简介开头的番号前缀 (clean_plot_num)
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  自动识别并剥离简介开头的番号（无论是带空格的 <code className="font-mono text-slate-600">SNOS-030 简介</code> 还是紧贴无空格的 <code className="font-mono text-slate-600">SNOS-030简介</code>，以及各类括号变体 <code className="font-mono text-slate-600">[SNOS-030]</code>、冒号等，均可干净清理为纯粹的简介内容）。
                </p>
              </div>
              <input
                type="checkbox"
                checked={formConfig.summarizer.nfo.clean_plot_num ?? true}
                onChange={(e) =>
                  updateForm((cfg) => {
                    cfg.summarizer.nfo.clean_plot_num = e.target.checked;
                    return cfg;
                  })
                }
                className="rounded text-indigo-600 focus:ring-indigo-500 shrink-0 mt-0.5"
              />
            </div>

            {/* 自定义清理文本列表 (plot_clean_patterns) */}
            <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2.5">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    需要清理的特定文本/正则列表 (plot_clean_patterns)
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    已配置 {patterns.length} 条
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  从简介中移除匹配的广告词或站点标识。支持不区分大小写与空白容差（无论写 <code className="font-mono text-slate-600"> - airav.io</code> 还是 <code className="font-mono text-slate-600">- airav.io</code> 均能消除末尾空格）。亦支持模板变量如 <code className="font-mono text-indigo-600">{"{num}"}</code> 或正则表达式。
                </p>
              </div>

              {/* 规则条目列表 */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {patterns.length === 0 ? (
                  <div className="text-center py-3 text-slate-400 text-xs bg-slate-50 rounded border border-dashed border-slate-200">
                    暂未配置自定义清理规则
                  </div>
                ) : (
                  patterns.map((pat, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded border border-slate-200 text-xs font-mono text-slate-700 group transition"
                    >
                      <span className="truncate">{pat}</span>
                      <button
                        type="button"
                        onClick={() => handleRemovePattern(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition cursor-pointer"
                        title="删除该规则"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* 新增规则输入栏 */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddPattern();
                    }
                  }}
                  placeholder="例如:  - airav.io 或特定广告词"
                  className="flex-1 text-xs font-mono px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddPattern}
                  disabled={!newPattern.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-medium transition cursor-pointer shrink-0"
                >
                  <Plus size={14} />
                  <span>添加规则</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. 预告视频链接写入设置 (<trailer>) */}
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
          <span
            className={`text-[11px] font-mono ${
              (formConfig.summarizer.nfo.include_trailer ?? false)
                ? "text-amber-600 font-semibold"
                : "text-slate-400"
            }`}
          >
            {(formConfig.summarizer.nfo.include_trailer ?? false) ? "已开启 (有风险)" : "已禁用 (推荐)"}
          </span>
        </div>

        {/* 醒目风险提示框 */}
        <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-lg text-amber-900 text-[11px] space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-amber-950">
            <AlertTriangle size={14} className="text-amber-600 shrink-0" />
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
            💡 <strong>强烈建议保持禁用</strong>。
          </p>
        </div>
      </div>
    </div>
  );
};
