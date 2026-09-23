import { describe, it, expect, vi } from "vitest";
import { AirAVCrawler } from "../airav";
import { MovieNotFoundError } from "../base";

describe("AirAVCrawler (DOM SSR)", () => {
  const sampleSearchHtml = `
    <!doctype html>
    <html>
      <body>
        <div class="row row-cols-2 row-cols-lg-4 g-2 mt-0">
          <div class="col oneVideo">
            <div class="card h-100">
              <div class="oneVideo-top">
                <a href="/video?hid=QC-BT-S3403403">
                  <img src="https://airav.io/storage/cover/big/QC-BT-S3403403.jpg?1789848148" class="card-img-top" alt="...">
                </a>
              </div>
              <div class="oneVideo-body">
                <h5>SNOS-168 </h5>
              </div>
            </div>
          </div>
          <div class="col oneVideo">
            <div class="card h-100">
              <div class="oneVideo-top">
                <a href="/video?hid=QC-BT-4545326">
                  <img src="https://airav.io/storage/cover/big/QC-BT-4545326.jpg?1789848146" class="card-img-top" alt="...">
                </a>
              </div>
              <div class="oneVideo-body">
                <h5>SNOS-168 最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛 河北彩伽</h5>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const sampleDetailHtml = `
    <!doctype html>
    <html>
      <head>
        <title>SNOS-168 最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛 河北彩伽 - airav.io</title>
        <meta property="og:title" content="SNOS-168 最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛 河北彩伽 - airav.io">
        <meta property="og:image" content="https://airav.io/storage/cover/big/QC-BT-4545326.jpg">
        <meta property="og:url" content="https://airav.io/video?hid=QC-BT-4545326">
        <meta property="og:description" content="河北彩伽，無盡的美女，想看她的極致。">
      </head>
      <body>
        <div class="video-title my-3">
          <h1>SNOS-168 最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛 河北彩伽</h1>
        </div>
        <div class="video-item">
          <div class="me-4"><i class="fa fa-clock me-2"></i>2026-03-20 00:00:00</div>
          <div><i class="fa fa-eye me-2"></i>199054</div>
        </div>
        <div class="video-info">
          <p class="my-3">河北彩伽，無盡的美女，想看她的極致。</p>
          <div class="info-list my-2">
            <ul class="list-group">
              <li class="my-2">番號：<span>SNOS-168</span></li>
              <li class="my-2">女優：<a href="/actor?id=30163">河北彩伽（河北彩花）</a></li>
              <li class="my-2">標籤：
                <a href="/tag?tid=5">720p</a>
                <a href="/tag?tid=8">AV女優片</a>
                <a href="/tag?tid=33">潮吹</a>
              </li>
              <li class="my-2">廠商：<a href="/tag?fid=362">S1 Style</a></li>
            </ul>
          </div>
        </div>
        <script>
          var sourceEl = document.createElement('source');
          sourceEl.src = "https:\\/\\/cdn.example.com\\/hls\\/preview.m3u8";
          sourceEl.type = 'application/x-mpegURL';
        </script>
      </body>
    </html>
  `;

  it("should search and parse movie details correctly from modern HTML", async () => {
    const crawler = new AirAVCrawler("https://airav.io");

    vi.spyOn(crawler, "fetchDocument").mockImplementation(async (url: string) => {
      if (url.includes("/search_result")) {
        return new DOMParser().parseFromString(sampleSearchHtml, "text/html");
      }
      if (url.includes("/video?hid=QC-BT-4545326")) {
        return new DOMParser().parseFromString(sampleDetailHtml, "text/html");
      }
      return new DOMParser().parseFromString("<html><body></body></html>", "text/html");
    });

    const result = await crawler.scrape("SNOS-168");

    expect(result.dvdid).toBe("SNOS-168");
    expect(result.url).toBe("https://airav.io/video?hid=QC-BT-4545326");
    expect(result.title).toBe("最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛 河北彩伽");
    expect(result.cover).toBe("https://airav.io/storage/cover/big/QC-BT-4545326.jpg");
    expect(result.publish_date).toBe("2026-03-20");
    expect(result.plot).toBe("河北彩伽，無盡的美女，想看她的極致。");
    expect(result.actress).toEqual(["河北彩伽（河北彩花）"]);
    expect(result.genre).toEqual(["720p", "AV女優片", "潮吹"]);
    expect(result.producer).toBe("S1 Style");
    expect(result.preview_video).toBe("https://cdn.example.com/hls/preview.m3u8");
  });

  it("should throw MovieNotFoundError when no search results found", async () => {
    const crawler = new AirAVCrawler("https://airav.io");
    const emptySearchHtml = `<html><body><div class="row"></div></body></html>`;

    vi.spyOn(crawler, "fetchDocument").mockResolvedValue(
      new DOMParser().parseFromString(emptySearchHtml, "text/html")
    );

    await expect(crawler.scrape("NONEXISTENT-999")).rejects.toThrow(MovieNotFoundError);
  });

  it("should sanitize dirty keywords like 馬賽克破壞版", async () => {
    const crawler = new AirAVCrawler("https://airav.io");
    const dirtyDetailHtml = `
      <html>
        <head>
          <meta property="og:image" content="https://airav.io/storage/cover/big/test.jpg">
        </head>
        <body>
          <div class="video-title">
            <h1>ABC-123 高級女優 馬賽克破壞版 流出</h1>
          </div>
          <div class="video-info">
            <p>這是 馬賽克破壞版 內容</p>
            <div class="info-list">
              <li class="my-2">番號：<span>ABC-123</span></li>
              <li class="my-2">女優：<a href="#">女優A</a></li>
              <li class="my-2">標籤：<a href="#">無碼</a></li>
            </div>
          </div>
        </body>
      </html>
    `;

    vi.spyOn(crawler, "fetchDocument").mockImplementation(async (url: string) => {
      if (url.includes("/search_result")) {
        return new DOMParser().parseFromString(
          `<div class="oneVideo"><a href="/video?hid=test"><h5>ABC-123</h5></a></div>`,
          "text/html"
        );
      }
      return new DOMParser().parseFromString(dirtyDetailHtml, "text/html");
    });

    const result = await crawler.scrape("ABC-123");

    expect(result.title).toBeUndefined();
    expect(result.plot).toBeUndefined();
    expect(result.genre).toEqual([]);
    expect(result.cover).toBe("https://airav.io/storage/cover/big/test.jpg");
    expect(result.actress).toEqual(["女優A"]);
  });

  it("should prioritize Chinese candidate over Japanese candidate, extract ori_title, and reject mismatched dvdid", async () => {
    const crawler = new AirAVCrawler("https://airav.io");

    const multiSearchHtml = `
      <!doctype html>
      <html>
        <body>
          <div class="row">
            <!-- 1. 混淆卡片：数字前缀包含但实际不匹配 (IPX-100 vs IPX-1001) -->
            <div class="col oneVideo">
              <div class="card">
                <a href="/video?hid=mismatched">
                  <img src="https://airav.io/storage/cover/big/mismatched.jpg">
                </a>
                <div class="oneVideo-body">
                  <h5>IPX-1001 超级大长篇中文本地化精选大合集包含巨量汉字</h5>
                </div>
              </div>
            </div>
            <!-- 2. 日文卡片：包含平假名，汉字较少，且详情页无简介 -->
            <div class="col oneVideo">
              <div class="card">
                <a href="/video?hid=jp-page">
                  <img src="https://airav.io/storage/cover/big/jp.jpg">
                </a>
                <div class="oneVideo-body">
                  <h5>IPX-100 最初で最後の限界突破。2ヶ月の禁欲が生んだ潜在的覚醒SEX</h5>
                </div>
              </div>
            </div>
            <!-- 3. 中文卡片：汉字数量最多，带中文字幕标签，包含完整中文简介 -->
            <div class="col oneVideo">
              <div class="card">
                <span class="badge">中文字幕</span>
                <a href="/video?hid=cn-page">
                  <img src="https://airav.io/storage/cover/big/cn.jpg">
                </a>
                <div class="oneVideo-body">
                  <h5>IPX-100 最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛</h5>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const cnDetailHtml = `
      <!doctype html>
      <html>
        <head>
          <title>IPX-100 最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛 - airav.io</title>
        </head>
        <body>
          <div class="video-title">
            <h1>IPX-100 最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛</h1>
          </div>
          <div class="video-info">
            <p>這是繁體中文翻譯好的劇情簡介，包含了豐富的情節說明。</p>
            <div class="info-list">
              <li>番號：<span>IPX-100</span></li>
              <li>女優：<a href="#">相澤南</a></li>
            </div>
          </div>
        </body>
      </html>
    `;

    vi.spyOn(crawler, "fetchDocument").mockImplementation(async (url: string) => {
      if (url.includes("/search_result")) {
        return new DOMParser().parseFromString(multiSearchHtml, "text/html");
      }
      if (url.includes("cn-page")) {
        return new DOMParser().parseFromString(cnDetailHtml, "text/html");
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await crawler.scrape("IPX-100");

    expect(result.dvdid).toBe("IPX-100");
    expect(result.url).toContain("cn-page");
    // 成功优选中文标题
    expect(result.title).toBe("最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛");
    // 成功提取同番号日文条目的片名为 ori_title
    expect(result.ori_title).toBe("最初で最後の限界突破。2ヶ月の禁欲が生んだ潜在的覚醒SEX");
    // 成功抓取中文简介
    expect(result.plot).toBe("這是繁體中文翻譯好的劇情簡介，包含了豐富的情節說明。");
    expect(result.actress).toEqual(["相澤南"]);
  });

  it("should never extract view/heart count into ori_title when search card has footer and second card has only dvdid (SNOS-174 scenario)", async () => {
    const crawler = new AirAVCrawler("https://airav.io");

    const snos174SearchHtml = `
      <!doctype html>
      <html>
        <body>
          <div class="row row-cols-2 row-cols-lg-4 g-2 mt-0">
            <!-- 页面 A 卡片：中文标题，带有 155182 浏览与点赞数 -->
            <div class="col oneVideo">
              <div class="card h-100">
                <div class="oneVideo-top">
                  <a href="/video?hid=QC-BT-S3405605">
                    <img src="https://airav.io/storage/cover/big/QC-BT-S3405605.jpg" class="card-img-top">
                  </a>
                </div>
                <div class="oneVideo-body">
                  <h5>SNOS-174 小心被纏上※ 三田真鈴喝醉變成甜美痴女，狂抽素人男子！搭訕反搭訕即插入即發射什麼都行的爆射10發梯次喝酒</h5>
                  <div class="oneVideo-fotter">
                    <p><i class="fa fa-eye"></i>155182</p>
                    <p><i class="fa fa-heart"></i>155182</p>
                  </div>
                </div>
              </div>
            </div>
            <!-- 页面 B 卡片：卡片仅有番号 SNOS-174，带有 117134 浏览与点赞数 -->
            <div class="col oneVideo">
              <div class="card h-100">
                <div class="oneVideo-top">
                  <a href="/video?hid=QC-BT-4533662">
                    <img src="https://airav.io/storage/cover/big/QC-BT-4533662.jpg" class="card-img-top">
                  </a>
                </div>
                <div class="oneVideo-body">
                  <h5>SNOS-174 </h5>
                  <div class="oneVideo-fotter">
                    <p><i class="fa fa-eye"></i>117134</p>
                    <p><i class="fa fa-heart"></i>117134</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const pageADetailHtml = `
      <!doctype html>
      <html>
        <head>
          <title>SNOS-174 小心被纏上※ 三田真鈴喝醉變成甜美痴女 - airav.io</title>
        </head>
        <body>
          <div class="video-title">
            <h1>SNOS-174 小心被纏上※ 三田真鈴喝醉變成甜美痴女，狂抽素人男子！搭訕反搭訕即插入即發射什麼都行的爆射10發梯次喝酒</h1>
          </div>
          <div class="video-info">
            <p>這次的企劃是一邊梯次喝酒一邊抓男人，在早上前讓10發射精！</p>
            <div class="info-list">
              <li>番號：<span>SNOS-174</span></li>
              <li>女優：<a href="#">三田真鈴</a></li>
              <li>廠商：<a href="#">S1 Style</a></li>
            </div>
          </div>
        </body>
      </html>
    `;

    const fetchSpy = vi.spyOn(crawler, "fetchDocument").mockImplementation(async (url: string) => {
      if (url.includes("/search_result")) {
        return new DOMParser().parseFromString(snos174SearchHtml, "text/html");
      }
      if (url.includes("QC-BT-S3405605")) {
        return new DOMParser().parseFromString(pageADetailHtml, "text/html");
      }
      throw new Error(`Unexpected URL fetched: ${url}`);
    });

    const result = await crawler.scrape("SNOS-174");

    expect(result.dvdid).toBe("SNOS-174");
    expect(result.url).toContain("QC-BT-S3405605");
    expect(result.title).toBe(
      "小心被纏上※ 三田真鈴喝醉變成甜美痴女，狂抽素人男子！搭訕反搭訕即插入即發射什麼都行的爆射10發梯次喝酒"
    );
    // 确保绝对不会抓到 117134 / 155182，且因卡片没有日文标题而安全回退为 undefined
    expect(result.ori_title).toBeUndefined();
    expect(result.plot).toBe("這次的企劃是一邊梯次喝酒一邊抓男人，在早上前讓10發射精！");
    expect(result.actress).toEqual(["三田真鈴"]);
    expect(result.producer).toBe("S1 Style");

    // 验证仅发起了 2 次请求（搜索页 + 优选页面 A），绝不多次发起请求去抓取页面 B
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
