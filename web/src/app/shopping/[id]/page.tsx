'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { SampleBadge } from '@/components/SampleBadge';
import { Swatch } from '@/components/Swatch';
import { useApp, useHydrated, useT } from '@/store';
import { ACTIVE_CATALOG, alternatives, catalogById, colorLabel, isCatalogVerified } from '@/lib/catalog';
import { calculateMaterials, estimateAccessories, mergeShoppingLists } from '@/lib/materials';
import { downloadBlob, safeFilename, shoppingListCsv } from '@/lib/export';

export default function ShoppingPage() {
  const { id } = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const { lang } = useT();
  const { projects, order, togglePurchase, wastageRate, setWastageRate } = useApp();
  const project = projects[id];
  const catalog = useMemo(() => catalogById(ACTIVE_CATALOG), []);
  const [mergeIds, setMergeIds] = useState<string[]>([]);
  const [showMerge, setShowMerge] = useState(false);

  const summary = useMemo(() => {
    if (!project) return null;
    const extra = mergeIds.map((m) => projects[m]?.pattern).filter(Boolean);
    return extra.length
      ? mergeShoppingLists([project.pattern, ...extra], catalog, { wastageRate })
      : calculateMaterials(project.pattern, catalog, { wastageRate });
  }, [project, projects, mergeIds, catalog, wastageRate]);

  const accessories = useMemo(
    () => (project ? estimateAccessories(project.itemType, project.pattern, { wearLengthCm: project.itemType === 'necklace' && !project.pattern.strand ? 42 : undefined }) : []),
    [project],
  );

  if (!hydrated) return null;
  if (!project || !summary) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <p>找不到这个项目。</p>
        <Link href="/" className="btn-primary">
          返回首页
        </Link>
      </main>
    );
  }

  const others = order.filter((o) => o !== id && projects[o]);
  const confirmLeft = accessories.filter((a) => a.status === 'needs-confirmation' && !project.purchase.confirmed[a.id]);
  const toBuy = summary.lines.filter((l) => !project.purchase.bought[l.colorId]);

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 pb-16 pt-8 sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">
              Shopping list · 与 Pattern v{project.pattern.version} 同步
              {mergeIds.length > 0 && ` · 已合并 ${mergeIds.length} 个项目`}
            </p>
            <h1 className="mt-1.5 font-serif text-3xl font-bold">{project.name} · 材料清单</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/editor/${project.id}`} className="btn-ghost">
              ← 返回编辑
            </Link>
            <button type="button" className="btn-ghost" aria-expanded={showMerge} onClick={() => setShowMerge((s) => !s)}>
              合并其他清单
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => downloadBlob(`${safeFilename(project.name)}-材料清单.csv`, shoppingListCsv(project, summary, accessories, wastageRate), 'text/csv;charset=utf-8')}
            >
              导出 CSV / Excel
            </button>
            <Link href={`/print/${project.id}`} className="btn-primary">
              导出 PDF 图纸
            </Link>
          </div>
        </div>

        {showMerge && (
          <fieldset className="card flex flex-wrap gap-x-6 gap-y-2 p-4">
            <legend className="px-1 text-sm font-bold">选择要合并采购的项目</legend>
            {others.length === 0 && <span className="text-sm text-muted">没有其他项目</span>}
            {others.map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-ink"
                  checked={mergeIds.includes(o)}
                  onChange={(e) => setMergeIds((m) => (e.target.checked ? [...m, o] : m.filter((x) => x !== o)))}
                />
                {projects[o].name}
              </label>
            ))}
          </fieldset>
        )}

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_720px] flex-col gap-6">
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warm px-5 py-4">
                <h2 className="text-base font-bold">珠子材料 · MIYUKI Delica 11/0</h2>
                <SampleBadge show={!isCatalogVerified(ACTIVE_CATALOG)} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-[13px]">
                  <thead className="bg-paper text-muted">
                    <tr>
                      <th scope="col" className="py-2.5 pl-5 pr-3 text-left font-medium">已购</th>
                      <th scope="col" className="px-3 py-2.5 text-left font-medium">色号 / 颜色名称</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">使用</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">建议备量</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">需购买</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">包装</th>
                      <th scope="col" className="py-2.5 pl-3 pr-5 text-left font-medium">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.lines.map((l) => {
                      const bought = !!project.purchase.bought[l.colorId];
                      const out = !!project.purchase.outOfStock[l.colorId];
                      const alts = out ? alternatives(l.colorId, ACTIVE_CATALOG, 2) : [];
                      const c = catalog.get(l.colorId)!;
                      return (
                        <tr key={l.colorId} className={`border-t border-warm-line ${bought ? 'opacity-60' : ''}`}>
                          <td className="py-3 pl-5 pr-3">
                            <input
                              type="checkbox"
                              aria-label={`${l.code} 已购买`}
                              className="h-[18px] w-[18px] accent-ink"
                              checked={bought}
                              onChange={() => togglePurchase(project.id, 'bought', l.colorId)}
                            />
                          </td>
                          <th scope="row" className="px-3 py-3 text-left font-normal">
                            <span className="flex items-center gap-2.5">
                              <Swatch hex={l.hex} size={26} />
                              <span className="flex flex-col">
                                <span className="font-mono font-medium">{l.code}</span>
                                <span className="text-xs text-muted">{colorLabel(c, lang)}</span>
                              </span>
                            </span>
                          </th>
                          <td className="px-3 py-3 text-right font-mono">{l.required}</td>
                          <td className="px-3 py-3 text-right font-mono text-muted">+{l.reserve}</td>
                          <td className="px-3 py-3 text-right font-mono font-bold">{l.purchaseNeeded}</td>
                          <td className="px-3 py-3 text-right font-mono">
                            {l.packages !== null ? `${l.packages} 包` : '需确认'}
                            {l.beadsPerPackage && <div className="text-[11px] text-muted">{l.beadsPerPackage} 颗/包</div>}
                          </td>
                          <td className="py-3 pl-3 pr-5">
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                aria-pressed={out}
                                onClick={() => togglePurchase(project.id, 'outOfStock', l.colorId)}
                                className={`rounded-full px-2.5 py-0.5 text-xs ${out ? 'bg-amber-soft text-amber-deep' : bought ? 'bg-matcha-soft text-matcha-dark' : 'bg-warm text-ink'}`}
                              >
                                {out ? '缺货' : bought ? '已购买' : '待购买'}
                              </button>
                              {alts.length > 0 && (
                                <span className="text-[11px] text-muted">
                                  替代：{alts.map((a) => `${a.color.code}（ΔE ${a.deltaE.toFixed(1)}）`).join('、')}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warm px-5 py-4">
                <h2 className="text-base font-bold">其他配件</h2>
                <span className="text-xs text-muted">按制作结构计算，无法确定的项目需要你确认</span>
              </div>
              <ul>
                {accessories.map((a) => {
                  const confirmed = !!project.purchase.confirmed[a.id];
                  const tag =
                    a.status === 'calculated'
                      ? { t: '已计算', c: 'bg-matcha-soft text-matcha-dark' }
                      : a.status === 'estimated'
                        ? { t: '估算', c: 'bg-warm text-ink' }
                        : confirmed
                          ? { t: '已确认', c: 'bg-matcha-soft text-matcha-dark' }
                          : { t: '需确认', c: 'bg-amber-soft text-amber-deep' };
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-warm-line px-5 py-3.5 first:border-0">
                      <span className="flex-[1_1_160px] text-sm font-medium">{a.name}</span>
                      <span className="flex-[1_1_120px] font-mono text-[13px]">{a.quantity}</span>
                      <span className="flex-[2_1_240px] text-xs text-muted">{a.reason}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs ${tag.c}`}>{tag.t}</span>
                      {a.status === 'needs-confirmation' && (
                        <button type="button" className="btn-ghost !px-3 !py-1 text-xs" onClick={() => togglePurchase(project.id, 'confirmed', a.id)}>
                          {confirmed ? '取消确认' : '确认'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <aside className="flex w-full flex-col gap-4 lg:w-[360px] lg:shrink-0">
            <div className="flex flex-col gap-3.5 rounded-[18px] bg-ink p-5 text-paper">
              <span className="text-xs tracking-[0.1em] text-[#CFCBC3]">采购汇总</span>
              <div className="grid grid-cols-2 gap-3.5">
                {[
                  ['珠子总数', summary.totalBeads],
                  ['色号数量', summary.colorCount],
                  ['待购色号', toBuy.length],
                  ['需购包装', summary.totalPackages ?? '需确认'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs text-[#CFCBC3]">{k}</div>
                    <div className="font-mono text-[26px]">{v}</div>
                  </div>
                ))}
              </div>
              <label className="flex items-center justify-between border-t border-[#44423E] pt-3 text-sm">
                预留损耗
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={Math.round(wastageRate * 100)}
                    onChange={(e) => setWastageRate(Number(e.target.value) / 100)}
                    className="w-16 rounded-md bg-white/10 px-2 py-1 text-right font-mono text-paper"
                  />
                  %
                </span>
              </label>
            </div>

            <div className="card flex flex-col gap-2.5 p-5">
              <h2 className="text-sm font-bold">计算方式</h2>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-7 text-body">
                {`Required = 图纸中该色号珠子数
Reserve  = ⌈Required × ${Math.round(wastageRate * 100)}%⌉
Purchase = Required + Reserve
Packages = ⌈Purchase ÷ 单包颗数⌉`}
              </pre>
              <p className="text-xs leading-relaxed text-muted">按克销售的商家，用该珠型可信的颗数/克参数换算；缺少参数时显示「需确认」，不做猜测。</p>
            </div>

            {(confirmLeft.length > 0 || summary.needsConfirmation.length > 0) && (
              <div className="flex flex-col gap-2 rounded-[18px] bg-sakura p-4">
                <h2 className="text-sm font-bold">需要你确认 {confirmLeft.length + summary.needsConfirmation.length} 项</h2>
                <ul className="list-disc pl-5 text-[13px] leading-relaxed text-[#4A3A3E]">
                  {confirmLeft.map((a) => (
                    <li key={a.id}>
                      {a.name}：{a.reason}
                    </li>
                  ))}
                  {summary.needsConfirmation.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
