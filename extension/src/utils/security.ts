/**
 * 前端超链接安全白名单校验工具
 * 防御通过伪协议 (javascript:, data:, vbscript:) 发起的恶意脚本执行与跨站攻击
 */

/**
 * 校验并清洗 URL，仅允许 http:// 或 https:// 协议的合法外部链接。
 * 若链接为空或协议不受信，返回 undefined。
 */
export function sanitizeHttpUrl(url: string | null | undefined): string | undefined {
  if (!url || typeof url !== "string") {
    return undefined;
  }
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return trimmed;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}
