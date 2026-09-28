/**
 * 多源数据汇总、水印降级策略、尾部女优清洗与语言感知流水线
 */

import { MovieInfo } from "./types";
import { isValidTitle, detectTextLanguage } from "./dvdid";

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
}

/**
 * 多源清洗与合并汇总器 (目标驱动流水线)
 */
export function summarizeMovieResults(
  siteData: Record<string, Partial<MovieInfo>>,
  priorityOrder: string[] = ["javbus", "javdb", "airav"],
  flags: SummarizerOptions = {}
): MovieInfo {
  const merged: Partial<MovieInfo> = {
    covers: [],
    big_covers: [],
    genre: [],
    genre_id: [],
    actress: [],
    preview_pics: [],
    magnet: [],
  };

  const useJavdbCover = flags.useJavdbCover ?? "fallback";
  const javdbData = siteData["javdb"];

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

  // 候选池检索：优先提取自然中文标题（AirAV 等）
  let bestZhTitle: string | undefined;
  let bestZhTitleTranslated: boolean | undefined;

  // 按照站点顺序（AirAV 优先，然后按照优先级列表）寻找中文标题
  const zhSearchOrder = [
    ...(siteData["airav"] ? ["airav"] : []),
    ...priorityOrder.filter((s) => s !== "airav"),
  ];
  for (const site of zhSearchOrder) {
    const data = siteData[site];
    if (!data?.title) continue;
    if (isCandidateTitleValid(data.title) && detectTextLanguage(data.title) === "zh") {
      bestZhTitle = data.title;
      bestZhTitleTranslated = data.title_translated;
      break;
    }
  }

  // 候选池检索：优先提取日文/英文原名（JavBus 优先，其次 JavDB 等）
  let bestOrigTitle: string | undefined;
  const origSearchOrder = [
    ...(siteData["javbus"] ? ["javbus"] : []),
    ...priorityOrder.filter((s) => s !== "javbus"),
  ];

  for (const site of origSearchOrder) {
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
    // 兜底：若均未命中语言规则，按 priorityOrder 选取第一个有效标题
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
  // 2. 剧情简介（AirAV 中文优先）
  // -------------------------------------------------------------
  if (siteData["airav"]?.plot && siteData["airav"].plot.trim().length >= 2) {
    merged.plot = siteData["airav"].plot;
    if (siteData["airav"].plot_translated !== undefined) {
      merged.plot_translated = siteData["airav"].plot_translated;
    }
  } else {
    for (const site of priorityOrder) {
      const data = siteData[site];
      if (data?.plot && data.plot.trim().length >= 2) {
        merged.plot = data.plot;
        if (data.plot_translated !== undefined) {
          merged.plot_translated = data.plot_translated;
        }
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // 3. 剧照预览图（单源整套独占：JavBus > JavDB > 其他）
  // -------------------------------------------------------------
  const previewSourceOrder = [
    ...(siteData["javbus"] ? ["javbus"] : []),
    ...(siteData["javdb"] ? ["javdb"] : []),
    ...priorityOrder.filter((s) => s !== "javbus" && s !== "javdb"),
  ];
  for (const site of previewSourceOrder) {
    const data = siteData[site];
    if (data?.preview_pics && data.preview_pics.length > 0) {
      merged.preview_pics = [...data.preview_pics];
      break;
    }
  }

  // -------------------------------------------------------------
  // 4. 分类体系（JavDB 单源独占霸权）
  // -------------------------------------------------------------
  if (javdbData?.genre && javdbData.genre.length > 0) {
    merged.genre = [...javdbData.genre];
    merged.genre_id = [...(javdbData.genre_id || [])];
  } else {
    for (const site of priorityOrder) {
      const data = siteData[site];
      if (data?.genre && data.genre.length > 0) {
        merged.genre = [...data.genre];
        merged.genre_id = [...(data.genre_id || [])];
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // 5. 评分（JavDB 社区独占）
  // -------------------------------------------------------------
  if (javdbData?.score) {
    merged.score = javdbData.score;
  } else {
    for (const site of priorityOrder) {
      if (siteData[site]?.score) {
        merged.score = siteData[site]!.score;
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // 6. 其他基础字段依次继承（官方基石物料优先：JavBus > 其他辅助数据源）
  // -------------------------------------------------------------
  const baseMetaOrder = [
    ...(siteData["javbus"] ? ["javbus"] : []),
    ...priorityOrder.filter((s) => s !== "javbus"),
  ];
  for (const site of baseMetaOrder) {
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
    if (!merged.preview_video && data.preview_video) merged.preview_video = data.preview_video;
    if (merged.uncensored === undefined && data.uncensored !== undefined) {
      merged.uncensored = data.uncensored;
    }

    // 磁链合并
    if (data.magnet) {
      for (const m of data.magnet) {
        if (!merged.magnet!.includes(m)) merged.magnet!.push(m);
      }
    }
  }

  // -------------------------------------------------------------
  // 6.1 女优名与头像（单源整套独占采纳：JavBus > JavDB > 其他站点按 priorityOrder）
  // 严禁跨站点合并演员列表求并集，否则不同站点间的中日双语译名会导致同一演员重复添加
  // -------------------------------------------------------------
  const shouldCleanActress = flags.cleanActressAlias ?? true;
  const actressSourceOrder = [
    ...(siteData["javbus"]?.actress?.length ? ["javbus"] : []),
    ...(siteData["javdb"]?.actress?.length ? ["javdb"] : []),
    ...priorityOrder.filter((s) => s !== "javbus" && s !== "javdb"),
  ];
  let rawSelectedActors: string[] = [];
  for (const site of actressSourceOrder) {
    const data = siteData[site];
    if (data?.actress && data.actress.length > 0) {
      rawSelectedActors = [...data.actress];
      const cleanActors: string[] = [];
      for (const act of data.actress) {
        const processed = shouldCleanActress ? cleanActressName(act) : act.trim();
        if (processed && !cleanActors.includes(processed)) {
          cleanActors.push(processed);
        }
      }
      if (cleanActors.length > 0) {
        merged.actress = cleanActors;
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // 7. 封面图与大图梯队裁决 (JavBus基石 > AirAV增强 > 非JavDB > JavDB保底/禁用)
  // -------------------------------------------------------------
  const candidateCovers: string[] = [];
  const candidateBigCovers: string[] = [];

  const addCoversFromData = (data: Partial<MovieInfo> | undefined) => {
    if (!data) return;
    if (data.big_cover && !candidateBigCovers.includes(data.big_cover)) {
      candidateBigCovers.push(data.big_cover);
    }
    if (data.big_covers) {
      for (const bc of data.big_covers) {
        if (bc && !candidateBigCovers.includes(bc)) candidateBigCovers.push(bc);
      }
    }
    if (data.cover && !candidateCovers.includes(data.cover)) {
      candidateCovers.push(data.cover);
    }
    if (data.covers) {
      for (const c of data.covers) {
        if (c && !candidateCovers.includes(c)) candidateCovers.push(c);
      }
    }
  };

  // 严格执行目标驱动梯队：JavBus(官方高清展开图基石) > AirAV(无水印封面增强) > 其余非JavDB站点 > JavDB(水印图保底/禁用)
  const coverSourceOrder = [
    ...(siteData["javbus"] ? ["javbus"] : []),
    ...(siteData["airav"] ? ["airav"] : []),
    ...priorityOrder.filter((s) => s !== "javbus" && s !== "airav" && s !== "javdb"),
  ];
  for (const site of coverSourceOrder) {
    addCoversFromData(siteData[site]);
  }

  // 处理 JavDB 封面
  if (useJavdbCover !== "never" && javdbData) {
    addCoversFromData(javdbData);
  }

  merged.covers = candidateCovers;
  merged.big_covers = candidateBigCovers;
  merged.cover = candidateCovers.length > 0 ? candidateCovers[0] : "";
  merged.big_cover =
    candidateBigCovers.length > 0 ? candidateBigCovers[0] : (merged.cover || "");

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
