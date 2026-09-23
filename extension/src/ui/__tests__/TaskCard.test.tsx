import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TaskCard } from "../components/TaskCard";
import { ScanMovieItem } from "../../crawlers/types";

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("TaskCard UI - 手动更正番号与状态交互", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  const sampleItem: ScanMovieItem = {
    taskId: "test-task-1",
    dvdid: "IPX-177",
    files: ["/path/to/IPX-177.mp4"],
    data_src: "normal",
    hard_sub: false,
    uncensored: false,
    status: "pending",
  };

  it("should render dvdid and allow entering edit mode", async () => {
    const onScrape = vi.fn();
    const onUpdate = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<TaskCard item={sampleItem} onScrapeSingle={onScrape} onUpdateDvdid={onUpdate} />);
    });

    // 默认展示 IPX-177
    expect(container.textContent).toContain("IPX-177");

    // 找到更正按钮并点击
    const editBtn = container.querySelector("button[title='更正番号']") as HTMLButtonElement;
    expect(editBtn).not.toBeNull();

    await act(async () => {
      editBtn.click();
    });

    // 进入编辑态：存在输入框
    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe("IPX-177");

    // 修改输入并保存
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;

    await act(async () => {
      nativeInputValueSetter?.call(input, "SSIS-001");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const saveBtn = container.querySelector("button[title='保存番号 (Enter)']") as HTMLButtonElement;
    expect(saveBtn).not.toBeNull();

    await act(async () => {
      saveBtn.click();
    });

    // 触发了 onUpdateDvdid
    expect(onUpdate).toHaveBeenCalledWith("test-task-1", "SSIS-001");
  });

  it("should render placeholder when dvdid is empty and disable scrape button", async () => {
    const emptyItem: ScanMovieItem = {
      ...sampleItem,
      dvdid: "",
    };
    const onScrape = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<TaskCard item={emptyItem} onScrapeSingle={onScrape} />);
    });

    expect(container.textContent).toContain("未知番号 (点击填写)");

    // 开始刮削按钮应处于 disabled
    const scrapeBtn = container.querySelector("button[disabled]") as HTMLButtonElement;
    expect(scrapeBtn).not.toBeNull();
    expect(scrapeBtn.textContent).toContain("开始刮削");
  });

  it("should cancel edit mode and revert value when Escape key is pressed", async () => {
    const onScrape = vi.fn();
    const onUpdate = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<TaskCard item={sampleItem} onScrapeSingle={onScrape} onUpdateDvdid={onUpdate} />);
    });

    const editBtn = container.querySelector("button[title='更正番号']") as HTMLButtonElement;
    await act(async () => {
      editBtn.click();
    });

    const input = container.querySelector("input[type='text']") as HTMLInputElement;
    expect(input).not.toBeNull();

    // 修改输入
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    await act(async () => {
      nativeInputValueSetter?.call(input, "TEMP-999");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("TEMP-999");

    // 按下 Escape 键取消
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    // 退出编辑态且未调用 onUpdate
    expect(container.querySelector("input[type='text']")).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("IPX-177");
  });

  it("should disable scrape button while actively editing", async () => {
    const onScrape = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<TaskCard item={sampleItem} onScrapeSingle={onScrape} />);
    });

    const editBtn = container.querySelector("button[title='更正番号']") as HTMLButtonElement;
    await act(async () => {
      editBtn.click();
    });

    // 正在编辑时，刮削按钮应被禁用以防止竞态条件
    const scrapeBtn = container.querySelector("button[title='请先确认保存番号 (按 Enter)']") as HTMLButtonElement;
    expect(scrapeBtn).not.toBeNull();
    expect(scrapeBtn.hasAttribute("disabled")).toBe(true);
  });
});

