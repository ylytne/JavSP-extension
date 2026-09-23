import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { FullAppConfig } from "../types";

interface ScannerTabProps {
  formConfig: FullAppConfig;
  updateForm: (updater: (prev: FullAppConfig) => FullAppConfig) => void;
}

export const ScannerTab: React.FC<ScannerTabProps> = ({ formConfig, updateForm }) => {
  const [newExt, setNewExt] = useState("");

  const handleAddExtension = () => {
    if (!newExt.trim()) return;
    let ext = newExt.trim().toLowerCase();
    if (!ext.startsWith(".")) ext = `.${ext}`;
    if (!formConfig.scanner.filename_extensions.includes(ext)) {
      updateForm((cfg) => {
        cfg.scanner.filename_extensions.push(ext);
        return cfg;
      });
    }
    setNewExt("");
  };

  const handleRemoveExtension = (targetExt: string) => {
    updateForm((cfg) => {
      cfg.scanner.filename_extensions = cfg.scanner.filename_extensions.filter(
        (e) => e !== targetExt
      );
      return cfg;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          默认待整理视频文件夹路径 (input_directory)
        </label>
        <input
          type="text"
          value={formConfig.scanner.input_directory || ""}
          onChange={(e) =>
            updateForm((cfg) => {
              cfg.scanner.input_directory = e.target.value.trim() || null;
              return cfg;
            })
          }
          placeholder="例如: E:\Movies 或 /data/downloads (留空则在运行时手动指定)"
          className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-[11px] text-slate-400 mt-1">
          若指定该路径，启动扫描时将自动填充并默认遍历此目录。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            最小文件体积阈值 (minimum_size)
          </label>
          <input
            type="text"
            value={formConfig.scanner.minimum_size}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.scanner.minimum_size = e.target.value;
                return cfg;
              })
            }
            placeholder="例如: 232MiB, 100MB, 500M"
            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            过滤掉体积小于该阈值的花絮或广告样本（.strm 虚拟串流文件自动豁免）。
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            已整理目录防重复跳过 (skip_nfo_dir)
          </label>
          <div className="flex items-center gap-3 pt-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formConfig.scanner.skip_nfo_dir}
                onChange={(e) =>
                  updateForm((cfg) => {
                    cfg.scanner.skip_nfo_dir = e.target.checked;
                    return cfg;
                  })
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
            <span className="text-xs text-slate-600 font-medium">
              {formConfig.scanner.skip_nfo_dir ? "跳过含有 .nfo 文件的文件夹" : "强制重新扫描全部目录"}
            </span>
          </div>
        </div>
      </div>

      {/* 视作影片的文件扩展名 */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          视作影片的文件扩展名列表 ({formConfig.scanner.filename_extensions.length} 种)
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2 p-2 bg-slate-50 border border-slate-200 rounded-lg min-h-12 items-center">
          {formConfig.scanner.filename_extensions.map((ext) => (
            <span
              key={ext}
              className="inline-flex items-center gap-1 text-[11px] font-mono bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded shadow-2xs"
            >
              {ext}
              <button
                type="button"
                onClick={() => handleRemoveExtension(ext)}
                className="text-slate-400 hover:text-rose-500 cursor-pointer"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newExt}
            onChange={(e) => setNewExt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddExtension())}
            placeholder="输入格式后缀，如 .ts 或 mkv 后按回车添加"
            className="text-xs font-mono px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={handleAddExtension}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1 transition cursor-pointer"
          >
            <Plus size={13} />
            添加格式
          </button>
        </div>
      </div>

      {/* 忽略规则 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            扫描忽略的文件夹名称模式 (每行一个正则)
          </label>
          <textarea
            rows={4}
            value={formConfig.scanner.ignored_folder_name_pattern.join("\n")}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.scanner.ignored_folder_name_pattern = e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean);
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            识别番号前忽略的字符串模式 (每行一个正则)
          </label>
          <textarea
            rows={4}
            value={formConfig.scanner.ignored_id_pattern.join("\n")}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.scanner.ignored_id_pattern = e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean);
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  );
};
