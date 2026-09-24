import React from "react";
import { FullAppConfig } from "../types";

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

  return (
    <div className="space-y-5">
      {/* 整理模式卡片 */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          文件整理模式
        </label>
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

      {/* 输出路径模板 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-slate-700">
            整理后输出文件夹路径模板 (output_folder_pattern)
          </label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400">点击插入变量:</span>
            {["{actress}", "{num}", "{title}", "{publisher}"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertTemplateVar("output_folder_pattern", v)}
                className="px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-[10px] font-mono rounded text-slate-600 border border-slate-200 cursor-pointer"
              >
                {v}
              </button>
            ))}
          </div>
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
          className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* 主文件名模板 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-bold text-slate-700">
            主文件名前缀模板 (basename_pattern)
          </label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400">点击插入变量:</span>
            {["{num}", "{title}"].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertTemplateVar("basename_pattern", v)}
                className="px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-[10px] font-mono rounded text-slate-600 border border-slate-200 cursor-pointer"
              >
                {v}
              </button>
            ))}
          </div>
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
          className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-600 font-medium">自动清洗标题末尾</span>
          </div>
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
                检测到同名外挂字幕时，自动将影片标记为中文字幕并在番号及文件名后追加 -C，生成中字水印海报
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
