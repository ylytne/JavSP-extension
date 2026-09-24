import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Settings } from "../pages/Settings";
import { ScannerTab } from "../pages/settings/tabs/ScannerTab";
import { NetworkTab } from "../pages/settings/tabs/NetworkTab";
import { SummarizerTab } from "../pages/settings/tabs/SummarizerTab";
import { MediaTab } from "../pages/settings/tabs/MediaTab";
import { TranslatorTab } from "../pages/settings/tabs/TranslatorTab";
import { FullAppConfig } from "../pages/settings/types";

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Settings 模块化组件与 Tab 渲染测试", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    // Mock fetch
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/config/raw")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ yaml: "scanner:\n  skip_nfo_dir: true" }),
          });
        }
        if (url.includes("/api/config")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockConfig,
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

  const mockConfig: FullAppConfig = {
    scanner: {
      ignored_id_pattern: ["^test"],
      input_directory: "D:/Videos",
      filename_extensions: [".mp4", ".mkv"],
      ignored_folder_name_pattern: ["^ignore"],
      minimum_size: "200M",
      skip_nfo_dir: true,
    },
    network: {
      retry: 3,
      timeout: 15,
    },
    crawler: {
      sleep_after_scraping: 1,
      sleep_jitter: 0.5,
    },
    crawlers: ["javbus", "javdb"],
    summarizer: {
      move_files: true,
      path: {
        output_folder_pattern: "{actress}/{num}",
        basename_pattern: "{num}",
        length_maximum: 250,
        length_by_byte: true,
        max_actress_count: 5,
        hard_link: true,
      },
      title: {
        remove_trailing_actor_name: true,
      },
      default: {
        title: "",
        actress: "",
        series: "",
        director: "",
        producer: "",
        publisher: "",
      },
      nfo: {
        basename_pattern: "{num}",
        title_pattern: "{num} {title}",
        custom_genres_fields: [],
        custom_tags_fields: [],
      },
      censor_options_representation: [],
      cover: {
        basename_pattern: "poster",
        add_label: true,
        crop: {
          ratio: 1.5,
          engine: null,
        },
      },
      fanart: {
        basename_pattern: "fanart",
      },
      extra_fanarts: {
        enabled: true,
        scrap_interval: 0.5,
        timeout: 10,
        max_count: 10,
        uniform_sampling: true,
      },
      subtitle: {
        enabled: true,
        auto_c_suffix: false,
        filename_extensions: [".srt", ".vtt", ".ass", ".ssa", ".sbv", ".idx", ".sub"],
      },
    },
    translator: {
      target_lang: "zh-CN",
      engine: { name: "google" },
      fields: {
        title: true,
        plot: true,
      },
    },
    server: {
      host: "127.0.0.1",
      port: 8765,
    },
  };

  it("应成功渲染主 Settings 页面及头部信息", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<Settings wsState="disconnected" />);
    });

    expect(container.textContent).toContain("在线配置管理中心");
    expect(container.textContent).toContain("可视化表单");
    expect(container.textContent).toContain("YAML 源码");
  });

  it("ScannerTab 应能正确展示配置并支持更新输入目录", async () => {
    const updateForm = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<ScannerTab formConfig={mockConfig} updateForm={updateForm} />);
    });

    expect(container.textContent).toContain("默认待整理视频文件夹路径");
    expect(container.textContent).toContain(".mp4");
    expect(container.textContent).toContain(".mkv");

    const input = container.querySelector("input[value='D:/Videos']") as HTMLInputElement;
    expect(input).not.toBeNull();
  });

  it("NetworkTab 应能展示启用的爬虫站点及超时配置", async () => {
    const updateForm = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<NetworkTab formConfig={mockConfig} updateForm={updateForm} />);
    });

    expect(container.textContent).toContain("JavBus");
    expect(container.textContent).toContain("JavDB");
    expect(container.textContent).toContain("AirAV");
    expect(container.textContent).toContain("单次网络请求超时时间");
    expect(container.textContent).toContain("大批量请求冷却防风控保护");
    expect(container.textContent).toContain("连续抓取基准数量");
  });

  it("NetworkTab 应支持配置大批量请求冷却防风控保护的启闭与参数更新", async () => {
    let currentConfig = JSON.parse(JSON.stringify(mockConfig));
    const updateForm = vi.fn((updater) => {
      currentConfig = updater(currentConfig);
    });
    const root = createRoot(container);

    await act(async () => {
      root.render(<NetworkTab formConfig={currentConfig} updateForm={updateForm} />);
    });

    // 检查启闭开关
    const toggle = container.querySelector(
      "input[aria-label='启用大批量请求冷却保护']"
    ) as HTMLInputElement;
    expect(toggle).not.toBeNull();
    expect(toggle.checked).toBe(true);

    // 触发关闭开关
    await act(async () => {
      toggle.click();
    });
    expect(currentConfig.crawler.burst_protection_enabled).toBe(false);

    // 重新渲染为开启状态以测试输入框
    currentConfig.crawler.burst_protection_enabled = true;
    currentConfig.crawler.burst_limit = 10;
    currentConfig.crawler.burst_jitter = 2;
    await act(async () => {
      root.render(<NetworkTab formConfig={currentConfig} updateForm={updateForm} />);
    });

    expect(container.textContent).toContain("当前动态保护节奏");
    expect(container.textContent).toContain("8 ~ 12");
  });

  it("NetworkTab 应支持独立切换启用与停用爬虫站点", async () => {
    let currentConfig = JSON.parse(JSON.stringify(mockConfig));
    const updateForm = vi.fn((updater) => {
      currentConfig = updater(currentConfig);
    });
    const root = createRoot(container);

    await act(async () => {
      root.render(<NetworkTab formConfig={currentConfig} updateForm={updateForm} />);
    });

    // mockConfig 初始启用列表为: javbus, javdb
    expect(currentConfig.crawlers).toEqual(["javbus", "javdb"]);

    // 点击未启用的 AirAV 卡片以启用
    const airavCard = container.querySelector("[data-testid='crawler-card-airav']") as HTMLElement;
    expect(airavCard).not.toBeNull();
    await act(async () => {
      airavCard.click();
    });
    expect(updateForm).toHaveBeenCalled();
    expect(currentConfig.crawlers).toContain("airav");

    // 重新渲染以更新 DOM
    await act(async () => {
      root.render(<NetworkTab formConfig={currentConfig} updateForm={updateForm} />);
    });

    // 点击已启用的 JavBus 卡片以停用
    const javbusCard = container.querySelector("[data-testid='crawler-card-javbus']") as HTMLElement;
    expect(javbusCard).not.toBeNull();
    await act(async () => {
      javbusCard.click();
    });
    expect(currentConfig.crawlers).not.toContain("javbus");
  });

  it("SummarizerTab 应能正确识别并展示整理模式", async () => {
    const updateForm = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<SummarizerTab formConfig={mockConfig} updateForm={updateForm} />);
    });

    expect(container.textContent).toContain("创建硬链接");
    const folderPatternInput = container.querySelector("input[value='{actress}/{num}']") as HTMLInputElement;
    expect(folderPatternInput).not.toBeNull();
  });

  it("SummarizerTab 应能正确展示并切换同名字幕归档与 auto_c_suffix 配置", async () => {
    let currentConfig = JSON.parse(JSON.stringify(mockConfig));
    const updateForm = vi.fn((updater) => {
      currentConfig = updater(currentConfig);
    });
    const root = createRoot(container);

    await act(async () => {
      root.render(<SummarizerTab formConfig={currentConfig} updateForm={updateForm} />);
    });

    expect(container.textContent).toContain("自动归档同名字幕文件");
    expect(container.textContent).toContain("外挂字幕自动标记为中字 (-C)");

    // 找到 auto_c_suffix 复选框并点击切换
    const autoCCheckbox = container.querySelector(
      "input[data-testid='auto-c-suffix-checkbox']"
    ) as HTMLInputElement;
    expect(autoCCheckbox).not.toBeNull();
    expect(autoCCheckbox.checked).toBe(false);

    await act(async () => {
      autoCCheckbox.click();
    });
    expect(updateForm).toHaveBeenCalled();
    expect(currentConfig.summarizer.subtitle.auto_c_suffix).toBe(true);
  });

  it("MediaTab 应能正确渲染封面裁剪比例与剧照配置", async () => {
    const updateForm = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<MediaTab formConfig={mockConfig} updateForm={updateForm} />);
    });

    expect(container.textContent).toContain("合成字幕/无码透明角标水印");
    expect(container.textContent).toContain("开启剧照下载");
  });

  it("TranslatorTab 应能正确渲染语言选择与翻译引擎", async () => {
    const updateForm = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<TranslatorTab formConfig={mockConfig} updateForm={updateForm} />);
    });

    expect(container.textContent).toContain("翻译目标语言");
    expect(container.textContent).toContain("翻译服务提供方");
    expect(container.textContent).toContain("影片标题 (title)");
  });
});
