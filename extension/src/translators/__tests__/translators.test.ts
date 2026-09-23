import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { md5 } from "../utils/md5";
import { GoogleTranslator } from "../google";
import { BingTranslator } from "../bing";
import { BaiduTranslator } from "../baidu";
import { ClaudeTranslator } from "../claude";
import { OpenAITranslator } from "../openai";
import {
  createTranslator,
  translateMovieInfo,
  renderTranslatePrompt,
  DEFAULT_TRANSLATE_PROMPT,
  resolveEngineLangCode,
} from "../index";
import { MovieInfo } from "../../crawlers/types";

describe("MD5 Utility", () => {
  it("computes correct md5 for empty string and ascii", () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5("hello world")).toBe("5eb63bbbe01eeed093cb22bb8f5acdc3");
  });

  it("computes correct md5 for UTF-8 Chinese characters", () => {
    // UTF-8 MD5 of '你好' is 7eca689f0d3389d9dea66ae112e5cfd7
    expect(md5("你好")).toBe("7eca689f0d3389d9dea66ae112e5cfd7");
  });
});

describe("Language Code Mapper (resolveEngineLangCode)", () => {
  it("maps language codes accurately for Google Translate", () => {
    expect(resolveEngineLangCode("google", "zh-CN")).toBe("zh-CN");
    expect(resolveEngineLangCode("google", "zh-TW")).toBe("zh-TW");
    expect(resolveEngineLangCode("google", "en")).toBe("en");
    expect(resolveEngineLangCode("google", "fr")).toBe("fr");
  });

  it("maps language codes accurately for Baidu Translate", () => {
    expect(resolveEngineLangCode("baidu", "zh-CN")).toBe("zh");
    expect(resolveEngineLangCode("baidu", "zh-TW")).toBe("cht");
    expect(resolveEngineLangCode("baidu", "ja")).toBe("jp");
    expect(resolveEngineLangCode("baidu", "ko")).toBe("kor");
    expect(resolveEngineLangCode("baidu", "fr")).toBe("fra");
    expect(resolveEngineLangCode("baidu", "es")).toBe("spa");
  });

  it("maps language codes accurately for Bing Translate", () => {
    expect(resolveEngineLangCode("bing", "zh-CN")).toBe("zh-Hans");
    expect(resolveEngineLangCode("bing", "zh-TW")).toBe("zh-Hant");
    expect(resolveEngineLangCode("bing", "en")).toBe("en");
    expect(resolveEngineLangCode("bing", "fr")).toBe("fr");
  });
});

describe("renderTranslatePrompt", () => {
  it("uses DEFAULT_TRANSLATE_PROMPT and replaces {targetLang} with english natural language name", () => {
    const prompt = renderTranslatePrompt(undefined, "zh-CN");
    expect(prompt).toContain("Translate the following Japanese paragraph into Simplified Chinese");
    expect(prompt).not.toContain("{targetLang}");
  });

  it("replaces {targetLang} with English for en target", () => {
    const prompt = renderTranslatePrompt(undefined, "en");
    expect(prompt).toContain("Translate the following Japanese paragraph into English");
  });

  it("supports {targetLangCn} for Chinese custom prompt", () => {
    const custom = "请将日文翻译为{targetLangCn}。";
    const promptZh = renderTranslatePrompt(custom, "zh-TW");
    expect(promptZh).toBe("请将日文翻译为繁体中文。");

    const promptFr = renderTranslatePrompt(custom, "fr");
    expect(promptFr).toBe("请将日文翻译为法语。");
  });

  it("trims whitespace and falls back to default if custom prompt is whitespace only", () => {
    const prompt = renderTranslatePrompt("   ", "zh-CN");
    expect(prompt).toContain("Simplified Chinese");
  });
});

describe("GoogleTranslator", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("successfully parses sentences and sentence breaks", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sentences: [
          { orig: "美しい日本語。", trans: "优美的日语。" },
          { orig: "次の文です。", trans: "下一句。" },
        ],
      }),
    } as any);

    const translator = new GoogleTranslator();
    const result = await translator.translate("美しい日本語。次の文です。");

    expect(result.error).toBeUndefined();
    expect(result.trans).toBe("优美的日语。下一句。");
    expect(result.orig_break).toEqual(["美しい日本語。", "次の文です。"]);
    expect(result.trans_break).toEqual(["优美的日语。", "下一句。"]);
  });

  it("handles HTTP 429 rate limit error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    } as any);

    const translator = new GoogleTranslator();
    const result = await translator.translate("テスト");

    expect(result.error).toContain("429");
  });

  it("correctly formats target language code in url (e.g. fr for French)", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation(async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sentences: [{ orig: "こんにちは", trans: "Bonjour" }],
        }),
      };
    });

    const translator = new GoogleTranslator({ name: "google", targetLang: "fr" });
    const result = await translator.translate("こんにちは");

    expect(capturedUrl).toContain("tl=fr");
    expect(result.trans).toBe("Bonjour");
  });
});

