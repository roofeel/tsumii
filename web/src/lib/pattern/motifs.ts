// AI 方案 → 可制作结构：MVP 将确定的平面主题（motif）栅格化为方格图纸。
// palette[0] 为底色，其余依次为主色、辅色、深色、点缀色；不足时复用最后一个。

import type { ItemType, Motif } from '../types';

export interface MotifSize {
  width: number;
  height: number;
}

export function defaultSize(itemType: ItemType): MotifSize {
  switch (itemType) {
    case 'bracelet':
      return { width: 12, height: 60 };
    case 'bookmark':
      return { width: 16, height: 48 };
    case 'earring':
    case 'brooch':
      return { width: 14, height: 14 };
    default:
      return { width: 20, height: 24 };
  }
}

export function renderMotif(motif: Motif, palette: string[], size: MotifSize): string[] {
  const { width: W, height: H } = size;
  const p = (i: number) => palette[Math.min(i, palette.length - 1)];
  const cells: string[] = new Array(W * H).fill(p(0));
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const s = Math.min(W, H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const nx = (x - cx) / (s / 2);
      const ny = (y - cy) / (s / 2);
      switch (motif) {
        case 'leaf': {
          // 竖直叶片：|nx| < 宽度轮廓，中线为叶脉
          const t = (y + 0.5) / H; // 0..1
          const half = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.12) / 0.8))) * 0.62 * (W / 2);
          const dx = Math.abs(x - cx);
          if (t < 0.1 && dx < 1) cells[i] = p(4);
          else if (dx < half) {
            const edge = dx > half - 1.2;
            const vein = dx < 0.6 || (Math.abs(dx - (t - 0.2) * W * 0.5) < 0.6 && t > 0.3 && t < 0.85);
            cells[i] = edge ? p(3) : vein ? p(2) : p(1);
          } else if (t > 0.9 && dx < 0.6) cells[i] = p(3);
          break;
        }
        case 'flower': {
          const r = Math.hypot(nx, ny);
          const th = Math.atan2(ny, nx) + Math.PI / 2;
          const petal = 0.55 + 0.32 * Math.abs(Math.cos(2.5 * th));
          if (r < 0.18) cells[i] = p(4);
          else if (r < 0.3) cells[i] = p(3);
          else if (r < petal - 0.1) cells[i] = p(1);
          else if (r < petal) cells[i] = p(2);
          break;
        }
        case 'diamond': {
          const d = Math.abs(nx) + Math.abs(ny);
          if (d < 0.25) cells[i] = p(4);
          else if (d < 0.5) cells[i] = p(1);
          else if (d < 0.62) cells[i] = p(3);
          else if (d < 0.86) cells[i] = p(2);
          else if (d < 0.95) cells[i] = p(1);
          break;
        }
        case 'gradient': {
          const bands = Math.max(1, palette.length - 1);
          const t = y / H;
          const k = Math.min(bands, 1 + Math.floor(t * bands));
          // 抖动边界，营造光影
          const jitter = ((x * 7 + y * 3) % 5) / 5 / bands;
          const k2 = Math.min(bands, 1 + Math.floor((t + jitter - 0.1 / bands) * bands));
          cells[i] = p(Math.max(1, (x + y) % 2 === 0 ? k : k2));
          break;
        }
        case 'night': {
          const t = y / H;
          cells[i] = t < 0.6 ? p(1) : p(2);
          const sky = ((x * 37 + y * 17) % 23 === 0) && t < 0.55;
          if (sky) cells[i] = p(4);
          const bh = [0.62, 0.7, 0.55, 0.66, 0.5, 0.72, 0.6][x % 7];
          if (t > bh) cells[i] = p(3);
          if (t > bh + 0.05 && (x + y) % 4 === 0 && t < 0.95) cells[i] = p(4);
          break;
        }
        case 'geometric': {
          const m = (((x - y) % 6) + 6) % 6;
          cells[i] = m < 2 ? p(3) : m === 2 ? p(4) : p(0);
          break;
        }
        case 'heart': {
          const X = nx * 1.2;
          const Y = -ny * 1.2 + 0.25;
          const v = Math.pow(X * X + Y * Y - 0.6, 3) - X * X * Y * Y * Y;
          if (v < 0) cells[i] = p(1);
          break;
        }
      }
    }
  }
  return cells;
}
