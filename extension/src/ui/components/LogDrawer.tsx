import React, { useState, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown, Trash2, Terminal } from "lucide-react";

export interface LogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "error" | "step";
  message: string;
}

interface LogDrawerProps {
  logs: LogEntry[];
  onClear: () => void;
}

export const LogDrawer: React.FC<LogDrawerProps> = ({ logs, onClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const latestLog = logs[logs.length - 1];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-700 shadow-2xl transition-all">
      {/* 头部摘要与折叠切换 */}
      <div
        className="px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-800 text-slate-300 select-none text-xs"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 overflow-hidden mr-2">
          <Terminal size={14} className="text-indigo-400 shrink-0" />
          <span className="font-semibold text-slate-200 shrink-0">实时日志 ({logs.length})</span>
          {latestLog && !isOpen && (
            <span className="text-slate-400 truncate text-[11px]">
              [{latestLog.time}] {latestLog.message}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              title="清空日志"
              className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200"
            >
              <Trash2 size={13} />
            </button>
          )}
          {isOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </div>
      </div>

      {/* 展开内容 */}
      {isOpen && (
        <div
          ref={scrollRef}
          className="h-52 overflow-y-auto px-4 py-2 font-mono text-[11px] leading-relaxed space-y-1 bg-slate-950 text-slate-300"
        >
          {logs.length === 0 ? (
            <div className="text-slate-500 py-6 text-center italic">暂无日志记录</div>
          ) : (
            logs.map((log) => {
              let color = "text-slate-300";
              if (log.level === "error") color = "text-rose-400 font-medium";
              else if (log.level === "warn") color = "text-amber-400";
              else if (log.level === "step") color = "text-sky-400";

              return (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-slate-500 shrink-0">{log.time}</span>
                  <span className="shrink-0 uppercase font-semibold text-[10px] px-1 rounded bg-slate-800 text-slate-400">
                    {log.level}
                  </span>
                  <span className={`${color} break-all flex-1`}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
