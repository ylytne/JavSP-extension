import React from "react";
import { ServerConnectionModal } from "../components/ServerConnectionModal";
import { wsService } from "../../services/backend-ws";
import { DashboardProps } from "./dashboard/types";
import { useDashboardConfig } from "./dashboard/hooks/useDashboardConfig";
import { useDashboardTasks } from "./dashboard/hooks/useDashboardTasks";
import { ServerOfflineAlert } from "./dashboard/components/ServerOfflineAlert";
import { ScanSection } from "./dashboard/components/ScanSection";
import { CrawlerStatusNotice } from "./dashboard/components/CrawlerStatusNotice";
import { BatchActionToolbar } from "./dashboard/components/BatchActionToolbar";
import { TaskListGrid } from "./dashboard/components/TaskListGrid";

export type { DashboardProps };

export const Dashboard: React.FC<DashboardProps> = ({
  wsState,
  addLog,
  onProcessingChange,
}) => {
  const {
    serverAddress,
    setServerAddress,
    isServerModalOpen,
    setIsServerModalOpen,
    scanDir,
    setScanDir,
    crawlerConfig,
    translatorConfig,
  } = useDashboardConfig(addLog);

  const {
    tasks,
    isScanning,
    scanProgress,
    isBatchRunning,
    statusFilter,
    setStatusFilter,
    counts,
    filteredTasks,
    handleStartScan,
    handleScrapeSingle,
    handleUpdateDvdid,
    handleBatchStart,
    handleBatchStop,
  } = useDashboardTasks({
    scanDir,
    crawlerConfig,
    translatorConfig,
    addLog,
    onProcessingChange,
  });

  return (
    <div className="space-y-4 w-full pb-24">
      {/* 离线排查与连接引导栏 */}
      {wsState !== "connected" && (
        <ServerOfflineAlert
          serverAddress={serverAddress}
          onOpenServerModal={() => setIsServerModalOpen(true)}
        />
      )}

      {/* 路径输入与扫描操作区 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <ScanSection
          scanDir={scanDir}
          onChangeScanDir={setScanDir}
          onStartScan={handleStartScan}
          isScanning={isScanning}
          wsConnected={wsState === "connected"}
          scanProgress={scanProgress}
        />
        <CrawlerStatusNotice crawlers={crawlerConfig.crawlers} />
      </div>

      {/* 批次任务统计与批量操作工具栏 */}
      {tasks.length > 0 && (
        <BatchActionToolbar
          totalCount={tasks.length}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          countPending={counts.pending}
          countCompleted={counts.completed}
          countError={counts.error}
          isBatchRunning={isBatchRunning}
          onBatchStart={handleBatchStart}
          onBatchStop={handleBatchStop}
        />
      )}

      {/* 任务卡片网格列表（响应式自适应） */}
      <TaskListGrid
        totalTasksCount={tasks.length}
        filteredTasks={filteredTasks}
        isScanning={isScanning}
        onScrapeSingle={handleScrapeSingle}
        onUpdateDvdid={handleUpdateDvdid}
      />

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
