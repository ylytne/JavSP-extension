import React, { useState, useEffect } from "react";
import {
  X,
  Server,
  Key,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  HelpCircle,
  Laptop,
  HardDrive,
} from "lucide-react";
import { serverConfig, DEFAULT_SERVER_ADDRESS } from "../../services/serverConfig";

interface ServerConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (newAddress: string) => void;
}

export const ServerConnectionModal: React.FC<ServerConnectionModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [address, setAddress] = useState<string>(DEFAULT_SERVER_ADDRESS);
  const [token, setToken] = useState<string>("");
  const [initialAddress, setInitialAddress] = useState<string>(DEFAULT_SERVER_ADDRESS);
  const [initialToken, setInitialToken] = useState<string>("");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    latency: number;
    version?: string;
    error?: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      serverConfig.init().then(({ address: addr, token: tok }) => {
        setAddress(addr);
        setToken(tok);
        setInitialAddress(addr);
        setInitialToken(tok);
        setTestResult(null);
        setErrorMsg(null);
        setSaveSuccess(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isDirty = address.trim() !== initialAddress.trim() || token.trim() !== initialToken.trim();

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setErrorMsg(null);
    try {
      const res = await serverConfig.testConnection(address, token);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        latency: 0,
        error: err.message || "测试连接失败",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await serverConfig.setServerConfig(address, token);
      setInitialAddress(address);
      setInitialToken(token);
      setSaveSuccess(true);
      onSaved?.(address);
      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err: any) {
      setErrorMsg(err.message || "保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Server size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">
                后端服务连接配置
              </h3>
              <p className="text-[11px] text-slate-500">
                配置扩展连接的 JavSP 后端目标（支持本机或局域网 NAS）
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容主体 */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* 快捷模板填充 */}
          <div>
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <HelpCircle size={12} />
              快捷选择常用地址
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddress("127.0.0.1:8765");
                  setTestResult(null);
                }}
                className={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer flex items-center gap-2.5 ${
                  address.includes("127.0.0.1") || address.includes("localhost")
                    ? "bg-indigo-50/70 border-indigo-200 text-indigo-900"
                    : "bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="p-1.5 rounded-lg bg-white border border-slate-200 shrink-0">
                  <Laptop size={14} className="text-indigo-600" />
                </div>
                <div>
                  <div className="font-semibold text-[11px]">本机独立运行</div>
                  <div className="font-mono text-[10px] text-slate-500">127.0.0.1:8765</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  // 如果当前是 127.0.0.1 则提供一个示范模板
                  if (address.includes("127.0.0.1")) {
                    setAddress("192.168.1.100:8765");
                  }
                  setTestResult(null);
                }}
                className={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer flex items-center gap-2.5 ${
                  !address.includes("127.0.0.1") && !address.includes("localhost")
                    ? "bg-indigo-50/70 border-indigo-200 text-indigo-900"
                    : "bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <div className="p-1.5 rounded-lg bg-white border border-slate-200 shrink-0">
                  <HardDrive size={14} className="text-indigo-600" />
                </div>
                <div>
                  <div className="font-semibold text-[11px]">局域网 NAS / 软路由</div>
                  <div className="font-mono text-[10px] text-slate-500">192.168.x.x:8765</div>
                </div>
              </button>
            </div>
          </div>

          {/* 表单输入区 */}
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                后端服务网关地址 (IP:Port 或 URL)
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setTestResult(null);
                }}
                placeholder="例如: 192.168.1.100:8765 或 http://nas.local:8765"
                className="w-full text-xs font-mono px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                若在 NAS / Docker 部署，请确保后端 <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">config.yml</code> 中 <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">server.host: 0.0.0.0</code> 并放行对应端口。
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key size={13} className="text-indigo-600" />
                  API 访问令牌 Token (可选)
                </span>
                <span className="text-[10px] text-slate-400 font-normal">
                  未开启鉴权可留空
                </span>
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  setTestResult(null);
                }}
                placeholder="若在后端的 config.yml 中配置了 server.token 则必填"
                className="w-full text-xs font-mono px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div
              className={`p-3 rounded-xl text-xs border transition animate-in fade-in flex items-start gap-2.5 ${
                testResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold">
                  {testResult.success ? "连接测试成功！" : "无法连接到该地址"}
                </div>
                <div className="text-[11px] mt-0.5 leading-relaxed break-all">
                  {testResult.success
                    ? `响应延迟: ${testResult.latency} ms · 服务端版本: ${testResult.version || "0.1.0"}`
                    : testResult.error}
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl text-xs bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* 底部操作按钮 */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !address.trim()}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            {testing ? (
              <Loader2 size={13} className="animate-spin text-indigo-600" />
            ) : (
              <Activity size={13} className="text-indigo-600" />
            )}
            <span>{testing ? "探测中..." : "测试连通性"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !address.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : saveSuccess ? (
                <CheckCircle2 size={13} />
              ) : (
                <Save size={13} />
              )}
              <span>{saving ? "正在连接..." : saveSuccess ? "已连接" : "保存并连接"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
