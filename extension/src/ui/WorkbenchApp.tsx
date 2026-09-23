import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Settings as SettingsIcon,
  Wifi,
  WifiOff,
  Sparkles,
  Layers,
  HelpCircle,
} from "lucide-react";
import { Dashboard } from "./pages/Dashboard";
import { LocalManagement } from "./pages/local/LocalManagement";
import { Settings } from "./pages/Settings";
import { LogDrawer, LogEntry } from "./components/LogDrawer";
import { wsService } from "../services/backend-ws";
import { serverConfig } from "../services/serverConfig";
import { ServerConnectionModal } from "./components/ServerConnectionModal";

export const WorkbenchApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "local" | "settings">("dashboard");

  const [wsState, setWsState] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [serverAddress, setServerAddress] = useState<string>(serverConfig.getCurrentServerAddress());
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [
      ...prev.slice(-300), // 工作台保留更多日志
      { id: Math.random().toString(36).substring(2, 9), time, level, message },
    ]);
  }, []);

  useEffect(() => {
    serverConfig.getServerAddress().then((addr) => setServerAddress(addr));
    const unsubAddr = serverConfig.onServerAddressChange((addr) => setServerAddress(addr));

    const unsub = wsService.onStateChange((state: "disconnected" | "connecting" | "connected") => {
      setWsState(state);
      if (state === "connected") {
        addLog("info", `已成功建立与后端 ${serverConfig.getCurrentServerAddress()} 的通信通道`);
      } else if (state === "connecting") {
        addLog("info", `正在尝试连接后端服务网关 (${serverConfig.getCurrentServerAddress()})...`);
      } else {
        addLog("warn", "与后端服务网关连接断开，正在准备重连...");
      }
    });

    wsService.connect();

    return () => {
      unsub();
      unsubAddr();
      wsService.disconnect();
    };
  }, [addLog]);

  // 防误触关闭标签页
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue = "当前批量刮削或整理正在进行中，关闭标签页将中断任务，确定要离开吗？";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isProcessing]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900">
      {/* 顶部主导航栏（宽屏大工作台风格） */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center text-white font-black text-sm shadow-sm">
            J
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight flex items-center gap-2">
              JavSP 全功能工作台
              <span className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200/60 px-2 py-0.5 rounded-md font-semibold">
                Workbench Pro
              </span>
            </h1>
            <p className="text-[11px] text-slate-500">
              双端协同架构 · 真实环境智能抓取与无损本地媒体整理
            </p>
          </div>
        </div>

        {/* 状态与 Tab 切换 */}
        <div className="flex items-center gap-4">
          {/* 连接状态指示 (可点击快速配置) */}
          <button
            type="button"
            onClick={() => setIsServerModalOpen(true)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-medium transition cursor-pointer hover:opacity-85 shadow-2xs ${
              wsState === "connected"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : wsState === "connecting"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
            title="点击配置后端网关连接地址"
          >
            {wsState === "connected" ? (
              <>
                <Wifi size={14} className="text-emerald-600 animate-pulse" />
                <span className="font-mono">后端网关在线 ({serverAddress})</span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-rose-500" />
                <span>{wsState === "connecting" ? "正在连接服务..." : "服务离线 (点击配置地址)"}</span>
              </>
            )}
          </button>

          {/* 选项卡按钮组 */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-sm">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition font-medium cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-white text-indigo-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutDashboard size={15} />
              刮削管理
            </button>
            <button
              onClick={() => setActiveTab("local")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition font-medium cursor-pointer ${
                activeTab === "local"
                  ? "bg-white text-indigo-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FolderKanban size={15} />
              本地管理
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition font-medium cursor-pointer ${
                activeTab === "settings"
                  ? "bg-white text-indigo-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <SettingsIcon size={15} />
              系统设置
            </button>
          </div>
        </div>
      </header>

      {/* 主视图内容区域 */}
      <main className="flex-1 w-full max-w-[1920px] mx-auto px-4 md:px-6 py-5">
        {activeTab === "dashboard" && (
          <Dashboard
            wsState={wsState}
            addLog={addLog}
            onProcessingChange={setIsProcessing}
          />
        )}
        {activeTab === "local" && (
          <LocalManagement
            wsState={wsState}
            addLog={addLog}
          />
        )}
        {activeTab === "settings" && (
          <Settings wsState={wsState} />
        )}
      </main>


      {/* 底部折叠日志抽屉 */}
      <LogDrawer logs={logs} onClear={() => setLogs([])} />

      {/* 后端服务连接配置弹窗 */}
      <ServerConnectionModal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        onSaved={(newAddr) => {
          setServerAddress(newAddr);
          wsService.reconnect();
        }}
      />
    </div>
  );
};

export default WorkbenchApp;
