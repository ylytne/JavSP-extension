/**
 * 均匀抽样工具函数 (Uniform Sampling)
 */

/**
 * 从给定的数据列表中，跨越整个序列均匀等间距提取指定数量的样本。
 *
 * 核心特性：
 * 1. 覆盖首尾：第 1 个样本对应第 1 项 (index 0)，最后 1 个样本对应最后 1 项 (index N-1)；
 * 2. 单调递增且不重复：利用线性插值 Math.round(i * ((N - 1) / (count - 1)))，并配备严格的防碰撞与边界保护；
 * 3. 容错健全：对空数组、count <= 0、count >= length、count === 1 均有明确而符合直觉的返回值。
 *
 * @param items 原始数据列表
 * @param count 目标抽取数量
 * @returns 抽取后的数据列表
 */
export function sampleEvenly<T>(items: T[], count: number): T[] {
  if (!items || items.length === 0) {
    return [];
  }
  if (count <= 0 || items.length <= count) {
    return [...items];
  }
  if (count === 1) {
    return [items[0]];
  }

  const n = items.length;
  const step = (n - 1) / (count - 1);
  const selectedIndices = new Set<number>();

  for (let i = 0; i < count; i++) {
    let idx = Math.round(i * step);
    // 边界钳位保护
    idx = Math.max(0, Math.min(n - 1, idx));

    // 碰撞检测与寻找可用槽位（理论上 count < n 时线性插值极少碰撞，此为防异常兜底）
    if (selectedIndices.has(idx)) {
      while (idx < n - 1 && selectedIndices.has(idx)) {
        idx++;
      }
      if (selectedIndices.has(idx)) {
        idx = Math.round(i * step);
        while (idx > 0 && selectedIndices.has(idx)) {
          idx--;
        }
      }
    }

    selectedIndices.add(idx);
  }

  // 保证提取的样本严格按升序排列
  const sortedIndices = Array.from(selectedIndices).sort((a, b) => a - b);
  return sortedIndices.map((idx) => items[idx]);
}
