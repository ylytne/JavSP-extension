/**
 * 微软必应 (Azure Cognitive Services) 翻译引擎实现
 * 包含女优人名动态词典标记保护 (<mstrans:dictionary>) 与标点空格清洗
 */

import { BingEngineConfig, ITranslator, TranslationResult, resolveEngineLangCode } from "./types";

export class BingTranslator implements ITranslator {
  public readonly name = "bing";
  private apiKey: string;
  private region: string;
  private targetLang: string;

  constructor(config: BingEngineConfig) {
    this.apiKey = config.api_key;
    this.region = config.region || "global";
    this.targetLang = config.targetLang || "zh-CN";
  }

  public async translate(text: string, actress: string[] = []): Promise<TranslationResult> {
    if (!text || !text.trim()) {
      return { trans: text };
    }

    if (!this.apiKey) {
      return { error: "必应翻译未配置有效的 API 密钥 (api_key)" };
    }

    // 使用动态词典保护原文中的女优名，防止翻译后辨识失真
    let processedText = text;
    for (const act of actress) {
      if (act && act.trim()) {
        const escaped = act.trim();
        processedText = processedText.split(escaped).join(
          `<mstrans:dictionary translation="${escaped}">${escaped}</mstrans:dictionary>`
        );
      }
    }

    const langCode = resolveEngineLangCode("bing", this.targetLang);
    const apiUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${langCode}&includeSentenceLength=true`;

    try {
      const traceId = typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": this.apiKey,
          "Ocp-Apim-Subscription-Region": this.region,
          "Content-Type": "application/json",
          "X-ClientTraceId": traceId,
        },
        body: JSON.stringify([{ text: processedText }]),
        signal: controller.signal,
      });
      clearTimeout(timer);

      const result = await resp.json();

      if (!resp.ok || result?.error) {
        const code = result?.error?.code || resp.status;
        const msg = result?.error?.message || resp.statusText;
        return { error: `必应翻译错误 (${code}): ${msg}` };
      }

      if (Array.isArray(result) && result.length > 0 && result[0]?.translations?.length > 0) {
        const transObj = result[0].translations[0];
        const sentLen = transObj.sentLen;

        if (sentLen && Array.isArray(sentLen.srcSentLen) && Array.isArray(sentLen.transSentLen)) {
          const orig_break: string[] = [];
          const trans_break: string[] = [];

          let remainingOrig = text;
          for (const len of sentLen.srcSentLen) {
            orig_break.push(remainingOrig.slice(0, len));
            remainingOrig = remainingOrig.slice(len);
          }
          if (remainingOrig) orig_break.push(remainingOrig);

          let remainingTrans = transObj.text || "";
          for (const len of sentLen.transSentLen) {
            // Bing 会在译文句尾额外添加西文空格，去除以契合中文标点习惯
            trans_break.push(remainingTrans.slice(0, len).replace(/\s+$/, ""));
            remainingTrans = remainingTrans.slice(len);
          }
          if (remainingTrans) trans_break.push(remainingTrans.replace(/\s+$/, ""));

          const trans = trans_break.join("");
          return { trans, orig_break, trans_break };
        }

        return { trans: (transObj.text || "").trim() };
      }

      return { error: "必应翻译返回了非预期的空数据结构" };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { error: "必应翻译请求超时 (12s)" };
      }
      return { error: `必应翻译发生异常: ${err.message || String(err)}` };
    }
  }
}
