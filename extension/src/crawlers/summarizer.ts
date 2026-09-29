/**
 * 多源数据汇总、水印降级策略、尾部女优清洗与语言感知流水线
 */

import { MovieInfo, AttributedCover } from "./types";
import { isValidTitle, detectTextLanguage } from "./dvdid";
import {
  DimensionRoutingConfig,
  SlotValidators,
  resolveActiveRoute,
  resolveSlot,
} from "./dimensionSlots";

/**
 * 寻找并移除标题尾部的女优名
 */
export function removeTrailingActorName(title: string, actors: string[]): string {
  if (!title || !actors || actors.length === 0) return title;
  const delimiters = "-xX &·,;　＆・，；";
  const escapedActors = actors
    .filter(Boolean)
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (escapedActors.length === 0) return title;

  // 转义正则字符集内的 '-' 和 ']'
  const escapedDelims = delimiters.replace(/[-[\]]/g, "\\$&");
  const pattern = new RegExp(
    `^(.*?)(?:[${escapedDelims}]{1,3}(?:${escapedActors.join("|")}))+$`,
    "u"
  );
  const match = title.match(pattern);
  if (!match) return title;
  const cleaned = match[1].trim();
  return cleaned || title;
}

/**
 * 清洗女优名称，剥离括号内的别名/旧艺名/译名 (如 "めぐり（藤浦めぐ）" -> "めぐり")
 */
export function cleanActressName(name: string): string {
  if (!name) return "";
  const trimmed = name.trim();
  // 移除半角与全角圆括号、方括号及其中的别名内容
  const cleaned = trimmed.replace(/\s*[（\(［\[][^（\(［\[）\)］\]]*[）\)］\]]/g, "").trim();
  return cleaned || trimmed;
}

/**
 * 提取女优名字的所有可能变体（包含原始名称、剥离括号别名后的主名、以及提取括号内部的内容作为独立别名）
 */
export function extractActorVariants(actors: string[]): string[] {
  if (!actors || actors.length === 0) return [];
  const variants = new Set<string>();

  for (const act of actors) {
    if (!act) continue;
    const trimmed = act.trim();
    if (!trimmed) continue;

    // 1. 原始名称
    variants.add(trimmed);

    // 2. 剥离别名括号后的主名 (例如: "めぐり（藤浦めぐ）" -> "めぐり")
    const cleaned = cleanActressName(trimmed);
    if (cleaned) {
      variants.add(cleaned);
    }

    // 3. 提取括号内部的内容作为独立别名 (例如: "河北彩伽（河北彩花）" -> "河北彩花")
    const aliasMatches = trimmed.matchAll(/[（\(［\[]([^（\(［\[）\)］\]]+)[）\)］\]]/g);
    for (const m of aliasMatches) {
      const alias = m[1]?.trim();
      if (alias) {
        variants.add(alias);
      }
    }
  }

  return Array.from(variants);
}

/**
 * 对单源爬取的元数据进行标题尾部女优名清洗 (第 1 重：单源就地自清洗)
 */
export function cleanMovieInfoTitle<T extends Partial<MovieInfo>>(info: T): T {
  if (!info.actress || info.actress.length === 0) return info;
  const variants = extractActorVariants(info.actress);
  if (variants.length === 0) return info;

  if (info.title) {
    const cleaned = removeTrailingActorName(info.title, variants);
    if (isValidTitle(cleaned)) {
      info.title = cleaned;
    }
  }
  if (info.ori_title) {
    const cleaned = removeTrailingActorName(info.ori_title, variants);
    if (isValidTitle(cleaned)) {
      info.ori_title = cleaned;
    }
  }
  return info;
}

export interface SummarizerOptions {
  hardSub?: boolean;
  uncensored?: boolean;
  useJavdbCover?: "fallback" | "never";
  cleanActressAlias?: boolean;
  dimensionRouting?: Partial<DimensionRoutingConfig>; // 第一级：各插槽专属路由
  enabledCrawlers?: string[]; // 已启用站点序列（同时充当动态 priorityOrder）
}

// 现代规范签名
export function summarizeMovieResults(
  siteData: Record<string, Partial<MovieInfo>>,
  options?: SummarizerOptions
): MovieInfo;

// 历史兼容重载签名 (现有 31 个单元测试与已有调用零改动兼容)
export function summarizeMovieResults(
  siteData: Record<string, Partial<MovieInfo>>,
  priorityOrder?: string[],
  flags?: SummarizerOptions
): MovieInfo;

