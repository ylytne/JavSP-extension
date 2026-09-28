import { describe, it, expect } from "vitest";
import {
  DEFAULT_DIMENSION_ROUTING,
  SLOT_ELIGIBLE_SITES,
  SlotValidators,
  resolveActiveRoute,
  resolveSlot,
} from "../dimensionSlots";

describe("dimensionSlots 核心引擎与验证器测试", () => {
  describe("SlotValidators", () => {
    it("nonEmptyArray 应精确识别有效数组，拒绝空数组与纯空白项", () => {
      expect(SlotValidators.nonEmptyArray([])).toBe(false);
      expect(SlotValidators.nonEmptyArray([""])).toBe(false);
      expect(SlotValidators.nonEmptyArray(["   ", "　"])).toBe(false);
      expect(SlotValidators.nonEmptyArray(null)).toBe(false);
      expect(SlotValidators.nonEmptyArray(undefined)).toBe(false);
      expect(SlotValidators.nonEmptyArray({})).toBe(false);
      expect(SlotValidators.nonEmptyArray("not-array")).toBe(false);

      expect(SlotValidators.nonEmptyArray(["相沢みなみ"])).toBe(true);
      expect(SlotValidators.nonEmptyArray(["", "小宵こなん"])).toBe(true);
    });

    it("nonEmptyString 应精确识别非空字符串，拒绝纯空白", () => {
      expect(SlotValidators.nonEmptyString("")).toBe(false);
      expect(SlotValidators.nonEmptyString("   ")).toBe(false);
      expect(SlotValidators.nonEmptyString(null)).toBe(false);
      expect(SlotValidators.nonEmptyString(undefined)).toBe(false);
      expect(SlotValidators.nonEmptyString(123)).toBe(false);

      expect(SlotValidators.nonEmptyString("有效标题")).toBe(true);
    });
  });

  describe("resolveActiveRoute 动态路由求解器", () => {
    it("应默认返回包含所有已启用且合法的站点列表", () => {
      const route = resolveActiveRoute("cover");
      expect(route).toEqual(["javbus", "airav", "javdb"]);
    });

    it("previews 专属能力约束：AirAV 不参与剧照插槽", () => {
      const route = resolveActiveRoute("previews", undefined, ["airav", "javdb", "javbus"]);
      expect(route).toEqual(["javbus", "javdb"]);
      expect(route).not.toContain("airav");
    });

    it("chinese 专属能力约束：仅 AirAV 参与自然繁中插槽", () => {
      const route = resolveActiveRoute("chinese", undefined, ["javbus", "javdb", "airav"]);
      expect(route).toEqual(["airav"]);
    });

    it("自适应长尾追加：新启用但未在配置中声明的站点自动追加到末尾", () => {
      const route = resolveActiveRoute(
        "actress",
        { actress: ["javdb"] },
        ["javbus", "javdb", "airav"]
      );
      // javdb 优先，其余启用的合法站点按 enabledCrawlers 顺序追加
      expect(route).toEqual(["javdb", "javbus", "airav"]);
    });

    it("未来新站点融入：新站点自动具备通用插槽能力", () => {
      const route = resolveActiveRoute(
        "actress",
        { actress: ["javbus", "javdb"] },
        ["dmm"]
      );
      expect(route).toEqual(["dmm"]);
    });

    it("极端空列表兜底：若启用的站点均不具备该插槽能力（如仅启用 javbus 时的 chinese 插槽），应安全返回空数组而不误引入", () => {
      const route = resolveActiveRoute("chinese", { chinese: [] }, ["javbus"]);
      expect(route).toEqual([]);
    });

    it("previews 插槽能力约束：仅启用 airav 时 previews 活跃路由为空", () => {
      const route = resolveActiveRoute("previews", undefined, ["airav"]);
      expect(route).toEqual([]);
    });

    it("极端配置兜底：当用户配置了空数组时，自动由启用的合法站点按兜底顺位填充", () => {
      const route = resolveActiveRoute("actress", { actress: [] }, ["javdb", "javbus"]);
      expect(route).toEqual(["javdb", "javbus"]);
    });
  });

  describe("resolveSlot 顺位萃取器", () => {
    it("应顺位萃取首个满足验证器的物料并返回胜出站点标识", () => {
      const siteData = {
        javbus: { actress: [] },
        javdb: { actress: ["小宵こなん"] },
        airav: { actress: ["相沢みなみ"] },
      };
      const result = resolveSlot(
        siteData,
        ["javbus", "javdb", "airav"],
        (d) => d.actress,
        SlotValidators.nonEmptyArray
      );
      expect(result.value).toEqual(["小宵こなん"]);
      expect(result.source).toBe("javdb");
    });

    it("若所有站点均不满足则返回 undefined", () => {
      const siteData = {
        javbus: { actress: [] },
        javdb: { actress: [] },
      };
      const result = resolveSlot(
        siteData,
        ["javbus", "javdb"],
        (d) => d.actress,
        SlotValidators.nonEmptyArray
      );
      expect(result.value).toBeUndefined();
      expect(result.source).toBeUndefined();
    });
  });
});
