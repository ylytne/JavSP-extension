/**
 * 扩展端连接服务配置管理 (独立于后端 config.yml，保存在浏览器 chrome.storage.local)
 */

const STORAGE_KEY_ADDR = "javsp_server_address";
const STORAGE_KEY_TOKEN = "javsp_api_token";
export const DEFAULT_SERVER_ADDRESS = "127.0.0.1:8765";

export type ServerConfigChangeListener = (
  newAddress: string,
  token: string,
  httpUrl: string,
  wsUrl: string
) => void;

class ServerConfigService {
  private currentAddress: string = DEFAULT_SERVER_ADDRESS;
  private currentToken: string = "";
  private isInitialized = false;
  private listeners: Set<ServerConfigChangeListener> = new Set();

  constructor() {
    this.init();
  }

  /**
   * 初始化：从 chrome.storage.local 或 localStorage 异步加载已保存的后端地址和 Token
   */
  public async init(): Promise<{ address: string; token: string }> {
    if (this.isInitialized) {
      return { address: this.currentAddress, token: this.currentToken };
    }

    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get([STORAGE_KEY_ADDR, STORAGE_KEY_TOKEN]);
        if (result && result[STORAGE_KEY_ADDR]) {
          this.currentAddress = this.normalizeAddress(result[STORAGE_KEY_ADDR]);
        }
        if (result && typeof result[STORAGE_KEY_TOKEN] === "string") {
          this.currentToken = result[STORAGE_KEY_TOKEN].trim();
        }
      } else if (typeof localStorage !== "undefined") {
        const savedAddr = localStorage.getItem(STORAGE_KEY_ADDR);
        if (savedAddr) {
          this.currentAddress = this.normalizeAddress(savedAddr);
        }
        const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        if (savedToken) {
          this.currentToken = savedToken.trim();
        }
      }
    } catch (e) {
      console.warn("[ServerConfig] 读取本地存储失败，使用默认配置:", e);
    }

    this.isInitialized = true;
    return { address: this.currentAddress, token: this.currentToken };
  }

  /**
   * 清洗与规整用户输入的地址
   * 支持: "127.0.0.1:8765", "http://192.168.1.100:8765/", "https://nas.lan:8765" 等
   */
  public normalizeAddress(input: string): string {
    if (!input || !input.trim()) {
      return DEFAULT_SERVER_ADDRESS;
    }
    let s = input.trim();
    // 移除末尾斜杠
    s = s.replace(/\/+$/, "");
    return s;
  }

  /**
   * 同步获取当前内存中的服务器地址 (默认 127.0.0.1:8765)
   */
  public getCurrentServerAddress(): string {
    return this.currentAddress;
  }

  /**
   * 异步获取配置的服务器地址（确保已从 storage 读取）
   */
  public async getServerAddress(): Promise<string> {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.currentAddress;
  }

  /**
   * 同步获取当前内存中的 Token
   */
  public getCurrentApiToken(): string {
    return this.currentToken;
  }

  /**
   * 异步获取配置的 Token（确保已从 storage 读取）
   */
  public async getApiToken(): Promise<string> {
    if (!this.isInitialized) {
      await this.init();
    }
    return this.currentToken;
  }

  /**
   * 获取 HTTP 鉴权请求头（若未配置 Token 则返回空对象）
   */
  public getAuthHeaders(token?: string): Record<string, string> {
    const tok = token !== undefined ? token.trim() : this.currentToken.trim();
    if (!tok) return {};
    return {
      Authorization: `Bearer ${tok}`,
    };
  }

  /**
   * 解析出 HTTP Base URL（例如 "http://192.168.1.100:8765"）
   */
  public getHttpBaseUrl(address?: string): string {
    const raw = address !== undefined ? this.normalizeAddress(address) : this.currentAddress;
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw.replace(/\/+$/, "");
    }
    return `http://${raw}`;
  }

  /**
   * 解析出 WebSocket URL（例如 "ws://192.168.1.100:8765/ws?token=..."）
   */
  public getWsUrl(address?: string, token?: string): string {
    const raw = address !== undefined ? this.normalizeAddress(address) : this.currentAddress;
    const tok = token !== undefined ? token.trim() : this.currentToken.trim();
    let base = raw;
    let isSecure = false;

    if (base.startsWith("https://")) {
      base = base.substring(8);
      isSecure = true;
    } else if (base.startsWith("http://")) {
      base = base.substring(7);
      isSecure = false;
    } else if (base.startsWith("wss://")) {
      base = base.substring(6);
      isSecure = true;
    } else if (base.startsWith("ws://")) {
      base = base.substring(5);
      isSecure = false;
    }

    base = base.replace(/\/+$/, "");
    let wsBase = base;
    if (!wsBase.endsWith("/ws")) {
      wsBase = `${wsBase}/ws`;
    }

    const fullProtocolUrl = isSecure ? `wss://${wsBase}` : `ws://${wsBase}`;
    if (tok) {
      return `${fullProtocolUrl}?token=${encodeURIComponent(tok)}`;
    }
    return fullProtocolUrl;
  }

  /**
   * 构造流式图片请求 URL（附带安全鉴权 Token）
   */
  public getImageUrl(finalPath: string, address?: string, token?: string): string {
    const baseUrl = this.getHttpBaseUrl(address);
    const tok = token !== undefined ? token.trim() : this.currentToken.trim();
    let url = `${baseUrl}/api/image?dir=${encodeURIComponent(finalPath)}`;
    if (tok) {
      url += `&token=${encodeURIComponent(tok)}`;
    }
    return url;
  }

  /**
   * 保存新的服务器地址与 Token 到 chrome.storage.local
   * 注意：此方法仅更新浏览器本地持久化，严格保证绝不写入后端的 config.yml
   */
  public async setServerConfig(address: string, token: string = ""): Promise<void> {
    const normalizedAddr = this.normalizeAddress(address);
    const normalizedToken = token.trim();

    this.currentAddress = normalizedAddr;
    this.currentToken = normalizedToken;
    this.isInitialized = true;

    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({
          [STORAGE_KEY_ADDR]: normalizedAddr,
          [STORAGE_KEY_TOKEN]: normalizedToken,
        });
      } else if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY_ADDR, normalizedAddr);
        localStorage.setItem(STORAGE_KEY_TOKEN, normalizedToken);
      }
    } catch (e) {
      console.error("[ServerConfig] 写入本地存储失败:", e);
    }

    const httpUrl = this.getHttpBaseUrl(normalizedAddr);
    const wsUrl = this.getWsUrl(normalizedAddr, normalizedToken);

    // 广播配置变更
    this.listeners.forEach((fn) => {
      try {
        fn(normalizedAddr, normalizedToken, httpUrl, wsUrl);
      } catch (err) {
        console.error("[ServerConfig] 触发配置变更监听异常:", err);
      }
    });
  }

  /**
   * 仅更新服务器地址（向后兼容）
   */
  public async setServerAddress(address: string): Promise<void> {
    await this.setServerConfig(address, this.currentToken);
  }

  /**
   * 仅更新 API Token
   */
  public async setApiToken(token: string): Promise<void> {
    await this.setServerConfig(this.currentAddress, token);
  }

  /**
   * 监听服务器配置（地址或 Token）变更
   */
  public onServerAddressChange(listener: ServerConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 测试连接指定地址与 Token 的连通性与鉴权有效性
   */
  public async testConnection(
    address?: string,
    token?: string
  ): Promise<{
    success: boolean;
    latency: number;
    version?: string;
    is_docker?: boolean;
    error?: string;
  }> {
    const baseUrl = this.getHttpBaseUrl(address);
    const pingUrl = `${baseUrl}/api/ping`;
    const headers = this.getAuthHeaders(token);
    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const resp = await fetch(pingUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latency = Math.round(performance.now() - startTime);

      if (resp.status === 401) {
        return {
          success: false,
          latency,
          error: "401 Unauthorized: 目标后端已开启安全鉴权，请填写正确的 API Token",
        };
      }

      if (!resp.ok) {
        return {
          success: false,
          latency,
          error: `HTTP 响应状态码异常: ${resp.status} ${resp.statusText}`,
        };
      }

      const data = await resp.json();
      if (data.status === "ok") {
        return {
          success: true,
          latency,
          version: data.version || "未知版本",
          is_docker: Boolean(data.is_docker),
        };
      } else {
        return {
          success: false,
          latency,
          error: `服务端返回非预期数据: ${JSON.stringify(data)}`,
        };
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - startTime);
      let errorMsg = err.message || "无法连接到该地址";
      if (err.name === "AbortError") {
        errorMsg = "连接超时 (超过 4 秒未响应)，请检查 IP/端口是否正确及防火墙放行规则";
      }
      return {
        success: false,
        latency,
        error: errorMsg,
      };
    }
  }
}

export const serverConfig = new ServerConfigService();
