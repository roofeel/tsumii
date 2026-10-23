// Canvas 绘制：编辑器画布、缩略图、PNG 导出共用。

import type { BeadColor } from './types';
import { isLight } from './color';

export type ViewMode = 'bead' | 'grid' | 'code' | 'compare';

export interface DrawOptions {
  cell: number;
  gap: number;
  view: ViewMode;
  highlight?: string | null;
  activeRow?: number | null;
  selection?: { x: number; y: number; w: number; h: number } | null;
  /** 色号编号：colorId → 序号 */
  codeIndex?: Map<string, number>;
  background?: string;
  offsetX?: number;
  offsetY?: number;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawPattern(
  ctx: CanvasRenderingContext2D,
  p: { width: number; height: number; cells: string[] },
  catalog: Map<string, BeadColor>,
  o: DrawOptions,
) {
  const step = o.cell + o.gap;
  const ox = o.offsetX ?? 0;
  const oy = o.offsetY ?? 0;
  if (o.background) {
    ctx.fillStyle = o.background;
    ctx.fillRect(ox, oy, p.width * step - o.gap, p.height * step - o.gap);
  }
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const id = p.cells[y * p.width + x];
      const color = catalog.get(id);
      const hex = color?.hex ?? '#FF00FF';
      const px = ox + x * step;
      const py = oy + y * step;
      ctx.globalAlpha = o.highlight && o.highlight !== id ? 0.18 : 1;
      ctx.fillStyle = hex;
      if (o.view === 'grid' || o.view === 'code') {
        ctx.fillRect(px, py, o.cell, o.cell);
      } else {
        roundRect(ctx, px, py, o.cell, o.cell, Math.max(1, o.cell * 0.28));
        ctx.fill();
        if (o.cell >= 8) {
          // 侧面阴影 + 珠孔
          ctx.fillStyle = 'rgba(0,0,0,0.10)';
          ctx.fillRect(px + o.cell * 0.12, py + o.cell * 0.82, o.cell * 0.76, o.cell * 0.12);
          ctx.beginPath();
          ctx.arc(px + o.cell / 2, py + o.cell / 2, o.cell * 0.14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34,34,34,0.22)';
          ctx.fill();
        }
      }
      if (o.view === 'code' && o.codeIndex && o.cell >= 12) {
        ctx.fillStyle = isLight(hex) ? '#222222' : '#FFFFFF';
        ctx.font = `${Math.floor(o.cell * 0.48)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(o.codeIndex.get(id) ?? '?'), px + o.cell / 2, py + o.cell / 2 + 1);
      }
    }
  }
  ctx.globalAlpha = 1;
  if (o.activeRow !== null && o.activeRow !== undefined) {
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 2;
    roundRect(ctx, ox - 4, oy + o.activeRow * step - 3, p.width * step - o.gap + 8, o.cell + 6, 5);
    ctx.stroke();
  }
  if (o.selection) {
    const s = o.selection;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#C2566F';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + s.x * step - 2, oy + s.y * step - 2, s.w * step - o.gap + 4, s.h * step - o.gap + 4);
    ctx.setLineDash([]);
  }
}

/** 导出 PNG（含坐标）为 data URL */
export function patternToPngDataUrl(
  p: { width: number; height: number; cells: string[] },
  catalog: Map<string, BeadColor>,
  view: ViewMode = 'bead',
  codeIndex?: Map<string, number>,
): string {
  const cell = 24;
  const gap = 2;
  const margin = 32;
  const canvas = document.createElement('canvas');
  canvas.width = margin + p.width * (cell + gap) + 16;
  canvas.height = margin + p.height * (cell + gap) + 16;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FAF9F6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#6B6862';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  for (let x = 0; x < p.width; x++) ctx.fillText(String(x + 1), margin + x * (cell + gap) + cell / 2, 20);
  ctx.textAlign = 'right';
  for (let y = 0; y < p.height; y++) ctx.fillText(String(y + 1), margin - 6, margin + y * (cell + gap) + cell / 2 + 4);
  drawPattern(ctx, p, catalog, { cell, gap, view, codeIndex, offsetX: margin, offsetY: margin });
  return canvas.toDataURL('image/png');
}
