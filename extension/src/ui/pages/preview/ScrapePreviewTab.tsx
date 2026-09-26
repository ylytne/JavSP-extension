import React, { useState, useRef } from "react";
import {
  FolderTree,
  Globe,
  Loader2,
  AlertCircle,
  FlaskConical,
  Sparkles,
} from "lucide-react";
import { LogEntry } from "../../components/LogDrawer";
import { ServerConnectionModal } from "../../components/ServerConnectionModal";
import { ServerOfflineAlert } from "../dashboard/components/ServerOfflineAlert";
import { useDashboardConfig } from "../dashboard/hooks/useDashboardConfig";
import { PreviewInputSection } from "./components/PreviewInputSection";
import { SimulatedLandingView } from "./components/SimulatedLandingView";
import { SourceSitesDetailView } from "./components/SourceSitesDetailView";
import { executeScrapePreview } from "./services/scraperPreviewService";
import { ScrapePreviewReport } from "./types";

export interface ScrapePreviewTabProps {
  wsState: "disconnected" | "connecting" | "connected";
  addLog: (level: LogEntry["level"], message: string) => void;
}

export const ScrapePreviewTab: React.FC<ScrapePreviewTabProps> = ({ wsState, addLog }) => {
  const {
    scanDir,
    serverAddress,
    setServerAddress,
    isServerModalOpen,
    setIsServerModalOpen,
    crawlerConfig,
    translatorConfig,
  } = useDashboardConfig(addLog);

  const [dvdid, setDvdid] = useState<string>("IPX-177");
  const [hardSub, setHardSub] = useState<boolean>(false);
  const [uncensored, setUncensored] = useState<boolean>(false);

  const [activeSubView, setActiveSubView] = useState<"landing" | "sources">("landing");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [report, setReport] = useState<ScrapePreviewReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStartTest = async () => {
    if (!dvdid.trim()) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const res = await executeScrapePreview(
        {
          dvdid: dvdid.trim(),
          hardSub,
          uncensored,
          baseOutputDir: scanDir || undefined,
        },
        crawlerConfig,
        translatorConfig,
        addLog,
        controller.signal
      );
      setReport(res);
    } catch (err: any) {
      if (err.name === "AbortError") {
        addLog("warn", `[${dvdid}] 用户手动中止了测试流水线`);
      } else {
        const msg = err.message || String(err);
        setError(msg);
        addLog("error", `[${dvdid}] 刮削测试发生异常: ${msg}`);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelTest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-5 w-full pb-24">
      {/* 后端离线排查横幅 */}
      {wsState !== "connected" && (
        <ServerOfflineAlert
          serverAddress={serverAddress}
          onOpenServerModal={() => setIsServerModalOpen(true)}
        />
      )}

      {/* 控制与输入面板 */}
      <PreviewInputSection
        dvdid={dvdid}
        onChangeDvdid={setDvdid}
        hardSub={hardSub}
        onChangeHardSub={setHardSub}
        uncensored={uncensored}
        onChangeUncensored={setUncensored}
        isLoading={isLoading}
        onStartTest={handleStartTest}
        onCancelTest={handleCancelTest}
        wsConnected={wsState === "connected"}
        crawlerConfig={crawlerConfig}
        translatorConfig={translatorConfig}
      />

      {/* 错误提示横幅 */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs text-rose-800 flex items-start gap-2.5 shadow-xs">
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold">刮削测试未通过</span>
            <p className="text-rose-700 leading-relaxed">{error}</p>
          </div>
        </div>
      )}

      {/* 进行中骨架屏 */}
      {isLoading && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm text-center space-y-4">
          <div className="flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="text-indigo-600 animate-spin" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-800">
                正在执行端到端刮削测试流水线...
              </h3>
              <p className="text-xs text-slate-500">
                正在并行请求目标站点、清洗合并元数据、下载测试图片，并由后端纯内存模拟生成 NFO 与海报
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 结果主展区 */}
      {!isLoading && report && (
        <div className="space-y-4">
          {/* 子视图切换导航 */}
          <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveSubView("landing")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition cursor-pointer ${
                  activeSubView === "landing"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FolderTree size={14} />
                <span>模拟落盘结果 ({report.dvdid})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubView("sources")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition cursor-pointer ${
                  activeSubView === "sources"
                    ? "bg-white text-indigo-700 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Globe size={14} />
                <span>各站点抓取明细 ({Object.keys(report.siteResults).length})</span>
              </button>
            </div>

            <div className="text-xs text-slate-400 font-mono hidden sm:block">
              测试耗时: {report.durationMs}ms
            </div>
          </div>

          {/* 子视图内容切换 */}
          {activeSubView === "landing" ? (
            <SimulatedLandingView report={report} />
          ) : (
            <SourceSitesDetailView report={report} />
          )}
        </div>
      )}

      {/* 初始空状态引导 */}
      {!isLoading && !report && !error && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
            <FlaskConical size={24} />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-sm font-bold text-slate-800">
              准备好开始刮削测试了吗？
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              输入任意番号点击【开始测试刮削】，即可在不破坏、不移动任何本地文件的前提下，完整预览各站点抓取明细与模拟落盘目录、NFO 节点及角标海报。
            </p>
          </div>
        </div>
      )}

      {/* 后端配置弹窗 */}
      <ServerConnectionModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onSaved={(newAddr) => {
          setServerAddress(newAddr);
        }}
      />
    </div>
  );
};
