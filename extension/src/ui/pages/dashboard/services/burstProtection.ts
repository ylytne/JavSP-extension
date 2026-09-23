/**
 * 爬虫大批量请求冷却防风控保护 (Burst Protection) 辅助模块
 */

/**
 * 计算下一次触发冷却休眠所需的抓取影片数量
 * @param burstLimit 基准数量（例如 10）
 * @param burstJitter 随机浮动范围（例如 2，即 10±2 => 8~12 部）
 * @returns [burstLimit - burstJitter, burstLimit + burstJitter] 范围内的随机整数，且至少为 1
 */
export function calculateNextBurstTarget(burstLimit: number, burstJitter: number): number {
  const safeLimit = Math.max(1, Math.round(burstLimit || 10));
  const safeJitter = Math.max(0, Math.round(burstJitter || 0));
  const min = Math.max(1, safeLimit - safeJitter);
  const max = Math.max(min, safeLimit + safeJitter);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 计算单次大批量冷却所需的休眠时间（秒）
 * @param burstCooldown 基准冷却时长（例如 60 秒）
 * @param burstCooldownJitter 冷却时长随机浮动（例如 10 秒，即 60 + [0, 10) 秒）
 * @returns 实际休眠的浮点秒数
 */
export function calculateBurstCooldown(burstCooldown: number, burstCooldownJitter: number): number {
  const safeBase = Math.max(0, Number(burstCooldown) || 0);
  const safeJitter = Math.max(0, Number(burstCooldownJitter) || 0);
  return safeBase + Math.random() * safeJitter;
}

/**
 * 检查取消标志的类型：支持布尔 Getter 函数或 React Ref 对象
 */
export type CancelSignal = (() => boolean) | { current: boolean };

function checkIsCancelled(signal?: CancelSignal): boolean {
  if (!signal) return false;
  if (typeof signal === "function") {
    return signal();
  }
  return Boolean(signal.current);
}

/**
 * 可中断休眠器：支持高频切片检查取消信号，杜绝长时间休眠导致的界面假死或无法即刻中止
 * @param ms 计划休眠的总毫秒数
 * @param cancelSignal 取消检查信号（如 batchCancelRef 或函数）
 * @param checkIntervalMs 切片轮询间隔（默认 200ms）
 * @returns Promise<boolean> - true 表示休眠正常完成，false 表示中途被用户中止
 */
export function interruptibleSleep(
  ms: number,
  cancelSignal?: CancelSignal,
  checkIntervalMs: number = 200
): Promise<boolean> {
  if (ms <= 0) {
    return Promise.resolve(!checkIsCancelled(cancelSignal));
  }

  if (checkIsCancelled(cancelSignal)) {
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    const startTime = Date.now();
    const interval = Math.max(50, checkIntervalMs);

    const timer = setInterval(() => {
      if (checkIsCancelled(cancelSignal)) {
        clearInterval(timer);
        resolve(false);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= ms) {
        clearInterval(timer);
        resolve(true);
      }
    }, interval);
  });
}
