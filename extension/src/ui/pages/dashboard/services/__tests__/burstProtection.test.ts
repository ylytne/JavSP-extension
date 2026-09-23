import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calculateNextBurstTarget,
  calculateBurstCooldown,
  interruptibleSleep,
} from "../burstProtection";

describe("burstProtection - 大批量防爬保护辅助算法", () => {
  describe("calculateNextBurstTarget", () => {
    it("在 10 ± 2 的配置下，生成的批次目标应始终在 8 到 12 之间", () => {
      const results = new Set<number>();
      for (let i = 0; i < 200; i++) {
        const val = calculateNextBurstTarget(10, 2);
        expect(val).toBeGreaterThanOrEqual(8);
        expect(val).toBeLessThanOrEqual(12);
        results.add(val);
      }
      // 验证随机性覆盖了不同值
      expect(results.size).toBeGreaterThan(1);
    });

    it("当 jitter 为 0 时，生成的批次目标应始终恒等于 limit", () => {
      for (let i = 0; i < 20; i++) {
        expect(calculateNextBurstTarget(10, 0)).toBe(10);
      }
    });

    it("当 jitter 大于 limit 时，生成的批次目标应保证至少为 1（防呆保护）", () => {
      for (let i = 0; i < 50; i++) {
        const val = calculateNextBurstTarget(2, 5);
        expect(val).toBeGreaterThanOrEqual(1);
        expect(val).toBeLessThanOrEqual(7);
      }
    });

    it("处理非法负数或零输入时优雅降级", () => {
      expect(calculateNextBurstTarget(-5, -2)).toBeGreaterThanOrEqual(1);
      expect(calculateNextBurstTarget(0, 0)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("calculateBurstCooldown", () => {
    it("在 60 + 10s 的配置下，冷却时间应始终在 60.0 到 70.0 之间", () => {
      for (let i = 0; i < 100; i++) {
        const cd = calculateBurstCooldown(60, 10);
        expect(cd).toBeGreaterThanOrEqual(60.0);
        expect(cd).toBeLessThanOrEqual(70.0);
      }
    });

    it("当 jitter 为 0 时，返回恒等于 base", () => {
      expect(calculateBurstCooldown(45, 0)).toBe(45);
    });

    it("处理非法负数输入时优雅处理为非负值", () => {
      expect(calculateBurstCooldown(-10, -5)).toBe(0);
    });
  });

  describe("interruptibleSleep", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("正常情况下休眠达到指定时间后完成并返回 true", async () => {
      const cancelRef = { current: false };
      const sleepPromise = interruptibleSleep(1000, cancelRef, 100);

      // 前进 500ms，任务应仍在挂起
      vi.advanceTimersByTime(500);

      // 前进剩余 600ms
      vi.advanceTimersByTime(600);

      const result = await sleepPromise;
      expect(result).toBe(true);
    });

    it("在休眠过程中若取消信号置为 true，应立即提前终止并返回 false", async () => {
      const cancelRef = { current: false };
      const sleepPromise = interruptibleSleep(60000, cancelRef, 100);

      // 前进 300ms
      vi.advanceTimersByTime(300);

      // 用户触发中止
      cancelRef.current = true;

      // 推进轮询定时器
      vi.advanceTimersByTime(150);

      const result = await sleepPromise;
      expect(result).toBe(false);
    });

    it("如果进入休眠时已经处于取消状态，应直接返回 false 且不等待", async () => {
      const cancelRef = { current: true };
      const result = await interruptibleSleep(5000, cancelRef);
      expect(result).toBe(false);
    });

    it("支持函数式取消检查", async () => {
      let cancelled = false;
      const sleepPromise = interruptibleSleep(2000, () => cancelled, 100);

      vi.advanceTimersByTime(500);
      cancelled = true;
      vi.advanceTimersByTime(150);

      const result = await sleepPromise;
      expect(result).toBe(false);
    });

    it("当 ms <= 0 时立即返回 true", async () => {
      const result = await interruptibleSleep(0);
      expect(result).toBe(true);
    });
  });
});
