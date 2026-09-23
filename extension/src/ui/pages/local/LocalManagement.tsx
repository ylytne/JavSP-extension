import React, { useState } from "react";
import { FileText, FolderKanban, Crop } from "lucide-react";
import { LocalTabType } from "./types";
import { NfoCleanerTab } from "./tabs/NfoCleanerTab";
import { PosterRecropTab } from "./tabs/PosterRecropTab";

interface LocalManagementProps {
  wsState: "disconnected" | "connecting" | "connected";
  addLog?: (level: "info" | "warn" | "error" | "step", message: string) => void;
}

export const LocalManagement: React.FC<LocalManagementProps> = ({ wsState, addLog }) => {
  const [activeSubTab, setActiveSubTab] = useState<LocalTabType>("nfo_cleaner");

  const subTabs = [
    {
      id: "nfo_cleaner" as LocalTabType,
      name: "NFO 标签清理",
      icon: FileText,
      description: "清理 NFO 文件中的 trailer 视频流与 actor.thumb 外链头像",
    },
    {
      id: "poster_recrop" as LocalTabType,
      name: "海报批量重裁剪",
      icon: Crop,
      description: "扫描现有 fanart 展开图，按大厂标准比例优化居中重新裁剪 poster 海报",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 头部子选项卡导航 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <FolderKanban size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">本地文件管理</h1>
            <p className="text-xs text-slate-500">
              管理本地刮削产物、整理结构及批量文件清洗维护
            </p>
          </div>
        </div>

        {/* 子选项卡选择 */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-sm">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition font-medium cursor-pointer ${
                  isActive
                    ? "bg-white text-indigo-700 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon size={15} />
                {tab.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* 子 Tab 视图渲染 */}
      {activeSubTab === "nfo_cleaner" && (
        <NfoCleanerTab wsState={wsState} addLog={addLog} />
      )}
      {activeSubTab === "poster_recrop" && (
        <PosterRecropTab wsState={wsState} addLog={addLog} />
      )}
    </div>
  );
};
export default LocalManagement;
