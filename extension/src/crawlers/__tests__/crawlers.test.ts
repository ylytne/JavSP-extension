import { describe, it, expect, vi } from "vitest";
import { JavBusCrawler } from "../javbus";
import { JavDBCrawler } from "../javdb";
import { BaseCrawler, MovieNotFoundError } from "../base";

describe("JavBusCrawler", () => {
  it("should detect 404 page correctly", async () => {
    const crawler = new JavBusCrawler();
    const fake404Doc = new DOMParser().parseFromString(
      "<html><head><title>404 Page Not Found! - JavBus</title></head><body></body></html>",
      "text/html"
    );
    vi.spyOn(crawler, "fetchDocument").mockResolvedValue(fake404Doc);

    await expect(crawler.scrape("NONEXISTENT-999")).rejects.toThrow(MovieNotFoundError);
  });

  it("should parse JavBus detail page correctly", async () => {
    const crawler = new JavBusCrawler();
    const sampleHtml = `
      <html>
        <head><title>IPX-177 - JavBus</title></head>
        <body>
          <div class="container">
            <h3>IPX-177 相思相愛の温泉旅行</h3>
            <a class="bigImage"><img src="https://pics.dmm.co.jp/digital/video/ipx00177/ipx00177pl.jpg" /></a>
            <div class="col-md-3 info">
              <p><span>識別碼:</span> <span>IPX-177</span></p>
              <p><span>發行日期:</span> 2018-09-13</p>
              <p><span>長度:</span> 120分鐘</p>
              <p><span>導演:</span> <a href="#">ディック仲西</a></p>
              <p><span>製作商:</span> <a href="#">IDEA POCKET</a></p>
              <p><span>發行商:</span> <a href="#">IDEA POCKET</a></p>
              <p><span>系列:</span> <a href="#">相思相愛</a></p>
            </div>
            <div class="genre">
              <label><a href="https://www.javbus.com/genre/v">温泉</a></label>
              <label><a href="https://www.javbus.com/uncensored/genre/x">无码破解</a></label>
            </div>
            <a class="avatar-box">
              <div><img src="https://pics.dmm.co.jp/mono/actjpgs/aizawa_minami.jpg" title="相沢みなみ" /></div>
            </a>
            <a class="avatar-box">
              <div><img src="https://www.javbus.com/images/nowprinting.gif" title="未知女优" /></div>
            </a>
            <div id="sample-waterfall">
              <a href="https://pics.dmm.co.jp/digital/video/ipx00177/ipx00177-1.jpg"></a>
            </div>
          </div>
        </body>
      </html>
    `;
    const doc = new DOMParser().parseFromString(sampleHtml, "text/html");
    vi.spyOn(crawler, "fetchDocument").mockResolvedValue(doc);

    const result = await crawler.scrape("IPX-177");
    expect(result.dvdid).toBe("IPX-177");
    expect(result.title).toBe("相思相愛の温泉旅行");
    expect(result.cover).toBe("https://pics.dmm.co.jp/digital/video/ipx00177/ipx00177pl.jpg");
    expect(result.publish_date).toBe("2018-09-13");
    expect(result.duration).toBe("120");
    expect(result.director).toBe("ディック仲西");
    expect(result.producer).toBe("IDEA POCKET");
    expect(result.serial).toBe("相思相愛");
    expect(result.uncensored).toBe(true);
    expect(result.genre).toEqual(["温泉", "无码破解"]);
    expect(result.genre_id).toEqual(["v", "uncensored-x"]);
    expect(result.actress).toEqual(["相沢みなみ", "未知女优"]);
    // nowprinting.gif should be excluded from actress_pics
    expect(result.actress_pics).toEqual({
      相沢みなみ: "https://pics.dmm.co.jp/mono/actjpgs/aizawa_minami.jpg",
    });
    expect(result.preview_pics).toEqual([
      "https://pics.dmm.co.jp/digital/video/ipx00177/ipx00177-1.jpg",
    ]);
  });
});

