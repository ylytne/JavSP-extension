import { describe, it, expect } from "vitest";
import { sampleEvenly } from "../../utils/sampling";

describe("sampleEvenly 均匀抽样算法", () => {
  it("应在 41 张剧照中均匀抽取 10 张并覆盖首尾", () => {
    const pics = Array.from({ length: 41 }, (_, i) => `pic-${i}.jpg`);
    const sampled = sampleEvenly(pics, 10);

    expect(sampled).toHaveLength(10);
    // 首尾覆盖验证
    expect(sampled[0]).toBe("pic-0.jpg");
    expect(sampled[9]).toBe("pic-40.jpg");

    // 验证单调递增且不重复
    const indices = sampled.map((p) => parseInt(p.replace("pic-", "").replace(".jpg", ""), 10));
    for (let i = 0; i < indices.length - 1; i++) {
      expect(indices[i]).toBeLessThan(indices[i + 1]);
    }

    // 验证抽取的精确索引值对应 round(i * 40 / 9)
    // 0, 4, 9, 13, 18, 22, 27, 31, 36, 40
    expect(indices).toEqual([0, 4, 9, 13, 18, 22, 27, 31, 36, 40]);
  });

  it("当目标数量大于等于原列表长度时，应返回全部数据", () => {
    const pics = ["a.jpg", "b.jpg", "c.jpg"];
    expect(sampleEvenly(pics, 3)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(sampleEvenly(pics, 10)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("当目标数量小于等于 0 时，应返回原列表", () => {
    const pics = ["a.jpg", "b.jpg", "c.jpg"];
    expect(sampleEvenly(pics, 0)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(sampleEvenly(pics, -1)).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
  });

  it("当目标数量为 1 时，应返回首个元素", () => {
    const pics = ["a.jpg", "b.jpg", "c.jpg"];
    expect(sampleEvenly(pics, 1)).toEqual(["a.jpg"]);
  });

  it("对空列表应返回空数组", () => {
    expect(sampleEvenly([], 5)).toEqual([]);
  });

  it("奇数与偶数序列的经典抽样测试", () => {
    // 5 张中抽 3 张 -> [0, 2, 4]
    const five = ["0", "1", "2", "3", "4"];
    expect(sampleEvenly(five, 3)).toEqual(["0", "2", "4"]);

    // 4 张中抽 2 张 -> [0, 3]
    const four = ["0", "1", "2", "3"];
    expect(sampleEvenly(four, 2)).toEqual(["0", "3"]);
  });
});
