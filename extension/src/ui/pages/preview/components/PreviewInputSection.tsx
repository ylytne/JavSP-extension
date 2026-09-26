import React from "react";
import {
  Play,
  StopCircle,
  Wifi,
  WifiOff,
  Globe,
  Sparkles,
  Camera,
  Layers,
  HelpCircle,
} from "lucide-react";
import { CrawlerRuntimeConfig } from "../../dashboard/types";
import { TranslatorConfig } from "../../../../translators";

export interface PreviewInputSectionProps {
  dvdid: string;
  onChangeDvdid: (val: string) => void;
  hardSub: boolean;
  onChangeHardSub: (val: boolean) => void;
  uncensored: boolean;
  onChangeUncensored: (val: boolean) => void;
  isLoading: boolean;
  onStartTest: () => void;
  onCancelTest?: () => void;
  wsConnected: boolean;
  crawlerConfig: CrawlerRuntimeConfig;
  translatorConfig: TranslatorConfig | null;
}

const SAMPLE_NUMS = ["IPX-177", "SSIS-001", "MIDV-047", "STAR-999", "FC2-1234567"];

export const PreviewInputSection: React.FC<PreviewInputSectionProps> = ({
  dvdid,
  onChangeDvdid,
  hardSub,
  onChangeHardSub,
  uncensored,
  onChangeUncensored,
  isLoading,
  onStartTest,
  onCancelTest,
  wsConnected,
  crawlerConfig,
  translatorConfig,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && !isLoading && wsConnected && dvdid.trim()) {
      onStartTest();
    }
  };

  const translatorEngineName = translatorConfig?.engine
    ? typeof translatorConfig.engine === "string"
      ? translatorConfig.engine
      : translatorConfig.engine.name.toUpperCase()
    : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>🧪 刮削流水线端到端测试</span>
            <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              内存级完全模拟 · 零本地文件变动
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            输入测试番号，在真实浏览器会话与当前配置下执行抓取、多源清洗与 NFO/海报生成，全方位检查抓取质量。
          </p>
        </div>

        {/* 环境徽标群 */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {/* 后端状态 */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-medium ${
              wsConnected
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-rose-50 text-rose-700 border-rose-200"
            }`}
            title={wsConnected ? "后端在线，可进行完整的 NFO 与角标合成预览" : "后端离线，无法进行模拟落盘计算"}
          >
            {wsConnected ? <Wifi size={13} className="text-emerald-600" /> : <WifiOff size={13} className="text-rose-500" />}
            <span>{wsConnected ? "后端在线 (全保真模拟)" : "后端离线"}</span>
          </div>

          {/* 爬虫站点 */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 text-slate-700 border border-slate-200">
            <Globe size={13} className="text-slate-500" />
            <span>数据源: {crawlerConfig.crawlers.join(", ").toUpperCase() || "未启用"}</span>
          </div>

          {/* 翻译引擎 */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 text-slate-700 border border-slate-200">
            <Sparkles size={13} className="text-amber-500" />
            <span>翻译: {translatorEngineName ? `${translatorEngineName} (${translatorConfig?.target_lang || "zh-CN"})` : "未启用"}</span>
          </div>

          {/* 剧照策略 */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 text-slate-700 border border-slate-200">
            <Camera size={13} className="text-indigo-500" />
            <span>
              剧照:{" "}
              {crawlerConfig.extraFanartsEnabled ? "测试抽样 1 张" : "已停用"}
            </span>
          </div>
        </div>
      </div>

      {/* 输入与控制行 */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 pt-1">
        {/* 番号输入框 */}
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={dvdid}
              onChange={(e) => onChangeDvdid(e.target.value.toUpperCase())}
              onBlur={() => onChangeDvdid(dvdid.trim())}
              onKeyDown={handleKeyDown}
              placeholder="请输入测试番号，如 IPX-177 或 SSIS-001..."
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase tracking-wider font-semibold placeholder:normal-case placeholder:font-normal placeholder:tracking-normal"
            />
          </div>

          {/* 快捷示例番号 */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 sm:py-0">
            <span className="text-[11px] text-slate-400 shrink-0">示例:</span>
            {SAMPLE_NUMS.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onChangeDvdid(num)}
                disabled={isLoading}
                className="text-[11px] px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-mono transition cursor-pointer shrink-0 disabled:opacity-50"
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* 属性模拟开关与操作按钮 */}
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          <div className="flex items-center gap-3 text-xs text-slate-700 border-r border-slate-200 pr-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hardSub}
                onChange={(e) => onChangeHardSub(e.target.checked)}
                disabled={isLoading}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium">模拟中字 (-C)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={uncensored}
                onChange={(e) => onChangeUncensored(e.target.checked)}
                disabled={isLoading}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="font-medium">模拟无码 (-U)</span>
            </label>
          </div>

          {isLoading ? (
            <button
              type="button"
              onClick={onCancelTest}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm cursor-pointer"
            >
              <StopCircle size={15} />
              <span>中断测试</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartTest}
              disabled={!wsConnected || !dvdid.trim()}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm cursor-pointer"
              title={!wsConnected ? "后端离线，请先确保后端 Python 服务正常启动" : "启动全链路测试刮削"}
            >
              <Play size={15} />
              <span>开始测试刮削</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
