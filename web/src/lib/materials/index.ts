// Engine C：Material Planning Engine（MVP：不接入价格与库存数据）
//
// Required       = Pattern 中某色号的珠子总数
// Reserve        = ceil(Required × 损耗比例)
// PurchaseNeeded = Required + Reserve
// Packages       = ceil(PurchaseNeeded / 单包装可用颗数)
// 按克销售时：单包装可用颗数 = floor(克数 × 可信颗数/克)

import type { AccessoryLine, BeadColor, ItemType, MaterialLine, MaterialSummary, Pattern } from '../types';
import { countColors } from '../pattern';

export interface MaterialOptions {
  /** 损耗比例，0.1 = 10% */
  wastageRate: number;
}

export const DEFAULT_MATERIAL_OPTIONS: MaterialOptions = { wastageRate: 0.1 };

export function reserveFor(required: number, wastageRate: number): number {
  if (required <= 0) return 0;
  // 先四舍五入到 1e-9，避免 0.1*30=3.0000000000000004 被 ceil 成 4
  return Math.ceil(Math.round(required * wastageRate * 1e9) / 1e9);
}

export function beadsPerPackage(color: BeadColor): number | null {
  if (color.packBeads && color.packBeads > 0) return color.packBeads;
  if (color.gramsPerPack && color.beadsPerGram && color.gramsPerPack > 0 && color.beadsPerGram > 0) {
    return Math.floor(color.gramsPerPack * color.beadsPerGram);
  }
  return null;
}

function lineFor(colorId: string, required: number, color: BeadColor, wastageRate: number): MaterialLine {
  const reserve = reserveFor(required, wastageRate);
  const purchaseNeeded = required + reserve;
  const perPack = beadsPerPackage(color);
  return {
    colorId,
    code: color.code,
    name: color.name,
    nameZh: color.nameZh,
    hex: color.hex,
    verified: color.verified,
    required,
    reserve,
    purchaseNeeded,
    packages: perPack ? Math.ceil(purchaseNeeded / perPack) : purchaseNeeded === 0 ? 0 : null,
    beadsPerPackage: perPack,
    discontinued: color.discontinued,
  };
}

function summarize(lines: MaterialLine[], totalBeads: number): MaterialSummary {
  const needsConfirmation: string[] = [];
  let totalPackages: number | null = 0;
  for (const l of lines) {
    if (l.packages === null) needsConfirmation.push(`${l.code}：缺少可信包装或颗数/克参数`);
    if (l.discontinued) needsConfirmation.push(`${l.code}：已停产，请选择替代色号`);
    totalPackages = totalPackages === null || l.packages === null ? null : totalPackages + l.packages;
  }
  return { lines, totalBeads, colorCount: lines.length, totalPackages, needsConfirmation };
}

export function calculateMaterials(
  pattern: Pick<Pattern, 'cells'>,
  catalog: Map<string, BeadColor>,
  options: MaterialOptions = DEFAULT_MATERIAL_OPTIONS,
): MaterialSummary {
  const counts = countColors(pattern.cells);
  // 按用量降序，用量相同按 id
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const lines = entries.map(([colorId, required]) => {
    const color = catalog.get(colorId);
    if (!color) throw new Error(`Pattern 引用了不存在的色号：${colorId}`);
    return lineFor(colorId, required, color, options.wastageRate);
  });
  return summarize(lines, pattern.cells.length);
}

/** 合并多个图纸的采购清单：先按色号累加用量，再统一计算损耗与包装 */
export function mergeShoppingLists(
  patterns: Pick<Pattern, 'cells'>[],
  catalog: Map<string, BeadColor>,
  options: MaterialOptions = DEFAULT_MATERIAL_OPTIONS,
): MaterialSummary {
  return calculateMaterials({ cells: patterns.flatMap((p) => p.cells) }, catalog, options);
}

/**
 * 配件需求。只有能由结构确定的项目标为 calculated；
 * 依赖佩戴长度或连接方式的项目一律标为 needs-confirmation。
 */
export function estimateAccessories(
  itemType: ItemType,
  pattern: Pick<Pattern, 'width' | 'height'>,
  opts: { wearLengthCm?: number } = {},
): AccessoryLine[] {
  // 方格平织（square stitch）每行约穿线 3 次行宽；加收尾 60 cm。仅为估算。
  const rowCm = pattern.width * 0.16;
  const threadM = Math.ceil(((pattern.height * rowCm * 3 + 60) / 100) * 10) / 10;
  const base: AccessoryLine[] = [
    { id: 'thread', name: '串珠线', quantity: `约 ${threadM} m`, reason: `按 ${pattern.height} 行方格平织往返穿线 + 收尾估算`, status: 'estimated' },
    { id: 'needle', name: '串珠针 #12', quantity: '1 根', reason: '适配 Delica 11/0 孔径', status: 'calculated' },
  ];
  switch (itemType) {
    case 'necklace':
    case 'pendant':
      return base.concat([
        { id: 'clasp', name: '龙虾扣', quantity: '1 个', reason: '项链开合需要', status: 'calculated' },
        { id: 'jumpring', name: '金属连接环 4 mm', quantity: '3 个', reason: '吊坠挂环 ×1 · 链条两端 ×2', status: 'calculated' },
        {
          id: 'extender',
          name: '延长链',
          quantity: opts.wearLengthCm ? '5 cm × 1' : '待定',
          reason: opts.wearLengthCm ? `佩戴长度 ${opts.wearLengthCm} cm，是否需要延长请确认` : '取决于最终佩戴长度',
          status: 'needs-confirmation',
        },
        { id: 'bail', name: '吊坠连接方式', quantity: '—', reason: '珠环 / 金属扣头二选一，结构需人工确认', status: 'needs-confirmation' },
      ]);
    case 'bracelet':
      return base.concat([
        { id: 'clasp', name: '扣件', quantity: '1 套', reason: '手链开合需要', status: 'calculated' },
        { id: 'endcap', name: '包扣 / 收尾夹', quantity: '2 个', reason: `按 ${pattern.width} 列宽度选择尺寸`, status: 'needs-confirmation' },
      ]);
    case 'earring':
      return base.concat([
        { id: 'hook', name: '耳钩或耳针', quantity: '1 对', reason: '按两只耳饰计算', status: 'calculated' },
        { id: 'jumpring', name: '金属连接环 4 mm', quantity: '2 个', reason: '每只 1 个', status: 'calculated' },
      ]);
    default:
      return base;
  }
}
