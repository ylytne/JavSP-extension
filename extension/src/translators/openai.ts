/**
 * OpenAI 兼容接口翻译引擎实现
 * 兼容 Groq, DeepSeek, OpenAI, Ollama 等任何遵循 OpenAI Chat Completions 协议的服务
 */

import { ITranslator, OpenAIEngineConfig, TranslationResult, renderTranslatePrompt } from "./types";

/**
 * 规范化 OpenAI 兼容 Chat Completions 端点地址
 */
export function normalizeChatCompletionsUrl(rawUrl?: string): string {
  const url = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!url) {
    return "https://api.groq.com/openai/v1/chat/completions";
  }
  if (url.endsWith("/chat/completions")) {
    return url;
  }
  if (url.endsWith("/v1")) {
    return `${url}/chat/completions`;
  }
  return `${url}/chat/completions`;
}

/**
 * 清洗 LLM 响应内容（去除思考链 <think> 标签与首尾多余成对符号）
 */
export function cleanLLMResponse(content: string): string {
  if (!content) return "";
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
    (cleaned.startsWith("「") && cleaned.endsWith("」")) ||
    (cleaned.startsWith("『") && cleaned.endsWith("』")) ||
    (cleaned.startsWith("《") && cleaned.endsWith("》"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

export class OpenAITranslator implements ITranslator {
  public readonly name = "openai";
  private url: string;
  private apiKey: string;
  private model: string;
  private targetLang: string;
  private prompt?: string;

  constructor(config: OpenAIEngineConfig) {
    const rawUrl = config.url || (config as any).baseUrl || (config as any).base_url;
    this.url = normalizeChatCompletionsUrl(rawUrl);
    this.apiKey = config.api_key || (config as any).apiKey || "";
    this.model = config.model || "llama-3.1-70b-versatile";
    this.targetLang = config.targetLang || "zh-CN";
    this.prompt = config.prompt || (config as any).system_prompt;
  }

  public async translate(text: string, _actress: string[] = []): Promise<TranslationResult> {
    if (!text || !text.trim()) {
      return { trans: text };
    }

    const systemPrompt = renderTranslatePrompt(this.prompt, this.targetLang);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const payload = {
      model: this.model,
      temperature: 0,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);

      const resp = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await resp.json();

      if (!resp.ok || data?.error) {
        const msg = data?.error?.message || resp.statusText;
        return { error: `OpenAI 翻译错误 (${resp.status}): ${msg}` };
      }

      if (Array.isArray(data?.choices) && data.choices.length > 0) {
        const rawContent = data.choices[0]?.message?.content || "";
        const content = cleanLLMResponse(rawContent);
        return { trans: content };
      }

      return { error: "OpenAI 翻译返回了非预期的 choices 数据" };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { error: "OpenAI 翻译请求超时 (20s)" };
      }
      return { error: `OpenAI 翻译发生异常: ${err.message || String(err)}` };
    }
  }
}
