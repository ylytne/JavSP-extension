import React from "react";
import {
  Wifi,
  Key,
  Loader2,
  Activity,
  Save,
  CheckCircle2,
  AlertCircle,
  Server,
  Info,
} from "lucide-react";
import { FullAppConfig, TestConnectionResult } from "../types";

interface ServerTabProps {
  formConfig: FullAppConfig | null;
  updateForm: (updater: (prev: FullAppConfig) => FullAppConfig) => void;
  clientAddress: string;
  setClientAddress: (val: string) => void;
  clientToken: string;
  setClientToken: (val: string) => void;
  isClientDirty: boolean;
  testingConnection: boolean;
  testResult: TestConnectionResult | null;
  setTestResult: (res: TestConnectionResult | null) => void;
  savingClientAddress: boolean;
  onTestConnection: () => void;
  onSaveClientAddress: () => void;
}

export const ServerTab: React.FC<ServerTabProps> = ({
  formConfig,
  updateForm,
  clientAddress,
  setClientAddress,
  clientToken,
  setClientToken,
  isClientDirty,
  testingConnection,
  testResult,
  setTestResult,
  savingClientAddress,
  onTestConnection,
  onSaveClientAddress,
}) => {
  return (
    <div className="space-y-5">
      {/* 卡片 A：浏览器扩展连接目标 (保存在 chrome.storage.local，绝不写入 config.yml) */}
      <div className="bg-slate-50/80 border border-indigo-200/80 rounded-xl p-4 space-y-3.5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
              <Wifi size={16} />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                浏览器扩展连接目标 (Client Target Address)
                <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-mono font-semibold">
                  chrome.storage.local
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                此项独立保存在当前浏览器本地，绝不会写入后端的{" "}
                <code className="font-mono bg-slate-200/60 px-1 py-0.5 rounded text-slate-700">
                  config.yml
                </code>
                。无论后端在本机还是局域网 NAS/软路由，均在此指定连接目标。
              </p>
            </div>
          </div>
          {isClientDirty && (
            <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold self-start sm:self-center shrink-0">
              ● 未保存的地址变更
            </span>
          )}
        </div>

        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                后端服务网关地址 (Host:Port)
              </label>
              <input
                type="text"
                value={clientAddress}
                onChange={(e) => {
                  setClientAddress(e.target.value);
                  setTestResult(null);
                }}
                placeholder="例如: 127.0.0.1:8765 或 192.168.1.100:8765"
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                <Key size={13} className="text-indigo-600" />
                安全访问令牌 API Token (可选)
              </label>
              <input
                type="password"
                value={clientToken}
                onChange={(e) => {
                  setClientToken(e.target.value);
                  setTestResult(null);
                }}
                placeholder="若远程/NAS后端启用了 Token 鉴权则必填"
                className="w-full text-xs font-mono px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-0.5">
            <button
              type="button"
              onClick={onTestConnection}
              disabled={testingConnection}
              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 disabled:opacity-50"
            >
              {testingConnection ? (
                <Loader2 size={13} className="animate-spin text-indigo-600" />
              ) : (
                <Activity size={13} className="text-indigo-600" />
              )}
              {testingConnection ? "探测中..." : "测试连接与密钥"}
            </button>
            <button
              type="button"
              onClick={onSaveClientAddress}
              disabled={savingClientAddress || !isClientDirty}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 disabled:opacity-40"
            >
              <Save size={13} />
              {savingClientAddress ? "正在切换..." : "保存并连接"}
            </button>
          </div>

          {/* 测试结果反馈栏 */}
          {testResult && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
                testResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {testResult.success ? (
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                )}
                <span className="font-medium">
                  {testResult.success
                    ? `连接正常！响应延迟: ${testResult.latency} ms，后端版本: ${testResult.version || "0.1.0"}${testResult.is_docker ? " (🐳 Docker 模式)" : ""}`
                    : `连接失败: ${testResult.error || "未知网络异常"}`}
                </span>
              </div>
              {testResult.success && (
                <span className="text-[10px] font-mono bg-emerald-100/80 text-emerald-700 px-2 py-0.5 rounded font-bold">
                  HTTP 200 OK
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 卡片 B：后端服务自身网络监听绑定 (来自 backend/config.yml) */}
      {formConfig ? (
        (() => {
          const isDocker = Boolean(formConfig.is_docker);
          return (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shrink-0 ${isDocker ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"}`}>
                  <Server size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    后端服务自身监听配置 (Server Process Host & Port)
                    {isDocker ? (
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-mono font-semibold flex items-center gap-1">
                        🐳 Docker 容器环境托管
                      </span>
                    ) : (
                      <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-mono font-semibold">
                        本地原生运行 (backend/config.yml)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isDocker
                      ? "当前服务运行于 Docker 容器中，容器内部进程已固定绑定至 0.0.0.0:8765。"
                      : "这是部署后端的服务器自身进程绑定的网卡与端口，本机运行保持 127.0.0.1 即可。"}
                  </p>
                </div>
              </div>

              {isDocker && (
                <div className="p-3 rounded-lg text-[11px] bg-blue-50 border border-blue-200 text-blue-900 flex items-start gap-2">
                  <Info size={15} className="text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Docker / NAS 部署模式运行中：</span>
                    后端已由容器环境锁定监听 <code className="font-mono bg-blue-100/70 px-1 py-0.5 rounded">0.0.0.0:8765</code>，内部 Host 与 Port 不可在此修改。若需调整宿主机对外访问端口，请在宿主机 <code className="font-mono bg-blue-100/70 px-1 py-0.5 rounded">docker-compose.yml</code> 或 <code className="font-mono bg-blue-100/70 px-1 py-0.5 rounded">.env</code> 中配置宿主机端口映射。
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>后端绑定 Host (宿主机网卡)</span>
                    {isDocker && (
                      <span className="text-[10px] text-slate-400 font-normal">锁定 (0.0.0.0)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    disabled={isDocker}
                    value={formConfig.server.host}
                    onChange={(e) =>
                      updateForm((cfg) => {
                        cfg.server.host = e.target.value.trim();
                        return cfg;
                      })
                    }
                    placeholder="127.0.0.1 (NAS/Docker部署填 0.0.0.0)"
                    className={`w-full text-xs font-mono px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDocker
                        ? "bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>服务端口 Port</span>
                    {isDocker && (
                      <span className="text-[10px] text-slate-400 font-normal">锁定 (8765)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    disabled={isDocker}
                    min="1024"
                    max="65535"
                    value={formConfig.server.port}
                    onChange={(e) =>
                      updateForm((cfg) => {
                        cfg.server.port = parseInt(e.target.value, 10) || 8765;
                        return cfg;
                      })
                    }
                    className={`w-full text-xs font-mono px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      isDocker
                        ? "bg-slate-100/80 border-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-slate-50 border-slate-200 text-slate-800"
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Key size={13} className="text-slate-600" />
                  后端安全访问令牌 (server.token)
                  <span className="text-[10px] text-indigo-600 font-normal ml-auto">支持在线热修改保存</span>
                </label>
                <input
                  type="text"
                  value={formConfig.server.token || ""}
                  onChange={(e) =>
                    updateForm((cfg) => {
                      cfg.server.token = e.target.value.trim();
                      return cfg;
                    })
                  }
                  placeholder="留空表示禁用鉴权；设置后将强制客户端校验 Token"
                  className="w-full text-xs font-mono px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  💡 安全建议：若后端部署于 NAS 或允许公网访问，强烈建议设置高强度密码 Token。保存后写入 config.yml。
                </p>
              </div>

              {!isDocker && (
                <p className="text-[11px] text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
                  ⚠️ 注意：本地源码运行模式下，修改服务端口或 Host 仅在下一次手动重启后端进程时生效；Token 与其他爬虫、过滤规则均可热生效。
                </p>
              )}
            </div>
          );
        })()
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 flex items-center gap-2.5">
          <Info size={16} className="text-slate-400 shrink-0" />
          <span>成功连接到目标后端后，可在此远程查看和调整后端进程自身的网卡与端口绑定 (backend/config.yml)。</span>
        </div>
      )}
    </div>
  );
};