describe("BingTranslator", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("protects actress names with dynamic dictionary tags and trims sentence trailing spaces", async () => {
    let capturedBody = "";
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = options.body;
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            translations: [
              {
                text: "主演是三上悠亜。 表现优秀。 ",
                sentLen: {
                  srcSentLen: [12, 6],
                  transSentLen: [9, 7],
                },
              },
            ],
          },
        ],
      };
    });

    const translator = new BingTranslator({ name: "bing", api_key: "fake-key" });
    const result = await translator.translate("主演は三上悠亜。素晴らしい。", ["三上悠亜"]);

    expect(capturedBody).toContain(
      '<mstrans:dictionary translation=\\"三上悠亜\\">三上悠亜</mstrans:dictionary>'
    );
    expect(result.error).toBeUndefined();
    expect(result.trans).toBe("主演是三上悠亜。表现优秀。");
    expect(result.trans_break).toEqual(["主演是三上悠亜。", "表现优秀。"]);
  });

  it("maps zh-CN to zh-Hans in Bing request URL", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation(async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => [{ translations: [{ text: "中文译文", sentLen: { srcSentLen: [2], transSentLen: [4] } }] }],
      };
    });

    const translator = new BingTranslator({ name: "bing", api_key: "fake-key", targetLang: "zh-CN" });
    await translator.translate("テスト");

    expect(capturedUrl).toContain("to=zh-Hans");
  });
});

describe("BaiduTranslator", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("generates correct signature and joins paragraphs with newline", async () => {
    let capturedBody = "";
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = options.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          trans_result: [
            { src: "段落一", dst: "段落一译文" },
            { src: "段落二", dst: "段落二译文" },
          ],
        }),
      };
    });

    const translator = new BaiduTranslator({
      name: "baidu",
      app_id: "test_appid",
      api_key: "test_secret",
    });

    const result = await translator.translate("段落一\n段落二");

    expect(capturedBody).toContain("appid=test_appid");
    expect(capturedBody).toContain("sign=");
    expect(result.error).toBeUndefined();
    expect(result.trans).toBe("段落一译文\n段落二译文");
  });

  it("maps zh-TW to cht in Baidu form data", async () => {
    let capturedBody = "";
    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = options.body.toString();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          trans_result: [{ src: "テスト", dst: "測試" }],
        }),
      };
    });

    const translator = new BaiduTranslator({
      name: "baidu",
      app_id: "test_id",
      api_key: "test_key",
      targetLang: "zh-TW",
    });

    await translator.translate("テスト");
    expect(capturedBody).toContain("to=cht");
  });
});

describe("ClaudeTranslator", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends standard Anthropic messages request and parses content", async () => {
    let capturedHeaders: any = {};
    let capturedPayload: any = {};

    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedHeaders = options.headers;
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ text: "测试翻译译文" }],
        }),
      };
    });

    const translator = new ClaudeTranslator({
      name: "claude",
      api_key: "test_claude_key",
    });

    const result = await translator.translate("テストの文章");

    expect(capturedHeaders["x-api-key"]).toBe("test_claude_key");
    expect(capturedPayload.messages[0].content).toBe("テストの文章");
    expect(capturedPayload.system).toContain("Translate the following Japanese");
    expect(result.trans).toBe("测试翻译译文");
  });

  it("supports configurable custom prompt with targetLang interpolation", async () => {
    let capturedPayload: any = {};

    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          content: [{ text: "自定义Prompt翻译译文" }],
        }),
      };
    });

    const translator = new ClaudeTranslator({
      name: "claude",
      api_key: "test_claude_key",
      targetLang: "zh-TW",
      prompt: "Custom translation prompt for {targetLang}: translate carefully.",
    });

    const result = await translator.translate("テストの文章");

    expect(capturedPayload.system).toBe("Custom translation prompt for Traditional Chinese: translate carefully.");
    expect(result.trans).toBe("自定义Prompt翻译译文");
  });
});

