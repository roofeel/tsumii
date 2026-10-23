// 项链串链：主链是一条单股珠串，不属于方格图纸，单独存为「循环单元 + 长度」。
// 与后端 app/engines/strand.py 保持同一算法。

import type { BeadColor, ItemType, Strand } from '../types';
import { DELICA_11_0_SIZE_MM, nearestColor } from '../catalog';
import { hexToLab } from '../color';

/** 只有项链带串链；吊坠为单独挂件，手链的方格图纸本身就是整条手链 */
export function hasStrand(itemType: ItemType): boolean {
  return itemType === 'necklace';
}

export const DEFAULT_STRAND_LENGTH_CM = 40;
export const MIN_STRAND_LENGTH_CM = 10;
export const MAX_STRAND_LENGTH_CM = 120;

/** 串链颗数：Delica 11/0 沿穿线方向约 1.3 mm/颗（估算值） */
export function strandBeadCount(lengthCm: number): number {
  return Math.max(0, Math.round((lengthCm * 10) / DELICA_11_0_SIZE_MM.height));
}

/** 按循环单元展开为整条串链的逐颗色号 */
export function expandStrand(strand: Strand): string[] {
  const n = strandBeadCount(strand.lengthCm);
  if (!strand.sequence.length) return [];
  return Array.from({ length: n }, (_, i) => strand.sequence[i % strand.sequence.length]);
}

/** 串法说明：循环单元重复 repeats 次，最后再串单元的前 remainder 颗 */
export function strandRepeats(strand: Strand): { total: number; repeats: number; remainder: number } {
  const total = strandBeadCount(strand.lengthCm);
  const k = strand.sequence.length;
  return k ? { total, repeats: Math.floor(total / k), remainder: total % k } : { total, repeats: 0, remainder: 0 };
}

/** 方案中的串链色序转为色卡 id；兼容旧数据中的 hex（取最接近的色号） */
export function strandSequenceIds(sequence: string[], catalog: BeadColor[]): string[] {
  const ids = new Set(catalog.map((c) => c.id));
  return sequence.map((v) => (ids.has(v) ? v : v.startsWith('#') ? nearestColor(hexToLab(v), catalog).id : v)).filter((v) => ids.has(v));
}

export function strandForItem(itemType: ItemType, sequence: string[], catalog: BeadColor[]): Strand | undefined {
  if (!hasStrand(itemType)) return undefined;
  const ids = strandSequenceIds(sequence, catalog);
  return ids.length ? { sequence: ids, lengthCm: DEFAULT_STRAND_LENGTH_CM } : undefined;
}
