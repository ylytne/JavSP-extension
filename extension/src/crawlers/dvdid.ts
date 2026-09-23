/**
 * 番号识别、严格匹配与文本特征分析公共模块
 */

/**
 * 规范化番号用于比较 (去掉分隔符并转为大写)
 */
export function normalizeDvdid(id: string): string {
  if (!id) return "";
  return id.replace(/[-_\s]/g, "").toUpperCase();
}

/**
 * 构造用于严格匹配番号的正则表达式
 * 能够精确区分 IPX-100 与 IPX-1001、SOE-1 与 SOE-10，支持连字符/空格/下划线变体及前导零容错
 */
export function buildDvdidMatcher(dvdid: string): RegExp {
  const clean = dvdid.trim().toUpperCase();

  // 1. 匹配常见番号：前缀字符 + 分隔符/空格 + 数字 (如 IPX-100, FC2-PPV-123456, T28-557, 012717-472)
  const match = clean.match(/^(.*?)[\s_-]*0*(\d+)$/i);
  if (match) {
    const rawPrefix = match[1];
    const num = match[2];
    const strippedNum = num.replace(/^0+/, "") || "0";

    let prefixPattern = rawPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    // 对 FC2 / FC2-PPV 双向归一化支持
    if (/^FC2(?:[-_\s]*PPV)?$/i.test(rawPrefix)) {
      prefixPattern = "FC2(?:[-_\\s]*PPV)?";
    }

    // 前置断言 (?<![A-Z0-9])：前面不能紧跟字母/数字，防止 TIPX-100 前缀粘连
    // 后置断言 (?![0-9])：数字后绝不能紧跟数字，彻底解决 IPX-100 误匹配 IPX-1001、SOE-1 误匹配 SOE-10 等问题
    return new RegExp(`(?<![A-Z0-9])${prefixPattern}[-_\\s]*0*${strippedNum}(?![0-9])`, "i");
  }

  // 2. 兜底匹配：转义后严格匹配单词边界
  const escaped = clean.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`, "i");
}

/**
 * 判断目标文本中是否包含且精准匹配目标番号
 */
export function isExactDvdidMatch(targetDvdid: string, text: string): boolean {
  if (!targetDvdid || !text) return false;
  const matcher = buildDvdidMatcher(targetDvdid);
  return matcher.test(text);
}

/**
 * 统计文本中 CJK 汉字（\u4E00-\u9FFF）的数量
 */
export function countHanzi(text: string): number {
  if (!text) return 0;
  const matches = text.match(/[\u4E00-\u9FFF]/g);
  return matches ? matches.length : 0;
}

/**
 * 判断文本是否主要为中文（包含 CJK 汉字，且完全不包含日文平假名）
 */
export function isChineseText(text: string): boolean {
  if (!text) return false;
  const hasHanzi = /[\u4E00-\u9FFF]/.test(text);
  const hasHiragana = /[\u3040-\u309F]/.test(text);
  return hasHanzi && !hasHiragana;
}

/**
 * 从标题中安全剥离目标番号前缀（包括括号等包装符号）
 */
export function cleanDvdidPrefix(title: string, dvdid: string): string {
  if (!title) return "";
  const clean = dvdid.trim();
  const match = clean.match(/^(.*?)[\s_-]*0*(\d+)$/i);
  if (match) {
    const rawPrefix = match[1];
    const num = match[2];
    const strippedNum = num.replace(/^0+/, "") || "0";
    let prefixPattern = rawPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    if (/^FC2(?:[-_\s]*PPV)?$/i.test(rawPrefix)) {
      prefixPattern = "FC2(?:[-_\\s]*PPV)?";
    }
    const pattern = new RegExp(
      `^\\s*[\\[【(]?\\s*${prefixPattern}[-_\\s]*0*${strippedNum}\\s*[\\]】)]?\\s*`,
      "i"
    );
    return title.replace(pattern, "").trim();
  }
  const escaped = clean.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const pattern = new RegExp(`^\\s*[\\[【(]?\\s*${escaped}\\s*[\\]】)]?\\s*`, "i");
  return title.replace(pattern, "").trim();
}

/**
 * 校验提取出的文本是否为有效标题（排除空值、纯数字、纯标点符号/空白等脏数据）
 */
export function isValidTitle(text: string | undefined | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  // 必须包含非空白、非数字、非标点/符号的实质字符
  return /[^\d\s\p{P}\p{S}]/u.test(trimmed);
}

export type DetectedLanguage = "zh" | "ja" | "en" | "num" | "invalid";

/**
 * 语言感知器：识别文本的语言特征
 * - invalid: 空串、长度 < 2、纯标点符号/空白
 * - num: 纯数字 (如 "42", "117134")
 * - ja: 日文假名 (平假名或片假名) 统计 >= 2，或包含假名且字数较短
 * - en: 无假名、无汉字，且英文字母 >= 2
 * - zh: 无假名，且 CJK 汉字数 >= 2
 */
export function detectTextLanguage(text: string | undefined | null): DetectedLanguage {
  if (!text) return "invalid";
  const trimmed = text.trim();
  if (trimmed.length < 2) return "invalid";

  // 纯标点符号/空白/控制符
  if (!/[^\s\p{P}\p{S}]/u.test(trimmed)) {
    return "invalid";
  }

  // 纯数字
  if (/^\d+$/.test(trimmed)) {
    return "num";
  }

  // 假名统计 (平假名 \u3040-\u309F, 片假名 \u30A0-\u30FF)
  const kanaMatches = trimmed.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
  const kanaCount = kanaMatches ? kanaMatches.length : 0;
  if (kanaCount >= 2 || (kanaCount >= 1 && trimmed.length <= 10) || kanaCount > 0) {
    return "ja";
  }

  // 汉字统计 (CJK 统一表意文字)
  const hanziMatches = trimmed.match(/[\u4E00-\u9FFF]/g);
  const hanziCount = hanziMatches ? hanziMatches.length : 0;

  // 中文：无假名且 CJK 汉字数 >= 2
  if (kanaCount === 0 && hanziCount >= 2) {
    return "zh";
  }

  // 英文：无假名、无汉字且英文字母 >= 2
  const latinMatches = trimmed.match(/[a-zA-Z]/g);
  const latinCount = latinMatches ? latinMatches.length : 0;
  if (kanaCount === 0 && hanziCount === 0 && latinCount >= 2) {
    return "en";
  }

  return "invalid";
}
