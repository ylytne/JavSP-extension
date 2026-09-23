/**
 * AirAV (https://airav.io) 爬虫实现
 *
 * 针对现代 AirAV 架构，基于真实页面 SSR HTML 进行 DOM 解析抓取。
 * 通过 /search_result?kw={番号} 检索，获取 /video?hid=... 详情页，
 * 并提取番号、标题、高清大图封面、简介、女优、标签、发行商以及 m3u8 预览流。
 */

import {
  BaseCrawler,
  MovieNotFoundError,
  unescapeHtml,
  isExactDvdidMatch,
  countHanzi,
  isChineseText,
  cleanDvdidPrefix,
  isValidTitle,
} from "./base";
import { MovieInfo, RequestRetryConfig } from "./types";

export interface AirAVCandidate {
  href: string;
  title: string;
  cleanTitle: string;
  score: number;
  isChinese: boolean;
  hasHiragana: boolean;
  hasKana: boolean;
  hanziCount: number;
}

export class AirAVCrawler extends BaseCrawler {
  name = "airav";
  baseUrl: string;

  constructor(baseUrl = "https://airav.io") {
    super();
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  /**
   * 在 AirAV 上搜索指定番号，返回按匹配度与汉字权重优选的候选列表，并捕获日文原名
   */
  async searchCandidates(
    dvdid: string,
    config?: RequestRetryConfig
  ): Promise<{ candidates: AirAVCandidate[]; detectedOriTitle?: string }> {
    const searchUrl = `${this.baseUrl}/search_result?kw=${encodeURIComponent(dvdid)}`;
    const doc = await this.fetchDocument(searchUrl, config);

    // 寻找搜索结果卡片：优先匹配 .oneVideo，避免多重匹配导致卡片重复
    let videoCards = doc.querySelectorAll(".oneVideo");
    if (!videoCards || videoCards.length === 0) {
      videoCards = doc.querySelectorAll(".card");
    }
    if (!videoCards || videoCards.length === 0) {
      throw new MovieNotFoundError(this.name, dvdid);
    }

    const candidates: AirAVCandidate[] = [];

    videoCards.forEach((card) => {
      const a = card.querySelector<HTMLAnchorElement>("a[href*='/video']");
      // 标题必须定位到具体的标题标签（h5、.card-title 等），严禁匹配包含浏览量/点赞数 footer 的外层容器（如 .oneVideo-body）
      const titleEl = card.querySelector("h5, .card-title, a[href*='/video'] h5");
      const rawTitle = titleEl?.textContent?.replace(/\s+/g, " ").trim() || "";
      const href = a?.getAttribute("href");

      if (href && rawTitle) {
        // 1. 严格番号断言匹配：杜绝 IPX-100 误匹配 IPX-1001、SOE-1 误匹配 SOE-10 等边缘情况
        const isMatch = isExactDvdidMatch(dvdid, rawTitle);
        let score = 0;
        if (!isMatch) {
          // 不匹配目标番号直接扣除 100 分（后续 score > 0 彻底剔除）
          score = -100;
        } else {
          // 匹配目标番号赋予基础分 100
          score = 100;
        }

        // 2. 统计 CJK 汉字数量（每个汉字 +1 分，中文本地化条目汉字数自然最高）
        const hanzi = countHanzi(rawTitle);
        score += hanzi;

        // 3. 卡片若包含“中文字幕”或“中文”标签，额外加 5 分
        if (card.textContent?.includes("中文字幕") || card.textContent?.includes("中文")) {
          score += 5;
        }

        // 4. 清洗番号前缀与语言特征判定（排除纯数字、纯符号等脏数据）
        const rawClean = cleanDvdidPrefix(rawTitle, dvdid);
        const clean = isValidTitle(rawClean) ? rawClean : "";
        const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(clean);
        const hasHiragana = /[\u3040-\u309F]/.test(clean);
        const isChinese = isChineseText(clean);

        // 仅保留有效匹配候选 (score > 0)
        if (score > 0) {
          candidates.push({
            href,
            title: rawTitle,
            cleanTitle: clean,
            score,
            isChinese,
            hasHiragana,
            hasKana,
            hanziCount: hanzi,
          });
        }
      }
    });

    if (candidates.length === 0) {
      throw new MovieNotFoundError(this.name, dvdid);
    }

    // 按得分排序，优先选择汉字数最多、权重最高的中文条目
    candidates.sort((a, b) => b.score - a.score);

    // 如果最优项是中文页面，且同批候选条目中存在含平假名/片假名且有实质片名的日文条目，将其片名提取为 ori_title
    let detectedOriTitle: string | undefined;
    if (candidates[0].isChinese && candidates.length > 1) {
      const jpCandidate = candidates.find(
        (c, idx) =>
          idx > 0 &&
          isValidTitle(c.cleanTitle) &&
          (c.hasHiragana || c.hasKana)
      );
      if (jpCandidate && isValidTitle(jpCandidate.cleanTitle)) {
        detectedOriTitle = jpCandidate.cleanTitle;
      }
    }

    return { candidates, detectedOriTitle };
  }

  /**
   * 在 AirAV 上搜索指定番号，返回匹配度最高（汉字最多）的详情页相对路径或完整 URL
   */
  async searchDetailUrl(dvdid: string, config?: RequestRetryConfig): Promise<string> {
    const { candidates } = await this.searchCandidates(dvdid, config);
    return candidates[0].href;
  }

  /**
   * 刮削指定番号的影片元数据
   */
  async scrape(dvdid: string, config?: RequestRetryConfig): Promise<Partial<MovieInfo>> {
    // 1. 通过搜索获取优选候选及日文原名
    const { candidates, detectedOriTitle } = await this.searchCandidates(dvdid, config);
    const bestCandidate = candidates[0];

    const detailPath = bestCandidate.href;
    const detailUrl = detailPath.startsWith("http")
      ? detailPath
      : `${this.baseUrl}${detailPath.startsWith("/") ? "" : "/"}${detailPath}`;

    // 2. 请求详情页并解析 DOM
    const doc = await this.fetchDocument(detailUrl, config);

    // 404 检测
    if (doc.title && (doc.title.includes("404") || doc.title.includes("Not Found"))) {
      throw new MovieNotFoundError(this.name, dvdid);
    }

    // 番号提取：优先从元数据列表提取，若无则使用搜索番号
    let exactDvdid = dvdid;
    const infoItems = doc.querySelectorAll(".info-list li, .list-group li");
    infoItems.forEach((li) => {
      const text = li.textContent || "";
      if (text.includes("番號：") || text.includes("番号：") || text.includes("番號:")) {
        const span = li.querySelector("span");
        const val = (span ? span.textContent : text.replace(/.*番[號号][：:]\s*/, "")).trim();
        if (val) exactDvdid = val;
      }
    });

    // 标题提取
    const titleEl = doc.querySelector(".video-title h1, h1");
    let rawTitle = titleEl?.textContent?.trim() || "";
    if (!rawTitle) {
      const ogTitle = doc.querySelector("meta[property='og:title']");
      rawTitle = ogTitle?.getAttribute("content")?.trim() || "";
    }
    // 剥离标题尾部的 " - airav.io" 站点标示
    rawTitle = rawTitle.replace(/\s*-\s*airav\.io\s*$/i, "").trim();
    // 剔除标题前面的番号
    let title = cleanDvdidPrefix(rawTitle, exactDvdid);
    title = unescapeHtml(title || rawTitle);
    if (!title && bestCandidate.cleanTitle) {
      title = bestCandidate.cleanTitle;
    }
    if (!isValidTitle(title)) {
      title = "";
    }

    // 封面大图提取 (og:image 或 #video_player_lazy_poster img)
    let cover = "";
    const ogImage = doc.querySelector("meta[property='og:image']");
    if (ogImage) {
      cover = ogImage.getAttribute("content")?.trim() || "";
    }
    if (!cover) {
      const posterImg = doc.querySelector<HTMLImageElement>("#video_player_lazy_poster img, .video img");
      if (posterImg) {
        cover = posterImg.getAttribute("src") || "";
      }
    }
    if (cover && !cover.startsWith("http")) {
      cover = `${this.baseUrl}${cover.startsWith("/") ? "" : "/"}${cover}`;
    }
    // 剥离可能存在的时间戳后缀
    cover = cover.replace(/\?\d+$/, "");

    // 剧情简介
    let plot: string | undefined;
    const plotEl = doc.querySelector(".video-info p, p.my-3");
    if (plotEl && plotEl.textContent?.trim()) {
      plot = unescapeHtml(plotEl.textContent.trim());
    } else {
      const ogDesc = doc.querySelector("meta[property='og:description'], meta[name='description']");
      const desc = ogDesc?.getAttribute("content")?.trim();
      if (desc && !desc.includes("線上A片永久免費觀看")) {
        plot = unescapeHtml(desc);
      }
    }

    // 发行日期提取
    let publishDate: string | undefined;
    const dateIcon = doc.querySelector(".video-item .fa-clock, .fa-clock");
    if (dateIcon && dateIcon.parentElement) {
      const dateMatch = dateIcon.parentElement.textContent?.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        publishDate = dateMatch[0];
      }
    }

    // 女优、标签与厂商提取
    const actress: string[] = [];
    const genre: string[] = [];
    let producer: string | undefined;

    infoItems.forEach((li) => {
      const text = li.textContent || "";
      if (text.includes("女優：") || text.includes("女優:")) {
        li.querySelectorAll("a").forEach((a) => {
          const act = a.textContent?.trim();
          if (act && !actress.includes(act)) actress.push(act);
        });
      } else if (text.includes("標籤：") || text.includes("标签：") || text.includes("標籤:")) {
        li.querySelectorAll("a").forEach((a) => {
          const g = a.textContent?.trim();
          if (g && !genre.includes(g)) genre.push(g);
        });
      } else if (text.includes("廠商：") || text.includes("厂商：") || text.includes("廠商:")) {
        const prodA = li.querySelector("a");
        if (prodA && prodA.textContent?.trim()) {
          producer = prodA.textContent.trim();
        }
      }
    });

    // 预告/视频流提取 (从页面内联的 script 提取 m3u8 地址)
    let previewVideo: string | undefined;
    const scripts = doc.querySelectorAll("script");
    for (const s of Array.from(scripts)) {
      const content = s.textContent || "";
      if (content.includes("sourceEl.src") || content.includes("m3u8")) {
        const m = content.match(/sourceEl\.src\s*=\s*["']([^"']+)["']/);
        if (m && m[1]) {
          // 解码反斜杠转义
          previewVideo = m[1].replace(/\\\//g, "/");
          break;
        }
      }
    }

    // 过滤“馬賽克破壞版”、“馬賽克破解版”、“無碼流出版”等脏数据
    const dirtyKeywords = ["馬賽克破壞版", "馬賽克破解版", "無碼流出版"];
    for (const keyword of dirtyKeywords) {
      if (title && title.includes(keyword)) {
        title = "";
        genre.length = 0;
      }
      if (plot && plot.includes(keyword)) {
        plot = undefined;
        genre.length = 0;
      }
      if (!title && !plot && genre.length === 0) {
        break;
      }
    }

    return {
      dvdid: exactDvdid,
      url: detailUrl,
      title: title || undefined,
      ori_title: isValidTitle(detectedOriTitle) ? detectedOriTitle : undefined,
      plot,
      cover,
      big_cover: cover,
      covers: cover ? [cover] : [],
      big_covers: cover ? [cover] : [],
      genre,
      actress,
      publish_date: publishDate,
      producer,
      preview_video: previewVideo,
    };
  }
}
