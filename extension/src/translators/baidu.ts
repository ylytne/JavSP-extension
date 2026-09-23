/**
 * 百度通用翻译 API 引擎实现
 * 包含 MD5 签名生成与 QPS=1 节流保护
 */

import { BaiduEngineConfig, ITranslator, TranslationResult, resolveEngineLangCode } from "./types";
import { md5 } from "./utils/md5";

export class BaiduTranslator implements ITranslator {
  public readonly name = "baidu";
  private appId: string;
  private apiKey: string;
  private targetLang: string;
  private static lastAccessTime = 0;

  constructor(config: BaiduEngineConfig) {
    this.appId = config.app_id;
    this.apiKey = config.api_key;
    this.targetLang = config.targetLang || "zh-CN";
  }

  public async translate(text: string, _actress: string[] = []): Promise<TranslationResult> {
    if (!text || !text.trim()) {
      return { trans: text };
    }

    if (!this.appId || !this.apiKey) {
      return { error: "百度翻译未配置完整的 app_id 或 api_key" };
    }

    // 百度通用翻译标准版限制 QPS=1，连续请求时平滑节流等待
    const now = Date.now();
    const elapsed = now - BaiduTranslator.lastAccessTime;
    if (elapsed < 1000) {
      await new Promise((r) => setTimeout(r, 1000 - elapsed));
    }

    const salt = Math.floor(Math.random() * 0x7fffffff).toString();
    const signInput = this.appId + text + salt + this.apiKey;
    const sign = md5(signInput);

    const langCode = resolveEngineLangCode("baidu", this.targetLang);
    const formData = new URLSearchParams();
    formData.append("q", text);
    formData.append("from", "auto");
    formData.append("to", langCode);
    formData.append("appid", this.appId);
    formData.append("salt", salt);
    formData.append("sign", sign);

    const apiUrl = "https://api.fanyi.baidu.com/api/trans/vip/translate";

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const resp = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        signal: controller.signal,
      });
      clearTimeout(timer);
      BaiduTranslator.lastAccessTime = Date.now();

      const data = await resp.json();

      if (data?.error_code) {
        return {
          error: `百度翻译错误 (${data.error_code}): ${data.error_msg || "未知错误"}`,
        };
      }

      if (Array.isArray(data?.trans_result)) {
        // 百度翻译以换行符划分段落
        const paragraphs = data.trans_result.map((i: any) => i.dst || "");
        return { trans: paragraphs.join("\n") };
      }

      return { error: "百度翻译返回非预期数据" };
    } catch (err: any) {
      BaiduTranslator.lastAccessTime = Date.now();
      if (err.name === "AbortError") {
        return { error: "百度翻译请求超时 (12s)" };
      }
      return { error: `百度翻译发生异常: ${err.message || String(err)}` };
    }
  }
}
