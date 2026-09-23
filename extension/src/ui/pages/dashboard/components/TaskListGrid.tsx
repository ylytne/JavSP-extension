import React from "react";
import { Film } from "lucide-react";
import { ScanMovieItem } from "../../../../crawlers/types";
import { TaskCard } from "../../../components/TaskCard";

export interface TaskListGridProps {
  totalTasksCount: number;
  filteredTasks: ScanMovieItem[];
  isScanning: boolean;
  onScrapeSingle: (item: ScanMovieItem) => void;
  onUpdateDvdid: (taskId: string, newDvdid: string) => void;
}

export const TaskListGrid: React.FC<TaskListGridProps> = ({
  totalTasksCount,
  filteredTasks,
  isScanning,
  onScrapeSingle,
  onUpdateDvdid,
}) => {
  return (
    <div>
      {totalTasksCount === 0 && !isScanning && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
          <Film size={44} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-700">暂无待整理任务</p>
          <p className="mt-1 text-slate-400">请在上方输入待整理文件夹路径并点击“扫描目录”开始</p>
        </div>
      )}

      {totalTasksCount > 0 && filteredTasks.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
          <p>该分类下暂无符合条件的影片任务</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {filteredTasks.map((item) => (
          <TaskCard
            key={item.taskId}
            item={item}
            onScrapeSingle={onScrapeSingle}
            onUpdateDvdid={onUpdateDvdid}
          />
        ))}
      </div>
    </div>
  );
};
