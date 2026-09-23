/**
 * JavSP 翻译子系统类型契约定义
 */

import { getLanguageMeta } from "./languages";

export * from "./languages";

export interface GoogleEngineConfig {
  name: "google";
  targetLang?: string; // 默认 "zh-CN"
}

export interface BaiduEngineConfig {
  name: "baidu";
  app_id: string;
  api_key: string;
  targetLang?: string; // 默认 "zh"
}

export interface BingEngineConfig {
  name: "bing";
  api_key: string;
  region?: string; // 默认 "global"
  targetLang?: string; // 默认 "zh-Hans"
}

export interface ClaudeEngineConfig {
  name: "claude";
  api_key: string;
  model?: string; // 默认 "claude-3-haiku-20240307"
  targetLang?: string; // 默认 "zh-CN"
  prompt?: string; // 自定义提示词模板，支持 {targetLang} / {targetLangCn} / {to} 占位符
}

export interface OpenAIEngineConfig {
  name: "openai";
  url: string; // 如 "https://api.groq.com/openai/v1/chat/completions"
  api_key: string;
  model: string; // 如 "llama-3.1-70b-versatile" 或 "gpt-3.5-turbo"
  targetLang?: string; // 默认 "zh-CN"
  prompt?: string; // 自定义提示词模板，支持 {targetLang} / {targetLangCn} / {to} 占位符
}

export const DEFAULT_TRANSLATE_PROMPT =
  "Translate the following Japanese paragraph into {targetLang}, while leaving non-Japanese text, names, or text that does not look like Japanese untranslated. Reply with the translated text only, do not add any text that is not in the original content.";

/**
 * 依据自定义模板或默认模板渲染翻译 Prompt
 */
export function renderTranslatePrompt(customPrompt: string | undefined, targetLang: string = "zh-CN"): string {
  const template = customPrompt && customPrompt.trim() ? customPrompt.trim() : DEFAULT_TRANSLATE_PROMPT;
  const meta = getLanguageMeta(targetLang);

  return template
    .replace(/\{targetLang\}/g, meta.englishName)
    .replace(/\{target_lang\}/g, meta.englishName)
    .replace(/\{targetLangCn\}/g, meta.chineseName)
    .replace(/\{targetLangCode\}/g, meta.code)
    .replace(/\{to\}/g, meta.englishName);
}

export type TranslateEngineConfig =
  | GoogleEngineConfig
  | BaiduEngineConfig
  | BingEngineConfig
  | ClaudeEngineConfig
  | OpenAIEngineConfig;

export interface TranslateFieldsConfig {
  title: boolean;
  plot: boolean;
}

export interface TranslatorConfig {
  target_lang?: string; // 统一目标语言代码（如 "zh-CN", "zh-TW", "en", "fr"）
  engine: TranslateEngineConfig | null;
  fields: TranslateFieldsConfig;
}

export interface TranslationResult {
  trans?: string;
  orig_break?: string[];
  trans_break?: string[];
  error?: string;
}

export interface ITranslator {
  readonly name: string;
  translate(text: string, actress?: string[]): Promise<TranslationResult>;
}
