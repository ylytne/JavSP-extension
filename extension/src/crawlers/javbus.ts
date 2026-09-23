/**
 * JavBus 爬虫实现
 */

import { BaseCrawler, MovieNotFoundError } from "./base";
import { MovieInfo, RequestRetryConfig } from "./types";

export class JavBusCrawler extends BaseCrawler {
  name = "javbus";
  baseUrl = "https://www.javbus.com";

  async scrape(dvdid: string, config?: RequestRetryConfig): Promise<Partial<MovieInfo>> {
    const url = `${this.baseUrl}/${encodeURIComponent(dvdid)}`;
    const doc = await this.fetchDocument(url, config);

    // 404 检测
    const pageTitle = doc.title.trim();
    if (pageTitle.startsWith("404 Page Not Found!")) {
      throw new MovieNotFoundError(this.name, dvdid);
    }

    const container = doc.querySelector(".container");
    const rawTitle = container?.querySelector("h3")?.textContent?.trim() || "";
    const cleanTitle = rawTitle.replace(new RegExp(dvdid, "gi"), "").trim();

    // 高清大图封面
    const bigCoverImg = container?.querySelector("a.bigImage img");
    const bigCoverUrl = bigCoverImg?.getAttribute("src") || "";
    const fullCoverUrl = bigCoverUrl.startsWith("http")
      ? bigCoverUrl
      : `${this.baseUrl}${bigCoverUrl}`;

    // 剧照预览
    const previewPics: string[] = [];
    doc.querySelectorAll("#sample-waterfall a").forEach((a) => {
      const href = a.getAttribute("href");
      if (href) {
        previewPics.push(href.startsWith("http") ? href : `${this.baseUrl}${href}`);
      }
    });

    const infoPanel = container?.querySelector(".info");
    let exactDvdid = dvdid;
    let publishDate: string | undefined;
    let duration: string | undefined;
    let director: string | undefined;
    let producer: string | undefined;
    let publisher: string | undefined;
    let serial: string | undefined;

    if (infoPanel) {
      infoPanel.querySelectorAll("p").forEach((p) => {
        const text = p.textContent || "";
        if (text.includes("識別碼:")) {
          const span = p.querySelector("span:last-child");
          exactDvdid = span?.textContent?.trim() || dvdid;
        } else if (text.includes("發行日期:")) {
          const m = text.match(/\d{4}-\d{2}-\d{2}/);
          if (m && m[0] !== "0000-00-00") publishDate = m[0];
        } else if (text.includes("長度:")) {
          const m = text.match(/(\d+)\s*分鐘/);
          if (m) duration = m[1];
        } else if (text.includes("導演:")) {
          director = p.querySelector("a")?.textContent?.trim();
        } else if (text.includes("製作商:")) {
          producer = p.querySelector("a")?.textContent?.trim();
        } else if (text.includes("發行商:")) {
          publisher = p.querySelector("a")?.textContent?.trim();
        } else if (text.includes("系列:")) {
          serial = p.querySelector("a")?.textContent?.trim();
        }
      });
    }

    // 分类与无码检测
    const genres: string[] = [];
    const genreIds: string[] = [];
    let uncensored = false;
    doc.querySelectorAll(".genre label a").forEach((a) => {
      const gName = a.textContent?.trim();
      const href = a.getAttribute("href") || "";
      if (gName) genres.push(gName);
      if (href) {
        const preId = href.split("/").pop() || "";
        if (href.includes("uncensored")) {
          genreIds.push(`uncensored-${preId}`);
          uncensored = true;
        } else {
          genreIds.push(preId);
        }
      }
    });

    // 女优名与头像提取 (过滤 nowprinting.gif)
    const actressList: string[] = [];
    const actressPics: Record<string, string> = {};

    doc.querySelectorAll(".avatar-box div img").forEach((img) => {
      const name = img.getAttribute("title")?.trim();
      const src = img.getAttribute("src")?.trim();
      if (name) {
        actressList.push(name);
        if (src && !src.endsWith("nowprinting.gif")) {
          actressPics[name] = src.startsWith("http") ? src : `${this.baseUrl}${src}`;
        }
      }
    });

    return {
      dvdid: exactDvdid,
      url,
      title: cleanTitle || rawTitle,
      cover: fullCoverUrl,
      big_cover: fullCoverUrl,
      covers: fullCoverUrl ? [fullCoverUrl] : [],
      big_covers: fullCoverUrl ? [fullCoverUrl] : [],
      publish_date: publishDate,
      duration,
      director,
      producer,
      publisher,
      serial,
      genre: genres,
      genre_id: genreIds,
      actress: actressList,
      actress_pics: actressPics,
      preview_pics: previewPics,
      uncensored,
    };
  }
}
