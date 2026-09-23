import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, LayoutDashboard, Settings as SettingsIcon, Wifi, WifiOff } from "lucide-react";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";
import { LogDrawer, LogEntry } from "./components/LogDrawer";
import { ServerConnectionModal } from "./components/ServerConnectionModal";
import { wsService } from "../services/backend-ws";
import { serverConfig } from "../services/serverConfig";

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings">("dashboard");
  const [wsState, setWsState] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [serverAddress, setServerAddress] = useState<string>(serverConfig.getCurrentServerAddress());
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((level: LogEntry["level"], message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [
      ...prev.slice(-200), // 保留最近 200 条
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

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 select-none">
      {/* 顶部主导航栏 */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-xs shadow-sm">
            J
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 leading-tight flex items-center gap-1.5">
              JavSP 扩展助手
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-semibold">
                MVP
              </span>
            </h1>
          </div>
        </div>

        {/* 状态与 Tab 切换 */}
        <div className="flex items-center gap-2">
          {/* 连接状态指示 (可点击快速配置) */}
          <button
            type="button"
            onClick={() => setIsServerModalOpen(true)}
            className={`flex items-center gap-1 text-[11px] px-2 py-0.8 rounded-full font-medium transition cursor-pointer hover:opacity-85 shadow-2xs ${
              wsState === "connected"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : wsState === "connecting"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
            title="点击配置后端连接地址"
          >
            {wsState === "connected" ? (
              <>
                <Wifi size={12} className="text-emerald-600" />
                <span>后端在线</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-rose-500" />
                <span>{wsState === "connecting" ? "连接中" : "后端离线 (点击配置)"}</span>
              </>
            )}
          </button>

          {/* 选项卡按钮 */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium ${
                activeTab === "dashboard"
                  ? "bg-white text-indigo-700 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <LayoutDashboard size={13} />
              主面板
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition font-medium ${
                activeTab === "settings"
                  ? "bg-white text-indigo-700 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <SettingsIcon size={13} />
              设置
            </button>
          </div>
        </div>
      </header>

      {/* 主视图内容区域 */}
      <main className="flex-1">
        {activeTab === "dashboard" ? (
          <Dashboard wsState={wsState} addLog={addLog} />
        ) : (
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

export default App;
