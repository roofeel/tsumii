'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { NecklacePreview } from '@/components/NecklacePreview';
import { PatternThumb } from '@/components/PatternThumb';
import { Swatch } from '@/components/Swatch';
import { LogoMark } from '@/components/Logo';
import { useApp, useHydrated } from '@/store';
import { ACTIVE_CATALOG, catalogById, isCatalogVerified } from '@/lib/catalog';
import { calculateMaterials, estimateAccessories } from '@/lib/materials';
import { productSizeCm, rowRuns, validatePattern } from '@/lib/pattern';
import { patternToPngDataUrl } from '@/lib/render';
import { DIFFICULTY_LABEL, ITEM_LABEL } from '@/lib/i18n';

/** 制作图纸：浏览器「打印 → 另存为 PDF」输出 A4 */
export default function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const project = useApp((s) => s.projects[id]);
  const { markExported, wastageRate } = useApp();
  const catalog = useMemo(() => catalogById(ACTIVE_CATALOG), []);
  const [gridImg, setGridImg] = useState<string | null>(null);

  const legendOrder = useMemo(() => {
    if (!project) return [] as string[];
    return [...new Set(project.pattern.cells)].sort((a, b) => ACTIVE_CATALOG.findIndex((c) => c.id === a) - ACTIVE_CATALOG.findIndex((c) => c.id === b));
  }, [project]);
  const codeIndex = useMemo(() => new Map(legendOrder.map((cid, i) => [cid, i + 1])), [legendOrder]);

  useEffect(() => {
    if (project) setGridImg(patternToPngDataUrl(project.pattern, catalog, 'code', codeIndex));
  }, [project, catalog, codeIndex]);

  if (!hydrated) return null;
  if (!project) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24 text-center">
        <p>找不到这个项目。</p>
      </main>
    );
  }

  const p = project.pattern;
  const summary = calculateMaterials(p, catalog, { wastageRate });
  const accessories = estimateAccessories(project.itemType, p, { wearLengthCm: project.itemType === 'necklace' ? 42 : undefined });
  const errors = validatePattern(p, catalog);
  const size = productSizeCm(p.width, p.height);
  const verified = isCatalogVerified(ACTIVE_CATALOG);

  return (
    <div className="mx-auto max-w-[900px] bg-white px-8 py-8 text-ink print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/shopping/${project.id}`} className="btn-ghost">
          ← 返回清单
        </Link>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            markExported(project.id);
            window.print();
          }}
        >
          打印 / 保存为 PDF
        </button>
      </div>

      <header className="flex items-start justify-between gap-6 border-b border-ink pb-4">
        <div>
          <p className="text-xs tracking-[0.12em] text-muted">MIYUKI BEAD PATTERN · 制作图纸</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">{project.name}</h1>
          <p className="mt-1 text-sm text-body">{project.idea ? `${project.idea.description}` : project.description || '图片转换作品'}</p>
        </div>
        <div className="flex items-center gap-2 text-right">
          <LogoMark size={26} />
          <span className="font-display text-xl italic">Tsumii</span>
        </div>
      </header>

      {(!verified || errors.length > 0 || project.idea?.feasibilityStatus === 'needs-review') && (
        <div className="mt-4 rounded-lg border border-amber-deep/30 bg-amber-soft px-4 py-2.5 text-xs leading-relaxed text-amber-deep">
          {!verified && <p>本图纸使用示例色卡，色号未经核实，不能直接用于采购。</p>}
          {errors.length > 0 && <p>图纸验证未通过：{errors.join('；')}</p>}
          {project.idea?.feasibilityStatus === 'needs-review' && <p>{project.idea.feasibilityNote}。立体结构未包含在本图纸中，需人工确认。</p>}
        </div>
      )}

      <section className="mt-5 grid grid-cols-2 gap-5 break-inside-avoid">
        <figure className="flex flex-col items-center justify-center rounded-xl bg-ivory p-4">
          {project.idea ? <NecklacePreview idea={project.idea} catalog={catalog} height={220} /> : <PatternThumb pattern={p} catalog={catalog} maxSize={220} />}
          <figcaption className="mt-2 text-xs text-muted">作品效果图</figcaption>
        </figure>
        <dl className="grid grid-cols-2 content-start gap-3 text-sm">
          {[
            ['作品类型', ITEM_LABEL.zh[project.itemType]],
            ['主题', project.idea?.styleTags.join(' · ') || '—'],
            ['珠子类型', 'MIYUKI Delica 11/0'],
            ['排列方式', '平面方格（Square stitch / Loom）'],
            ['图纸尺寸', `${p.width} 列 × ${p.height} 行`],
            ['成品尺寸', `约 ${size.w} × ${size.h} cm（不含配件）`],
            ['珠子总数', `${summary.totalBeads} 颗 · ${summary.colorCount} 色`],
            ['难度', project.idea ? DIFFICULTY_LABEL.zh[project.idea.difficulty] : '—'],
          ].map(([k, v]) => (
            <div key={k} className="border-b border-warm-line pb-2">
              <dt className="text-[11px] text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-6 break-inside-avoid">
        <h2 className="mb-2 text-base font-bold">串珠网格图 · 行列坐标</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {gridImg && <img src={gridImg} alt="带行列坐标与色号编号的完整串珠网格图" className="mx-auto max-h-[900px] max-w-full" />}
      </section>

      <section className="mt-6 break-inside-avoid">
        <h2 className="mb-2 text-base font-bold">色号图例与材料清单</h2>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-ink text-left">
              <th className="py-1.5">编号</th>
              <th>色号</th>
              <th>颜色名称</th>
              <th className="text-right">使用</th>
              <th className="text-right">建议备量</th>
              <th className="text-right">采购</th>
            </tr>
          </thead>
          <tbody>
            {legendOrder.map((cid) => {
              const l = summary.lines.find((x) => x.colorId === cid)!;
              return (
                <tr key={cid} className="border-b border-warm-line">
                  <td className="py-1.5 font-mono">{codeIndex.get(cid)}</td>
                  <td>
                    <span className="inline-flex items-center gap-2 font-mono">
                      <Swatch hex={l.hex} size={14} />
                      {l.code}
                    </span>
                  </td>
                  <td>
                    {l.nameZh} {l.name}
                  </td>
                  <td className="text-right font-mono">{l.required}</td>
                  <td className="text-right font-mono">+{l.reserve}</td>
                  <td className="text-right font-mono">{l.purchaseNeeded}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h3 className="mb-1 mt-4 text-sm font-bold">配件</h3>
        <ul className="text-[13px] leading-7">
          {accessories.map((a) => (
            <li key={a.id}>
              {a.name}：{a.quantity} <span className="text-muted">— {a.reason}{a.status === 'needs-confirmation' ? '（需确认）' : a.status === 'estimated' ? '（估算）' : ''}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-base font-bold">制作步骤与注意事项</h2>
        <ol className="list-decimal pl-5 text-[13px] leading-7">
          <li>按图例准备各色珠子，建议使用分格盒并标注编号。</li>
          <li>剪取串珠线，穿入 #12 串珠针，尾端预留约 15 cm。</li>
          <li>从第 1 行开始，按下表从左到右串入珠子；每行完成后以方格平织（square stitch）与上一行连接。</li>
          <li>每完成 5 行对照网格图检查一次，发现错误及时拆改。</li>
          <li>全部完成后将线头回穿 2–3 行并打结，涂少量胶水固定。</li>
          <li>按配件清单安装扣件与连接环；标注「需确认」的结构请先确认再安装。</li>
        </ol>
        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-ink text-left">
              <th className="w-14 py-1">行</th>
              <th>从左到右（编号 × 颗数）</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: p.height }, (_, r) => (
              <tr key={r} className="break-inside-avoid border-b border-warm-line">
                <td className="py-1 font-mono">{r + 1}</td>
                <td className="font-mono">
                  {rowRuns(p.cells, p.width, r)
                    .map((run) => `${codeIndex.get(run.colorId)}×${run.length}`)
                    .join('  ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="mt-8 border-t border-warm pt-3 text-[11px] text-muted">
        Tsumii つみー · 串米 — Tiny Beads. Endless Possibilities. · 生成于 {new Date().toLocaleDateString()} · Pattern v{p.version}
      </footer>
    </div>
  );
}
