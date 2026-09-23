import React from "react";
import { FullAppConfig } from "../types";
import { SUPPORTED_LANGUAGES } from "../../../../translators/languages";

interface TranslatorTabProps {
  formConfig: FullAppConfig;
  updateForm: (updater: (prev: FullAppConfig) => FullAppConfig) => void;
}

export const TranslatorTab: React.FC<TranslatorTabProps> = ({ formConfig, updateForm }) => {
  // 翻译引擎类型解析
  const getTranslatorEngineType = (): string => {
    const engine = formConfig.translator?.engine;
    if (!engine) return "none";
    if (typeof engine === "string") return engine;
    return engine.name || "none";
  };

  const setTranslatorEngineType = (type: string) => {
    updateForm((cfg) => {
      if (type === "none") {
        cfg.translator.engine = null;
      } else if (type === "google") {
        cfg.translator.engine = { name: "google" };
      } else if (type === "baidu") {
        cfg.translator.engine = { name: "baidu", app_id: "", api_key: "" };
      } else if (type === "bing") {
        cfg.translator.engine = { name: "bing", api_key: "" };
      } else if (type === "claude") {
        cfg.translator.engine = { name: "claude", api_key: "", model: "claude-3-haiku-20240307", prompt: "" };
      } else if (type === "openai") {
        cfg.translator.engine = {
          name: "openai",
          url: "https://api.groq.com/openai/v1/chat/completions",
          api_key: "",
          model: "llama-3.1-70b-versatile",
          prompt: "",
        };
      }
      return cfg;
    });
  };

  const engineType = getTranslatorEngineType();

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          翻译目标语言 (Target Language)
        </label>
        <select
          value={formConfig.translator.target_lang || "zh-CN"}
          onChange={(e) =>
            updateForm((cfg) => {
              cfg.translator.target_lang = e.target.value;
              return cfg;
            })
          }
          className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-slate-500 mt-1">
          选择影片标题与剧情简介翻译的目标语言，传统翻译引擎（Google/百度/Bing）与大模型（默认提示词）均会自动适配此语种。<br />
          请注意，如果目标语言选择为简体中文/繁体中文，且爬虫已经从源站爬取到了中文信息，翻译流程会直接跳过。
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">
          翻译服务提供方 (engine)
        </label>
        <select
          value={engineType}
          onChange={(e) => setTranslatorEngineType(e.target.value)}
          className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
        >
          <option value="none">禁用翻译服务 (不进行翻译)</option>
          <option value="google">Google 免费网页翻译 (无需 API Key)</option>
          <option value="openai">OpenAI 兼容接口 (如 Groq / DeepSeek / Ollama)</option>
          <option value="baidu">百度翻译 (官方 API)</option>
          <option value="bing">微软必应翻译 (Azure Translator)</option>
          <option value="claude">Anthropic Claude</option>
        </select>
      </div>

      {/* 动态展示不同引擎专属表单项 */}
      {engineType === "openai" && (
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              API 请求 URL (例如 OpenAI 格式端点)
            </label>
            <input
              type="text"
              value={formConfig.translator.engine?.url || ""}
              onChange={(e) =>
                updateForm((cfg) => {
                  if (cfg.translator.engine) cfg.translator.engine.url = e.target.value;
                  return cfg;
                })
              }
              placeholder="https://api.groq.com/openai/v1/chat/completions"
              className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={formConfig.translator.engine?.api_key || ""}
                onChange={(e) =>
                  updateForm((cfg) => {
                    if (cfg.translator.engine) cfg.translator.engine.api_key = e.target.value;
                    return cfg;
                  })
                }
                placeholder="gsk_..."
                className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Model 名称
              </label>
              <input
                type="text"
                value={formConfig.translator.engine?.model || ""}
                onChange={(e) =>
                  updateForm((cfg) => {
                    if (cfg.translator.engine) cfg.translator.engine.model = e.target.value;
                    return cfg;
                  })
                }
                placeholder="llama-3.1-70b-versatile"
                className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              自定义提示词 Prompt (可选，留空使用系统默认)
            </label>
            <textarea
              rows={2}
              value={formConfig.translator.engine?.prompt || ""}
              onChange={(e) =>
                updateForm((cfg) => {
                  if (cfg.translator.engine) cfg.translator.engine.prompt = e.target.value;
                  return cfg;
                })
              }
              placeholder="Translate the following Japanese paragraph into {targetLang}..."
              className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[10px] text-slate-500 mt-0.5">
              提示：支持使用 <code className="text-indigo-600 font-mono">{"{targetLang}"}</code> 占位符指代目标语言。
            </p>
          </div>
        </div>
      )}

      {engineType === "baidu" && (
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              百度 App ID
            </label>
            <input
              type="text"
              value={formConfig.translator.engine?.app_id || ""}
              onChange={(e) =>
                updateForm((cfg) => {
                  if (cfg.translator.engine) cfg.translator.engine.app_id = e.target.value;
                  return cfg;
                })
              }
              className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              API 密钥 / Secret Key
            </label>
            <input
              type="password"
              value={formConfig.translator.engine?.api_key || ""}
              onChange={(e) =>
                updateForm((cfg) => {
                  if (cfg.translator.engine) cfg.translator.engine.api_key = e.target.value;
                  return cfg;
                })
              }
              className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      )}

      {engineType === "bing" && (
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200">
          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
            API Key
          </label>
          <input
            type="password"
            value={formConfig.translator.engine?.api_key || ""}
            onChange={(e) =>
              updateForm((cfg) => {
                if (cfg.translator.engine) cfg.translator.engine.api_key = e.target.value;
                return cfg;
              })
            }
            className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {engineType === "claude" && (
        <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={formConfig.translator.engine?.api_key || ""}
                onChange={(e) =>
                  updateForm((cfg) => {
                    if (cfg.translator.engine) cfg.translator.engine.api_key = e.target.value;
                    return cfg;
                  })
                }
                placeholder="sk-ant-..."
                className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Model 模型名称
              </label>
              <input
                type="text"
                value={formConfig.translator.engine?.model || ""}
                onChange={(e) =>
                  updateForm((cfg) => {
                    if (cfg.translator.engine) cfg.translator.engine.model = e.target.value;
                    return cfg;
                  })
                }
                placeholder="claude-3-haiku-20240307"
                className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              自定义提示词 Prompt (可选，留空使用系统默认)
            </label>
            <textarea
              rows={2}
              value={formConfig.translator.engine?.prompt || ""}
              onChange={(e) =>
                updateForm((cfg) => {
                  if (cfg.translator.engine) cfg.translator.engine.prompt = e.target.value;
                  return cfg;
                })
              }
              placeholder="Translate the following Japanese paragraph into {targetLang}..."
              className="w-full text-xs font-mono px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[10px] text-slate-500 mt-0.5">
              提示：支持使用 <code className="text-indigo-600 font-mono">{"{targetLang}"}</code> 占位符指代目标语言。
            </p>
          </div>
        </div>
      )}

      {/* 待翻译字段开关 */}
      <div className="flex items-center gap-6 pt-1">
        <span className="text-xs font-bold text-slate-700">待翻译字段开关:</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={formConfig.translator.fields.title}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.translator.fields.title = e.target.checked;
                return cfg;
              })
            }
            className="rounded text-indigo-600 focus:ring-indigo-500"
          />
          <span>影片标题 (title)</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={formConfig.translator.fields.plot}
            onChange={(e) =>
              updateForm((cfg) => {
                cfg.translator.fields.plot = e.target.checked;
                return cfg;
              })
            }
            className="rounded text-indigo-600 focus:ring-indigo-500"
          />
          <span>剧情简介 (plot)</span>
        </label>
      </div>
    </div>
  );
};
