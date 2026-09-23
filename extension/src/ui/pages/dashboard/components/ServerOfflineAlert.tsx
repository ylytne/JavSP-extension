import React from "react";
import { AlertTriangle } from "lucide-react";

export interface ServerOfflineAlertProps {
  serverAddress: string;
  onOpenServerModal: () => void;
}

export const ServerOfflineAlert: React.FC<ServerOfflineAlertProps> = ({
  serverAddress,
  onOpenServerModal,
}) => {
  return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800 flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertTriangle size={18} className="text-rose-600 shrink-0" />
        <div>
          <span className="font-bold">未能连接到后端服务网关</span>
          <span className="text-rose-600 font-mono ml-1.5">({serverAddress})</span>
          <p className="text-[11px] text-rose-700 mt-0.5">
            若您的后端部署在局域网 NAS、软路由或 Docker 容器中，请配置对应主机的 IP 与端口。
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenServerModal}
        className="px-3.5 py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 font-bold rounded-lg shrink-0 cursor-pointer shadow-2xs transition"
      >
        修改连接配置
      </button>
    </div>
  );
};
