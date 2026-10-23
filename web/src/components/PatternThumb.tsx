'use client';

import { useEffect, useRef } from 'react';
import type { BeadColor } from '@/lib/types';
import { drawPattern, type ViewMode } from '@/lib/render';

interface Props {
  pattern: { width: number; height: number; cells: string[] };
  catalog: Map<string, BeadColor>;
  /** 最大显示宽高（CSS px） */
  maxSize?: number;
  view?: ViewMode;
  className?: string;
  label?: string;
}

export function PatternThumb({ pattern, catalog, maxSize = 200, view = 'bead', className, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cell = Math.max(2, Math.floor(maxSize / Math.max(pattern.width, pattern.height)) - 1);
  const gap = cell >= 6 ? 1 : 0;
  const w = pattern.width * (cell + gap) - gap;
  const h = pattern.height * (cell + gap) - gap;

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    drawPattern(ctx, pattern, catalog, { cell, gap, view });
  }, [pattern, catalog, cell, gap, w, h, view]);

  return <canvas ref={ref} style={{ width: w, height: h }} className={className} role="img" aria-label={label ?? 'bead pattern preview'} />;
}
