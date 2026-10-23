import type { BeadColor, Lab } from '../types';
import { deltaE2000, hexToLab } from '../color';
import sampleCatalog from './sample-delica-11-0.json';

/**
 * MIYUKI 色卡
 *
 * ⚠️ PRD 要求：不允许虚构不存在的 MIYUKI 官方色号。
 * 仓库内置的 sample-delica-11-0.json 仅为开发用示例（code 为 SAMPLE-xx，verified=false），
 * 不对应任何官方色号。上线前请用 scripts/import-catalog.ts 从已核实的数据源（官方色卡 / 授权商家数据）
 * 导入 verified=true 的数据，替换 ACTIVE_CATALOG。
 */
export const ACTIVE_CATALOG: BeadColor[] = (sampleCatalog as BeadColor[]).map((c) => ({ ...c }));

/** Delica 11/0 近似物理尺寸，用于估算成品尺寸（约值） */
export const DELICA_11_0_SIZE_MM = { width: 1.6, height: 1.3 } as const;

const labCache = new Map<string, Lab>();
export function colorLab(c: BeadColor): Lab {
  let lab = labCache.get(c.id);
  if (!lab) {
    lab = hexToLab(c.hex);
    labCache.set(c.id, lab);
  }
  return lab;
}

export function catalogById(catalog: BeadColor[]): Map<string, BeadColor> {
  return new Map(catalog.map((c) => [c.id, c]));
}

export function isCatalogVerified(catalog: BeadColor[]): boolean {
  return catalog.length > 0 && catalog.every((c) => c.verified);
}

export interface CatalogIssue {
  id: string;
  problem: string;
}

/** 校验色卡数据完整性；导入脚本与测试共用 */
export function validateCatalog(catalog: BeadColor[]): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const ids = new Set<string>();
  const codes = new Set<string>();
  for (const c of catalog) {
    if (ids.has(c.id)) issues.push({ id: c.id, problem: 'duplicate id' });
    ids.add(c.id);
    if (codes.has(c.code)) issues.push({ id: c.id, problem: 'duplicate code' });
    codes.add(c.code);
    if (!/^#[0-9A-Fa-f]{6}$/.test(c.hex)) issues.push({ id: c.id, problem: 'invalid hex' });
    if (c.verified && c.code.startsWith('SAMPLE')) issues.push({ id: c.id, problem: 'sample code marked verified' });
    if (c.packBeads === undefined && !(c.gramsPerPack && c.beadsPerGram)) {
      issues.push({ id: c.id, problem: 'no trusted packaging data' });
    }
  }
  return issues;
}

/** 找到 ΔE2000 最接近的色号（排除停产） */
export function nearestColor(lab: Lab, catalog: BeadColor[], opts: { exclude?: Set<string>; allowDiscontinued?: boolean } = {}): BeadColor {
  let best: BeadColor | null = null;
  let bestD = Infinity;
  for (const c of catalog) {
    if (opts.exclude?.has(c.id)) continue;
    if (c.discontinued && !opts.allowDiscontinued) continue;
    const d = deltaE2000(lab, colorLab(c));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) throw new Error('Catalog is empty');
  return best;
}

/** 替代色号建议：与给定色号 ΔE 最小的 k 个 */
export function alternatives(colorId: string, catalog: BeadColor[], k = 3): { color: BeadColor; deltaE: number }[] {
  const base = catalog.find((c) => c.id === colorId);
  if (!base) return [];
  const lab = colorLab(base);
  return catalog
    .filter((c) => c.id !== colorId && !c.discontinued)
    .map((c) => ({ color: c, deltaE: deltaE2000(lab, colorLab(c)) }))
    .sort((x, y) => x.deltaE - y.deltaE)
    .slice(0, k);
}

/** 色号显示名 */
export function colorLabel(c: BeadColor, lang: 'zh' | 'en' | 'ja'): string {
  if (lang === 'zh') return c.nameZh;
  if (lang === 'ja') return c.nameJa ?? c.name;
  return c.name;
}
