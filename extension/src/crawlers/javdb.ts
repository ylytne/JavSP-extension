/**
 * JavDB 爬虫实现
 */

import { BaseCrawler, MovieNotFoundError } from "./base";
import { MovieInfo, RequestRetryConfig } from "./types";

export class JavDBCrawler extends BaseCrawler {
  name = "javdb";
  baseUrl = "https://javdb.com";

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

    return {
      dvdid,
      url,
      title: cleanTitle || rawTitle,
      cover,
      covers: cover ? [cover] : [],
      big_covers: [],
      score,
      publish_date: dateMatch ? dateMatch[0] : undefined,
      genre: [],
      actress: [],
      preview_pics: [],
    };
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

        if (strongText.includes("日期:")) {
          const m = valText.match(/\d{4}-\d{2}-\d{2}/);
          if (m) publishDate = m[0];
        } else if (strongText.includes("時長:")) {
          duration = valText.replace("時長:", "").replace("分鍾", "").replace("分钟", "").trim();
        } else if (strongText.includes("導演:")) {
          director = valueSpan?.textContent?.trim();
        } else if (strongText.includes("片商:") || strongText.includes("賣家:")) {
          producer = valueSpan?.textContent?.trim();
        } else if (strongText.includes("發行:")) {
          publisher = valueSpan?.textContent?.trim();
        } else if (strongText.includes("系列:")) {
          serial = valueSpan?.textContent?.trim();
        }
      }
    }

    // 评分转换 (5分制乘以 2 -> 10分制)
    let score: string | undefined;
    const scoreContainer = doc.querySelector(".score-stars")?.parentElement?.textContent || "";
    const sMatch = scoreContainer.match(/([\d.]+)分/);
    if (sMatch) {
      score = (parseFloat(sMatch[1]) * 2).toFixed(2);
    }

    // 分类提取
    const genres: string[] = [];
    const genreIds: string[] = [];
    doc.querySelectorAll("strong").forEach((st) => {
      if (st.textContent?.includes("類別:")) {
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

    // 女优提取（按 ♀ 符号精准过滤）
    const actressList: string[] = [];
    doc.querySelectorAll("strong").forEach((st) => {
      if (st.textContent?.includes("演員:")) {
        const actorSpan = st.parentElement?.querySelector("span");
        if (actorSpan) {
          const links = Array.from(actorSpan.querySelectorAll("a"));
          const strongs = Array.from(actorSpan.querySelectorAll("strong"));
          for (let i = 0; i < links.length; i++) {
            const actorName = links[i].textContent?.trim() || "";
            const gender = strongs[i]?.textContent?.trim();
            if (gender === "♀" && actorName) {
              actressList.push(actorName);
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

    return {
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
    };
  }
}
