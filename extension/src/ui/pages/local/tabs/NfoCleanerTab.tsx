import React, { useState, useMemo, useEffect } from "react";
import {
  FileText,
  Play,
  Eye,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  FolderInput,
  ShieldCheck,
  Film,
  User,
  Filter,
  Columns2,
  Search,
  Plus,
  Trash2,
  Image,
  FileCode,
  Tag,
  Type,
  Check,
  HelpCircle,
} from "lucide-react";
import { serverConfig } from "../../../../services/serverConfig";
import {
  CleanNfoResponse,
  CleanNfoFileResultItem,
  PreviewNfoResponse,
  RewriteRule,
} from "../types";
import { NfoDiffModal } from "../components/NfoDiffModal";

interface NfoCleanerTabProps {
  wsState: "disconnected" | "connecting" | "connected";
  addLog?: (level: "info" | "warn" | "error" | "step", message: string) => void;
}

const DEFAULT_PRESET_RULES: RewriteRule[] = [
  {
    id: "preset_art",
    name: "清理 Jellyfin 绝对路径海报 <art>",
    rule_type: "remove_node",
    target: "<art></art>",
    replacement: "",
    enabled: true,
  },
  {
    id: "preset_trailer",
    name: "清理预告片 <trailer>",
    rule_type: "remove_node",
    target: "<trailer></trailer>",
    replacement: "",
    enabled: true,
  },
  {
    id: "preset_actor_thumb",
    name: "清理演员外链头像 <actor><thumb>",
    rule_type: "remove_node",
    target: "<actor><thumb></thumb></actor>",
    replacement: "",
    enabled: true,
  },
  {
    id: "preset_fileinfo",
    name: "清理 Jellyfin 流媒体探测参数 <fileinfo>",
    rule_type: "remove_node",
    target: "<fileinfo></fileinfo>",
    replacement: "",
    enabled: false,
  },
  {
    id: "preset_numid",
    name: "还原 Jellyfin 番号 (<numid> → <uniqueid>)",
    rule_type: "replace_node",
    target: "<numid>",
    replacement: '<uniqueid type="num" default="true">',
    enabled: false,
  },
  {
    id: "preset_lockdata",
    name: "清理 Jellyfin 锁定标记 <lockdata>",
    rule_type: "remove_node",
    target: "<lockdata></lockdata>",
    replacement: "",
    enabled: false,
  },
  {
    id: "preset_actor_type",
    name: "补充演员类型 (<actor><type>Actor</type>)",
    rule_type: "append_node",
    target: "<actor></actor>",
    replacement: "<type>Actor</type>",
    enabled: false,
  },
];

const CUSTOM_RULES_STORAGE_KEY = "javsp_nfo_custom_rules";

