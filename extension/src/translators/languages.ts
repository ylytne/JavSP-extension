/**
 * JavSP 多语言定义与翻译服务商代码映射器
 */

export interface LanguageMeta {
  code: string;         // 通用标准语言代码（如 "zh-CN", "zh-TW", "en", "fr"）
  label: string;        // 界面显示名称（如 "简体中文 (Simplified Chinese)"）
  englishName: string;  // 英文自然语言名称（用于大模型英文提示词插值，如 "English", "French"）
  chineseName: string;  // 中文自然语言名称（用于中文提示词插值，如 "英语", "法语"）
  googleCode: string;   // Google 翻译 API 代码
  baiduCode: string;    // 百度翻译 API 代码
  bingCode: string;     // 微软必应 (Azure Translator) API 代码
}

/**
 * 官方预置的常用支持语言清单
 */
export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {
    code: "zh-CN",
    label: "简体中文 (Simplified Chinese)",
    englishName: "Simplified Chinese",
    chineseName: "简体中文",
    googleCode: "zh-CN",
    baiduCode: "zh",
    bingCode: "zh-Hans",
  },
  {
    code: "zh-TW",
    label: "繁体中文 (Traditional Chinese)",
    englishName: "Traditional Chinese",
    chineseName: "繁体中文",
    googleCode: "zh-TW",
    baiduCode: "cht",
    bingCode: "zh-Hant",
  },
  {
    code: "en",
    label: "英语 (English)",
    englishName: "English",
    chineseName: "英语",
    googleCode: "en",
    baiduCode: "en",
    bingCode: "en",
  },
  {
    code: "ja",
    label: "日语 (Japanese)",
    englishName: "Japanese",
    chineseName: "日语",
    googleCode: "ja",
    baiduCode: "jp",
    bingCode: "ja",
  },
  {
    code: "ko",
    label: "韩语 (Korean)",
    englishName: "Korean",
    chineseName: "韩语",
    googleCode: "ko",
    baiduCode: "kor",
    bingCode: "ko",
  },
  {
    code: "fr",
    label: "法语 (French)",
    englishName: "French",
    chineseName: "法语",
    googleCode: "fr",
    baiduCode: "fra",
    bingCode: "fr",
  },
  {
    code: "de",
    label: "德语 (German)",
    englishName: "German",
    chineseName: "德语",
    googleCode: "de",
    baiduCode: "de",
    bingCode: "de",
  },
  {
    code: "es",
    label: "西班牙语 (Spanish)",
    englishName: "Spanish",
    chineseName: "西班牙语",
    googleCode: "es",
    baiduCode: "spa",
    bingCode: "es",
  },
  {
    code: "ru",
    label: "俄语 (Russian)",
    englishName: "Russian",
    chineseName: "俄语",
    googleCode: "ru",
    baiduCode: "ru",
    bingCode: "ru",
  },
];

/**
 * 获取指定代码对应的语言元数据（支持未知代码优雅降级）
 */
export function getLanguageMeta(code: string = "zh-CN"): LanguageMeta {
  const normalized = code.trim().replace("_", "-");
  const found = SUPPORTED_LANGUAGES.find(
    (l) => l.code.toLowerCase() === normalized.toLowerCase()
  );
  if (found) {
    return found;
  }

  // 若为非预置语言代码，构造默认回退对象
  return {
    code: normalized,
    label: normalized,
    englishName: normalized,
    chineseName: normalized,
    googleCode: normalized,
    baiduCode: normalized,
    bingCode: normalized,
  };
}

/**
 * 为特定的翻译引擎提取匹配的语言代码
 */
export function resolveEngineLangCode(
  engineName: "google" | "baidu" | "bing" | "claude" | "openai" | string,
  targetLang: string = "zh-CN"
): string {
  const meta = getLanguageMeta(targetLang);
  switch (engineName) {
    case "google":
      return meta.googleCode;
    case "baidu":
      return meta.baiduCode;
    case "bing":
      return meta.bingCode;
    default:
      return meta.code;
  }
}
