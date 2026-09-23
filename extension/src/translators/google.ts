/**
 * Google 免费翻译引擎实现 (Web 端点)
 */

import { GoogleEngineConfig, ITranslator, TranslationResult, resolveEngineLangCode } from "./types";

const GOOGLE_ENDPOINTS = [
  "https://translate.googleapis.com/translate_a/single",
  "https://translate.google.com.hk/translate_a/single",
  "https://translate.google.com/translate_a/single",
];

export class GoogleTranslator implements ITranslator {
  public readonly name = "google";
  private targetLang: string;

  constructor(config?: GoogleEngineConfig) {
    this.targetLang = config?.targetLang || "zh-CN";
  }

  public async translate(text: string, _actress: string[] = []): Promise<TranslationResult> {
    if (!text || !text.trim()) {
      return { trans: text };
    }

    const langCode = resolveEngineLangCode("google", this.targetLang);
    const encoded = encodeURIComponent(text);

    let lastError = "";

    for (const endpoint of GOOGLE_ENDPOINTS) {
      const url = `${endpoint}?client=gtx&dt=t&dj=1&ie=UTF-8&sl=auto&tl=${langCode}&q=${encoded}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);

        const resp = await fetch(url, {
          method: "GET",
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (resp.status === 429) {
          lastError = "Google 翻译请求超限 (HTTP 429 Too Many Requests)";
          continue;
        }

        if (!resp.ok) {
          lastError = `Google 翻译请求失败: HTTP ${resp.status} ${resp.statusText}`;
          continue;
        }

        const data = await resp.json();
        if (Array.isArray(data.sentences) && data.sentences.length > 0) {
          const orig_break = data.sentences.map((s: any) => s.orig || "");
          const trans_break = data.sentences.map((s: any) => s.trans || "");
          const trans = trans_break.join("");
          return { trans, orig_break, trans_break };
        }

        lastError = "Google 翻译未返回有效的 sentences 列表";
      } catch (err: any) {
        if (err.name === "AbortError") {
          lastError = `Google 翻译请求超时 (8s) [${endpoint}]`;
        } else {
          lastError = `Google 翻译发生异常 [${endpoint}]: ${err.message || String(err)}`;
        }
      }
    }

    return { error: lastError || "所有 Google 翻译备用端点均无法访问" };
  }
}