export const NfoCleanerTab: React.FC<NfoCleanerTabProps> = ({ wsState, addLog }) => {
  const [directory, setDirectory] = useState("");
  const [recursive, setRecursive] = useState(true);
  const [backup, setBackup] = useState(true);

  // 规则池状态（预设 + 自定义）
  const [presetRules, setPresetRules] = useState<RewriteRule[]>(DEFAULT_PRESET_RULES);
  const [customRules, setCustomRules] = useState<RewriteRule[]>(() => {
    try {
      const saved = localStorage.getItem(CUSTOM_RULES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 添加自定义规则表单状态
  const [showAddRuleForm, setShowAddRuleForm] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRuleType, setNewRuleType] = useState<"remove_node" | "replace_node" | "replace_text" | "append_node">("remove_node");
  const [newRuleTarget, setNewRuleTarget] = useState("");
  const [newRuleReplacement, setNewRuleReplacement] = useState("");
  const [newRuleScope, setNewRuleScope] = useState("");

  // 运行与状态
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fetchingDefaultDir, setFetchingDefaultDir] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CleanNfoResponse | null>(null);
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // 列表过滤
  const [filterMode, setFilterMode] = useState<"all" | "changed" | "error">("changed");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [displayLimit, setDisplayLimit] = useState(100);

  // 对比差异弹窗
  const [selectedFileForDiff, setSelectedFileForDiff] = useState<string | null>(null);
  const [diffCache, setDiffCache] = useState<Record<string, PreviewNfoResponse>>({});

  // 持久化自定义规则
  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_RULES_STORAGE_KEY, JSON.stringify(customRules));
    } catch {
      // 忽略存储异常
    }
  }, [customRules]);

  // 合并所有启用的规则
  const allActiveRules = useMemo(() => {
    return [...presetRules, ...customRules].filter((r) => r.enabled);
  }, [presetRules, customRules]);

  // 切换预设规则状态
  const handleTogglePreset = (id: string) => {
    setPresetRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
    setDiffCache({});
  };

  // 切换自定义规则状态
  const handleToggleCustom = (id: string) => {
    setCustomRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
    setDiffCache({});
  };

  // 删除自定义规则
  const handleDeleteCustom = (id: string) => {
    setCustomRules((prev) => prev.filter((r) => r.id !== id));
    setDiffCache({});
  };

  // 添加自定义规则
  const handleAddCustomRule = () => {
    if (!newRuleTarget.trim()) {
      setError("请填写匹配目标（标签名、XML片段或查找文本）");
      return;
    }
    const rule: RewriteRule = {
      id: `custom_${Date.now()}`,
      name:
        newRuleName.trim() ||
        (newRuleType === "remove_node"
          ? `删除 ${newRuleTarget.trim()}`
          : newRuleType === "replace_node"
          ? `重构 ${newRuleTarget.trim()} -> ${newRuleReplacement.trim()}`
          : newRuleType === "append_node"
          ? `追加 ${newRuleTarget.trim()} -> ${newRuleReplacement.trim()}`
          : `替换 "${newRuleTarget.trim()}" -> "${newRuleReplacement.trim()}"`),
      rule_type: newRuleType,
      target: newRuleTarget.trim(),
      replacement: newRuleReplacement.trim(),
      scope: newRuleScope.trim() || undefined,
      enabled: true,
    };

    setCustomRules((prev) => [...prev, rule]);
    setNewRuleName("");
    setNewRuleTarget("");
    setNewRuleReplacement("");
    setNewRuleScope("");
    setShowAddRuleForm(false);
    setError(null);
    setDiffCache({});
  };

  // 读取系统配置中的默认输入目录
  const handleFetchDefaultDirectory = async () => {
    setFetchingDefaultDir(true);
    setError(null);
    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const headers = serverConfig.getAuthHeaders();
      const resp = await fetch(`${baseUrl}/api/config`, { headers });
      if (!resp.ok) {
        throw new Error(`无法获取后端配置 (HTTP ${resp.status})`);
      }
      const cfg = await resp.json();
      const defaultDir = cfg?.scanner?.input_directory || cfg?.input_directory || "";
      if (defaultDir) {
        setDirectory(defaultDir);
        addLog?.("info", `已填充系统默认扫描目录: ${defaultDir}`);
      } else {
        setError("系统配置中未设置默认输入目录，请手动输入");
      }
    } catch (err: any) {
      setError(err.message || "读取默认目录失败");
    } finally {
      setFetchingDefaultDir(false);
    }
  };

  // 第一步：强制先扫描并生成预览（dry_run: true）
  const handleScanPreview = async () => {
    if (!directory.trim()) {
      setError("请填写需要扫描的目标目录路径");
      return;
    }
    if (allActiveRules.length === 0) {
      setError("请至少启用一项清理或重写规则");
      return;
    }

    setScanning(true);
    setError(null);
    setResult(null);
    setAppliedSuccess(false);
    setDiffCache({});

    addLog?.("step", `开始对目录 [${directory.trim()}] 扫描并生成改动预览...`);

    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const headers = {
        ...serverConfig.getAuthHeaders(),
        "Content-Type": "application/json",
      };

      const resp = await fetch(`${baseUrl}/api/tools/clean-nfo`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          directory: directory.trim(),
          rules: allActiveRules,
          recursive,
          dry_run: true, // 强制预览模式，绝不直接写盘
          backup,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        throw new Error(errJson?.detail || `请求失败 (HTTP ${resp.status})`);
      }

      const data: CleanNfoResponse = await resp.json();
      setResult(data);
      addLog?.(
        "info",
        `预览扫描完成：检索 ${data.scanned_files} 个文件，其中 ${data.modified_files} 个文件将发生变更`
      );
    } catch (err: any) {
      const msg = err.message || "执行扫描预览请求失败";
      setError(msg);
      addLog?.("error", `扫描预览失败: ${msg}`);
    } finally {
      setScanning(false);
    }
  };

  // 第二步：用户在预览界面检查无误后，二次确认真实写盘（dry_run: false）
  const handleConfirmApply = async () => {
    if (!directory.trim() || !result) return;

    setShowConfirmModal(false);
    setApplying(true);
    setError(null);

    addLog?.("step", `用户确认执行真实写盘，正在向磁盘写入修改...`);

    try {
      const baseUrl = serverConfig.getHttpBaseUrl();
      const headers = {
        ...serverConfig.getAuthHeaders(),
        "Content-Type": "application/json",
      };

      const resp = await fetch(`${baseUrl}/api/tools/clean-nfo`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          directory: directory.trim(),
          rules: allActiveRules,
          recursive,
          dry_run: false, // 真实写盘
          backup,
        }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        throw new Error(errJson?.detail || `请求失败 (HTTP ${resp.status})`);
      }

      const data: CleanNfoResponse = await resp.json();
      setResult(data);
      setAppliedSuccess(true);
      setDiffCache({});
      addLog?.(
        "info",
        `真实写入完成！已成功修改并落盘 ${data.modified_files} 个 NFO 文件${backup ? " (已创建 .bak 备份)" : ""}`
      );
    } catch (err: any) {
      const msg = err.message || "执行真实写盘失败";
      setError(msg);
      addLog?.("error", `写入失败: ${msg}`);
    } finally {
      setApplying(false);
    }
  };

  // 过滤结果
  const filteredResults = useMemo(() => {
    return (result?.results || []).filter((item: CleanNfoFileResultItem) => {
      if (filterMode === "changed" && !item.changed) return false;
      if (filterMode === "error" && !item.error) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        if (!item.path.toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  }, [result, filterMode, searchKeyword]);

  const displayedResults = useMemo(() => {
    return filteredResults.slice(0, displayLimit);
  }, [filteredResults, displayLimit]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 头部说明卡片 */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileText size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                NFO 规则重写与清理工具
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                支持通用规则重写引擎：安全清洗 Jellyfin 污染的 &lt;art&gt;、&lt;fileinfo&gt;、还原 &lt;numid&gt;，或批量替换演员名等内容。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-medium">
            <ShieldCheck size={14} />
            <span>安全机制：强制必须先预览，确认后方可写盘</span>
          </div>
        </div>

        {/* 目录输入区域 */}
        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              扫描目标目录路径
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                placeholder="例如: D:\Videos\Organized 或 /mnt/media/movies"
                className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
              <button
                type="button"
                onClick={handleFetchDefaultDirectory}
                disabled={fetchingDefaultDir}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition shrink-0 cursor-pointer disabled:opacity-50"
                title="读取 config.yml 中配置的默认输入目录"
              >
                {fetchingDefaultDir ? (
                  <Loader2 size={14} className="animate-spin text-slate-500" />
                ) : (
                  <FolderInput size={14} className="text-indigo-600" />
                )}
                <span>读取系统输入目录</span>
              </button>
            </div>
          </div>

          {/* 常用预设规则开关 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              常用快捷预设规则
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {presetRules.map((rule) => (
                <label
                  key={rule.id}
                  className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition select-none ${
                    rule.enabled
                      ? "border-indigo-200 bg-indigo-50/30"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={() => handleTogglePreset(rule.id)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 truncate">
                      {rule.id === "preset_art" && <Image size={14} className="text-amber-600 shrink-0" />}
                      {rule.id === "preset_trailer" && <Film size={14} className="text-sky-600 shrink-0" />}
                      {rule.id === "preset_actor_thumb" && <User size={14} className="text-purple-600 shrink-0" />}
                      {rule.id === "preset_fileinfo" && <FileCode size={14} className="text-indigo-600 shrink-0" />}
                      {rule.id === "preset_numid" && <Tag size={14} className="text-emerald-600 shrink-0" />}
                      {rule.id === "preset_lockdata" && <ShieldCheck size={14} className="text-slate-600 shrink-0" />}
                      {rule.id === "preset_actor_type" && <Sparkles size={14} className="text-violet-600 shrink-0" />}
                      <span className="truncate">{rule.name}</span>
                    </span>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                      {rule.rule_type === "append_node"
                        ? `${rule.target} + ${rule.replacement}`
                        : `${rule.target} ${rule.replacement ? `→ ${rule.replacement}` : "(删除)"}`}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 自定义重写规则池 */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Type size={14} className="text-indigo-600" />
                自定义重写与替换规则 ({customRules.length})
              </label>
              <button
                type="button"
                onClick={() => setShowAddRuleForm((v) => !v)}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
              >
                <Plus size={14} />
                <span>{showAddRuleForm ? "收起添加表单" : "添加自定义规则"}</span>
              </button>
            </div>

            {/* 新增规则内嵌表单 */}
            {showAddRuleForm && (
              <div className="p-4 bg-slate-50 border border-indigo-100 rounded-xl mb-3 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">新建重写/替换规则</span>
                  <div className="flex gap-2 text-xs flex-wrap">
                    <button
                      type="button"
                      onClick={() => setNewRuleType("remove_node")}
                      className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer transition ${
                        newRuleType === "remove_node"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      删除节点
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRuleType("replace_node")}
                      className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer transition ${
                        newRuleType === "replace_node"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      重构节点/标签
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRuleType("append_node")}
                      className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer transition ${
                        newRuleType === "append_node"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      追加子节点
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRuleType("replace_text")}
                      className={`px-2.5 py-1 rounded-md border font-medium cursor-pointer transition ${
                        newRuleType === "replace_text"
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      替换文本内容
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 mb-1">
                      {newRuleType === "replace_text"
                        ? "查找文本 (例如: 相沢みなみ)"
                        : newRuleType === "append_node"
                        ? "目标父节点/XPath (例如: <actor></actor> 或 //actor)"
                        : "目标标签/XPath (例如: <art></art> 或 //fileinfo)"}
                    </label>
                    <input
                      type="text"
                      value={newRuleTarget}
                      onChange={(e) => setNewRuleTarget(e.target.value)}
                      placeholder={
                        newRuleType === "replace_text"
                          ? "相沢みなみ"
                          : newRuleType === "append_node"
                          ? "<actor></actor> 或 //actor"
                          : "<art></art> 或 actor/thumb"
                      }
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono text-slate-800"
                    />
                  </div>

                  {newRuleType !== "remove_node" && (
                    <div>
                      <label className="block text-slate-600 mb-1">
                        {newRuleType === "replace_text"
                          ? "替换为 (例如: 相澤南)"
                          : newRuleType === "append_node"
                          ? "待追加的子节点片段 (例如: <type>Actor</type>)"
                          : "替换标签片段 (例如: <uniqueid type=\"num\">)"}
                      </label>
                      <input
                        type="text"
                        value={newRuleReplacement}
                        onChange={(e) => setNewRuleReplacement(e.target.value)}
                        placeholder={
                          newRuleType === "replace_text"
                            ? "相澤南"
                            : newRuleType === "append_node"
                            ? "<type>Actor</type>"
                            : '<uniqueid type="num" default="true">'
                        }
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono text-slate-800"
                      />
                    </div>
                  )}

                  {newRuleType === "replace_text" && (
                    <div>
                      <label className="block text-slate-600 mb-1">
                        限定作用域标签 (可选，例如: &lt;actor&gt;&lt;name&gt;，留空为全局文本)
                      </label>
                      <input
                        type="text"
                        value={newRuleScope}
                        onChange={(e) => setNewRuleScope(e.target.value)}
                        placeholder="留空为全局文本替换，或输入 //actor/name"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono text-slate-800"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-600 mb-1">规则备注名称 (可选)</label>
                    <input
                      type="text"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      placeholder="例如: 演员更名或片商统一"
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddRuleForm(false)}
                    className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomRule}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition cursor-pointer"
                  >
                    <Check size={13} />
                    <span>保存并启用此规则</span>
                  </button>
                </div>
              </div>
            )}

            {/* 自定义规则列表 */}
            {customRules.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-1">暂无自定义规则，可点击右上角添加。</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {customRules.map((cr) => (
                  <div
                    key={cr.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition ${
                      cr.enabled
                        ? "bg-slate-100 border-slate-300 text-slate-800"
                        : "bg-slate-50 border-slate-200 text-slate-400 line-through"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={cr.enabled}
                      onChange={() => handleToggleCustom(cr.id)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 cursor-pointer"
                    />
                    <span className="font-medium">{cr.name}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustom(cr.id)}
                      className="text-slate-400 hover:text-rose-600 transition ml-0.5 cursor-pointer"
                      title="删除此规则"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 递归与备份选项 */}
          <div className="flex items-center gap-6 pt-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span>递归扫描子目录</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={backup}
                onChange={(e) => setBackup(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span className="flex items-center gap-1 text-emerald-700 font-medium">
                <ShieldCheck size={14} />
                实际写盘前自动备份为 .bak 文件
              </span>
            </label>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 触发主操作：强制先预览 */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              后端服务状态:{" "}
              <span
                className={
                  wsState === "connected"
                    ? "text-emerald-600 font-semibold"
                    : "text-rose-500 font-semibold"
                }
              >
                {wsState === "connected" ? "在线" : "离线"}
              </span>
            </div>

            <button
              type="button"
              onClick={handleScanPreview}
              disabled={scanning || applying}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              {scanning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>正在扫描检索中...</span>
                </>
              ) : (
                <>
                  <Eye size={16} />
                  <span>开始扫描并预览改动</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 预览与结果面板 */}
      {result && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6 animate-in fade-in duration-200">
          {/* 顶部状态条与写盘确认动作栏 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-slate-50 border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                {result.dry_run ? (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold text-amber-700 bg-amber-100 rounded-full border border-amber-300">
                    <Eye size={13} />
                    模拟预览模式 (磁盘尚未修改)
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold text-emerald-700 bg-emerald-100 rounded-full border border-emerald-300">
                    <CheckCircle2 size={13} />
                    真实写入完成
                  </span>
                )}
                <span className="text-xs font-semibold text-slate-700">
                  {result.modified_files > 0
                    ? `共检索到 ${result.modified_files} 个文件需要变更`
                    : "所选目录中的文件完全干净，无须修改"}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {result.dry_run
                  ? "请在下方列表中检查待修改文件（可点击任意行打开双栏对比），核对无误后点击右侧按钮执行写盘。"
                  : "修改已安全持久化写入本地磁盘文件。"}
              </p>
            </div>

            {/* 如果是预览模式且存在修改，展示确认写盘按钮 */}
            {result.dry_run && result.modified_files > 0 && (
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={applying}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-md hover:shadow-lg transition cursor-pointer disabled:opacity-50"
                >
                  {applying ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>正在写入磁盘...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>确认无误，执行真实写盘 ({result.modified_files})</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 指标卡片 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-xs text-slate-500">已扫描文件</div>
              <div className="text-lg font-bold text-slate-800 mt-1">{result.scanned_files}</div>
            </div>
            <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-100">
              <div className="text-xs text-indigo-600 font-medium">涉及变更文件</div>
              <div className="text-lg font-bold text-indigo-700 mt-1">{result.modified_files}</div>
            </div>
            <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-100">
              <div className="text-xs text-amber-600 font-medium">清理 Art/Trailer/Thumb</div>
              <div className="text-lg font-bold text-amber-700 mt-1">
                {(result.total_art_removed || 0) + result.total_trailer_removed + result.total_actor_thumb_removed}
              </div>
            </div>
            <div className="p-3 bg-rose-50/60 rounded-lg border border-rose-100">
              <div className="text-xs text-rose-600 font-medium">失败异常文件</div>
              <div className="text-lg font-bold text-rose-700 mt-1">{result.error_files}</div>
            </div>
          </div>

          {/* 明细过滤与列表 */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-sm">
              <div className="flex items-center gap-2 font-medium text-slate-700">
                <Filter size={15} />
                <span>文件明细 ({filteredResults.length})</span>
                <span className="text-xs text-slate-400 font-normal">
                  (点击任意文件可对比修改前后两栏差异)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="按文件名搜索..."
                    className="pl-8 pr-3 py-1 bg-slate-50 border border-slate-300 rounded-md text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-48"
                  />
                </div>

                <div className="flex border border-slate-200 rounded-md p-0.5 bg-slate-100 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterMode("changed")}
                    className={`px-2.5 py-0.5 rounded cursor-pointer transition ${
                      filterMode === "changed" ? "bg-white font-medium text-indigo-700 shadow-2xs" : "text-slate-600"
                    }`}
                  >
                    仅有变更
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode("all")}
                    className={`px-2.5 py-0.5 rounded cursor-pointer transition ${
                      filterMode === "all" ? "bg-white font-medium text-indigo-700 shadow-2xs" : "text-slate-600"
                    }`}
                  >
                    全部
                  </button>
                </div>
              </div>
            </div>

            {/* 文件条目列表 */}
            {displayedResults.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs">
                没有符合过滤条件的文件
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                {displayedResults.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => !item.error && setSelectedFileForDiff(item.path)}
                    className={`p-3 flex items-center justify-between transition ${
                      item.error ? "bg-white" : "hover:bg-indigo-50/40 cursor-pointer group"
                    }`}
                    title={item.error ? item.error : "点击查看修改前后两栏对比"}
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="font-mono text-slate-800 truncate group-hover:text-indigo-700 transition-colors">
                        {item.path}
                      </div>
                      {item.error ? (
                        <div className="text-rose-600 mt-0.5">错误: {item.error}</div>
                      ) : (
                        <div className="text-slate-500 mt-0.5 flex gap-2 flex-wrap">
                          {item.trailer_removed > 0 && <span className="text-sky-600">trailer x{item.trailer_removed}</span>}
                          {item.actor_thumb_removed > 0 && <span className="text-purple-600">thumb x{item.actor_thumb_removed}</span>}
                          {Boolean(item.art_removed && item.art_removed > 0) && (
                            <span className="text-amber-600">art x{item.art_removed}</span>
                          )}
                          {item.rule_hits &&
                            Object.entries(item.rule_hits)
                              .filter(([k, v]) => v > 0 && !["preset_trailer", "preset_actor_thumb", "preset_art"].includes(k))
                              .map(([k, v]) => (
                                <span key={k} className="text-indigo-600 font-mono">
                                  {k} x{v}
                                </span>
                              ))}
                          {!item.changed && <span>无需修改</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!item.error && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFileForDiff(item.path);
                          }}
                          className="hidden group-hover:flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition cursor-pointer"
                        >
                          <Columns2 size={12} />
                          对比差异
                        </button>
                      )}
                      {item.error ? (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-md font-medium">失败</span>
                      ) : item.changed ? (
                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md font-medium">
                          {result.dry_run ? "将修改" : "已修改"}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md">无变动</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {filteredResults.length > displayLimit && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setDisplayLimit((prev) => prev + 100)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-md transition cursor-pointer"
                >
                  加载更多条目 (已展示 {displayLimit} / {filteredResults.length})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 二次确认写盘弹窗 */}
      {showConfirmModal && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">确认执行真实写盘？</h3>
                <p className="text-xs text-slate-500 mt-0.5">请再次确认即将对磁盘文件进行的修改</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-1">
              <div>
                涉及修改文件数: <span className="font-bold text-indigo-600">{result.modified_files} 个</span>
              </div>
              <div>
                备份状态:{" "}
                <span className={backup ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                  {backup ? "已开启 (.bak 自动备份)" : "未开启备份 (直接覆盖)"}
                </span>
              </div>
              <div>
                生效规则数: <span className="font-semibold">{allActiveRules.length} 条</span>
              </div>
            </div>

            <p className="text-xs text-rose-600">
              ⚠️ 此操作将直接修改磁盘中的 .nfo 文件，请确保已核对过上方预览中的改动差异。
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 font-medium cursor-pointer"
              >
                取消返回
              </button>
              <button
                type="button"
                onClick={handleConfirmApply}
                disabled={applying}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
              >
                {applying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>确认立即写入磁盘</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 差异对比弹窗 */}
      <NfoDiffModal
        isOpen={selectedFileForDiff !== null}
        onClose={() => setSelectedFileForDiff(null)}
        filePath={selectedFileForDiff}
        rules={allActiveRules}
        cachedData={selectedFileForDiff ? diffCache[selectedFileForDiff] : null}
        onDataLoaded={(p, d) => setDiffCache((prev) => ({ ...prev, [p]: d }))}
      />
    </div>
  );
};
