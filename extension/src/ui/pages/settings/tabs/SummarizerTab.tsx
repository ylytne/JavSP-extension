import React from "react";
import { FullAppConfig } from "../types";
import {
  FOLDER_VARS,
  BASENAME_VARS,
  NFO_BASENAME_VARS,
  COVER_BASENAME_VARS,
  FANART_BASENAME_VARS,
  VariablePillSelector,
  FolderBreadcrumbPreview,
  DiskStructurePreview,
  formatTemplate,
  TEMPLATE_SAMPLE_MOVIE,
} from "../components/TemplatePreview";

interface SummarizerTabProps {
  formConfig: FullAppConfig;
  updateForm: (updater: (prev: FullAppConfig) => FullAppConfig) => void;
}

export const SummarizerTab: React.FC<SummarizerTabProps> = ({ formConfig, updateForm }) => {
  const insertTemplateVar = (
    field: "output_folder_pattern" | "basename_pattern",
    varName: string
  ) => {
    updateForm((cfg) => {
      if (field === "output_folder_pattern") {
        cfg.summarizer.path.output_folder_pattern += varName;
      } else if (field === "basename_pattern") {
        cfg.summarizer.path.basename_pattern += varName;
      }
      return cfg;
    });
  };

  const insertNfoVar = (varName: string) => {
    updateForm((cfg) => {
      cfg.summarizer.nfo.basename_pattern = (cfg.summarizer.nfo.basename_pattern || "") + varName;
      return cfg;
    });
  };

  const insertCoverVar = (varName: string) => {
    updateForm((cfg) => {
      cfg.summarizer.cover.basename_pattern = (cfg.summarizer.cover.basename_pattern || "") + varName;
      return cfg;
    });
  };

  const insertFanartVar = (varName: string) => {
    updateForm((cfg) => {
      cfg.summarizer.fanart.basename_pattern = (cfg.summarizer.fanart.basename_pattern || "") + varName;
      return cfg;
    });
  };

  return (
    <div className="space-y-5">
      {/* 整理模式卡片 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-bold text-slate-700">
            文件整理模式
          </label>
          <span className="text-[11px] text-slate-400">已与【刮削管理】首页控制台双向联动</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              mode: "move",
              title: "移动并归档",
              desc: "原文件将被安全剪切移动至目标目录",
              active: formConfig.summarizer.move_files && !formConfig.summarizer.path.hard_link,
            },
            {
              mode: "hard_link",
              title: "创建硬链接 ",
              desc: "不占用额外磁盘空间，原文件不受影响，建议PT保种党使用此模式",
              active: formConfig.summarizer.path.hard_link,
            },
            {
              mode: "inplace",
              title: "原地就地生成",
              desc: "不移动视频，仅在当前同级目录生成 NFO 与图片",
              active: !formConfig.summarizer.move_files && !formConfig.summarizer.path.hard_link,
            },
          ].map((item) => (
            <div
              key={item.mode}
              onClick={() =>
                updateForm((cfg) => {
                  if (item.mode === "move") {
                    cfg.summarizer.move_files = true;
                    cfg.summarizer.path.hard_link = false;
                  } else if (item.mode === "hard_link") {
                    cfg.summarizer.move_files = true;
                    cfg.summarizer.path.hard_link = true;
                  } else {
                    cfg.summarizer.move_files = false;
                    cfg.summarizer.path.hard_link = false;
                  }
                  return cfg;
                })
              }
              className={`p-3 rounded-lg border text-xs cursor-pointer transition select-none ${
                item.active
                  ? "bg-indigo-50/60 border-indigo-400 text-indigo-950 font-medium"
                  : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <div className="font-bold mb-0.5">{item.title}</div>
              <div className="text-[11px] text-slate-500 leading-tight">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 输出路径模板与文件名配置卡片 */}
      <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 space-y-4">
        {/* 默认输出根目录 */}
        <div className="space-y-1.5 pb-3 border-b border-slate-200/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <label className="text-xs font-bold text-slate-700">
                默认整理后输出根目录 (output_directory)
              </label>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                跨盘归档或统一影片存放根目录。留空则默认直接输出至每次扫描的待整理目录，亦可在【刮削管理】面板中随时手动指定。
              </p>
            </div>
          </div>
          <input
            type="text"
            value={formConfig.summarizer.path.output_directory || ""}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.summarizer.path.output_directory = e.target.value.trim() || null;
                return cfg;
              })
            }
            placeholder="例如: E:\Movies\Organized 或 /volume1/video/movies (留空默认使用扫描目录)"
            className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* 输出路径模板 */}
        <div className="space-y-1.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <label className="text-xs font-bold text-slate-700">
                整理后分类子目录路径模板 (output_folder_pattern)
              </label>
              <div className="text-[11px] text-slate-500 leading-relaxed mt-0.5 space-y-0.5">
                <p>在输出根目录下方，定义影片归档与子文件夹层级。使用斜杠 <code className="text-indigo-600 font-mono font-semibold">/</code> 分隔多级子目录：</p>
                <div className="text-[10.5px] text-slate-400 pl-1 space-y-0.5">
                  <div>
                    • <strong className="text-slate-600 font-medium">相对子目录</strong>（如 <code className="text-indigo-600 font-mono">#整理完成/{"{actress}"}/...</code>）：自动存放在每次指定的输出根目录中；
                  </div>
                  <div>
                    • <strong className="text-slate-600 font-medium">绝对路径</strong>（如 <code className="text-indigo-600 font-mono">E:/MOVIES/{"{actress}"}/...</code>）：强制跨盘归档至该固定绝对路径。
                  </div>
                </div>
              </div>
            </div>
            <VariablePillSelector
              vars={FOLDER_VARS}
              onInsert={(token) => insertTemplateVar("output_folder_pattern", token)}
            />
          </div>
          <input
            type="text"
            value={formConfig.summarizer.path.output_folder_pattern}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.summarizer.path.output_folder_pattern = e.target.value;
                return cfg;
              })
            }
            placeholder="#整理完成/{actress}/[{num}] {title}"
            className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {/* 实时目录层级效果预览 */}
          <FolderBreadcrumbPreview
            pattern={formConfig.summarizer.path.output_folder_pattern}
            baseDirectory={formConfig.summarizer.path.output_directory || formConfig.scanner.input_directory}
          />
        </div>

        {/* 主文件名模板 */}
        <div className="space-y-1.5 pt-2 border-t border-slate-200/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <label className="text-xs font-bold text-slate-700">
                主文件名前缀模板 (basename_pattern)
              </label>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                定义目标目录内视频、NFO、海报及字幕的主文件名（不含扩展名及 CD1 分片标记），推荐保持 <code className="text-indigo-600 font-mono font-semibold">{"{num}"}</code>。
              </p>
            </div>
            <VariablePillSelector
              vars={BASENAME_VARS}
              onInsert={(token) => insertTemplateVar("basename_pattern", token)}
            />
          </div>
          <input
            type="text"
            value={formConfig.summarizer.path.basename_pattern}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.summarizer.path.basename_pattern = e.target.value;
                return cfg;
              })
            }
            placeholder="{num}"
            className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* NFO 文件命名规则 */}
        <div className="space-y-2 pt-3 border-t border-slate-200/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div>
              <label className="text-xs font-bold text-slate-700">
                NFO 文件命名规则 (nfo.basename_pattern)
              </label>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                控制落盘时 NFO 文件的名称（无需输入 <code className="text-indigo-600 font-mono">.nfo</code> 扩展名）。推荐保持 <code className="text-indigo-600 font-mono font-semibold">{"{filename}"}</code> 与视频主文件完全同名。
              </p>
            </div>
            <VariablePillSelector
              vars={NFO_BASENAME_VARS}
              onInsert={insertNfoVar}
            />
          </div>
          <input
            type="text"
            value={formConfig.summarizer.nfo.basename_pattern ?? "{filename}"}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.summarizer.nfo.basename_pattern = e.target.value;
                return cfg;
              })
            }
            placeholder="{filename}"
            className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-400 select-none">推荐预设:</span>
              <button
                type="button"
                onClick={() =>
                  updateForm((cfg) => {
                    cfg.summarizer.nfo.basename_pattern = "{filename}";
                    return cfg;
                  })
                }
                className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                title="重置为与视频主文件完全同名"
              >
                重置为同名 ({"{filename}"})
              </button>
              <button
                type="button"
                onClick={() =>
                  updateForm((cfg) => {
                    cfg.summarizer.nfo.basename_pattern = "movie";
                    return cfg;
                  })
                }
                className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                title="切换为 Kodi 传统单目录 movie.nfo"
              >
                movie.nfo
              </button>
              <button
                type="button"
                onClick={() =>
                  updateForm((cfg) => {
                    cfg.summarizer.nfo.basename_pattern = "{num}";
                    return cfg;
                  })
                }
                className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                title="固定使用番号命名 (如 IPX-177.nfo)"
              >
                {"{num}"}
              </button>
            </div>
            {/* 实时效果预览条 */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-white px-2.5 py-1 rounded border border-slate-200">
              <span className="font-semibold text-slate-700">NFO 落盘效果：</span>
              <code className="text-emerald-700 font-mono font-bold">
                {(
                  formatTemplate(
                    formConfig.summarizer.nfo.basename_pattern?.trim() || "{filename}",
                    { ...TEMPLATE_SAMPLE_MOVIE, filename: "IPX-177", basename: "IPX-177" }
                  ) || "IPX-177"
                ) + ".nfo"}
              </code>
            </div>
          </div>
        </div>

        {/* 海报与背景图命名规则 */}
        <div className="space-y-3 pt-3 border-t border-slate-200/70">
          <div>
            <label className="text-xs font-bold text-slate-800">
              海报与背景图命名规则 (cover & fanart basename_pattern)
            </label>
            <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
              自定义落盘生成的海报（竖版裁剪海报）与背景图（横版展开图）的文件名，无需输入 <code className="text-indigo-600 font-mono">.jpg</code> 扩展名。
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 1. 竖版海报命名规则 */}
            <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2.5 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-slate-700">
                  竖版裁剪海报 (cover.basename_pattern)
                </span>
                <VariablePillSelector
                  vars={COVER_BASENAME_VARS}
                  onInsert={insertCoverVar}
                />
              </div>

              {/* 输入框独占一行，保证有足够宽度 */}
              <input
                type="text"
                value={formConfig.summarizer.cover.basename_pattern ?? "poster"}
                onChange={(e) =>
                  updateForm((cfg) => {
                    cfg.summarizer.cover.basename_pattern = e.target.value;
                    return cfg;
                  })
                }
                placeholder="poster"
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* 快捷预设按钮独立成行，支持弹性换行 */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-slate-400 select-none">推荐预设:</span>
                <button
                  type="button"
                  onClick={() =>
                    updateForm((cfg) => {
                      cfg.summarizer.cover.basename_pattern = "poster";
                      return cfg;
                    })
                  }
                  className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                  title="Kodi/Emby 标准推荐 (固定 poster.jpg)"
                >
                  poster
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateForm((cfg) => {
                      cfg.summarizer.cover.basename_pattern = "{num}-poster";
                      return cfg;
                    })
                  }
                  className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                  title="番号关联海报 (如 IPX-177-poster.jpg)"
                >
                  {"{num}-poster"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateForm((cfg) => {
                      cfg.summarizer.cover.basename_pattern = "{filename}-poster";
                      return cfg;
                    })
                  }
                  className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                  title="跟随视频最终文件名关联海报 (如 IPX-177-poster.jpg)"
                >
                  {"{filename}-poster"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateForm((cfg) => {
                      cfg.summarizer.cover.basename_pattern = "{filename}";
                      return cfg;
                    })
                  }
                  className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                  title="与视频最终主文件完全同名 (如 IPX-177.jpg)"
                >
                  {"{filename} (同名)"}
                </button>
              </div>

              {/* 实时效果预览条 */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-white px-2.5 py-1.5 rounded border border-slate-200">
                <span className="font-semibold text-slate-700 shrink-0">海报落盘效果：</span>
                <code className="text-blue-700 font-mono font-bold truncate">
                  {(
                    (formConfig.summarizer.cover.basename_pattern?.includes("{") &&
                    formConfig.summarizer.cover.basename_pattern?.includes("}"))
                      ? (formatTemplate(
                          formConfig.summarizer.cover.basename_pattern,
                          { ...TEMPLATE_SAMPLE_MOVIE, filename: "IPX-177", basename: "IPX-177" }
                        ) || "poster")
                      : (formConfig.summarizer.cover.basename_pattern?.trim() || "poster")
                  ) + ".jpg"}
                </code>
              </div>
            </div>

            {/* 2. 横版背景图命名规则 */}
            <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-2.5 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-slate-700">
                  横版背景图 (fanart.basename_pattern)
                </span>
                <VariablePillSelector
                  vars={FANART_BASENAME_VARS}
                  onInsert={insertFanartVar}
                />
              </div>

              {/* 输入框独占一行，保证有足够宽度 */}
              <input
                type="text"
                value={formConfig.summarizer.fanart.basename_pattern ?? "fanart"}
                onChange={(e) =>
                  updateForm((cfg) => {
                    cfg.summarizer.fanart.basename_pattern = e.target.value;
                    return cfg;
                  })
                }
                placeholder="fanart"
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* 快捷预设按钮独立成行，支持弹性换行 */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-slate-400 select-none">推荐预设:</span>
                <button
                  type="button"
                  onClick={() =>
                    updateForm((cfg) => {
                      cfg.summarizer.fanart.basename_pattern = "fanart";
                      return cfg;
                    })
                  }
                  className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                  title="Kodi/Emby 标准推荐 (固定 fanart.jpg)"
                >
                  fanart
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateForm((cfg) => {
                      cfg.summarizer.fanart.basename_pattern = "{num}-fanart";
                      return cfg;
                    })
                  }
                  className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                  title="番号关联背景图 (如 IPX-177-fanart.jpg)"
                >
                  {"{num}-fanart"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateForm((cfg) => {
                      cfg.summarizer.fanart.basename_pattern = "{filename}-fanart";
                      return cfg;
                    })
                  }
                  className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                  title="跟随视频最终文件名关联背景图 (如 IPX-177-fanart.jpg)"
                >
                  {"{filename}-fanart"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateForm((cfg) => {
                      cfg.summarizer.fanart.basename_pattern = "{filename}-thumb";
                      return cfg;
                    })
                  }
                  className="px-2 py-1 text-[11px] bg-slate-100 text-slate-700 hover:bg-slate-200 rounded border border-slate-200 font-medium transition cursor-pointer select-none"
                  title="Jellyfin/Emby 缩略图规范 (如 IPX-177-thumb.jpg)"
                >
                  {"{filename}-thumb"}
                </button>
              </div>

              {/* 实时效果预览条 */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-white px-2.5 py-1.5 rounded border border-slate-200">
                <span className="font-semibold text-slate-700 shrink-0">背景图落盘效果：</span>
                <code className="text-indigo-700 font-mono font-bold truncate">
                  {(
                    (formConfig.summarizer.fanart.basename_pattern?.includes("{") &&
                    formConfig.summarizer.fanart.basename_pattern?.includes("}"))
                      ? (formatTemplate(
                          formConfig.summarizer.fanart.basename_pattern,
                          { ...TEMPLATE_SAMPLE_MOVIE, filename: "IPX-177", basename: "IPX-177" }
                        ) || "fanart")
                      : (formConfig.summarizer.fanart.basename_pattern?.trim() || "fanart")
                  ) + ".jpg"}
                </code>
              </div>
            </div>
          </div>
        </div>

        {/* 综合落盘文件结构动态模拟效果卡片 */}
        <DiskStructurePreview
          folderPattern={formConfig.summarizer.path.output_folder_pattern}
          basenamePattern={formConfig.summarizer.path.basename_pattern}
          baseDirectory={formConfig.scanner.input_directory}
          nfoBasenamePattern={formConfig.summarizer.nfo?.basename_pattern}
          coverBasenamePattern={formConfig.summarizer.cover?.basename_pattern}
          fanartBasenamePattern={formConfig.summarizer.fanart?.basename_pattern}
        />
      </div>

      {/* 路径保护与截断 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            路径最大安全长度 (length_maximum)
          </label>
          <input
            type="number"
            min="50"
            max="300"
            value={formConfig.summarizer.path.length_maximum}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.summarizer.path.length_maximum = parseInt(e.target.value, 10) || 250;
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[10px] text-slate-400 mt-1 leading-tight">
            防止 Windows 路径超过 260 字符限制而截短标题
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            最多展示女优数量 (max_actress_count)
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={formConfig.summarizer.path.max_actress_count}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.summarizer.path.max_actress_count = parseInt(e.target.value, 10) || 10;
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[10px] text-slate-400 mt-1 leading-tight">
            多女优作品在路径中最多保留的演员数量
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            剥离标题尾部女优名
          </label>
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={formConfig.summarizer.title.remove_trailing_actor_name}
              onChange={(e) =>
                updateForm((cfg) => {
                  cfg.summarizer.title.remove_trailing_actor_name = e.target.checked;
                  return cfg;
                })
              }
              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span className="text-xs text-slate-600 font-medium">自动清洗标题末尾</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 leading-tight">
            若标题末尾附带演员姓名则自动剔除，保持标题纯净
          </p>
        </div>
      </div>

      {/* 字幕文件归档设置 */}
      <div className="bg-slate-50/70 p-3.5 rounded-lg border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-700">自动归档同名字幕文件</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              归档时自动识别同目录下的同名字幕（.srt .vtt .ass .ssa .sbv .idx .sub 及语言后缀），一并归档并重命名
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-3">
            <input
              type="checkbox"
              data-testid="subtitle-enabled-toggle"
              checked={formConfig.summarizer.subtitle?.enabled ?? true}
              onChange={(e) =>
                updateForm((cfg) => {
                  if (!cfg.summarizer.subtitle) {
                    cfg.summarizer.subtitle = {
                      enabled: e.target.checked,
                      auto_c_suffix: false,
                      filename_extensions: [".srt", ".vtt", ".ass", ".ssa", ".sbv", ".idx", ".sub"],
                    };
                  } else {
                    cfg.summarizer.subtitle.enabled = e.target.checked;
                  }
                  return cfg;
                })
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* 仅在主开关开启时展示 auto_c_suffix */}
        {(formConfig.summarizer.subtitle?.enabled ?? true) && (
          <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-700">外挂字幕自动标记为中字 (-C)</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                检测到同名外挂字幕时，自动将影片标记为中文字幕并在番号及文件名后追加 -C，生成中字水印海报(如开启)
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="auto-c-suffix-checkbox"
              checked={formConfig.summarizer.subtitle?.auto_c_suffix ?? false}
              onChange={(e) =>
                updateForm((cfg) => {
                  if (!cfg.summarizer.subtitle) {
                    cfg.summarizer.subtitle = {
                      enabled: true,
                      auto_c_suffix: e.target.checked,
                      filename_extensions: [".srt", ".vtt", ".ass", ".ssa", ".sbv", ".idx", ".sub"],
                    };
                  } else {
                    cfg.summarizer.subtitle.auto_c_suffix = e.target.checked;
                  }
                  return cfg;
                })
              }
              className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer ml-3 shrink-0"
            />
          </div>
        )}
      </div>
    </div>
  );
};
