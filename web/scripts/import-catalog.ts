/**
 * 从已核实的数据源（CSV）导入 MIYUKI 色卡，替换开发用示例数据。
 *
 * 用法：npx tsx scripts/import-catalog.ts path/to/delica-11-0.csv
 *
 * CSV 列（第一行为表头）：
 *   code,name,nameZh,nameJa,hex,finish,discontinued,packBeads,gramsPerPack,beadsPerGram
 * - code：官方色号，例如 DB-xxxx（必须来自官方色卡或授权商家数据，禁止估填）
 * - packBeads 或 gramsPerPack+beadsPerGram 至少提供一组可信数据，否则材料清单会显示「需确认」
 *
 * 导入后会写入 src/lib/catalog/delica-11-0.json，并标记 verified=true。
 * 然后在 src/lib/catalog/index.ts 中把 import 从 sample-delica-11-0.json 改为 delica-11-0.json。
 */
import fs from 'node:fs';
import path from 'node:path';
import { validateCatalog } from '../src/lib/catalog';
import type { BeadColor } from '../src/lib/types';

const file = process.argv[2];
if (!file) {
  console.error('用法：npx tsx scripts/import-catalog.ts <csv>');
  process.exit(1);
}
const [header, ...rows] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
const cols = header.split(',').map((s) => s.trim());
const get = (r: string[], k: string) => r[cols.indexOf(k)]?.trim() ?? '';
const num = (v: string) => (v ? Number(v) : undefined);

const catalog: BeadColor[] = rows.map((line, i) => {
  const r = line.split(',');
  return {
    id: get(r, 'code').toLowerCase().replace(/[^a-z0-9]+/g, '-') || `row-${i}`,
    brand: 'MIYUKI',
    series: 'Delica',
    size: '11/0',
    code: get(r, 'code'),
    name: get(r, 'name'),
    nameZh: get(r, 'nameZh') || get(r, 'name'),
    nameJa: get(r, 'nameJa') || undefined,
    hex: get(r, 'hex').toUpperCase(),
    finish: get(r, 'finish') || 'opaque',
    discontinued: /^(1|true|yes)$/i.test(get(r, 'discontinued')),
    packBeads: num(get(r, 'packBeads')),
    gramsPerPack: num(get(r, 'gramsPerPack')),
    beadsPerGram: num(get(r, 'beadsPerGram')),
    verified: true,
  };
});

const issues = validateCatalog(catalog);
if (issues.length) {
  console.warn('发现问题：');
  issues.forEach((x) => console.warn(`  ${x.id}: ${x.problem}`));
}
const out = path.join(__dirname, '../src/lib/catalog/delica-11-0.json');
fs.writeFileSync(out, JSON.stringify(catalog, null, 2) + '\n');
console.log(`已写入 ${catalog.length} 个色号 → ${out}`);