describe("JavDBCrawler", () => {
  it("should match dvdid in search and parse details with actress ♀ filter", async () => {
    const crawler = new JavDBCrawler();

    const searchHtml = `
      <html>
        <body>
          <div class="movie-list">
            <a class="box" href="/v/abcde" title="IPX-177 相思相愛 温泉旅行">
              <div class="video-title"><strong>IPX-177</strong></div>
              <div class="score"><span><span>4.20分</span></span></div>
            </a>
          </div>
        </body>
      </html>
    `;
    const searchDoc = new DOMParser().parseFromString(searchHtml, "text/html");

    const detailHtml = `
      <html>
        <body>
          <div class="video-detail">
            <h2><strong class="current-title">IPX-177 相思相愛 温泉旅行</strong></h2>
            <img class="video-cover" src="https://c0.jdbstatic.com/covers/ab/abcde.jpg" />
            <div class="score-stars"></div>
            <span>4.20分</span>
            <nav class="panel movie-panel-info">
              <div><strong>日期:</strong><span>2018-09-13</span></div>
              <div><strong>時長:</strong><span>120分鍾</span></div>
              <div><strong>片商:</strong><span>IdeaPocket</span></div>
              <div>
                <strong>演員:</strong>
                <span>
                  <a href="#">相沢みなみ</a><strong>♀</strong>
                  <a href="#">男优甲</a><strong>♂</strong>
                </span>
              </div>
              <div>
                <strong>類別:</strong>
                <span>
                  <a href="/tags?c1=1">单体作品</a>
                </span>
              </div>
            </nav>
          </div>
        </body>
      </html>
    `;
    const detailDoc = new DOMParser().parseFromString(detailHtml, "text/html");

    vi.spyOn(crawler, "fetchDocument").mockImplementation(async (url: string) => {
      if (url.includes("/search?")) return searchDoc;
      return detailDoc;
    });

    const result = await crawler.scrape("IPX-177");
    expect(result.dvdid).toBe("IPX-177");
    expect(result.title).toBe("相思相愛 温泉旅行");
    expect(result.cover).toBe("https://c0.jdbstatic.com/covers/ab/abcde.jpg");
    // Female filter: only 相沢みなみ (not 男优甲)
    expect(result.actress).toEqual(["相沢みなみ"]);
    expect(result.producer).toBe("IdeaPocket");
  });

  it("should fallback to search card when detail page is VIP blocked", async () => {
    const crawler = new JavDBCrawler();
    const searchHtml = `
      <html>
        <body>
          <div class="movie-list">
            <a class="box" href="/v/vip123" title="VIP-999 秘密会所">
              <div class="video-title"><strong>VIP-999</strong></div>
              <div><img src="https://c0.jdbstatic.com/covers/vip.jpg" /></div>
              <div class="score"><span><span>4.50分</span></span></div>
              <div class="meta">2023-01-01</div>
            </a>
          </div>
        </body>
      </html>
    `;
    const searchDoc = new DOMParser().parseFromString(searchHtml, "text/html");
    const vipDetailDoc = new DOMParser().parseFromString(
      "<html><head><title>登入 | JavDB</title></head><body><div class='vip-only'>此内容仅VIP可见</div></body></html>",
      "text/html"
    );

    vi.spyOn(crawler, "fetchDocument").mockImplementation(async (url: string) => {
      if (url.includes("/search?")) return searchDoc;
      return vipDetailDoc;
    });

    const result = await crawler.scrape("VIP-999");
    expect(result.dvdid).toBe("VIP-999");
    expect(result.title).toBe("秘密会所");
    expect(result.cover).toBe("https://c0.jdbstatic.com/covers/vip.jpg");
    expect(result.score).toBe("9.00"); // 4.50 * 2
    expect(result.publish_date).toBe("2023-01-01");
  });

  it("should extract metadata from JavDB proxy site with simplified Chinese and modern actor-female class", async () => {
    const crawler = new JavDBCrawler("https://javdb580.com");

    const searchHtml = `
      <html>
        <body>
          <div class="movie-list">
            <a class="box" href="/v/g6Adg" title="SSIS-335 温泉旅行 小宵こなん">
              <div class="video-title"><strong>SSIS-335</strong></div>
            </a>
          </div>
        </body>
      </html>
    `;
    const searchDoc = new DOMParser().parseFromString(searchHtml, "text/html");

    // 模拟真实代理镜像站（简体中文 + 现代 a.actor-female 标签）
    const detailHtml = `
      <html>
        <body>
          <div class="video-detail">
            <h2><strong class="current-title">SSIS-335 温泉旅行 小宵こなん</strong></h2>
            <img class="video-cover" src="https://c0.jdbstatic.com/covers/g6/g6Adg.jpg" />
            <div class="score-stars"></div>
            <span>4.26分</span>
            <nav class="panel movie-panel-info">
              <div class="panel-block"><strong>日期:</strong>&nbsp;<span class="value">2022-02-22</span></div>
              <div class="panel-block"><strong>时长:</strong>&nbsp;<span class="value">120 分钟</span></div>
              <div class="panel-block"><strong>导演:</strong>&nbsp;<span class="value"><a href="/directors/pWB">大崎広浩治</a></span></div>
              <div class="panel-block"><strong>片商:</strong>&nbsp;<span class="value"><a href="/makers/7R">S1 NO.1 STYLE</a></span></div>
              <div class="panel-block"><strong>系列:</strong>&nbsp;<span class="value"><a href="/series/Y80B">温泉不伦旅行</a></span></div>
              <div class="panel-block">
                <strong>类别:</strong>
                &nbsp;<span class="value">
                  <a href="/tags?c1=51">出轨</a>,&nbsp;
                  <a href="/tags?c4=17">巨乳</a>,&nbsp;
                  <a href="/tags/uncensored?c7=348">无码破解</a>
                </span>
              </div>
              <div class="panel-block">
                <strong>演员:</strong>
                &nbsp;<span class="value">
                  <a class="actor-female" href="/actors/76BeZ">小宵こなん</a>, <a href="/actors/p3NEk">井口</a>
                </span>
              </div>
            </nav>
          </div>
        </body>
      </html>
    `;
    const detailDoc = new DOMParser().parseFromString(detailHtml, "text/html");

    vi.spyOn(crawler, "fetchDocument").mockImplementation(async (url: string) => {
      if (url.includes("/search?")) return searchDoc;
      return detailDoc;
    });

    const result = await crawler.scrape("SSIS-335");
    expect(result.dvdid).toBe("SSIS-335");
    expect(result.title).toBe("温泉旅行");
    expect(result.publish_date).toBe("2022-02-22");
    expect(result.duration).toBe("120");
    expect(result.director).toBe("大崎広浩治");
    expect(result.producer).toBe("S1 NO.1 STYLE");
    expect(result.serial).toBe("温泉不伦旅行");
    expect(result.uncensored).toBe(true);
    // 类别与类别 ID 正常提取
    expect(result.genre).toEqual(["出轨", "巨乳", "无码破解"]);
    expect(result.genre_id).toEqual(["tags?c1=51", "tags?c4=17", "uncensored?c7=348"]);
    // 现代 actor-female 精准提取女优，过滤男优 井口
    expect(result.actress).toEqual(["小宵こなん"]);
  });
});

