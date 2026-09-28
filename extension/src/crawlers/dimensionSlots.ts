/**
 * 维度插槽路由核心算法与契约定义 (Dimension Slot Routing Engine)
 *
 * 负责 6 大维度插槽 (cover, previews, chinese, genre, actress, meta) 的
 * 活跃路线求解、白名单能力约束、类型感知验证与顺位萃取。
 */

import { MovieInfo } from "./types";

export interface DimensionRoutingConfig {
  cover: string[];
  previews: string[];
  chinese: string[];
  genre: string[];
  actress: string[];
  meta: string[];
}

export const DEFAULT_DIMENSION_ROUTING: DimensionRoutingConfig = {
  cover: ["javbus", "airav", "javdb"],
  previews: ["javbus", "javdb"],
  chinese: ["airav"],
  genre: ["javdb", "javbus", "airav"],
  actress: ["javbus", "javdb", "airav"],
  meta: ["javbus", "javdb", "airav"],
};

/**
 * 6 大插槽合法的候选站点白名单（专属能力约束）
 * 防止将不具备剧照能力的 AirAV 或不具备人工繁中的站点误引入特定插槽
 */
export const SLOT_ELIGIBLE_SITES: Record<keyof DimensionRoutingConfig, string[]> = {
  cover: ["javbus", "airav", "javdb"],
  actress: ["javbus", "javdb", "airav"],
  genre: ["javdb", "javbus", "airav"],
  meta: ["javbus", "javdb", "airav"],
  previews: ["javbus", "javdb"], // AirAV 无剧照物料，不参与
  chinese: ["airav"], // 当前仅 AirAV 提供自然人工繁中
};

/**
 * 严格类型感知验证器 (SlotValidators)
 * 彻底杜绝 Boolean([]) === true 的真值阻断问题
 */
export const SlotValidators = {
  /**
   * 数组类插槽（如 actress, previews, genre）：
   * 必须是数组，长度大于 0，且至少包含一个去除首尾空格后非空的字符串
   */
  nonEmptyArray: (val: any): boolean => {
    if (!Array.isArray(val) || val.length === 0) return false;
    return val.some((item) => typeof item === "string" && item.trim().length > 0);
  },

  /**
   * 字符串类插槽（如 title, plot, producer, duration 等）：
   * 必须是字符串且去除空格后长度大于 0
   */
  nonEmptyString: (val: any): boolean => {
    return typeof val === "string" && val.trim().length > 0;
  },
};

/**
 * 计算指定插槽维度的实际执行路由
 * @param slot 插槽名称
 * @param routingConfig 用户配置的路由表 (SSOT)
 * @param enabledCrawlers 当前启用的爬虫列表 (crawlers 开关)
 */
export function resolveActiveRoute(
  slot: keyof DimensionRoutingConfig,
  routingConfig?: Partial<DimensionRoutingConfig>,
  enabledCrawlers: string[] = ["javbus", "javdb", "airav"]
): string[] {
  const preferredOrder = routingConfig?.[slot] || DEFAULT_DIMENSION_ROUTING[slot] || [];
  const enabledSet = new Set(enabledCrawlers);
  const eligibleList = SLOT_ELIGIBLE_SITES[slot] || [];
  const eligibleSet = new Set(eligibleList);
  const activeRoute: string[] = [];

  // 判断站点是否具备该插槽能力：
  // 1. 在该插槽白名单中明确具备；
  // 2. 对于未来新接入的站点（非已知老三站 javbus/javdb/airav）：
  //    - chinese 插槽极为特殊（当前仅 AirAV 提供自然繁中），未知新站点不默认具备中文能力；
  //    - 其他通用插槽（cover, previews, actress, genre, meta），新站点默认具备插槽能力，实现即插即用
  const isSiteEligible = (site: string) => {
    if (eligibleSet.has(site)) return true;
    if (slot === "chinese") return false;
    const isKnownOldSite = ["javbus", "javdb", "airav"].includes(site);
    return !isKnownOldSite;
  };

  // 1. 保留 preferredOrder 中已启用且具备该插槽能力的站点，按顺位排列并去重
  for (const site of preferredOrder) {
    if (enabledSet.has(site) && isSiteEligible(site) && !activeRoute.includes(site)) {
      activeRoute.push(site);
    }
  }

  // 2. 自适应长尾追加：若有站点在 enabledCrawlers 中启用了且具备该插槽能力（如未来新接入且开启的站点），
  //    但未在用户的 preferredOrder 中声明，自动按 enabledCrawlers 的顺位追加至末尾兜底！
  for (const site of enabledCrawlers) {
    if (isSiteEligible(site) && !activeRoute.includes(site)) {
      activeRoute.push(site);
    }
  }

  // 3. 极端容错兜底：若经过白名单过滤后 activeRoute 为空，但 enabledCrawlers 中有站点，
  //    回退至 enabledCrawlers 中首个具备该插槽能力的站点；若均不具备该插槽能力，保持为空队列
  if (activeRoute.length === 0 && enabledCrawlers.length > 0) {
    for (const site of enabledCrawlers) {
      if (isSiteEligible(site)) {
        activeRoute.push(site);
        break;
      }
    }
  }

  return activeRoute;
}

export interface SlotResolveResult<T> {
  value: T | undefined;
  source: string | undefined; // 胜出采纳的站点标识
}

/**
 * 沿着活跃路由顺位寻找首个满足验证器的有效物料，遇到空数据自动穿透降级
 */
export function resolveSlot<T>(
  siteData: Record<string, Partial<MovieInfo>>,
  activeRoute: string[],
  extractor: (data: Partial<MovieInfo>) => T | undefined,
  validator: (val: T) => boolean
): SlotResolveResult<T> {
  for (const siteId of activeRoute) {
    const data = siteData[siteId];
    if (!data) continue;
    const rawVal = extractor(data);
    if (rawVal !== undefined && validator(rawVal)) {
      return { value: rawVal, source: siteId };
    }
  }
  return { value: undefined, source: undefined };
}
