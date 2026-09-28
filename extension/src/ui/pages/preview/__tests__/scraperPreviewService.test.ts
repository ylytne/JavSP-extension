import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeScrapePreview } from "../services/scraperPreviewService";
import { BaseCrawler } from "../../../../crawlers/base";
import { JavBusCrawler } from "../../../../crawlers/javbus";
import { JavDBCrawler } from "../../../../crawlers/javdb";
import { AirAVCrawler } from "../../../../crawlers/airav";
import * as pipelineModule from "../../../pages/dashboard/services/scraperPipeline";
import { CrawlerRuntimeConfig } from "../../../pages/dashboard/types";

const mockCrawlerConfig: CrawlerRuntimeConfig = {
  retry: 1,
  timeout: 5,
  sleepAfterScraping: 0,
  sleepJitter: 0,
  extraFanartsEnabled: true,
  extraFanartsInterval: 0,
  extraFanartsMaxCount: 10,
  extraFanartsUniformSampling: true,
  extraFanartsTimeout: 5,
  includeTrailer: false,
  crawlers: ["javbus", "javdb", "airav"],
  useJavdbCover: "fallback",
  burstProtectionEnabled: false,
  burstLimit: 10,
  burstJitter: 0,
  burstCooldown: 0,
  burstCooldownJitter: 0,
  proxyFree: {},
};