// 统一实现层：参数归一化与动态兜底序列推导
export function summarizeMovieResults(
  siteData: Record<string, Partial<MovieInfo>>,
  priorityOrderOrOptions?: string[] | SummarizerOptions,
  legacyFlags?: SummarizerOptions
): MovieInfo {
  let flags: SummarizerOptions = {};
  let enabledCrawlers: string[] = [];

  if (Array.isArray(priorityOrderOrOptions)) {
    // 兼容历史调用: summarizeMovieResults(siteData, ["javbus", "javdb"], flags)
    enabledCrawlers = priorityOrderOrOptions;
    flags = legacyFlags || {};
  } else if (priorityOrderOrOptions && typeof priorityOrderOrOptions === "object") {
    // 新标准调用: summarizeMovieResults(siteData, { dimensionRouting, enabledCrawlers, ... })
    flags = priorityOrderOrOptions;
    if (flags.enabledCrawlers && Array.isArray(flags.enabledCrawlers) && flags.enabledCrawlers.length > 0) {
      enabledCrawlers = flags.enabledCrawlers;
    }
  }

  // 极限自适应兜底：若外部未提供启用列表，自动以实际抓到数据的站点为基准序列，杜绝写死常量！
  if (enabledCrawlers.length === 0) {
    enabledCrawlers = Object.keys(siteData);
  }

  // 动态基准兜底顺位 priorityOrder（严格与 enabledCrawlers 同步）
  const priorityOrder = enabledCrawlers;
  const routingConfig = flags.dimensionRouting;

  const merged: Partial<MovieInfo> = {
    covers: [],
    big_covers: [],
    genre: [],
    genre_id: [],
    actress: [],
    preview_pics: [],
    magnet: [],
  };

  // -------------------------------------------------------------
  // 1. 标题与原名路由（语言感知与纯数字共识仲裁）
  // -------------------------------------------------------------
  // 统计所有纯数字标题出现的次数，实现多源共识仲裁
  const numericTitleCounts: Record<string, number> = {};
  for (const site of Object.keys(siteData)) {
    const data = siteData[site];
    if (!data) continue;
    for (const t of [data.title, data.ori_title]) {
      if (t && detectTextLanguage(t) === "num") {
        const trimmed = t.trim();
        numericTitleCounts[trimmed] = (numericTitleCounts[trimmed] || 0) + 1;
      }
    }
  }

  // 校验标题是否在当前多源环境下有效
  const isCandidateTitleValid = (t: string | undefined | null): boolean => {
    if (!t) return false;
    const trimmed = t.trim();
    if (trimmed.length < 2) return false;
    const lang = detectTextLanguage(trimmed);
    if (lang === "invalid") return false;
    if (lang === "num") {
      // 纯数字标题必须至少有 2 家数据源共识达成
      return (numericTitleCounts[trimmed] || 0) >= 2;
    }
    return isValidTitle(trimmed);
  };

  const chineseRoute = resolveActiveRoute("chinese", routingConfig, priorityOrder);
  const metaRoute = resolveActiveRoute("meta", routingConfig, priorityOrder);

  // 候选池检索：优先提取自然中文标题（AirAV 等，遵循 chineseRoute 顺位）
  let bestZhTitle: string | undefined;
  let bestZhTitleTranslated: boolean | undefined;

  for (const site of chineseRoute) {
    const data = siteData[site];
    if (!data?.title) continue;
    if (isCandidateTitleValid(data.title) && detectTextLanguage(data.title) === "zh") {
      bestZhTitle = data.title;
      bestZhTitleTranslated = data.title_translated;
      break;
    }
  }

  // 候选池检索：优先提取日文/英文原名（遵循 metaRoute 顺位）
  let bestOrigTitle: string | undefined;
  for (const site of metaRoute) {
    const data = siteData[site];
    if (!data) continue;
    // 优先检查 ori_title
    if (data.ori_title && isCandidateTitleValid(data.ori_title)) {
      const lang = detectTextLanguage(data.ori_title);
      if (lang === "ja" || lang === "en" || lang === "num") {
        bestOrigTitle = data.ori_title;
        break;
      }
    }
    // 其次检查 title
    if (data.title && isCandidateTitleValid(data.title)) {
      const lang = detectTextLanguage(data.title);
      if (lang === "ja" || lang === "en" || lang === "num") {
        bestOrigTitle = data.title;
        break;
      }
    }
  }

  if (bestZhTitle) {
    merged.title = bestZhTitle;
    if (bestZhTitleTranslated !== undefined) {
      merged.title_translated = bestZhTitleTranslated;
    }
    if (bestOrigTitle && detectTextLanguage(bestOrigTitle) !== "zh") {
      merged.ori_title = bestOrigTitle;
    }
  } else if (bestOrigTitle) {
    // 没有获取到中文标题时，先将日文/英文原名作为 title 占位（以便后续机翻），同时作为 ori_title
    merged.title = bestOrigTitle;
    if (detectTextLanguage(bestOrigTitle) !== "zh") {
      merged.ori_title = bestOrigTitle;
    }
  } else {
    // 极端边缘未知语言标题兜底：直接沿 priorityOrder 遍历首个满足基础校验的标题
    for (const site of priorityOrder) {
      const data = siteData[site];
      if (data?.title && isCandidateTitleValid(data.title)) {
        merged.title = data.title;
        if (data.title_translated !== undefined) merged.title_translated = data.title_translated;
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // 2. 剧情简介（优先遵循 chineseRoute 顺位）
  // -------------------------------------------------------------
  for (const siteId of chineseRoute) {
    const p = siteData[siteId]?.plot;
    if (p && p.trim().length >= 2) {
      merged.plot = p;
      merged.plot_translated = siteData[siteId]?.plot_translated;
      break;
    }
  }
  if (!merged.plot) {
    for (const siteId of priorityOrder) {
      const p = siteData[siteId]?.plot;
      if (p && p.trim().length >= 2) {
        merged.plot = p;
        merged.plot_translated = siteData[siteId]?.plot_translated;
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // 3. 剧照预览图（单源整套独占：遵循 previewsRoute 顺位）
  // -------------------------------------------------------------
  const previewsRoute = resolveActiveRoute("previews", routingConfig, priorityOrder);
  const { value: selectedPreviews, source: previewsSource } = resolveSlot(
    siteData,
    previewsRoute,
    (d) => d.preview_pics,
    SlotValidators.nonEmptyArray
  );
  if (selectedPreviews && selectedPreviews.length > 0) {
    merged.preview_pics = [...selectedPreviews];
    merged.preview_source = previewsSource;
  }

  // -------------------------------------------------------------
  // 4. 分类体系（原子提取与多源保底：遵循 genreRoute 顺位）
  // -------------------------------------------------------------
  const genreRoute = resolveActiveRoute("genre", routingConfig, priorityOrder);
  const { value: selectedGenres, source: genreSource } = resolveSlot(
    siteData,
    genreRoute,
    (d) => d.genre,
    SlotValidators.nonEmptyArray
  );
  if (selectedGenres && genreSource) {
    merged.genre = [...selectedGenres];
    merged.genre_id = [...(siteData[genreSource]?.genre_id || [])];
  }

  // -------------------------------------------------------------
  // 5. 出演女优（单源整套独占瀑布降级：遵循 actressRoute 顺位）
  // -------------------------------------------------------------
  const shouldCleanActress = flags.cleanActressAlias ?? true;
  const actressRoute = resolveActiveRoute("actress", routingConfig, priorityOrder);
  const { value: selectedActors } = resolveSlot(
    siteData,
    actressRoute,
    (d) => d.actress,
    SlotValidators.nonEmptyArray
  );

  let rawSelectedActors: string[] = [];
  if (selectedActors && selectedActors.length > 0) {
    rawSelectedActors = [...selectedActors];
    const cleanActors: string[] = [];
    for (const act of selectedActors) {
      const processed = shouldCleanActress ? cleanActressName(act) : act.trim();
      if (processed && !cleanActors.includes(processed)) {
        cleanActors.push(processed);
      }
    }
    if (cleanActors.length > 0) {
      merged.actress = cleanActors;
    }
  }

  // -------------------------------------------------------------
  // 6. 其他基础字段依次继承（发售基础元数据逐字段降级补全）
  // -------------------------------------------------------------
  for (const site of metaRoute) {
    const data = siteData[site];
    if (!data) continue;

    if (!merged.dvdid && data.dvdid) merged.dvdid = data.dvdid;
    if (!merged.cid && data.cid) merged.cid = data.cid;
    if (!merged.url && data.url) merged.url = data.url;
    if (!merged.publish_date && data.publish_date) merged.publish_date = data.publish_date;
    if (!merged.duration && data.duration) merged.duration = data.duration;
    if (!merged.director && data.director) merged.director = data.director;
    if (!merged.producer && data.producer) merged.producer = data.producer;
    if (!merged.publisher && data.publisher) merged.publisher = data.publisher;
    if (!merged.serial && data.serial) merged.serial = data.serial;
    if (!merged.score && data.score) merged.score = data.score;
    if (!merged.preview_video && data.preview_video) merged.preview_video = data.preview_video;
    if (merged.uncensored === undefined && data.uncensored !== undefined) {
      merged.uncensored = data.uncensored;
    }

    // 磁链全源去重累加合并
    if (data.magnet && Array.isArray(data.magnet)) {
      for (const m of data.magnet) {
        if (!merged.magnet!.includes(m)) merged.magnet!.push(m);
      }
    }
  }

  // -------------------------------------------------------------
  // 7. 封面图与大图梯队裁决
  // -------------------------------------------------------------
  const candidateCovers: string[] = [];
  const candidateBigCovers: string[] = [];
  const candidateCoversAttributed: AttributedCover[] = [];

  const addCoversFromData = (data: Partial<MovieInfo> | undefined, siteId: string) => {
    if (!data) return;
    if (data.big_cover && !candidateBigCovers.includes(data.big_cover)) {
      candidateBigCovers.push(data.big_cover);
      if (!candidateCoversAttributed.some((c) => c.url === data.big_cover)) {
        candidateCoversAttributed.push({ url: data.big_cover, sourceSite: siteId, isBig: true });
      }
    }
    if (data.big_covers) {
      for (const bc of data.big_covers) {
        if (bc && !candidateBigCovers.includes(bc)) {
          candidateBigCovers.push(bc);
          if (!candidateCoversAttributed.some((c) => c.url === bc)) {
            candidateCoversAttributed.push({ url: bc, sourceSite: siteId, isBig: true });
          }
        }
      }
    }
    if (data.cover && !candidateCovers.includes(data.cover)) {
      candidateCovers.push(data.cover);
      if (!candidateCoversAttributed.some((c) => c.url === data.cover)) {
        candidateCoversAttributed.push({ url: data.cover, sourceSite: siteId, isBig: false });
      }
    }
    if (data.covers) {
      for (const c of data.covers) {
        if (c && !candidateCovers.includes(c)) {
          candidateCovers.push(c);
          if (!candidateCoversAttributed.some((item) => item.url === c)) {
            candidateCoversAttributed.push({ url: c, sourceSite: siteId, isBig: false });
          }
        }
      }
    }
  };

  const coverRoute = resolveActiveRoute("cover", routingConfig, priorityOrder);
  const useJavdbCover = flags.useJavdbCover ?? "fallback";

  // 若配置显式指定 never，拥有最高一票否决权，强制从 coverRoute 中过滤掉 javdb
  const effectiveCoverRoute =
    useJavdbCover === "never"
      ? coverRoute.filter((s) => s !== "javdb")
      : coverRoute;

  for (const site of effectiveCoverRoute) {
    addCoversFromData(siteData[site], site);
  }

  merged.covers = candidateCovers;
  merged.big_covers = candidateBigCovers;
  merged.candidate_covers_attributed = candidateCoversAttributed;
  merged.cover =
    candidateCovers.length > 0
      ? candidateCovers[0]
      : candidateBigCovers.length > 0
      ? candidateBigCovers[0]
      : "";
  merged.big_cover =
    candidateBigCovers.length > 0
      ? candidateBigCovers[0]
      : (merged.cover || "");

  if (merged.cover && !candidateCovers.includes(merged.cover)) {
    candidateCovers.push(merged.cover);
  }

  // -------------------------------------------------------------
  // 8. 必填字段校验
  // -------------------------------------------------------------
  if (!merged.title) {
    throw new Error(`刮削数据不完整: 缺少必填字段 (title: false)`);
  }
  if (!merged.cover && useJavdbCover !== "never") {
    throw new Error(`刮削数据不完整: 缺少必填字段 (cover: false)`);
  }

  // -------------------------------------------------------------
  // 9. 清洗标题尾部女优名 (第 2 重：跨源全量演员变体池兜底)
  // -------------------------------------------------------------
  const allActorVariants = new Set<string>();

  // 1) 收集所有爬虫源提供的女优名及其变体
  for (const site of Object.keys(siteData)) {
    const data = siteData[site];
    if (data?.actress && Array.isArray(data.actress)) {
      for (const act of extractActorVariants(data.actress)) {
        allActorVariants.add(act);
      }
    }
  }

  // 2) 收集最终选中的演员列表及其变体
  if (merged.actress && Array.isArray(merged.actress)) {
    for (const act of extractActorVariants(merged.actress)) {
      allActorVariants.add(act);
    }
  }

  // 3) 收集原始选中的 rawSelectedActors
  for (const act of extractActorVariants(rawSelectedActors)) {
    allActorVariants.add(act);
  }

  const actorVariantsList = Array.from(allActorVariants);
  if (merged.title) {
    const cleaned = removeTrailingActorName(merged.title, actorVariantsList);
    if (isValidTitle(cleaned)) {
      merged.title = cleaned;
    }
  }
  if (merged.ori_title) {
    const cleaned = removeTrailingActorName(merged.ori_title, actorVariantsList);
    if (isValidTitle(cleaned)) {
      merged.ori_title = cleaned;
    }
  }

  // -------------------------------------------------------------
  // 10. 额外标签注入 (-C: 内嵌字幕, -U: 无码流出/破解)
  // -------------------------------------------------------------
  if (flags.hardSub) {
    if (!merged.genre!.includes("内嵌字幕")) {
      merged.genre!.push("内嵌字幕");
    }
  }
  if (flags.uncensored || merged.uncensored) {
    merged.uncensored = true;
    if (!merged.genre!.includes("无码流出/破解") && !merged.genre!.includes("无码")) {
      merged.genre!.push("无码流出/破解");
    }
  }

  return merged as MovieInfo;
}