describe("BaseCrawler.fetchImageAsBase64", () => {
  it("should convert image blob to base64 data url", async () => {
    const fakeBlob = new Blob(["fake image data"], { type: "image/jpeg" });
    const fakeResponse = {
      ok: true,
      blob: async () => fakeBlob,
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse));

    const result = await BaseCrawler.fetchImageAsBase64("https://example.com/test.jpg");
    expect(result).toMatch(/^data:image\/jpeg;base64,/);

    vi.unstubAllGlobals();
  });

  it("should throw informative error on HTTP failure", async () => {
    const fake403Response = {
      ok: false,
      status: 403,
      statusText: "Forbidden",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fake403Response));

    await expect(
      BaseCrawler.fetchImageAsBase64("https://www.javbus.com/pics/cover/test.jpg")
    ).rejects.toThrow("触发反爬虫或访问受限: HTTP 403");

    vi.unstubAllGlobals();
  });
});

describe("爬虫自定义 Base URL (反向代理/免代理镜像) 测试", () => {
  it("JavBusCrawler 应正确采用自定义 baseUrl 并拼接目标 URL", async () => {
    const crawler = new JavBusCrawler("seedmm.help");
    expect(crawler.baseUrl).toBe("https://seedmm.help");

    let requestedUrl = "";
    vi.spyOn(crawler, "fetchDocument").mockImplementation(async (url: string) => {
      requestedUrl = url;
      return new DOMParser().parseFromString("<html><head><title>404 Page Not Found!</title></head></html>", "text/html");
    });

    await expect(crawler.scrape("IPX-177")).rejects.toThrow();
    expect(requestedUrl).toBe("https://seedmm.help/IPX-177");
  });

  it("JavDBCrawler 应正确采用自定义 baseUrl 并发起搜索与详情请求", async () => {
    const crawler = new JavDBCrawler("javdb580.com/");
    expect(crawler.baseUrl).toBe("https://javdb580.com");

    let requestedUrl = "";
    vi.spyOn(crawler, "fetchDocument").mockImplementation(async (url: string) => {
      requestedUrl = url;
      return new DOMParser().parseFromString("<html><body></body></html>", "text/html");
    });

    await expect(crawler.scrape("IPX-177")).rejects.toThrow();
    expect(requestedUrl).toBe("https://javdb580.com/search?q=IPX-177&f=all");
  });
});

