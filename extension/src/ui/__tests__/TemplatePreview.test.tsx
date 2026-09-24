import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  formatTemplate,
  parsePathSegments,
  TEMPLATE_SAMPLE_MOVIE,
  FOLDER_VARS,
  BASENAME_VARS,
  NFO_TITLE_VARS,
  VariablePillSelector,
  FolderBreadcrumbPreview,
  DiskStructurePreview,
  MediaTitlePreview,
} from "../pages/settings/components/TemplatePreview";
import { SummarizerTab } from "../pages/settings/tabs/SummarizerTab";
import { MediaTab } from "../pages/settings/tabs/MediaTab";
import { FullAppConfig } from "../pages/settings/types";

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("TemplatePreview 核心函数与组件测试", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  describe("formatTemplate 变量替换机制", () => {
    it("应正确替换常见番号、女优、标题变量", () => {
      const pattern = "#整理完成/{actress}/[{num}] {title}";
      const result = formatTemplate(pattern);
      expect(result).toBe(
        `#整理完成/${TEMPLATE_SAMPLE_MOVIE.actress}/[${TEMPLATE_SAMPLE_MOVIE.num}] ${TEMPLATE_SAMPLE_MOVIE.title}`
      );
    });

    it("对未知变量应保留原样，避免抛出异常", () => {
      const pattern = "{foo}/{bar}/{num}";
      const result = formatTemplate(pattern);
      expect(result).toBe(`{foo}/{bar}/${TEMPLATE_SAMPLE_MOVIE.num}`);
    });

    it("输入为空或无变量时应优雅处理", () => {
      expect(formatTemplate("")).toBe("");
      expect(formatTemplate("simple_string")).toBe("simple_string");
    });
  });

  describe("parsePathSegments 路径智能解析", () => {
    it("应正确识别 Windows 绝对路径盘符", () => {
      const info = parsePathSegments("E:/MOVIES/{actress}/[{num}]");
      expect(info.isAbsolute).toBe(true);
      expect(info.rootType).toBe("drive");
      expect(info.rootLabel).toBe("E:\\");
      expect(info.segments).toEqual(["MOVIES", TEMPLATE_SAMPLE_MOVIE.actress, `[${TEMPLATE_SAMPLE_MOVIE.num}]`]);
    });

    it("应正确识别 POSIX / NAS 根路径", () => {
      const info = parsePathSegments("/volume1/video/{actress}");
      expect(info.isAbsolute).toBe(true);
      expect(info.rootType).toBe("posix_root");
      expect(info.rootLabel).toBe("/");
      expect(info.segments).toEqual(["volume1", "video", TEMPLATE_SAMPLE_MOVIE.actress]);
    });

    it("应正确识别相对路径", () => {
      const info = parsePathSegments("#整理完成/{actress}/[{num}]");
      expect(info.isAbsolute).toBe(false);
      expect(info.rootType).toBe("relative");
      expect(info.rootLabel).toContain("扫描目标目录");
      expect(info.segments).toEqual(["#整理完成", TEMPLATE_SAMPLE_MOVIE.actress, `[${TEMPLATE_SAMPLE_MOVIE.num}]`]);
    });
  });

  describe("VariablePillSelector 药丸选择器", () => {
    it("点击药丸按钮应触发 onInsert 并传递对应变量 token", async () => {
      const onInsert = vi.fn();
      const root = createRoot(container);

      await act(async () => {
        root.render(<VariablePillSelector vars={FOLDER_VARS} onInsert={onInsert} />);
      });

      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBe(FOLDER_VARS.length);

      // 点击第一个按钮 ({actress})
      await act(async () => {
        buttons[0].click();
      });

      expect(onInsert).toHaveBeenCalledWith("{actress}");
    });
  });

  describe("FolderBreadcrumbPreview 目录层级预览", () => {
    it("相对路径时应渲染相对路径模式与扫描目标目录根", async () => {
      const root = createRoot(container);

      await act(async () => {
        root.render(<FolderBreadcrumbPreview pattern="#整理完成/{actress}/[{num}] {title}" />);
      });

      expect(container.textContent).toContain("相对路径模式");
      expect(container.textContent).toContain("扫描目标目录");
      expect(container.textContent).toContain("#整理完成");
      expect(container.textContent).toContain(TEMPLATE_SAMPLE_MOVIE.actress);
      expect(container.textContent).toContain(`[${TEMPLATE_SAMPLE_MOVIE.num}]`);
    });

    it("绝对路径时（如 E:/MOVIES/...）应直接渲染盘符根而无扫描目标目录前缀", async () => {
      const root = createRoot(container);

      await act(async () => {
        root.render(<FolderBreadcrumbPreview pattern="E:/MOVIES/{actress}/[{num}]" />);
      });

      expect(container.textContent).toContain("绝对路径模式");
      expect(container.textContent).toContain("E:\\");
      expect(container.textContent).not.toContain("扫描目标目录");
      expect(container.textContent).not.toContain("[目标根目录]");
      expect(container.textContent).toContain("MOVIES");
      expect(container.textContent).toContain(TEMPLATE_SAMPLE_MOVIE.actress);
      expect(container.textContent).toContain(`[${TEMPLATE_SAMPLE_MOVIE.num}]`);
    });

    it("空模板应提示存放在扫描目标目录下", async () => {
      const root = createRoot(container);

      await act(async () => {
        root.render(<FolderBreadcrumbPreview pattern="" />);
      });

      expect(container.textContent).toContain("未定义子目录");
    });
  });

  describe("DiskStructurePreview 落盘结构模拟预览", () => {
    it("相对路径时应根据模板实时展示相对目录与文件清单", async () => {
      const root = createRoot(container);

      await act(async () => {
        root.render(
          <DiskStructurePreview
            folderPattern="{actress}/{num}"
            basenamePattern="{num}"
            baseDirectory="D:/download"
          />
        );
      });

      expect(container.textContent).toContain("落盘文件结构动态模拟效果");
      expect(container.textContent).toContain("相对路径");
      expect(container.textContent).toContain("D:/download");
      expect(container.textContent).toContain(`${TEMPLATE_SAMPLE_MOVIE.actress}/${TEMPLATE_SAMPLE_MOVIE.num}`);
      expect(container.textContent).toContain(`${TEMPLATE_SAMPLE_MOVIE.num}.mp4`);
      expect(container.textContent).toContain(`${TEMPLATE_SAMPLE_MOVIE.num}.nfo`);
      expect(container.textContent).toContain(`${TEMPLATE_SAMPLE_MOVIE.num}-poster.jpg`);
      expect(container.textContent).toContain(`${TEMPLATE_SAMPLE_MOVIE.num}.zh.srt`);
    });

    it("绝对路径时应显示绝对路径并移除扫描目标目录前缀", async () => {
      const root = createRoot(container);

      await act(async () => {
        root.render(
          <DiskStructurePreview
            folderPattern="E:/MOVIES/{actress}/[{num}]"
            basenamePattern="{num}"
          />
        );
      });

      expect(container.textContent).toContain("绝对路径");
      expect(container.textContent).not.toContain("扫描目标目录");
      expect(container.textContent).not.toContain("D:/download");
      expect(container.textContent).toContain(`E:/MOVIES/${TEMPLATE_SAMPLE_MOVIE.actress}/[${TEMPLATE_SAMPLE_MOVIE.num}]`);
    });
  });

  describe("MediaTitlePreview 媒体中心标题预览", () => {
    it("应根据 nfo.title_pattern 动态渲染媒体中心标题", async () => {
      const root = createRoot(container);

      await act(async () => {
        root.render(<MediaTitlePreview pattern="[{num}] {title} ({censor})" />);
      });

      expect(container.textContent).toContain("媒体中心 (Emby / Jellyfin / Kodi) 显示效果实时预览");
      expect(container.textContent).toContain(
        `[${TEMPLATE_SAMPLE_MOVIE.num}] ${TEMPLATE_SAMPLE_MOVIE.title} (${TEMPLATE_SAMPLE_MOVIE.censor})`
      );
    });
  });

  describe("SummarizerTab 与 MediaTab 集成渲染", () => {
    const mockFullConfig: FullAppConfig = {
      scanner: {
        ignored_id_pattern: [],
        input_directory: null,
        filename_extensions: [".mp4"],
        ignored_folder_name_pattern: [],
        minimum_size: "200M",
        skip_nfo_dir: true,
      },
      network: { retry: 3, timeout: 10 },
      crawler: { sleep_after_scraping: 1, sleep_jitter: 0.5 },
      crawlers: ["javbus"],
      summarizer: {
        move_files: true,
        path: {
          output_folder_pattern: "#整理完成/{actress}/[{num}] {title}",
          basename_pattern: "{num}",
          length_maximum: 250,
          length_by_byte: true,
          max_actress_count: 10,
          hard_link: false,
        },
        title: { remove_trailing_actor_name: true },
        default: {
          title: "#未知标题",
          actress: "#未知女优",
          series: "#未知系列",
          director: "#未知导演",
          producer: "#未知制作商",
          publisher: "#未知发行商",
        },
        nfo: {
          basename_pattern: "movie",
          title_pattern: "{num} {title}",
          custom_genres_fields: [],
          custom_tags_fields: [],
        },
        censor_options_representation: ["无码", "有码", "未知"],
        cover: {
          basename_pattern: "{num}-poster",
          add_label: false,
          crop: { ratio: 1.5, engine: null },
        },
        fanart: { basename_pattern: "{num}-fanart" },
        extra_fanarts: {
          enabled: true,
          scrap_interval: 0.5,
          timeout: 10,
          max_count: 10,
          uniform_sampling: true,
        },
      },
      translator: {
        engine: "google",
        fields: { title: true, plot: true },
      },
      server: { host: "127.0.0.1", port: 8765 },
    };

    it("SummarizerTab 应能点击变量药丸并追加变量至 output_folder_pattern", async () => {
      let currentCfg = JSON.parse(JSON.stringify(mockFullConfig));
      const updateForm = vi.fn((updater) => {
        currentCfg = updater(currentCfg);
      });
      const root = createRoot(container);

      await act(async () => {
        root.render(<SummarizerTab formConfig={currentCfg} updateForm={updateForm} />);
      });

      // 验证展示了目录预览及落盘结构模拟
      expect(container.textContent).toContain("生成文件夹层级预览");
      expect(container.textContent).toContain("落盘文件结构动态模拟效果");

      // 点击 {year} 变量按钮插入
      const yearBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("{year}")
      );
      expect(yearBtn).toBeDefined();

      await act(async () => {
        yearBtn?.click();
      });

      expect(updateForm).toHaveBeenCalled();
      expect(currentCfg.summarizer.path.output_folder_pattern).toContain("{year}");
    });

    it("MediaTab 应渲染媒体库实时预览并在输入变化时动态联动", async () => {
      let currentCfg = JSON.parse(JSON.stringify(mockFullConfig));
      const updateForm = vi.fn((updater) => {
        currentCfg = updater(currentCfg);
      });
      const root = createRoot(container);

      await act(async () => {
        root.render(<MediaTab formConfig={currentCfg} updateForm={updateForm} />);
      });

      expect(container.textContent).toContain("媒体中心 (Emby / Jellyfin / Kodi) 显示效果实时预览");
      expect(container.textContent).toContain("IPX-177  讓高傲妹妹穿過膝襪露絕對領域");

      // 点击 {censor} 按钮
      const censorBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("{censor}")
      );
      expect(censorBtn).toBeDefined();

      await act(async () => {
        censorBtn?.click();
      });

      expect(updateForm).toHaveBeenCalled();
      expect(currentCfg.summarizer.nfo.title_pattern).toContain("{censor}");
    });
  });
});
