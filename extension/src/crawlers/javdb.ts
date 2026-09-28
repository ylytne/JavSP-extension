/**
 * JavDB 爬虫实现
 */

import { BaseCrawler, MovieNotFoundError, normalizeSiteUrl } from "./base";
import { MovieInfo, RequestRetryConfig } from "./types";

export class JavDBCrawler extends BaseCrawler {
  name = "javdb";
  baseUrl: string;

  constructor(baseUrl?: string) {
    super();
    this.baseUrl = normalizeSiteUrl(baseUrl, "https://javdb.com");
  }

  async scrape(dvdid: string, config?: RequestRetryConfig): Promise<Partial<MovieInfo>> {
    const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(dvdid)}&f=all`;
    const searchDoc = await this.fetchDocument(searchUrl, config);

    // 1. 在搜索结果列表中精准匹配目标番号
    const movieBoxes = Array.from(searchDoc.querySelectorAll("a.box"));
    let targetBox: Element | null = null;
    let targetUrl = "";

    for (const box of movieBoxes) {
      const titleStrong = box.querySelector("div.video-title strong");
      const textId = titleStrong?.textContent?.trim().toLowerCase();
      if (textId === dvdid.toLowerCase()) {
        targetBox = box;
        const href = box.getAttribute("href") || "";
        targetUrl = href.startsWith("http") ? href : `${this.baseUrl}${href}`;
        break;
      }
    }

    if (!targetBox) {
      throw new MovieNotFoundError(this.name, dvdid);
    }

    // 2. 尝试获取详情页；若触发 VIP 权限拦截或登录跳转，降级从搜索卡片中提取基础元数据
    let detailDoc: Document | null = null;
    try {
      detailDoc = await this.fetchDocument(targetUrl, config);
      // 检查是否重定向或限制为 VIP 可见
      if (detailDoc.title.includes("登入") || detailDoc.querySelector(".vip-only")) {
        detailDoc = null;
      }
    } catch {
      detailDoc = null;
    }

    // VIP / 登录降级提取逻辑
    if (!detailDoc) {
      return this.parseFromSearchBox(targetBox, targetUrl, dvdid);
    }

    // 3. 从详情页完整解析
    return this.parseDetailPage(detailDoc, targetUrl, dvdid);
  }

  /**
   * 降级方案：从搜索结果卡片直接提取封面、标题和发行日期
   */
  private parseFromSearchBox(box: Element, url: string, dvdid: string): Partial<MovieInfo> {
    const rawTitle = box.getAttribute("title") || "";
    const cleanTitle = rawTitle.replace(new RegExp(dvdid, "gi"), "").trim();
    const cover = box.querySelector("div img")?.getAttribute("src") || "";

    let score: string | undefined;
    const scoreText = box.querySelector("div.score")?.textContent || "";
    const scoreMatch = scoreText.match(/([\d.]+)分/);
    if (scoreMatch) {
      score = (parseFloat(scoreMatch[1]) * 2).toFixed(2);
    }

    const metaText = box.querySelector("div.meta")?.textContent?.trim() || "";
    const dateMatch = metaText.match(/\d{4}-\d{2}-\d{2}/);

    return this.cleanTitle({
      dvdid,
      url,
      title: cleanTitle || rawTitle,
      cover,
      covers: cover ? [cover] : [],
      big_covers: [],
      score,
      publish_date: dateMatch ? dateMatch[0] : undefined,
      genre: [],
      genre_id: [],
      actress: [],
      preview_pics: [],
    });
  }

  /**
   * 详情页解析
   */
  private parseDetailPage(doc: Document, url: string, dvdid: string): Partial<MovieInfo> {
    const container = doc.querySelector(".video-detail");
    const infoPanel = doc.querySelector(".movie-panel-info");

    const rawTitle =
      container?.querySelector("h2 strong.current-title")?.textContent?.trim() || "";
    const originTitleNode = container?.querySelector("h2 span.origin-title")?.textContent?.trim();
    const cleanTitle = rawTitle.replace(new RegExp(dvdid, "gi"), "").trim();
    const cleanOriginTitle = originTitleNode
      ? originTitleNode.replace(new RegExp(dvdid, "gi"), "").trim()
      : undefined;

    const cover = doc.querySelector("img.video-cover")?.getAttribute("src") || "";

    // 预览图
    const previewPics: string[] = [];
    doc.querySelectorAll("a.tile-item[data-fancybox='gallery']").forEach((a) => {
      const href = a.getAttribute("href");
      if (href) previewPics.push(href);
    });

    // 预告片
    let previewVideo: string | undefined;
    const videoSrc = doc.querySelector("video#preview-video source")?.getAttribute("src");
    if (videoSrc) {
      previewVideo = videoSrc.startsWith("//") ? `https:${videoSrc}` : videoSrc;
    }

    let publishDate: string | undefined;
    let duration: string | undefined;
    let director: string | undefined;
    let producer: string | undefined;
    let publisher: string | undefined;
    let serial: string | undefined;
    let uncensored: boolean | undefined;

    // 遍历 panel 内信息项
    if (infoPanel) {
      const items = Array.from(infoPanel.children);
      for (const item of items) {
        const strongText = item.querySelector("strong")?.textContent?.trim() || "";
        const valueSpan = item.querySelector("span");
        const valText = (valueSpan ? valueSpan.textContent : item.textContent) || "";

        if (/(?:日期|released? date)[：:]/i.test(strongText)) {
          const m = valText.match(/\d{4}-\d{2}-\d{2}/);
          if (m) publishDate = m[0];
        } else if (/(?:時長|时长|duration)[：:]/i.test(strongText)) {
          duration = valText
            .replace(/^(?:時長|时长|duration)[：:]\s*/i, "")
            .replace(/(?:分鍾|分钟|mins?)/gi, "")
            .trim();
        } else if (/(?:導演|导演|director)[：:]/i.test(strongText)) {
          director = valueSpan?.textContent?.trim();
        } else if (/(?:片商|賣家|卖家|maker|producer|seller)[：:]/i.test(strongText)) {
          producer = valueSpan?.textContent?.trim();
        } else if (/(?:發行|发行|publisher)[：:]/i.test(strongText)) {
          publisher = valueSpan?.textContent?.trim();
        } else if (/(?:系列|series)[：:]/i.test(strongText)) {
          serial = valueSpan?.textContent?.trim();
        }
      }
    }

    // 评分转换 (5分制乘以 2 -> 10分制)
    let score: string | undefined;
    const scoreContainer = doc.querySelector(".score-stars")?.parentElement?.textContent || "";
    const sMatch = scoreContainer.match(/([\d.]+)\s*(?:分|points?)/i) || scoreContainer.match(/([\d.]+)分/);
    if (sMatch) {
      score = (parseFloat(sMatch[1]) * 2).toFixed(2);
    }

    // 分类提取 (兼容繁体“類別:”、简体“类别:”以及英文“Tags:”)
    const genres: string[] = [];
    const genreIds: string[] = [];
    doc.querySelectorAll("strong").forEach((st) => {
      const text = st.textContent?.trim() || "";
      if (/(?:類別|类别|tags?|categories|genre)[：:]/i.test(text)) {
        const links = st.parentElement?.querySelectorAll("span a");
        links?.forEach((a) => {
          const gName = a.textContent?.trim();
          const href = a.getAttribute("href") || "";
          if (gName) genres.push(gName);
          if (href) {
            genreIds.push(href.split("/").pop() || "");
            if (href.includes("uncensored")) uncensored = true;
          }
        });
      }
    });

    // 女优提取 (兼容现代 JavDB 的 a.actor-female 结构与旧版 <strong>♀</strong> 标记)
    const actressList: string[] = [];
    doc.querySelectorAll("strong").forEach((st) => {
      const text = st.textContent?.trim() || "";
      if (/(?:演員|演员|actors?|actress(?:es)?)[：:]/i.test(text)) {
        const actorSpan = st.parentElement?.querySelector("span");
        if (actorSpan) {
          // 1. 优先提取现代 JavDB 标记的女性演员 a.actor-female
          const femaleLinks = Array.from(actorSpan.querySelectorAll("a.actor-female"));
          if (femaleLinks.length > 0) {
            femaleLinks.forEach((a) => {
              const name = a.textContent?.trim();
              if (name && !actressList.includes(name)) {
                actressList.push(name);
              }
            });
          } else {
            // 2. 兼容旧版/测试 Mock: 根据 ♀ 符号精准过滤女优
            const links = Array.from(actorSpan.querySelectorAll("a"));
            const strongs = Array.from(actorSpan.querySelectorAll("strong"));
            let foundBySymbol = false;

            for (let i = 0; i < links.length; i++) {
              const actorName = links[i].textContent?.trim() || "";
              const gender = strongs[i]?.textContent?.trim();
              const nextElText = links[i].nextElementSibling?.textContent?.trim();
              const nextNodeText = links[i].nextSibling?.textContent?.trim() || "";

              if (
                (gender === "♀" || nextElText === "♀" || nextNodeText.includes("♀")) &&
                actorName
              ) {
                if (!actressList.includes(actorName)) {
                  actressList.push(actorName);
                }
                foundBySymbol = true;
              }
            }

            // 3. 若无任何 ♀ 标识且无 actor-female，排除明确标为男性的链接后作为女优提取
            if (!foundBySymbol && links.length > 0) {
              links.forEach((a) => {
                if (a.classList.contains("actor-male")) return;
                const nextNodeText =
                  a.nextElementSibling?.textContent || a.nextSibling?.textContent || "";
                if (nextNodeText.includes("♂")) return;
                const name = a.textContent?.trim();
                if (name && !actressList.includes(name)) {
                  actressList.push(name);
                }
              });
            }
          }
        }
      }
    });

    // 磁力链接提取
    const magnets: string[] = [];
    doc.querySelectorAll(".magnet-name a").forEach((a) => {
      const href = a.getAttribute("href");
      if (href) magnets.push(href);
    });

    return this.cleanTitle({
      dvdid,
      url,
      title: cleanTitle || rawTitle,
      ori_title: cleanOriginTitle || undefined,
      cover,
      covers: cover ? [cover] : [],
      big_covers: [],
      score,
      publish_date: publishDate,
      duration,
      director,
      producer,
      publisher,
      serial,
      genre: genres,
      genre_id: genreIds,
      actress: actressList,
      preview_pics: previewPics,
      preview_video: previewVideo,
      uncensored,
      magnet: magnets,
    });
  }
}
