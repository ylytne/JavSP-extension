/**
 * 站点反向代理与免代理镜像辅助工具 (Proxy-Free Mirrors)
 */

/**
 * 规范化站点 Base URL
 * - 若为空或纯空白，回退返回 fallbackUrl；
 * - 补齐缺失的 https:// 协议头；
 * - 剔除末尾多余斜杠。
 */
export function normalizeSiteUrl(
  input: string | undefined | null,
  fallbackUrl: string
): string {
  if (!input || !input.trim()) {
    return fallbackUrl ? fallbackUrl.trim().replace(/\/+$/, "") : "";
  }
  let trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return trimmed.replace(/\/+$/, "");
}

export interface ConnectivityTestResult {
  ok: boolean;
  status?: number;
  latency: number;
  error?: string;
}

/**
 * 测试目标站点/镜像地址的网络连通性与响应延时
 */
export async function testSiteConnectivity(
  targetUrl: string,
  timeoutMs = 6000
): Promise<ConnectivityTestResult> {
  const normalized = normalizeSiteUrl(targetUrl, "");
  if (!normalized) {
    return { ok: false, latency: 0, error: "站点地址不可为空" };
  }

  const startTime = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(normalized, {
        method: "HEAD",
        signal: controller.signal,
        credentials: "omit",
      });
      // 部分反向代理或 WAF 禁用 HEAD 请求 (405 Method Not Allowed)
      if (response.status === 405) {
        throw new Error("HEAD not allowed");
      }
    } catch (headErr: any) {
      if (headErr?.name === "AbortError") throw headErr;
      // 降级使用 GET 探测
      response = await fetch(normalized, {
        method: "GET",
        signal: controller.signal,
        credentials: "omit",
      });
    }

    clearTimeout(timer);
    const latency = Math.round(performance.now() - startTime);

    // 状态码 < 500（包含 200、301/302 重定向、甚至 403 WAF 质询）均表明站点网络可达、DNS 正常解析
    const isReachable = response.status < 500;
    return {
      ok: isReachable,
      status: response.status,
      latency,
      error: isReachable ? undefined : `HTTP ${response.status}`,
    };
  } catch (err: any) {
    clearTimeout(timer);
    const latency = Math.round(performance.now() - startTime);
    const isTimeout = err?.name === "AbortError";
    return {
      ok: false,
      latency,
      error: isTimeout ? `连接超时 (>${timeoutMs / 1000}秒)` : err?.message || "网络无法连通",
    };
  }
}