describe("scraperPreviewService 刮削测试流水线单元测试", () => {
  const dummyLogs: string[] = [];
  const logFn = (level: string, msg: string) => dummyLogs.push(`[${level}] ${msg}`);

  beforeEach(() => {
    dummyLogs.length = 0;
    vi.restoreAllMocks();

    // Mock crawlers
    vi.spyOn(JavBusCrawler.prototype, "scrape").mockResolvedValue({
      dvdid: "IPX-177",
      title: "純情美少女の放課後 相沢みなみ",
      ori_title: "純情美少女の放課後 相沢みなみ",
      cover: "https://pics.javbus.com/cover/ipx177.jpg",
      actress: ["相沢みなみ"],
      genre: ["美少女", "制服"],
      preview_pics: [
        "https://pics.javbus.com/sample1.jpg",
        "https://pics.javbus.com/sample2.jpg",
        "https://pics.javbus.com/sample3.jpg",
      ],
      url: "https://www.javbus.com/IPX-177",
    });

    vi.spyOn(JavDBCrawler.prototype, "scrape").mockResolvedValue({
      dvdid: "IPX-177",
      score: "8.5",
      genre: ["美少女", "制服", "单体作品"],
      url: "https://javdb.com/v/test",
    });

    vi.spyOn(AirAVCrawler.prototype, "scrape").mockResolvedValue({
      dvdid: "IPX-177",
      title: "纯情美少女的放学后",
      plot: "这是一段中文测试简介",
      url: "https://airav.io/video/test",
    });

    // Mock downloadCoversWithFallback
    vi.spyOn(pipelineModule, "downloadCoversWithFallback").mockResolvedValue({
      coverBase64: "data:image/jpeg;base64,mockCoverData",
      matchedCoverUrl: "https://pics.javbus.com/cover/ipx177.jpg",
    });

    // Mock BaseCrawler.fetchImageAsBase64
    vi.spyOn(BaseCrawler, "fetchImageAsBase64").mockResolvedValue(
      "data:image/jpeg;base64,mockSampleFanartData"
    );

    // Mock fetch for backend /api/organize/preview
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/organize/preview")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: "ok",
              target_dir: "D:/Videos/Organized/相沢みなみ/[IPX-177] 纯情美少女的放学后",
              rel_folder: "#整理完成/相沢みなみ/[IPX-177] 纯情美少女的放学后",
              base_name: "IPX-177",
              video_filename: "IPX-177.mp4",
              nfo_filename: "IPX-177.nfo",
              nfo_content: '<?xml version="1.0"?><movie><title>IPX-177 纯情美少女的放学后</title></movie>',
              poster_filename: "poster.jpg",
              fanart_filename: "fanart.jpg",
              extrafanarts_files: ["extrafanart/0.jpg"],
              cleaned_dict: {
                num: "IPX-177",
                title: "纯情美少女的放学后",
                actress: "相沢みなみ",
              },
              cropped_poster_base64: "data:image/jpeg;base64,mockCroppedPoster",
              genre_norm: ["美少女", "制服"],
              normalized_actresses: ["相沢みなみ"],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: "ok" }),
        });
      })
    );
  });

  it("应能完整执行多源测试刮削并生成报告", async () => {
    const report = await executeScrapePreview(
      {
        dvdid: "IPX-177",
        hardSub: false,
        uncensored: false,
      },
      mockCrawlerConfig,
      null,
      logFn
    );

    expect(report.dvdid).toBe("IPX-177");
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.siteResults.javbus.status).toBe("success");
    expect(report.siteResults.javdb.status).toBe("success");
    expect(report.siteResults.airav.status).toBe("success");

    // 检查落盘模拟结果与规范化数据映射
    expect(report.landingData.baseName).toBe("IPX-177");
    expect(report.landingData.videoFilename).toBe("IPX-177.mp4");
    expect(report.landingData.nfoContent).toContain("<movie>");
    expect(report.landingData.croppedPosterBase64).toBe("data:image/jpeg;base64,mockCroppedPoster");
    expect(report.summarized.genre_norm).toEqual(["美少女", "制服"]);
    expect(report.summarized.actress).toEqual(["相沢みなみ"]);
    expect(report.landingData.genreNorm).toEqual(["美少女", "制服"]);
    expect(report.landingData.normalizedActresses).toEqual(["相沢みなみ"]);
  });

  it("当开启剧照下载时，严格只实际下载第 1 张剧照作为测试抽样", async () => {
    const fetchPicSpy = vi.spyOn(BaseCrawler, "fetchImageAsBase64");

    const report = await executeScrapePreview(
      {
        dvdid: "IPX-177",
      },
      { ...mockCrawlerConfig, extraFanartsEnabled: true },
      null,
      logFn
    );

    // 虽然 preview_pics 有 3 张，但测试模式下只请求第 1 张
    expect(fetchPicSpy).toHaveBeenCalledTimes(1);
    expect(fetchPicSpy).toHaveBeenCalledWith(
      "https://pics.javbus.com/sample1.jpg",
      expect.anything()
    );
    expect(report.sampleFanartUrl).toBe("https://pics.javbus.com/sample1.jpg");
    expect(report.sampleFanartBase64).toBe("data:image/jpeg;base64,mockSampleFanartData");
  });

  it("当配置停用剧照下载时，应跳过剧照抓取", async () => {
    const fetchPicSpy = vi.spyOn(BaseCrawler, "fetchImageAsBase64");

    const report = await executeScrapePreview(
      {
        dvdid: "IPX-177",
      },
      { ...mockCrawlerConfig, extraFanartsEnabled: false },
      null,
      logFn
    );

    expect(fetchPicSpy).not.toHaveBeenCalled();
    expect(report.sampleFanartBase64).toBeUndefined();
  });

  it("当用户通过 AbortSignal 中断时，应抛出 AbortError", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      executeScrapePreview(
        { dvdid: "IPX-177" },
        mockCrawlerConfig,
        null,
        logFn,
        controller.signal
      )
    ).rejects.toThrow("Aborted");
  });

  it("当所有站点均抓取失败时，应抛出友好的错误信息", async () => {
    vi.spyOn(JavBusCrawler.prototype, "scrape").mockRejectedValue(new Error("JavBus 404"));
    vi.spyOn(JavDBCrawler.prototype, "scrape").mockRejectedValue(new Error("JavDB 404"));
    vi.spyOn(AirAVCrawler.prototype, "scrape").mockRejectedValue(new Error("AirAV 404"));

    await expect(
      executeScrapePreview(
        { dvdid: "UNKNOWN-001" },
        mockCrawlerConfig,
        null,
        logFn
      )
    ).rejects.toThrow("所有启用的站点均未能成功返回");
  });

  it("应正确向后端传递 baseOutputDir 参数", async () => {
    let capturedBody: any = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, init?: any) => {
        if (url.includes("/api/organize/preview")) {
          capturedBody = JSON.parse(init.body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: "ok",
              target_dir: "D:/Videos/Custom/相沢みなみ/[IPX-177] 纯情美少女的放学后",
              rel_folder: "#整理完成/相沢みなみ/[IPX-177] 纯情美少女的放学后",
              base_name: "IPX-177",
              video_filename: "IPX-177.mp4",
              nfo_filename: "IPX-177.nfo",
              nfo_content: "<movie></movie>",
              poster_filename: "poster.jpg",
              fanart_filename: "fanart.jpg",
              extrafanarts_files: [],
              cleaned_dict: {},
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    await executeScrapePreview(
      {
        dvdid: "IPX-177",
        baseOutputDir: "D:/Videos/Custom",
      },
      mockCrawlerConfig,
      null,
      logFn
    );

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.base_output_dir).toBe("D:/Videos/Custom");
  });

  it("当后端模拟整理接口报错时，应抛出可读的错误信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/organize/preview")) {
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: "Internal Server Error",
            text: async () => "Simulated Backend Error",
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    await expect(
      executeScrapePreview(
        { dvdid: "IPX-177" },
        mockCrawlerConfig,
        null,
        logFn
      )
    ).rejects.toThrow("后端模拟整理请求失败");
  });
});
