import React from "react";
import { FileCode, Server } from "lucide-react";
import { FullAppConfig } from "../types";

interface YamlEditorProps {
  formConfig: FullAppConfig | null;
  rawYaml: string;
  onChangeYaml: (val: string) => void;
  onGoToServerTab: () => void;
}

export const YamlEditor: React.FC<YamlEditorProps> = ({
  formConfig,
  rawYaml,
  onChangeYaml,
  onGoToServerTab,
}) => {
  if (formConfig) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode size={16} className="text-indigo-600" />
            <span className="text-xs font-bold text-slate-800">
              config.yml 原始纯文本源码
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            支持直接粘贴修改，非技术用户不要乱改。
          </span>
        </div>

        <textarea
          rows={22}
          value={rawYaml}
          onChange={(e) => onChangeYaml(e.target.value)}
          spellCheck={false}
          className="w-full text-xs font-mono leading-relaxed p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-12 text-center space-y-3">
      <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto">
        <FileCode size={24} />
      </div>
      <div>
        <h4 className="text-sm font-bold text-slate-800">无法读取 config.yml 源码</h4>
        <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
          后端服务当前处于离线状态。请先在【服务网络】Tab 中配置正确的 NAS 或远程服务网关地址并保存连接。
        </p>
      </div>
      <button
        type="button"
        onClick={onGoToServerTab}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
      >
        <Server size={14} />
        前往配置后端连接地址
      </button>
    </div>
  );
};
