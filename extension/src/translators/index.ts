/**
 * JavSP 前端翻译子系统工厂与调度中枢
 */

import { MovieInfo } from "../crawlers/types";
import { isChineseText } from "../crawlers/dvdid";
import {
  BaiduEngineConfig,
  BingEngineConfig,
  ClaudeEngineConfig,
  GoogleEngineConfig,
  ITranslator,
  OpenAIEngineConfig,
  TranslatorConfig,
} from "./types";
import { GoogleTranslator } from "./google";
import { BingTranslator } from "./bing";
import { BaiduTranslator } from "./baidu";
import { ClaudeTranslator } from "./claude";
import { OpenAITranslator } from "./openai";

export * from "./types";
export * from "./google";
export * from "./bing";
export * from "./baidu";
export * from "./claude";
export * from "./openai";

/**
 * 根据配置实例化对应的翻译引擎
 */
export function createTranslator(config?: TranslatorConfig | null): ITranslator | null {
  if (!config || !config.engine) {
    return null;
  }

  const engine = config.engine;
  const name = typeof engine === "string" ? engine : engine.name;
  const engineObj: any = typeof engine === "object" ? { ...engine } : { name: engine };
  const globalTargetLang = config.target_lang || (config as any).target_language || "zh-CN";
  if (!engineObj.targetLang) {
    engineObj.targetLang = globalTargetLang;
  }

  switch (name) {
    case "google":
      return new GoogleTranslator(engineObj as GoogleEngineConfig);
    case "bing":
      return new BingTranslator(engineObj as BingEngineConfig);
    case "baidu":
      return new BaiduTranslator(engineObj as BaiduEngineConfig);
    case "claude":
      return new ClaudeTranslator(engineObj as ClaudeEngineConfig);
    case "openai":
      return new OpenAITranslator(engineObj as OpenAIEngineConfig);
    default:
      console.warn(`[Translator] 未知的翻译引擎类型: ${name}`);
      return null;
  }
}

/**
 * 依据配置翻译 MovieInfo 中的标题与简介
 *
 * @param info 待处理的 MovieInfo 元数据对象（将就地更新）
 * @param config 翻译配置（引擎与翻译字段开关）
 * @param onLog 可选的日志回调函数
 * @returns 是否全部翻译成功（若某字段翻译失败则返回 false，保留原内容）
 */
export async function translateMovieInfo(
  info: MovieInfo,
  config: TranslatorConfig,
  onLog?: (level: "info" | "step" | "warn" | "error", message: string) => void
): Promise<boolean> {
  const translator = createTranslator(config);
  if (!translator) {
    return true; // 未启用翻译引擎，直接通过
  }

  const globalTargetLang = (
    config.target_lang ||
    (config as any).target_language ||
    "zh-CN"
  ).toLowerCase();
  const isTargetChinese =
    globalTargetLang.startsWith("zh") ||
    globalTargetLang === "cht" ||
    globalTargetLang === "chs";

  // 1. 翻译标题
  if (info.title && config.fields?.title && !info.title_translated) {
    if (isTargetChinese && isChineseText(info.title)) {
      onLog?.(
        "info",
        `标题已是中文 ("${info.title.slice(0, 30)}...")，且目标语言为中文，自动跳过标题翻译`
      );
      info.title_translated = true;
    } else {
      onLog?.("step", `正在使用 ${translator.name} 翻译标题: "${info.title.slice(0, 30)}..."`);
      const res = await translator.translate(info.title, info.actress || []);
      if (res.trans) {
        if (!info.ori_title) {
          info.ori_title = info.title;
        }
        info.title = res.trans;
        info.title_translated = true;
        if (res.orig_break && res.orig_break.length > 0) {
          info.ori_title_break = res.orig_break;
        }
        if (res.trans_break && res.trans_break.length > 0) {
          info.title_break = res.trans_break;
        }
        onLog?.("info", `标题翻译成功: "${info.title}"`);
      } else {
        const err = res.error || "未知翻译错误";
        onLog?.("error", `标题翻译失败: ${err}`);
        return false;
      }
    }
  }

  // 2. 翻译剧情简介
  if (info.plot && config.fields?.plot && !info.plot_translated) {
    if (isTargetChinese && isChineseText(info.plot)) {
      onLog?.(
        "info",
        `剧情简介已是中文 (${info.plot.length} 字)，且目标语言为中文，自动跳过简介翻译`
      );
      info.plot_translated = true;
    } else {
      onLog?.("step", `正在使用 ${translator.name} 翻译剧情简介...`);
      const res = await translator.translate(info.plot, info.actress || []);
      if (res.trans) {
        if (!info.ori_plot) {
          info.ori_plot = info.plot;
        }
        info.plot = res.trans;
        info.plot_translated = true;
        onLog?.("info", `剧情简介翻译成功 (${res.trans.length} 字)`);
      } else {
        const err = res.error || "未知翻译错误";
        onLog?.("error", `剧情简介翻译失败: ${err}`);
        return false;
      }
    }
  }

  return true;
}
