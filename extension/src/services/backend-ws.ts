/**
 * 后端 WebSocket 与 REST 服务通信管理
 */

import { MovieInfo, WsEvent, WsMessage } from "../crawlers/types";
import { serverConfig } from "./serverConfig";

type EventHandler<T = any> = (data: T, taskId?: string) => void;

export class BackendWsClient {
  private url: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private reconnectTimer: any = null;
  private pingTimer: any = null;
  private isExplicitlyClosed = false;

  private listeners: Map<string, Set<EventHandler>> = new Map();
  public state: "disconnected" | "connecting" | "connected" = "disconnected";
  private stateListeners: Set<(state: "disconnected" | "connecting" | "connected") => void> =
    new Set();

  constructor(url?: string) {
    this.url = url || serverConfig.getWsUrl();

    // 确保异步从 storage 初始化后再确认一次最新 ws 地址
    serverConfig.init().then(({ address, token }) => {
      const latestWs = serverConfig.getWsUrl(address, token);
      if (this.url !== latestWs && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        this.url = latestWs;
      }
    });

    // 监听地址或 Token 变化，用户在设置中修改并保存后自动重连
    serverConfig.onServerAddressChange((_addr, _token, _httpUrl, newWsUrl) => {
      this.reconnectWithUrl(newWsUrl);
    });
  }

  /**
   * 触发立即基于最新配置重新连接
   */
  public reconnect(): void {
    this.reconnectWithUrl(serverConfig.getWsUrl());
  }

  /**
   * 切换至新服务器地址并重连
   */
  public reconnectWithUrl(newWsUrl: string): void {
    if (this.url === newWsUrl && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }
    console.log(`[WS] 切换连接目标至: ${newWsUrl}`);
    this.url = newWsUrl;
    this.isExplicitlyClosed = false;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connect();
  }

  public getUrl(): string {
    return this.url;
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.setState("connecting");

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState("connected");
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WsMessage = JSON.parse(event.data);
          this.dispatchEvent(msg.event, msg.data, msg.taskId);
        } catch (err) {
          console.error("[WS] 无法解析消息:", event.data, err);
        }
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        this.setState("disconnected");
        if (event.code === 4001) {
          console.warn("[WS] 连接被拒绝 (4001): API Token 缺失或无效");
          this.dispatchEvent("AUTH_ERROR", {
            code: 4001,
            message: "API Token 鉴权失败，请在设置中检查并输入正确的访问令牌",
          });
          return;
        }
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn("[WS] 连接错误:", err);
      };
    } catch (e) {
      this.setState("disconnected");
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState("disconnected");
  }

  private setState(state: "disconnected" | "connecting" | "connected"): void {
    this.state = state;
    this.stateListeners.forEach((fn) => fn(state));
  }

  public onStateChange(fn: (state: "disconnected" | "connecting" | "connected") => void): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => this.stateListeners.delete(fn);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    // 指数退避: 1s, 2s, 4s, 5s... max 10s
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.send("PING", { time: Date.now() });
    }, 20000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  public send(event: WsEvent | string, data: any = {}, taskId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[WS] 未就绪，无法发送:", event);
      return;
    }
    const payload: WsMessage = { event, taskId, data };
    this.ws.send(JSON.stringify(payload));
  }

  public on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  private dispatchEvent(event: string, data: any, taskId?: string): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(data, taskId);
        } catch (e) {
          console.error(`[WS] 执行事件 ${event} 回调出错:`, e);
        }
      });
    }
  }

  /**
   * 触发后端扫描
   */
  public scanStart(directory?: string): void {
    this.send("SCAN_START", { directory: directory || null });
  }

  /**
   * 提交单部影片整理请求
   */
  public submitOrganization(
    taskId: string,
    metadata: MovieInfo,
    coverBase64?: string,
    extra?: {
      files?: string[];
      hardSub?: boolean;
      uncensored?: boolean;
      baseOutputDir?: string;
      extraFanartsBase64?: string[];
      actressPicsBase64?: Record<string, string>;
    }
  ): void {
    this.send(
      "ORGANIZATION_SUBMIT",
      {
        taskId,
        metadata,
        coverBase64: coverBase64 || null,
        extra_fanarts_base64: extra?.extraFanartsBase64 || [],
        actress_pics_base64: extra?.actressPicsBase64 || {},
        files: extra?.files,
        hard_sub: extra?.hardSub,
        uncensored: extra?.uncensored,
        base_output_dir: extra?.baseOutputDir,
      },
      taskId
    );
  }
}

export const wsService = new BackendWsClient();
