'use client';

import { useEffect, useRef } from 'react';
import type { BeadColor } from '@/lib/types';
import { drawPattern, type ViewMode } from '@/lib/render';

export type Rect = { x: number; y: number; w: number; h: number };

interface Props {
  width: number;
  height: number;
  cells: string[];
  catalog: Map<string, BeadColor>;
  cell: number;
  view: ViewMode;
  highlight: string | null;
  activeRow: number | null;
  selection: Rect | null;
  codeIndex: Map<string, number>;
  /** 选区工具：拖拽框选 */
  selectMode: boolean;
  onStrokeStart: (index: number) => void;
  onStrokeMove: (index: number) => void;
  onStrokeEnd: () => void;
  onSelect: (rect: Rect) => void;
}

const GAP = 2;
const LABEL = 26;

export function BeadCanvas(props: Props) {
  const { width, height, cells, catalog, cell, view, highlight, activeRow, selection, codeIndex } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ start: { x: number; y: number } | null; active: boolean }>({ start: null, active: false });
  const step = cell + GAP;
  const cssW = LABEL + width * step + 8;
  const cssH = LABEL + height * step + 8;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = cssW * dpr;
    c.height = cssH * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#6B6862';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let x = 0; x < width; x++) {
      if (x === 0 || (x + 1) % 5 === 0) ctx.fillText(String(x + 1), LABEL + x * step + cell / 2, 16);
    }
    ctx.textAlign = 'right';
    for (let y = 0; y < height; y++) {
      if (cell >= 12 || y === 0 || (y + 1) % 5 === 0) ctx.fillText(String(y + 1), LABEL - 6, LABEL + y * step + cell / 2 + 3);
    }
    if (view === 'grid') {
      ctx.fillStyle = '#D9D4CA';
      ctx.fillRect(LABEL - GAP, LABEL - GAP, width * step + GAP, height * step + GAP);
    }
    drawPattern(ctx, { width, height, cells }, catalog, {
      cell,
      gap: GAP,
      view,
      highlight,
      activeRow,
      selection,
      codeIndex,
      offsetX: LABEL,
      offsetY: LABEL,
    });
  }, [cssW, cssH, width, height, cells, catalog, cell, step, view, highlight, activeRow, selection, codeIndex]);

  const toCell = (e: React.PointerEvent): { x: number; y: number } | null => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) * cssW) / r.width - LABEL;
    const py = ((e.clientY - r.top) * cssH) / r.height - LABEL;
    const x = Math.floor(px / step);
    const y = Math.floor(py / step);
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    return { x, y };
  };

  const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x) + 1,
    h: Math.abs(a.y - b.y) + 1,
  });

  return (
    <canvas
      ref={ref}
      style={{ width: cssW, height: cssH, touchAction: 'none' }}
      className="cursor-crosshair select-none"
      role="img"
      aria-label={`串珠图纸 ${width} 列 × ${height} 行，可点击或拖动编辑`}
      onPointerDown={(e) => {
        const p = toCell(e);
        if (!p) return;
        (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
        drag.current = { start: p, active: true };
        if (props.selectMode) props.onSelect(rectFrom(p, p));
        else props.onStrokeStart(p.y * width + p.x);
      }}
      onPointerMove={(e) => {
        if (!drag.current.active) return;
        const p = toCell(e);
        if (!p) return;
        if (props.selectMode && drag.current.start) props.onSelect(rectFrom(drag.current.start, p));
        else props.onStrokeMove(p.y * width + p.x);
      }}
      onPointerUp={() => {
        if (drag.current.active && !props.selectMode) props.onStrokeEnd();
        drag.current = { start: null, active: false };
      }}
      onPointerCancel={() => {
        if (drag.current.active && !props.selectMode) props.onStrokeEnd();
        drag.current = { start: null, active: false };
      }}
    />
  );
}
