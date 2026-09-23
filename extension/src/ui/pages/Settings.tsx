import React from "react";
import {
  AlertCircle,
  Folder,
  Globe,
  FolderArchive,
  Image as ImageIcon,
  Languages,
  Server,
  X,
  CheckCircle2,
} from "lucide-react";

import { FullAppConfig, SettingsProps, TabType } from "./settings/types";
import { useSettingsConfig } from "./settings/useSettingsConfig";
import { SettingsHeader } from "./settings/components/SettingsHeader";
import { SettingsActionBar } from "./settings/components/SettingsActionBar";
import { ResetConfirmModal } from "./settings/components/ResetConfirmModal";
import { YamlEditor } from "./settings/components/YamlEditor";
import { ScannerTab } from "./settings/tabs/ScannerTab";
import { NetworkTab } from "./settings/tabs/NetworkTab";
import { SummarizerTab } from "./settings/tabs/SummarizerTab";
import { MediaTab } from "./settings/tabs/MediaTab";
import { TranslatorTab } from "./settings/tabs/TranslatorTab";
import { ServerTab } from "./settings/tabs/ServerTab";

export type { FullAppConfig, SettingsProps, TabType };

export const Settings: React.FC<SettingsProps> = ({ wsState }) => {
  const {
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab,
    formConfig,
    rawYaml,
    setRawYaml,
    loading,
    saving,
    errorMessage,
    setErrorMessage,
    successToast,
    showResetConfirm,
    setShowResetConfirm,
    isDirty,
    isClientDirty,
    clientAddress,
    setClientAddress,
    clientToken,
    setClientToken,
    testingConnection,
    testResult,
    setTestResult,
    savingClientAddress,
    updateForm,
    fetchConfig,
    handleTestConnection,
    handleSaveClientAddress,
    handleSaveForm,
    handleSaveYaml,
    handleUndo,
    handleResetToDefault,
  } = useSettingsConfig(wsState);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4 pb-20">
      {/* 顶部主标题与模式切换 */}
      <SettingsHeader
        viewMode={viewMode}
        setViewMode={setViewMode}
        isDirty={isDirty}
        loading={loading}
        onRefresh={fetchConfig}
      />

      {/* 错误提示栏 */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-800 flex items-start gap-2.5 shadow-xs">
          <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 leading-relaxed">
            <div className="font-bold mb-0.5">配置校验或操作失败</div>
            <div>{errorMessage}</div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-700 p-0.5 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 成功 Toast */}
      {successToast && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 flex items-center gap-2 shadow-xs animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span className="font-semibold">{successToast}</span>
        </div>
      )}

      {/* 模式一：可视化表单视图 */}
      {viewMode === "form" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* 分组 Tab 导航栏 */}
          <div className="flex border-b border-slate-200 bg-slate-50/70 overflow-x-auto text-xs font-semibold">
            {[
              { key: "scanner", label: "扫描识别", icon: Folder },
              { key: "network", label: "抓取与网络", icon: Globe },
              { key: "summarizer", label: "归档与整理", icon: FolderArchive },
              { key: "media", label: "媒体与剧照", icon: ImageIcon },
              { key: "translator", label: "翻译引擎", icon: Languages },
              { key: "server", label: "服务网络", icon: Server },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as TabType)}
                  className={`flex items-center gap-1.5 px-4 py-3 border-b-2 whitespace-nowrap transition cursor-pointer ${
                    isActive
                      ? "border-indigo-600 text-indigo-700 bg-white font-bold"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60"
                  }`}
                >
                  <Icon size={14} className={isActive ? "text-indigo-600" : "text-slate-400"} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* 表单主体内容区 */}
          <div className="p-5 space-y-5">
            {!formConfig && activeTab !== "server" && (
              <div className="py-12 px-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">未能连接到后端服务</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                    当前未能从目标后端（{clientAddress}）拉取到业务配置。如果后端部署在局域网 NAS、软路由或 Docker 容器中，请切换至【服务网络】Tab 配置连接目标。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("server")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
                >
                  <Server size={14} />
                  前往配置后端连接地址
                </button>
              </div>
            )}

            {activeTab === "scanner" && formConfig && (
              <ScannerTab formConfig={formConfig} updateForm={updateForm} />
            )}

            {activeTab === "network" && formConfig && (
              <NetworkTab formConfig={formConfig} updateForm={updateForm} />
            )}

            {activeTab === "summarizer" && formConfig && (
              <SummarizerTab formConfig={formConfig} updateForm={updateForm} />
            )}

            {activeTab === "media" && formConfig && (
              <MediaTab formConfig={formConfig} updateForm={updateForm} />
            )}

            {activeTab === "translator" && formConfig && (
              <TranslatorTab formConfig={formConfig} updateForm={updateForm} />
            )}

            {activeTab === "server" && (
              <ServerTab
                formConfig={formConfig}
                updateForm={updateForm}
                clientAddress={clientAddress}
                setClientAddress={setClientAddress}
                clientToken={clientToken}
                setClientToken={setClientToken}
                isClientDirty={isClientDirty}
                testingConnection={testingConnection}
                testResult={testResult}
                setTestResult={setTestResult}
                savingClientAddress={savingClientAddress}
                onTestConnection={handleTestConnection}
                onSaveClientAddress={handleSaveClientAddress}
              />
            )}
          </div>
        </div>
      )}

      {/* 模式二：YAML 源码直接编辑 */}
      {viewMode === "yaml" && (
        <YamlEditor
          formConfig={formConfig}
          rawYaml={rawYaml}
          onChangeYaml={setRawYaml}
          onGoToServerTab={() => {
            setViewMode("form");
            setActiveTab("server");
          }}
        />
      )}

      {/* 底部悬浮/操作栏 */}
      {formConfig && (
        <SettingsActionBar
          saving={saving}
          isDirty={isDirty}
          onSave={viewMode === "form" ? handleSaveForm : handleSaveYaml}
          onUndo={handleUndo}
          onShowResetConfirm={() => setShowResetConfirm(true)}
        />
      )}

      {/* 恢复默认确认弹窗 */}
      <ResetConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetToDefault}
      />
    </div>
  );
};

export default Settings;
