import { useState, useEffect, useCallback } from "react";
import { FullAppConfig, TabType, TestConnectionResult } from "./types";
import { serverConfig, DEFAULT_SERVER_ADDRESS } from "../../../services/serverConfig";

export function useSettingsConfig(wsState: "disconnected" | "connecting" | "connected") {
  // 模式：表单可视化模式 vs YAML 源码模式
  const [viewMode, setViewMode] = useState<"form" | "yaml">("form");
  const [activeTab, setActiveTab] = useState<TabType>("scanner");

  // 配置状态
  const [savedConfig, setSavedConfig] = useState<FullAppConfig | null>(null);
  const [formConfig, setFormConfig] = useState<FullAppConfig | null>(null);
  const [rawYaml, setRawYaml] = useState<string>("");
  const [savedRawYaml, setSavedRawYaml] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // 客户端连接配置状态 (保存在 chrome.storage.local，绝不写入 config.yml)
  const [clientAddress, setClientAddress] = useState<string>(DEFAULT_SERVER_ADDRESS);
  const [savedClientAddress, setSavedClientAddress] = useState<string>(DEFAULT_SERVER_ADDRESS);
  const [clientToken, setClientToken] = useState<string>("");
  const [savedClientToken, setSavedClientToken] = useState<string>("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [savingClientAddress, setSavingClientAddress] = useState(false);

  // 判断是否有未保存的改动 (Dirty State)
  const isFormDirty =
    formConfig && savedConfig
      ? JSON.stringify(formConfig) !== JSON.stringify(savedConfig)
      : false;
  const isYamlDirty = rawYaml !== savedRawYaml;
  const isDirty = viewMode === "form" ? isFormDirty : isYamlDirty;

  const isClientDirty =
    clientAddress.trim() !== savedClientAddress.trim() ||
    clientToken.trim() !== savedClientToken.trim();

  // 成功 Toast 自动消失
  useEffect(() => {
    if (successToast) {
      const t = setTimeout(() => setSuccessToast(null), 3500);
      return () => clearTimeout(t);
    }
  }, [successToast]);

  // 初始化从本地 storage 读取连接地址与 Token
  useEffect(() => {
    serverConfig.init().then(({ address, token }) => {
      setClientAddress(address);
      setSavedClientAddress(address);
      setClientToken(token);
      setSavedClientToken(token);
    });
  }, []);

  // 辅助函数：更新嵌套状态
  const updateForm = useCallback((updater: (prev: FullAppConfig) => FullAppConfig) => {
    setFormConfig((prev) => (prev ? updater(JSON.parse(JSON.stringify(prev))) : prev));
  }, []);

  // 从后端拉取配置
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const authHeaders = serverConfig.getAuthHeaders();
      // 1. 获取结构化配置
      const resp = await fetch(`${baseUrl}/api/config`, { headers: authHeaders });
      if (!resp.ok) {
        if (resp.status === 401) {
          throw new Error("HTTP 401 Unauthorized: 目标后端已开启安全鉴权，请在下方配置正确的 API Token 并点击【保存并连接】");
        }
        throw new Error(`HTTP ${resp.status}`);
      }
      const data: FullAppConfig = await resp.json();

      setSavedConfig(JSON.parse(JSON.stringify(data)));
      setFormConfig(JSON.parse(JSON.stringify(data)));

      // 2. 获取原始 YAML 文本
      const rawResp = await fetch(`${baseUrl}/api/config/raw`, { headers: authHeaders });
      if (rawResp.ok) {
        const rawData = await rawResp.json();
        setRawYaml(rawData.yaml || "");
        setSavedRawYaml(rawData.yaml || "");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "无法拉取目标后端配置，请检查服务地址与网络状态");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [wsState, fetchConfig]);

  // 当后端离线或未获取到配置时，自动引导至服务网络 Tab 以便用户配置目标地址
  useEffect(() => {
    if (!formConfig && !loading) {
      setActiveTab("server");
    }
  }, [formConfig, loading]);

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await serverConfig.testConnection(clientAddress, clientToken);
      setTestResult(res);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveClientAddress = async () => {
    setSavingClientAddress(true);
    setErrorMessage(null);
    try {
      await serverConfig.setServerConfig(clientAddress, clientToken);
      setSavedClientAddress(clientAddress);
      setSavedClientToken(clientToken);
      setSuccessToast(`扩展连接目标已更新为 ${clientAddress}，正在重新拉取最新服务配置...`);
      await fetchConfig();
    } catch (err: any) {
      setErrorMessage(err.message || "保存客户端连接配置失败");
    } finally {
      setSavingClientAddress(false);
    }
  };

  // 保存可视化表单配置
  const handleSaveForm = async () => {
    if (!formConfig) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const authHeaders = serverConfig.getAuthHeaders();
      const resp = await fetch(`${baseUrl}/api/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify(formConfig),
      });

      const resData = await resp.json();
      if (!resp.ok) {
        throw new Error(resData.detail || "保存配置失败，请检查输入格式");
      }

      setSavedConfig(JSON.parse(JSON.stringify(resData.config)));
      setFormConfig(JSON.parse(JSON.stringify(resData.config)));

      // 刷新 raw yaml 状态
      const rawResp = await fetch(`${baseUrl}/api/config/raw`, { headers: authHeaders });
      if (rawResp.ok) {
        const rawData = await rawResp.json();
        setRawYaml(rawData.yaml || "");
        setSavedRawYaml(rawData.yaml || "");
      }

      setSuccessToast("配置已成功更新并热生效！");
    } catch (err: any) {
      setErrorMessage(err.message || "保存配置出错");
    } finally {
      setSaving(false);
    }
  };

  // 保存原始 YAML 文本配置
  const handleSaveYaml = async () => {
    setSaving(true);
    setErrorMessage(null);
    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const authHeaders = serverConfig.getAuthHeaders();
      const resp = await fetch(`${baseUrl}/api/config/raw`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ yaml: rawYaml }),
      });

      const resData = await resp.json();
      if (!resp.ok) {
        throw new Error(resData.detail || "YAML 语法校验未通过");
      }

      setSavedRawYaml(rawYaml);
      if (resData.config) {
        setSavedConfig(JSON.parse(JSON.stringify(resData.config)));
        setFormConfig(JSON.parse(JSON.stringify(resData.config)));
      }
      setSuccessToast("YAML 源码验证通过并已持久化保存！");
    } catch (err: any) {
      setErrorMessage(err.message || "保存 YAML 配置失败");
    } finally {
      setSaving(false);
    }
  };

  // 放弃改动并撤销
  const handleUndo = () => {
    if (viewMode === "form") {
      if (savedConfig) {
        setFormConfig(JSON.parse(JSON.stringify(savedConfig)));
      }
    } else {
      setRawYaml(savedRawYaml);
    }
    setErrorMessage(null);
  };

  // 恢复系统默认
  const handleResetToDefault = async () => {
    setShowResetConfirm(false);
    setSaving(true);
    setErrorMessage(null);
    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const authHeaders = serverConfig.getAuthHeaders();
      const resp = await fetch(`${baseUrl}/api/config/reset`, {
        method: "POST",
        headers: authHeaders,
      });
      const resData = await resp.json();
      if (!resp.ok) {
        throw new Error(resData.detail || "恢复默认配置失败");
      }
      setSavedConfig(JSON.parse(JSON.stringify(resData.config)));
      setFormConfig(JSON.parse(JSON.stringify(resData.config)));

      // 刷新 raw yaml
      const rawResp = await fetch(`${baseUrl}/api/config/raw`, { headers: authHeaders });
      if (rawResp.ok) {
        const rawData = await rawResp.json();
        setRawYaml(rawData.yaml || "");
        setSavedRawYaml(rawData.yaml || "");
      }
      setSuccessToast("已成功重置为系统默认配置！");
    } catch (err: any) {
      setErrorMessage(err.message || "恢复默认配置出错");
    } finally {
      setSaving(false);
    }
  };

  return {
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
  };
}
