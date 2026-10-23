// AI 局部修改（MVP 规则版）：在选中区域内按自然语言指令改色。
// 接入真实模型后，可由 Provider 返回同样的 { map } 结果，界面不变。

import type { BeadColor } from '../types';
import { colorLab, nearestColor } from '../catalog';
import { hexToLab } from '../color';
import { COLOR_WORDS } from './parse';

const TARGET_HEX: Record<string, string> = {
  green: '#789477',
  pink: '#E59AAE',
  blue: '#26324F',
  white: '#F2EEE6',
  gold: '#C99A3A',
  red: '#C9473F',
  black: '#1E1E1E',
  purple: '#B7A6CC',
};

export interface LocalEditResult {
  /** 旧色号 → 新色号 */
  map: (colorId: string) => string;
  summary: string;
}

/**
 * @param background 视为背景、不参与修改的色号
 */
export function planLocalEdit(instruction: string, catalog: BeadColor[], background: string | null): LocalEditResult | null {
  const t = instruction.toLowerCase();
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const keep = (id: string) => id === background;

  const shift = (delta: number) => (id: string) => {
    if (keep(id)) return id;
    const lab = colorLab(byId.get(id)!);
    return nearestColor({ L: Math.max(0, Math.min(100, lab.L + delta)), a: lab.a, b: lab.b }, catalog, { exclude: background ? new Set([background]) : undefined }).id;
  };

  if (/浅|亮|lighter|明る/.test(t)) return { map: shift(14), summary: '选区颜色提亮' };
  if (/深|暗|darker/.test(t)) return { map: shift(-14), summary: '选区颜色加深' };

  for (const [key, words] of Object.entries(COLOR_WORDS)) {
    if (words.some((w) => t.includes(w))) {
      const target = nearestColor(hexToLab(TARGET_HEX[key]), catalog).id;
      return { map: (id) => (keep(id) ? id : target), summary: `选区改为 ${byId.get(target)!.nameZh}` };
    }
  }
  if (/删除|清除|去掉|remove|clear|消/.test(t) && background) {
    return { map: () => background, summary: '清空选区' };
  }
  return null;
}

/** 以出现在边缘最多的颜色作为背景色 */
export function guessBackground(cells: string[], width: number, height: number): string | null {
  const tally = new Map<string, number>();
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const id = cells[y * width + x];
      tally.set(id, (tally.get(id) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let n = 0;
  tally.forEach((v, k) => {
    if (v > n) {
      n = v;
      best = k;
    }
  });
  return best;
}
