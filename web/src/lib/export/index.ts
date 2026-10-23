import type { AccessoryLine, MaterialSummary, Project } from '../types';

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 采购清单 CSV（带 BOM，Excel 可直接打开中文） */
export function shoppingListCsv(project: Project, summary: MaterialSummary, accessories: AccessoryLine[], wastageRate: number): string {
  const rows: (string | number | null)[][] = [
    ['Tsumii 材料清单', project.name],
    ['珠型', 'MIYUKI Delica 11/0', '损耗比例', `${Math.round(wastageRate * 100)}%`],
    [],
    ['色号', '颜色名称', '系列规格', '使用数量', '建议备量', '需要购买', '每包颗数', '包装数量', '已购买', '缺货', '数据状态'],
    ...summary.lines.map((l) => [
      l.code,
      `${l.nameZh} ${l.name}`,
      'Delica 11/0',
      l.required,
      l.reserve,
      l.purchaseNeeded,
      l.beadsPerPackage,
      l.packages ?? '需确认',
      project.purchase.bought[l.colorId] ? '是' : '',
      project.purchase.outOfStock[l.colorId] ? '是' : '',
      l.verified ? '已核实' : '示例数据',
    ]),
    [],
    ['配件', '数量', '说明', '状态'],
    ...accessories.map((a) => [a.name, a.quantity, a.reason, a.status === 'needs-confirmation' ? '需确认' : a.status === 'estimated' ? '估算' : '已计算']),
  ];
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function projectJson(project: Project): string {
  return JSON.stringify({ format: 'tsumii-project', version: 1, project }, null, 2);
}

export function downloadBlob(filename: string, content: string | Blob, mime = 'text/plain;charset=utf-8') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(filename: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const safeFilename = (s: string) => s.replace(/[\\/:*?"<>|\s]+/g, '_');