describe("OpenAITranslator", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends standard chat completions payload with temperature 0", async () => {
    let capturedHeaders: any = {};
    let capturedPayload: any = {};

    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedHeaders = options.headers;
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { content: "这是OpenAI翻译后的中文" },
            },
          ],
        }),
      };
    });

    const translator = new OpenAITranslator({
      name: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      api_key: "sk-test",
      model: "gpt-4o-mini",
    });

    const result = await translator.translate("日本語のテスト");

    expect(capturedHeaders["Authorization"]).toBe("Bearer sk-test");
    expect(capturedPayload.temperature).toBe(0);
    expect(capturedPayload.model).toBe("gpt-4o-mini");
    expect(result.trans).toBe("这是OpenAI翻译后的中文");
  });

  it("supports configurable custom prompt with targetLang interpolation", async () => {
    let capturedPayload: any = {};

    global.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: { content: "这是自定义Prompt翻译结果" },
            },
          ],
        }),
      };
    });

    const translator = new OpenAITranslator({
      name: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      api_key: "sk-test",
      model: "gpt-4o-mini",
      targetLang: "zh-CN",
      prompt: "你是一位专业翻译官，请将日文翻译成 {targetLangCn}，不要添加多余解释。",
    });

    const result = await translator.translate("テスト");

    expect(capturedPayload.messages[0].role).toBe("system");
    expect(capturedPayload.messages[0].content).toBe("你是一位专业翻译官，请将日文翻译成 简体中文，不要添加多余解释。");
    expect(result.trans).toBe("这是自定义Prompt翻译结果");
  });
});

