import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { LocalManagement } from "../pages/local/LocalManagement";
import { NfoCleanerTab } from "../pages/local/tabs/NfoCleanerTab";

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("LocalManagement 本地管理与 NfoCleanerTab 测试", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string, options?: any) => {
        if (url.includes("/api/config")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              scanner: { input_directory: "D:\\Videos\\Default" },
            }),
          });
        }
        if (url.includes("/api/tools/clean-nfo")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: "ok",
              directory: "D:\\Videos\\Test",
              scanned_files: 5,
              modified_files: 2,
              total_trailer_removed: 2,
              total_actor_thumb_removed: 1,
              error_files: 0,
              dry_run: options?.body ? JSON.parse(options.body).dry_run : false,
              results: [
                {
                  path: "D:\\Videos\\Test\\MIDV-404.nfo",
                  changed: true,
                  trailer_removed: 1,
                  actor_thumb_removed: 1,
                  error: null,
                },
                {
                  path: "D:\\Videos\\Test\\IPX-177.nfo",
                  changed: true,
                  trailer_removed: 1,
                  actor_thumb_removed: 0,
                  error: null,
                },
              ],
            }),
          });
        }
        if (url.includes("/api/tools/preview-nfo")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: "ok",
              path: "D:\\Videos\\Test\\MIDV-404.nfo",
              original: "<?xml version=\"1.0\" ?>\n<movie>\n  <title>MIDV-404</title>\n  <trailer>test.mp4</trailer>\n  <actor>\n    <name>Actress</name>\n    <thumb>act.jpg</thumb>\n  </actor>\n</movie>",
              cleaned: "<?xml version=\"1.0\" ?>\n<movie>\n  <title>MIDV-404</title>\n  <actor>\n    <name>Actress</name>\n  </actor>\n</movie>",
              trailer_removed: 1,
              actor_thumb_removed: 1,
              changed: true,
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

  it("LocalManagement 应能正确渲染并展示头部与子选项卡", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<LocalManagement wsState="connected" />);
    });

    expect(container.textContent).toContain("本地文件管理");
    expect(container.textContent).toContain("NFO 标签清理");
    expect(container.textContent).toContain("海报批量重裁剪");
    expect(container.textContent).toContain("NFO 标签清理工具");

    // 点击切换至海报批量重裁剪选项卡
    const recropTabBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("海报批量重裁剪")
    );
    expect(recropTabBtn).not.toBeNull();

    await act(async () => {
      recropTabBtn?.click();
    });

    expect(container.textContent).toContain("海报批量重裁剪设置");
    expect(container.textContent).toContain("仅限标准大厂比例");
    expect(container.textContent).toContain("自动备份原海报");
  });

  it("NfoCleanerTab 目录为空时点击执行应提示错误", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<NfoCleanerTab wsState="connected" />);
    });

    const execBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("开始执行清理")
    );
    expect(execBtn).not.toBeNull();

    await act(async () => {
      execBtn?.click();
    });

    expect(container.textContent).toContain("请填写需要扫描的目标目录路径");
  });

  it("NfoCleanerTab 点击读取系统输入目录应填充路径", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<NfoCleanerTab wsState="connected" />);
    });

    const fetchBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("读取系统输入目录")
    );
    expect(fetchBtn).not.toBeNull();

    await act(async () => {
      fetchBtn?.click();
    });

    const input = container.querySelector('input[placeholder*="例如:"]') as HTMLInputElement;
    expect(input.value).toBe("D:\\Videos\\Default");
  });

  it("NfoCleanerTab 正常执行清理并展示统计结果", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<NfoCleanerTab wsState="connected" />);
    });

    // 通过点击读取系统目录填充路径
    const fetchBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("读取系统输入目录")
    );
    await act(async () => {
      fetchBtn?.click();
    });

    const execBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("开始执行清理")
    );

    await act(async () => {
      execBtn?.click();
    });


    expect(container.textContent).toContain("处理结果汇总");
    expect(container.textContent).toContain("已扫描文件");
    expect(container.textContent).toContain("5");
    expect(container.textContent).toContain("涉及修改文件");
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("MIDV-404.nfo");
    expect(container.textContent).toContain("IPX-177.nfo");
  });

  it("NfoCleanerTab 开启预览模式时按钮文案与状态应切换", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<NfoCleanerTab wsState="connected" />);
    });

    const dryRunCheckbox = Array.from(container.querySelectorAll("input[type='checkbox']"))[3] as HTMLInputElement;
    expect(dryRunCheckbox).not.toBeNull();

    await act(async () => {
      dryRunCheckbox.click();
    });

    expect(container.textContent).toContain("开始预览扫描");
  });

  it("NfoCleanerTab 点击列表文件应按需打开双栏对比弹窗并展示修改前后内容", async () => {
    const root = createRoot(container);
    await act(async () => {
      root.render(<NfoCleanerTab wsState="connected" />);
    });

    // 填充目录并执行扫描
    const fetchBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("读取系统输入目录")
    );
    await act(async () => {
      fetchBtn?.click();
    });

    const execBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("开始执行清理")
    );
    await act(async () => {
      execBtn?.click();
    });

    // 找到 MIDV-404.nfo 对应行
    const fileRow = Array.from(container.querySelectorAll("div")).find((div) =>
      div.textContent?.includes("MIDV-404.nfo") && div.className.includes("cursor-pointer")
    );
    expect(fileRow).not.toBeNull();

    // 点击行打开对比弹窗
    await act(async () => {
      fileRow?.click();
    });

    // 验证双栏列头存在
    expect(container.textContent).toContain("修改前 (原文件内容)");
    expect(container.textContent).toContain("修改后 (清理后内容)");
    expect(container.textContent).toContain("trailer -1");
    expect(container.textContent).toContain("thumb -1");
    expect(container.textContent).toContain("复制修改后");

    // 验证按 Esc 或点击关闭按钮弹窗关闭
    const closeBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.title?.includes("关闭 (Esc)")
    );
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn?.click();
    });

    expect(container.textContent).not.toContain("修改前 (原文件内容)");
  });
});

