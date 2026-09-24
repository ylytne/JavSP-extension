import { describe, it, expect } from "vitest";
import { cleanActressName, removeTrailingActorName, summarizeMovieResults } from "../summarizer";
import { MovieInfo } from "../types";

describe("cleanActressName", () => {
  it("should remove full-width parentheses with alias", () => {
    expect(cleanActressName("めぐり（藤浦めぐ）")).toBe("めぐり");
  });

  it("should remove half-width parentheses with alias", () => {
    expect(cleanActressName("葵つかさ(葵司)")).toBe("葵つかさ");
  });

  it("should remove brackets with alias", () => {
    expect(cleanActressName("安斋らら［RION］")).toBe("安斋らら");
    expect(cleanActressName("安斋らら[RION]")).toBe("安斋らら");
  });

  it("should handle spaces around parentheses", () => {
    expect(cleanActressName("めぐり （藤浦めぐ）")).toBe("めぐり");
    expect(cleanActressName("  葵つかさ (葵司)  ")).toBe("葵つかさ");
  });

  it("should not modify normal names without parentheses", () => {
    expect(cleanActressName("相沢みなみ")).toBe("相沢みなみ");
    expect(cleanActressName("三上悠亜")).toBe("三上悠亜");
  });

  it("should keep raw name if only parentheses exist", () => {
    expect(cleanActressName("（未知女优）")).toBe("（未知女优）");
  });
});

describe("removeTrailingActorName", () => {
  it("should remove trailing actress name separated by space", () => {
    const title = "相思相愛の温泉旅行 相沢みなみ";
    const cleaned = removeTrailingActorName(title, ["相沢みなみ"]);
    expect(cleaned).toBe("相思相愛の温泉旅行");
  });

  it("should remove trailing actress name separated by hyphen", () => {
    const title = "相思相愛の温泉旅行-相沢みなみ";
    const cleaned = removeTrailingActorName(title, ["相沢みなみ"]);
    expect(cleaned).toBe("相思相愛の温泉旅行");
  });

  it("should handle multiple actresses", () => {
    const title = "美少女大乱交 三上悠亜・相沢みなみ";
    const cleaned = removeTrailingActorName(title, ["三上悠亜", "相沢みなみ"]);
    expect(cleaned).toBe("美少女大乱交");
  });

  it("should not modify title if actress is in the middle", () => {
    const title = "相沢みなみ的大冒险 完结篇";
    const cleaned = removeTrailingActorName(title, ["相沢みなみ"]);
    expect(cleaned).toBe("相沢みなみ的大冒险 完结篇");
  });
});