describe("Factory & translateMovieInfo", () => {
  it("createTranslator returns null when engine is null", () => {
    const t = createTranslator({ engine: null, fields: { title: true, plot: true } });
    expect(t).toBeNull();
  });

  it("injects global target_lang to created translator when not explicitly set in engine", () => {
    const t = createTranslator({
      target_lang: "fr",
      engine: { name: "google" },
      fields: { title: true, plot: true },
    }) as any;

    expect(t).not.toBeNull();
    expect(t.targetLang).toBe("fr");
  });

  it("translates both title and plot and records original fields and breaks", async () => {
    const mockMovie: MovieInfo = {
      dvdid: "IPX-177",
      url: "https://www.javbus.com/IPX-177",
      title: "元のタイトル",
      plot: "元のプロット",
      cover: "https://example.com/cover.jpg",
      covers: [],
      big_covers: [],
      genre: ["标签1"],
      actress: ["相沢みなみ"],
      preview_pics: [],
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        sentences: [{ orig: "元のタイトル", trans: "翻译后的标题" }],
      }),
    } as any);

    const success = await translateMovieInfo(mockMovie, {
      engine: { name: "google" },
      fields: { title: true, plot: true },
    });

    expect(success).toBe(true);
    expect(mockMovie.ori_title).toBe("元のタイトル");
    expect(mockMovie.title).toBe("翻译后的标题");
    expect(mockMovie.ori_plot).toBe("元のプロット");
    expect(mockMovie.plot).toBe("翻译后的标题"); // mock返回同样内容
    expect(mockMovie.title_break).toEqual(["翻译后的标题"]);
    expect(mockMovie.ori_title_break).toEqual(["元のタイトル"]);

    global.fetch = originalFetch;
  });

  it("still translates title when ori_title already exists and prevents duplicate translation", async () => {
    const mockMovie: MovieInfo = {
      dvdid: "IPX-177",
      url: "https://www.javbus.com/IPX-177",
      title: "既存のタイトル",
      ori_title: "既存のオリジナルタイトル",
      cover: "https://example.com/cover.jpg",
      covers: [],
      big_covers: [],
      genre: ["标签1"],
      actress: ["相沢みなみ"],
      preview_pics: [],
    };

    let fetchCount = 0;
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sentences: [{ orig: "既存のタイトル", trans: "已翻译标题" }],
        }),
      };
    });

    const success = await translateMovieInfo(mockMovie, {
      engine: { name: "google" },
      fields: { title: true, plot: false },
    });

    expect(success).toBe(true);
    expect(fetchCount).toBe(1);
    expect(mockMovie.ori_title).toBe("既存のオリジナルタイトル");
    expect(mockMovie.title).toBe("已翻译标题");
    expect(mockMovie.title_translated).toBe(true);

    // 再次调用，应当命中 title_translated 防重，不再发起网络请求
    const secondCall = await translateMovieInfo(mockMovie, {
      engine: { name: "google" },
      fields: { title: true, plot: false },
    });
    expect(secondCall).toBe(true);
    expect(fetchCount).toBe(1);

    global.fetch = originalFetch;
  });

  it("skips translation when target language is Chinese and content is already Chinese", async () => {
    const mockMovie: MovieInfo = {
      dvdid: "IPX-100",
      url: "https://airav.io/video?hid=test",
      title: "最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛",
      plot: "這是繁體中文翻譯好的劇情簡介，完全不含日文平假名。",
      cover: "https://example.com/cover.jpg",
      covers: [],
      big_covers: [],
      genre: ["标签1"],
      actress: ["河北彩伽"],
      preview_pics: [],
    };

    let fetchCount = 0;
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const logs: string[] = [];
    const success = await translateMovieInfo(
      mockMovie,
      {
        target_lang: "zh-CN",
        engine: { name: "google" },
        fields: { title: true, plot: true },
      },
      (level, msg) => logs.push(msg)
    );

    expect(success).toBe(true);
    // 零网络请求调用
    expect(fetchCount).toBe(0);
    // 标记为已翻译
    expect(mockMovie.title_translated).toBe(true);
    expect(mockMovie.plot_translated).toBe(true);
    // 标题与剧情内容完整保留原中文
    expect(mockMovie.title).toBe("最初也是最後的極限挑戰。2個月禁慾後的潛在覺醒性愛");
    expect(mockMovie.plot).toBe("這是繁體中文翻譯好的劇情簡介，完全不含日文平假名。");
    // 日志中有跳过记录
    expect(logs.some((l) => l.includes("自动跳过标题翻译"))).toBe(true);
    expect(logs.some((l) => l.includes("自动跳过简介翻译"))).toBe(true);

    global.fetch = originalFetch;
  });

  it("does NOT skip translation when target language is English even if content is Chinese", async () => {
    const mockMovie: MovieInfo = {
      dvdid: "IPX-100",
      url: "https://airav.io/video?hid=test",
      title: "最初也是最後的極限挑戰",
      cover: "https://example.com/cover.jpg",
      covers: [],
      big_covers: [],
      genre: ["标签1"],
      actress: ["河北彩伽"],
      preview_pics: [],
    };

    let fetchCount = 0;
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sentences: [{ orig: "最初也是最後的極限挑戰", trans: "First and last extreme challenge" }],
        }),
      };
    });

    const success = await translateMovieInfo(mockMovie, {
      target_lang: "en",
      engine: { name: "google" },
      fields: { title: true, plot: false },
    });

    expect(success).toBe(true);
    expect(fetchCount).toBe(1);
    expect(mockMovie.title).toBe("First and last extreme challenge");
    expect(mockMovie.title_translated).toBe(true);

    global.fetch = originalFetch;
  });
});

describe("OpenAI Translator Enhancements", () => {
  it("normalizes base URL to chat completions endpoint", async () => {
    const { normalizeChatCompletionsUrl } = await import("../openai");
    expect(normalizeChatCompletionsUrl("https://api.deepseek.com")).toBe(
      "https://api.deepseek.com/chat/completions"
    );
    expect(normalizeChatCompletionsUrl("https://api.openai.com/v1/")).toBe(
      "https://api.openai.com/v1/chat/completions"
    );
    expect(normalizeChatCompletionsUrl("https://api.groq.com/openai/v1/chat/completions")).toBe(
      "https://api.groq.com/openai/v1/chat/completions"
    );
  });

  it("cleans <think> tags and wrapping quotes in LLM responses", async () => {
    const { cleanLLMResponse } = await import("../openai");
    const withThink = "<think>Let me translate this Japanese title...</think>新人女优 出道作品";
    expect(cleanLLMResponse(withThink)).toBe("新人女优 出道作品");

    const withQuotes = '  "新人女优 出道作品"  ';
    expect(cleanLLMResponse(withQuotes)).toBe("新人女优 出道作品");

    const withJapaneseQuotes = "「新人女优 出道作品」";
    expect(cleanLLMResponse(withJapaneseQuotes)).toBe("新人女优 出道作品");
  });
});
