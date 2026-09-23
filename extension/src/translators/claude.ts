/**
 * Anthropic Claude 翻译引擎实现
 */

import { ClaudeEngineConfig, ITranslator, TranslationResult, renderTranslatePrompt } from "./types";

export class ClaudeTranslator implements ITranslator {
  public readonly name = "claude";
  private apiKey: string;
  private model: string;
  private targetLang: string;
  private prompt?: string;

  constructor(config: ClaudeEngineConfig) {
    this.apiKey = config.api_key;
    this.model = config.model || "claude-3-haiku-20240307";
    this.targetLang = config.targetLang || "zh-CN";
    this.prompt = config.prompt || (config as any).system_prompt;
  }

  public async translate(text: string, _actress: string[] = []): Promise<TranslationResult> {
    if (!text || !text.trim()) {
      return { trans: text };
    }

    if (!this.apiKey) {
      return { error: "Claude 翻译未配置有效的 API 密钥 (api_key)" };
    }

    const apiUrl = "https://api.anthropic.com/v1/messages";
    const systemPrompt = renderTranslatePrompt(this.prompt, this.targetLang);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);

      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "dangerously-allow-browser": "true",
        },
        body: JSON.stringify({
          model: this.model,
          system: systemPrompt,
          max_tokens: 1024,
          messages: [{ role: "user", content: text }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const data = await resp.json();

      if (!resp.ok || data?.error) {
        const msg = data?.error?.message || resp.statusText;
        return { error: `Claude 翻译错误 (${resp.status}): ${msg}` };
      }

      if (Array.isArray(data?.content) && data.content.length > 0) {
        const transText = (data.content[0]?.text || "").trim();
        return { trans: transText };
      }

      return { error: "Claude 翻译未返回 content 内容" };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { error: "Claude 翻译请求超时 (20s)" };
      }
      return { error: `Claude 翻译发生异常: ${err.message || String(err)}` };
    }
  }
}