describe("summarizeMovieResults", () => {
  const mockJavbus: Partial<MovieInfo> = {
    dvdid: "IPX-177",
    title: "相思相愛の温泉旅行 相沢みなみ",
    cover: "https://javbus.com/big_cover.jpg",
    big_cover: "https://javbus.com/big_cover.jpg",
    publish_date: "2023-05-01",
    duration: "120",
    genre: ["温泉", "巨乳"],
    genre_id: ["v", "2h"],
    actress: ["相沢みなみ"],
    actress_pics: { "相沢みなみ": "https://javbus.com/avatar.jpg" },
    preview_pics: ["https://javbus.com/p1.jpg", "https://javbus.com/p2.jpg"],
  };

  const mockJavdb: Partial<MovieInfo> = {
    dvdid: "IPX-177",
    title: "相思相愛の温泉旅行",
    cover: "https://javdb.com/watermarked_cover.jpg",
    score: "8.60",
    producer: "IdeaPocket",
    genre: ["温泉", "单体作品"],
    genre_id: ["tags?c7=161"],
    actress: ["相沢みなみ"],
    preview_pics: [
      "https://javdb.com/p1_same.jpg",
      "https://javdb.com/p2_same.jpg",
      "https://javdb.com/p3_same.jpg",
    ],
  };

  it("should merge correctly and downgrade JavDB cover", () => {
    const summarized = summarizeMovieResults(
      { javbus: mockJavbus, javdb: mockJavdb },
      ["javbus", "javdb"],
      { hardSub: true, uncensored: true }
    );

    expect(summarized.dvdid).toBe("IPX-177");
    // Title actress should be cleaned
    expect(summarized.title).toBe("相思相愛の温泉旅行");
    // JavBus cover takes precedence
    expect(summarized.cover).toBe("https://javbus.com/big_cover.jpg");
    // JavDB cover is in covers list after JavBus cover
    expect(summarized.covers).toEqual([
      "https://javbus.com/big_cover.jpg",
      "https://javdb.com/watermarked_cover.jpg",
    ]);
    // Fields from JavDB filled in
    expect(summarized.score).toBe("8.60");
    expect(summarized.producer).toBe("IdeaPocket");
    // JavDB 分类单源霸权
    expect(summarized.genre_id).toEqual(["tags?c7=161"]);
    // Special flags injected
    expect(summarized.genre).toContain("温泉");
    expect(summarized.genre).toContain("单体作品");
    expect(summarized.genre).toContain("内嵌字幕");
    expect(summarized.genre).toContain("无码流出/破解");
    expect(summarized.uncensored).toBe(true);
  });

  it("should prioritize airav when priorityOrder has airav first", () => {
    const mockAirav: Partial<MovieInfo> = {
      dvdid: "IPX-177",
      title: "相思相愛的溫泉旅行 (官方中文版)",
      cover: "https://airav.io/airav_cover.jpg",
      plot: "AirAV 的中文劇情簡介",
    };

    const summarized = summarizeMovieResults(
      { javbus: mockJavbus, airav: mockAirav },
      ["airav", "javbus"]
    );

    expect(summarized.title).toBe("相思相愛的溫泉旅行 (官方中文版)");
    expect(summarized.cover).toBe("https://airav.io/airav_cover.jpg");
    expect(summarized.plot).toBe("AirAV 的中文劇情簡介");
    // JavBus cover follows AirAV cover
    expect(summarized.covers).toEqual([
      "https://airav.io/airav_cover.jpg",
      "https://javbus.com/big_cover.jpg",
    ]);
  });

  it("should still downgrade javdb watermarked cover when javdb is placed first in priorityOrder", () => {
    const summarized = summarizeMovieResults(
      { javbus: mockJavbus, javdb: mockJavdb },
      ["javdb", "javbus"]
    );

    expect(summarized.score).toBe("8.60");
    // Cover is downgraded to JavBus because JavDB has a watermark
    expect(summarized.cover).toBe("https://javbus.com/big_cover.jpg");
    expect(summarized.covers).toEqual([
      "https://javbus.com/big_cover.jpg",
      "https://javdb.com/watermarked_cover.jpg",
    ]);
  });

  it("should use javdb cover if it is the only available cover source and fallback is allowed", () => {
    const summarized = summarizeMovieResults(
      { javdb: mockJavdb },
      ["javdb"],
      { useJavdbCover: "fallback" }
    );

    expect(summarized.cover).toBe("https://javdb.com/watermarked_cover.jpg");
    expect(summarized.covers).toEqual(["https://javdb.com/watermarked_cover.jpg"]);
  });

  it("should allow empty cover without throwing error when use_javdb_cover is never and only javdb has cover", () => {
    const summarized = summarizeMovieResults(
      { javdb: mockJavdb },
      ["javdb"],
      { useJavdbCover: "never" }
    );

    expect(summarized.cover).toBe("");
    expect(summarized.covers).toEqual([]);
    expect(summarized.title).toBe("相思相愛の温泉旅行");
  });

  it("should adopt preview_pics strictly from a single source (JavBus > JavDB) without union", () => {
    const summarized = summarizeMovieResults(
      { javbus: mockJavbus, javdb: mockJavdb },
      ["javbus", "javdb"]
    );

    // 严禁并集，100% 独占采纳 JavBus 整套剧照
    expect(summarized.preview_pics).toEqual([
      "https://javbus.com/p1.jpg",
      "https://javbus.com/p2.jpg",
    ]);
  });

  it("should enforce JavDB genre hegemony exclusively", () => {
    const summarized = summarizeMovieResults(
      { javbus: mockJavbus, javdb: mockJavdb },
      ["javbus", "javdb"]
    );

    // 仅采纳 JavDB 分类，不掺杂 JavBus 的 "巨乳"
    expect(summarized.genre).toEqual(["温泉", "单体作品"]);
    expect(summarized.genre_id).toEqual(["tags?c7=161"]);
  });

  it("should arbitrate numeric title by consensus (keep when 2+ agree, discard when lone number)", () => {
    // 场景 A: 单个站点的脏数字 (如 AirAV 117134 浏览量)，有正常日文标题 -> 丢弃数字
    const dirtySiteData: Record<string, Partial<MovieInfo>> = {
      javbus: {
        dvdid: "SNOS-174",
        title: "泥酔痴女に絡まれて朝まで10発 三田真鈴",
        cover: "https://javbus.com/cover.jpg",
        actress: ["三田真鈴"],
      },
      airav: {
        dvdid: "SNOS-174",
        ori_title: "117134",
        cover: "https://airav.io/cover.jpg",
      },
    };

    const dirtySummarized = summarizeMovieResults(dirtySiteData, ["javbus", "airav"]);
    expect(dirtySummarized.ori_title).toBe("泥酔痴女に絡まれて朝まで10発");
    expect(dirtySummarized.title).toBe("泥酔痴女に絡まれて朝まで10発");

    // 场景 B: 多个站点共识的纯数字片名 (如《42》) -> 采纳数字
    const num42SiteData: Record<string, Partial<MovieInfo>> = {
      javbus: {
        dvdid: "XYZ-042",
        title: "42",
        cover: "https://javbus.com/cover.jpg",
      },
      javdb: {
        dvdid: "XYZ-042",
        title: "42",
        cover: "https://javdb.com/cover.jpg",
      },
    };

    const num42Summarized = summarizeMovieResults(num42SiteData, ["javbus", "javdb"]);
    expect(num42Summarized.title).toBe("42");
    expect(num42Summarized.ori_title).toBe("42");
  });

  it("should route Chinese title to title and Japanese to ori_title based on language perception", () => {
    const mockAiravZh: Partial<MovieInfo> = {
      dvdid: "SNOS-174",
      title: "小心被纏上※ 三田真鈴喝醉變成甜美痴女！搭訕反搭訕即插入即發射什麼都行的爆射10發梯次喝酒",
      plot: "這是繁體中文劇情簡介",
      cover: "https://airav.io/cover.jpg",
    };

    const mockJavbusJa: Partial<MovieInfo> = {
      dvdid: "SNOS-174",
      title: "泥酔痴女に絡まれて朝まで10発 三田真鈴",
      cover: "https://javbus.com/cover.jpg",
      actress: ["三田真鈴"],
    };

    const summarized = summarizeMovieResults(
      { javbus: mockJavbusJa, airav: mockAiravZh },
      ["javbus", "airav"]
    );

    // 语言感知器感知到 AirAV 为中文，自动推选为 title
    expect(summarized.title).toBe(
      "小心被纏上※ 三田真鈴喝醉變成甜美痴女！搭訕反搭訕即插入即發射什麼都行的爆射10發梯次喝酒"
    );
    // JavBus 假名日文标题自动推选为 ori_title，并清洗女优名
    expect(summarized.ori_title).toBe("泥酔痴女に絡まれて朝まで10発");
    expect(summarized.plot).toBe("這是繁體中文劇情簡介");
  });

  it("should adopt actress from JavBus and avoid cross-language duplication with AirAV", () => {
    const siteData: Record<string, Partial<MovieInfo>> = {
      airav: {
        dvdid: "ABF-358",
        title: "究極のぬるぬるオーガズム (官方中文版)",
        cover: "https://airav.io/cover.jpg",
        actress: ["涼森玲夢"], // 中文译名
      },
      javbus: {
        dvdid: "ABF-358",
        title: "究極のぬるぬるオーガズム 涼森れむ",
        cover: "https://javbus.com/cover.jpg",
        actress: ["涼森れむ"], // 日文原名
        actress_pics: { "涼森れむ": "https://javbus.com/remu.jpg" },
      },
    };

    // 即使 priorityOrder 将 airav 排在首位，女优也应当单源采纳权威日文名与头像，严禁中日文重复并集
    const summarized = summarizeMovieResults(siteData, ["airav", "javbus"]);
    expect(summarized.actress).toEqual(["涼森れむ"]);
    expect(summarized.actress_pics).toEqual({ "涼森れむ": "https://javbus.com/remu.jpg" });
  });

  it("should strip alias parentheses from actress name and align actress_pics keys", () => {
    const siteData: Record<string, Partial<MovieInfo>> = {
      javbus: {
        dvdid: "SOE-999",
        title: "超高級ソープへようこそ めぐり（藤浦めぐ）",
        cover: "https://javbus.com/soe999.jpg",
        actress: ["めぐり（藤浦めぐ）", "葵つかさ(葵司)"],
        actress_pics: {
          "めぐり（藤浦めぐ）": "https://javbus.com/meguri.jpg",
          "葵つかさ(葵司)": "https://javbus.com/aoi.jpg",
        },
      },
    };

    const summarized = summarizeMovieResults(siteData, ["javbus"]);

    // 女优名字切括号
    expect(summarized.actress).toEqual(["めぐり", "葵つかさ"]);
    // 头像 Key 自动对齐重命名为主艺名
    expect(summarized.actress_pics).toEqual({
      めぐり: "https://javbus.com/meguri.jpg",
      葵つかさ: "https://javbus.com/aoi.jpg",
    });
    // 标题尾部女优名（包含带括号的原名）应被成功清洗
    expect(summarized.title).toBe("超高級ソープへようこそ");
  });

  it("should preserve alias parentheses when cleanActressAlias is false", () => {
    const siteData: Record<string, Partial<MovieInfo>> = {
      javbus: {
        dvdid: "SOE-999",
        title: "超高級ソープへようこそ めぐり（藤浦めぐ）",
        cover: "https://javbus.com/soe999.jpg",
        actress: ["めぐり（藤浦めぐ）"],
        actress_pics: {
          "めぐり（藤浦めぐ）": "https://javbus.com/meguri.jpg",
        },
      },
    };

    const summarized = summarizeMovieResults(siteData, ["javbus"], {
      cleanActressAlias: false,
    });

    expect(summarized.actress).toEqual(["めぐり（藤浦めぐ）"]);
    expect(summarized.actress_pics).toEqual({
      "めぐり（藤浦めぐ）": "https://javbus.com/meguri.jpg",
    });
  });

  it("should throw error if title is missing", () => {
    expect(() => {
      summarizeMovieResults({
        javbus: { dvdid: "IPX-177", cover: "https://javbus.com/cover.jpg" },
      });
    }).toThrow(/缺少必填字段/);
  });
});
