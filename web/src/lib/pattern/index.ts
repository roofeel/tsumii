import type { BeadColor, Pattern, PatternVersion, Strand } from '../types';
import { DELICA_11_0_SIZE_MM } from '../catalog';

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function createPattern(input: {
  projectId: string;
  width: number;
  height: number;
  cells: string[];
  variantId?: string;
  strand?: Strand;
}): Pattern {
  if (input.cells.length !== input.width * input.height) {
    throw new Error(`cells length ${input.cells.length} ≠ ${input.width}×${input.height}`);
  }
  return {
    id: uid('pat'),
    projectId: input.projectId,
    variantId: input.variantId,
    beadType: 'delica-11-0',
    layoutType: 'square',
    width: input.width,
    height: input.height,
    cells: input.cells.slice(),
    components: [{ id: 'main', name: 'main', x: 0, y: 0, width: input.width, height: input.height }],
    ...(input.strand ? { strand: { sequence: input.strand.sequence.slice(), lengthCm: input.strand.lengthCm } } : {}),
    version: 1,
  };
}

export function snapshot(p: Pattern, note: string): PatternVersion {
  return {
    version: p.version,
    cells: p.cells.slice(),
    width: p.width,
    height: p.height,
    ...(p.strand ? { strand: { sequence: p.strand.sequence.slice(), lengthCm: p.strand.lengthCm } } : {}),
    note,
    createdAt: new Date().toISOString(),
  };
}

export function setCell(cells: string[], index: number, colorId: string): string[] {
  if (cells[index] === colorId) return cells;
  const next = cells.slice();
  next[index] = colorId;
  return next;
}

/** 4 邻接填充 */
export function floodFill(cells: string[], width: number, height: number, index: number, colorId: string): string[] {
  const from = cells[index];
  if (from === undefined || from === colorId) return cells;
  const next = cells.slice();
  const stack = [index];
  while (stack.length) {
    const k = stack.pop()!;
    if (next[k] !== from) continue;
    next[k] = colorId;
    const x = k % width;
    const y = Math.floor(k / width);
    if (x > 0) stack.push(k - 1);
    if (x < width - 1) stack.push(k + 1);
    if (y > 0) stack.push(k - width);
    if (y < height - 1) stack.push(k + width);
  }
  return next;
}

/** 矩形区域替换颜色（区域选择 + AI 局部修改的基础操作） */
export function replaceInRect(
  cells: string[],
  width: number,
  rect: { x: number; y: number; w: number; h: number },
  map: (colorId: string) => string,
): string[] {
  const next = cells.slice();
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = y * width + x;
      if (i >= 0 && i < next.length && x < width) next[i] = map(next[i]);
    }
  }
  return next;
}

export function countColors(cells: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cells) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

/** 按行生成制作步骤：从左到右的连续色段 */
export function rowRuns(cells: string[], width: number, row: number): { colorId: string; length: number }[] {
  const runs: { colorId: string; length: number }[] = [];
  for (let x = 0; x < width; x++) {
    const id = cells[row * width + x];
    const last = runs[runs.length - 1];
    if (last && last.colorId === id) last.length++;
    else runs.push({ colorId: id, length: 1 });
  }
  return runs;
}

/** 删除孤立像素：四邻都与自己不同、且邻居中有多数色时，替换为多数色 */
export function removeIsolated(cells: string[], width: number, height: number): string[] {
  const next = cells.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const me = cells[i];
      const ns: string[] = [];
      if (x > 0) ns.push(cells[i - 1]);
      if (x < width - 1) ns.push(cells[i + 1]);
      if (y > 0) ns.push(cells[i - width]);
      if (y < height - 1) ns.push(cells[i + width]);
      if (ns.length < 2 || ns.includes(me)) continue;
      const tally = countColors(ns);
      let best = '';
      let bestN = 0;
      tally.forEach((n, id) => {
        if (n > bestN) {
          best = id;
          bestN = n;
        }
      });
      if (bestN >= 2) next[i] = best;
    }
  }
  return next;
}

/** 左右对称修正：以左半为准镜像到右半 */
export function mirrorHorizontal(cells: string[], width: number, height: number): string[] {
  const next = cells.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < Math.floor(width / 2); x++) {
      next[y * width + (width - 1 - x)] = cells[y * width + x];
    }
  }
  return next;
}

/** 合并小区域颜色：用量低于阈值的颜色并入最接近的常用色 */
export function mergeRareColors(cells: string[], minCount: number, nearest: (id: string, among: string[]) => string): string[] {
  const counts = countColors(cells);
  const common = [...counts.entries()].filter(([, n]) => n >= minCount).map(([id]) => id);
  if (common.length === 0) return cells;
  const remap = new Map<string, string>();
  counts.forEach((n, id) => {
    if (n < minCount) remap.set(id, nearest(id, common));
  });
  return cells.map((c) => remap.get(c) ?? c);
}

/** 图纸结构验证：MVP 规则。不通过的图纸不能声明为“可制作”。 */
export function validatePattern(p: Pattern, catalog: Map<string, BeadColor>): string[] {
  const errors: string[] = [];
  if (p.layoutType !== 'square') errors.push(`暂不支持的排列方式：${p.layoutType}`);
  if (p.width < 1 || p.height < 1) errors.push('图纸尺寸无效');
  if (p.cells.length !== p.width * p.height) errors.push('珠子数量与行列数不一致');
  const unknown = new Set<string>();
  p.cells.forEach((c) => {
    if (!catalog.has(c)) unknown.add(c);
  });
  p.strand?.sequence.forEach((c) => {
    if (!catalog.has(c)) unknown.add(c);
  });
  if (unknown.size) errors.push(`存在不在色卡中的色号：${[...unknown].join(', ')}`);
  if (p.strand && !p.strand.sequence.length) errors.push('串链循环单元为空');
  return errors;
}

/** 成品尺寸（约值，cm） */
export function productSizeCm(width: number, height: number): { w: number; h: number } {
  return {
    w: Math.round(width * DELICA_11_0_SIZE_MM.width) / 10,
    h: Math.round(height * DELICA_11_0_SIZE_MM.height) / 10,
  };
}
