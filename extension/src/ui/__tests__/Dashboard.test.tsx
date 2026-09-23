import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "../pages/Dashboard";
import { getSourceLabel } from "../pages/dashboard/services/scraperPipeline";

// @ts-ignore
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Dashboard 模块化重构后的组件与服务测试", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    // Mock fetch
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/config")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              scanner: { input_directory: "D:/Videos/Unorganized" },
              network: { retry: 3, timeout: 10 },
              crawlers: ["javbus", "javdb", "airav"],
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

  it("getSourceLabel should correctly identify image source sites", () => {
    expect(getSourceLabel("https://pics.javbus.com/cover/789.jpg")).toBe("JavBus");
    expect(getSourceLabel("https://c0.jdbstatic.com/covers/ab/test.jpg")).toBe("JavDB");
    expect(getSourceLabel("https://pics.dmm.co.jp/mono/movie/adult/test.jpg")).toBe("DMM");
    expect(getSourceLabel("https://airav.io/media/covers/123.jpg")).toBe("AirAV");
    expect(getSourceLabel("https://unknown-site.org/pic.png")).toBe("unknown-site.org");
    expect(getSourceLabel("invalid-url")).toBe("外部源");
  });

  it("should show offline alert when wsState is disconnected", async () => {
    const addLog = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<Dashboard wsState="disconnected" addLog={addLog} />);
    });

    expect(container.textContent).toContain("未能连接到后端服务网关");
    expect(container.textContent).toContain("修改连接配置");
  });

  it("should not show offline alert and should show scan section when wsState is connected", async () => {
    const addLog = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<Dashboard wsState="connected" addLog={addLog} />);
    });

    expect(container.textContent).not.toContain("未能连接到后端服务网关");
    expect(container.textContent).toContain("待整理视频文件夹路径");
    expect(container.textContent).toContain("扫描目录");

    // 默认空状态
    expect(container.textContent).toContain("暂无待整理任务");

    // 爬虫站点提示
    expect(container.textContent).toContain("已启用爬虫站点:");
    expect(container.textContent).toContain("JavBus");
    expect(container.textContent).toContain("JavDB");
    expect(container.textContent).toContain("AirAV");
  });

  it("should allow editing the directory input", async () => {
    const addLog = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(<Dashboard wsState="connected" addLog={addLog} />);
    });

    const input = container.querySelector(
      "input[type='text']"
    ) as HTMLInputElement;
    expect(input).not.toBeNull();

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;

    await act(async () => {
      nativeInputValueSetter?.call(input, "D:/NewMovies");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(input.value).toBe("D:/NewMovies");
  });
});
