import React from "react";
import {
  X,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Globe,
} from "lucide-react";
import { SiteReadinessItem } from "../../../../crawlers/tabBridge";
import { sanitizeHttpUrl } from "../../../../utils/security";

export interface SiteReadinessModalProps {
  isOpen: boolean;
  sites: SiteReadinessItem[];
  onConfirm: () => Promise<void> | void;
  onReopen: () => Promise<void> | void;
  onClose: () => void;
  isRechecking?: boolean;
  recheckError?: string | null;
}

export const SiteReadinessModal: React.FC<SiteReadinessModalProps> = ({
  isOpen,
  sites,
  onConfirm,
  onReopen,
  onClose,
  isRechecking = false,
  recheckError = null,
}) => {
  if (!isOpen) return null;

  const getReasonBadge = (reason: SiteReadinessItem["reason"]) => {
    switch (reason) {
      case "missing":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            未打开页面
          </span>
        );
      case "cf_challenge":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldAlert className="w-3 h-3 text-rose-500" />
            存在 Cloudflare 人机验证
          </span>
        );
      case "discarded":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <RefreshCw className="w-3 h-3 text-slate-500" />
            页面已冻结休眠
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-linear-to-r from-indigo-50/50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/10 flex items-center justify-center text-indigo-600 font-bold">
              🚀
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                刮削站点环境就绪确认
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                TabBridge 同源通道需在浏览器保留对应站点的合法页面
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRechecking}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <p className="font-medium text-slate-800 mb-1">
              已为你自动在浏览器中打开/探测所需站点页面：
            </p>
            <p className="text-slate-500">
              请确认页面已正常加载（若遇到 Cloudflare
              验证码请在对应标签页点击通过）。确认无误后点击下方按钮即可全速刮削。
            </p>
          </div>

          {/* Sites List */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-slate-700 px-0.5">
              待就绪站点 ({sites.length}):
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-xs font-bold text-slate-800">
                        {site.name}
                      </span>
                      {(() => {
                        const safeUrl = sanitizeHttpUrl(site.url);
                        return safeUrl ? (
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 font-mono truncate"
                          >
                            {safeUrl}
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono truncate">
                            {site.url}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="shrink-0">{getReasonBadge(site.reason)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Recheck Error Alert */}
          {recheckError && (
            <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 animate-in fade-in duration-200">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">{recheckError}</div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-t border-slate-100 gap-3">
          <button
            type="button"
            onClick={onReopen}
            disabled={isRechecking}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            重新打开未就绪标签页
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isRechecking}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/50 transition-colors disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isRechecking}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-xs hover:shadow flex items-center gap-1.5 disabled:opacity-50"
            >
              {isRechecking ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  正在复检环境...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  已在浏览器完成过盾，立即开始
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
