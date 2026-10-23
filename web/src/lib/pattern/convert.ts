// Engine B（MVP）：图片 → 结构化方格图纸
// Image Normalization → Grid Layout → Color Quantization → MIYUKI Palette Matching → Pattern Optimization

import type { BeadColor } from '../types';
import { type RGB, rgbToLab, hexToLab, deltaE2000 } from '../color';
import { colorLab, nearestColor } from '../catalog';
import { countColors, mergeRareColors, mirrorHorizontal, removeIsolated } from './index';

export interface PixelSource {
  width: number;
  height: number;
  /** RGBA，长度 = width * height * 4 */
  data: ArrayLike<number>;
}

export type ConversionMode = 'faithful' | 'pixel' | 'cartoon' | 'outline' | 'low-color';

export interface ConvertOptions {
  cols: number;
  rows: number;
  maxColors: number;
  mode: ConversionMode;
  removeIsolated: boolean;
  symmetry: boolean;
  smallAreaMerge: boolean;
  catalog: BeadColor[];
  /** 透明区域使用的底色；缺省为最接近白色的色号 */
  backgroundId?: string;
}

/** 区域平均采样。透明像素占多数的格子返回 null。 */
export function sampleGrid(src: PixelSource, cols: number, rows: number): (RGB | null)[] {
  const out: (RGB | null)[] = [];
  for (let gy = 0; gy < rows; gy++) {
    const y0 = Math.floor((gy * src.height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * src.height) / rows));
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor((gx * src.width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * src.width) / cols));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      let transparent = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * src.width + x) * 4;
          if (src.data[i + 3] < 128) {
            transparent++;
            continue;
          }
          r += src.data[i];
          g += src.data[i + 1];
          b += src.data[i + 2];
          n++;
        }
      }
      out.push(n === 0 || transparent > n ? null : { r: r / n, g: g / n, b: b / n });
    }
  }
  return out;
}

function posterize(c: RGB, levels: number): RGB {
  const step = 255 / (levels - 1);
  const q = (v: number) => Math.round(v / step) * step;
  return { r: q(c.r), g: q(c.g), b: q(c.b) };
}

/** 将用到的颜色限制在 maxColors 以内：反复把用量最少的颜色并入 ΔE 最近的保留色 */
export function limitColors(cells: string[], maxColors: number, byId: Map<string, BeadColor>): string[] {
  let current = cells.slice();
  for (;;) {
    const counts = countColors(current);
    if (counts.size <= Math.max(1, maxColors)) return current;
    const sorted = [...counts.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    const [victim] = sorted[0];
    const vLab = colorLab(byId.get(victim)!);
    let target = '';
    let best = Infinity;
    for (const [id] of sorted.slice(1)) {
      const d = deltaE2000(vLab, colorLab(byId.get(id)!));
      if (d < best) {
        best = d;
        target = id;
      }
    }
    current = current.map((c) => (c === victim ? target : c));
  }
}

export function convertToCells(src: PixelSource, opts: ConvertOptions): string[] {
  const { cols, rows, catalog } = opts;
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const bg = opts.backgroundId ?? nearestColor(hexToLab('#FFFFFF'), catalog).id;
  const samples = sampleGrid(src, cols, rows);

  let cells = samples.map((s) => {
    if (!s) return bg;
    const c = opts.mode === 'cartoon' ? posterize(s, 5) : s;
    return nearestColor(rgbToLab(c), catalog).id;
  });

  const maxColors = opts.mode === 'low-color' ? Math.min(opts.maxColors, 4) : opts.maxColors;
  cells = limitColors(cells, maxColors, byId);

  if (opts.mode === 'outline') {
    // 轮廓优先：亮度跳变明显的格子使用当前用色中最深的颜色
    const used = [...new Set(cells)];
    const darkest = used.reduce((a, b) => (colorLab(byId.get(a)!).L <= colorLab(byId.get(b)!).L ? a : b));
    const L = cells.map((c) => colorLab(byId.get(c)!).L);
    const edged = cells.slice();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const right = x < cols - 1 ? Math.abs(L[i] - L[i + 1]) : 0;
        const down = y < rows - 1 ? Math.abs(L[i] - L[i + cols]) : 0;
        if (Math.max(right, down) > 18 && L[i] < 92) edged[i] = darkest;
      }
    }
    cells = edged;
  }

  if (opts.removeIsolated || opts.mode === 'pixel') cells = removeIsolated(cells, cols, rows);
  if (opts.smallAreaMerge) {
    const minCount = Math.max(2, Math.round(cols * rows * 0.004));
    cells = mergeRareColors(cells, minCount, (id, among) => {
      const lab = colorLab(byId.get(id)!);
      return among.reduce((a, b) =>
        deltaE2000(lab, colorLab(byId.get(a)!)) <= deltaE2000(lab, colorLab(byId.get(b)!)) ? a : b,
      );
    });
  }
  if (opts.symmetry) cells = mirrorHorizontal(cells, cols, rows);
  return cells;
}
