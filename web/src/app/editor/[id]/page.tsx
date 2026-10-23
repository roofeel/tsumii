'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BeadCanvas, type Rect } from '@/components/BeadCanvas';
import { LangSwitch } from '@/components/Header';
import { Logo } from '@/components/Logo';
import { PatternThumb } from '@/components/PatternThumb';
import { SampleBadge } from '@/components/SampleBadge';
import { Swatch } from '@/components/Swatch';
import { useApp, useHydrated, useT } from '@/store';
import { ACTIVE_CATALOG, catalogById, colorLabel, isCatalogVerified } from '@/lib/catalog';
import { countColors, floodFill, productSizeCm, replaceInRect, rowRuns, validatePattern } from '@/lib/pattern';
import { calculateMaterials } from '@/lib/materials';
import { guessBackground, planLocalEdit } from '@/lib/ai/local';
import { patternToPngDataUrl, type ViewMode } from '@/lib/render';
import { downloadBlob, downloadDataUrl, projectJson, safeFilename } from '@/lib/export';

type Tool = 'brush' | 'eraser' | 'picker' | 'fill' | 'select';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'brush', label: '画笔', key: 'B', icon: 'M3 21c3 0 5-2 5-4.5S10 13 12 13l7-7a2 2 0 0 0-3-3l-7 7c0 2-1.5 4-4.5 4S3 18 3 21z' },
  { id: 'eraser', label: '橡皮擦', key: 'E', icon: 'M7 21h12M4 15l9-9 6 6-7 7H8z' },
  { id: 'picker', label: '吸管', key: 'I', icon: 'M14 4l6 6M17 7 7 17l-3 3v-3L14 7' },
  { id: 'fill', label: '填充', key: 'G', icon: 'M5 12l7-7 7 7-7 7zM20 15c0 1.5 1 2.5 1 4a1 1 0 0 1-2 0c0-1.5 1-2.5 1-4z' },
  { id: 'select', label: '区域', key: 'M', icon: 'M4 4h4M12 4h4M20 4v4M20 12v4M20 20h-4M12 20H8M4 20v-4M4 12V8' },
];

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'bead', label: '真实珠子' },
  { id: 'grid', label: '像素网格' },
  { id: 'code', label: '色号编号' },
  { id: 'compare', label: '原图对比' },
];

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const hydrated = useHydrated();
  const { lang } = useT();
  const project = useApp((s) => s.projects[id]);
  const { updateCells, saveVersion, restoreVersion, wastageRate, setWastageRate } = useApp();
  const catalog = useMemo(() => catalogById(ACTIVE_CATALOG), []);

  const [cells, setCells] = useState<string[]>([]);
  const [past, setPast] = useState<string[][]>([]);
  const [future, setFuture] = useState<string[][]>([]);
  const [tool, setTool] = useState<Tool>('brush');
  const [view, setView] = useState<ViewMode>('bead');
  const [active, setActive] = useState<string>('');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [row, setRow] = useState<number>(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [zoom, setZoom] = useState(22);
  const [aiText, setAiText] = useState('');
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [addColor, setAddColor] = useState('');
  const loadedFor = useRef<string | null>(null);
  const stroke = useRef<{ before: string[] | null }>({ before: null });

  // 首次载入项目
  useEffect(() => {
    if (!project || loadedFor.current === project.id) return;
    loadedFor.current = project.id;
    setCells(project.pattern.cells);
    const counts = countColors(project.pattern.cells);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    setActive(sorted[1]?.[0] ?? sorted[0]?.[0] ?? ACTIVE_CATALOG[0].id);
    setRow(Math.floor(project.pattern.height / 2));
    const fit = Math.floor(560 / Math.max(project.pattern.width, project.pattern.height * 0.8));
    setZoom(Math.max(8, Math.min(28, fit)));
  }, [project]);

  // 编辑结果写回 store（节流），材料统计在本地即时计算
  useEffect(() => {
    if (!project || !cells.length || cells === project.pattern.cells) return;
    const h = setTimeout(() => updateCells(project.id, cells), 250);
    return () => clearTimeout(h);
  }, [cells, project, updateCells]);

  const W = project?.pattern.width ?? 0;
  const H = project?.pattern.height ?? 0;
  const background = useMemo(() => (cells.length ? guessBackground(cells, W, H) : null), [cells, W, H]);

  const commit = useCallback(
    (next: string[], before: string[]) => {
      if (next === before) return;
      setPast((p) => [...p.slice(-99), before]);
      setFuture([]);
      setCells(next);
    },
    [],
  );

  const paintAt = (index: number, base: string[]): string[] => {
    if (tool === 'brush') return base[index] === active ? base : Object.assign(base.slice(), { [index]: active });
    if (tool === 'eraser') return background && base[index] !== background ? Object.assign(base.slice(), { [index]: background }) : base;
    return base;
  };

  const onStrokeStart = (index: number) => {
    if (tool === 'picker') {
      setActive(cells[index]);
      setTool('brush');
      return;
    }
    if (tool === 'fill') {
      commit(floodFill(cells, W, H, index, active), cells);
      return;
    }
    stroke.current.before = cells;
    setCells((c) => paintAt(index, c));
    setRow(Math.floor(index / W));
  };
  const onStrokeMove = (index: number) => {
    if (!stroke.current.before) return;
    setCells((c) => paintAt(index, c));
  };
  const onStrokeEnd = () => {
    const before = stroke.current.before;
    stroke.current.before = null;
    if (before && before !== cells) {
      setPast((p) => [...p.slice(-99), before]);
      setFuture([]);
    }
  };

  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture([cells, ...future]);
    setCells(past[past.length - 1]);
    setPast(past.slice(0, -1));
  }, [past, future, cells]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast([...past, cells]);
    setCells(future[0]);
    setFuture(future.slice(1));
  }, [past, future, cells]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
      if (t && !e.metaKey && !e.ctrlKey) setTool(t.id);
      if (e.key === 'ArrowDown') setRow((r) => Math.min(H - 1, r + 1));
      if (e.key === 'ArrowUp') setRow((r) => Math.max(0, r - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, H]);

  const counts = useMemo(() => countColors(cells), [cells]);
  const usedIds = useMemo(() => {
    const ids = [...counts.keys()];
    if (active && !ids.includes(active)) ids.push(active);
    return ids.sort((a, b) => ACTIVE_CATALOG.findIndex((c) => c.id === a) - ACTIVE_CATALOG.findIndex((c) => c.id === b));
  }, [counts, active]);
  const codeIndex = useMemo(() => new Map(usedIds.map((cid, i) => [cid, i + 1])), [usedIds]);
  const summary = useMemo(() => (cells.length ? calculateMaterials({ cells }, catalog, { wastageRate }) : null), [cells, catalog, wastageRate]);
  const errors = useMemo(() => (project && cells.length ? validatePattern({ ...project.pattern, cells }, catalog) : []), [project, cells, catalog]);
  const runs = useMemo(() => (cells.length ? rowRuns(cells, W, row) : []), [cells, W, row]);

  if (!hydrated) return null;
  if (!project) {
    return (
      <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center">
        <p>找不到这个项目。</p>
        <Link href="/" className="btn-primary">
          返回首页
        </Link>
      </main>
    );
  }

  const applyAi = () => {
    if (!selection) {
      setAiMsg('请先用「区域」工具框选要修改的范围');
      return;
    }
    const plan = planLocalEdit(aiText, ACTIVE_CATALOG, background);
    if (!plan) {
      setAiMsg('暂时无法理解这条指令，可以试试「改成金色」「浅一点」「清除」');
      return;
    }
    commit(replaceInRect(cells, W, selection, plan.map), cells);
    setAiMsg(plan.summary);
  };

  const size = productSizeCm(W, H);
  const v1 = project.versions[0];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-warm bg-white px-4 py-2.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-3.5">
          <Logo compact />
          <span className="h-5 w-px bg-warm" />
          <span className="text-sm font-bold">{project.name}</span>
          <span className="rounded-md bg-matcha-soft px-2 py-0.5 text-xs text-matcha-dark">已自动保存 · v{project.pattern.version}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="视图">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
              className={`rounded-lg border px-3 py-1.5 text-[13px] ${view === v.id ? 'border-ink bg-ink text-paper' : 'border-warm bg-white text-ink hover:bg-paper'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="撤销 (Ctrl+Z)" onClick={undo} disabled={!past.length} className="btn-ghost h-9 w-9 !p-0">
            ↶
          </button>
          <button type="button" aria-label="重做 (Ctrl+Shift+Z)" onClick={redo} disabled={!future.length} className="btn-ghost h-9 w-9 !p-0">
            ↷
          </button>
          <LangSwitch />
          <Link href={`/shopping/${project.id}`} className="btn-primary">
            生成清单与图纸
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-wrap items-stretch">
        {/* 左：设计工具 */}
        <aside className="flex w-full flex-col gap-5 border-b border-warm bg-white p-4 lg:w-[256px] lg:border-b-0 lg:border-r">
          <section className="flex flex-col gap-2">
            <h2 className="text-xs tracking-[0.1em] text-muted">工具</h2>
            <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-3">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tool === t.id}
                  title={`${t.label} (${t.key})`}
                  onClick={() => setTool(t.id)}
                  className={`flex flex-col items-center gap-1 rounded-[10px] border px-1 py-2.5 text-xs ${tool === t.id ? 'border-ink bg-ink text-paper' : 'border-warm bg-white text-ink hover:bg-paper'}`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={t.icon} />
                  </svg>
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 text-[13px]">
            <div className="rounded-lg bg-paper px-2.5 py-2">
              <div className="text-[11px] text-muted">尺寸</div>
              <div className="font-mono">
                {W} × {H}
              </div>
            </div>
            <div className="rounded-lg bg-paper px-2.5 py-2">
              <div className="text-[11px] text-muted">珠型</div>
              <div>Delica 11/0</div>
            </div>
            <div className="col-span-2 rounded-lg bg-paper px-2.5 py-2">
              <div className="text-[11px] text-muted">成品尺寸</div>
              <div>
                约 {size.w} × {size.h} cm
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xs tracking-[0.1em] text-muted">色号</h2>
              <span className="text-[11px] text-muted">再点一次 = 高亮</span>
            </div>
            <ul className="flex flex-col gap-1">
              {usedIds.map((cid) => {
                const c = catalog.get(cid)!;
                const on = active === cid;
                return (
                  <li key={cid}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        if (on) setHighlight((h) => (h === cid ? null : cid));
                        else {
                          setActive(cid);
                          setHighlight(null);
                          if (tool === 'eraser' || tool === 'picker') setTool('brush');
                        }
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-[10px] border px-2 py-1.5 text-left ${on ? 'border-ink' : 'border-warm'} ${highlight === cid ? 'bg-sakura' : 'bg-white'}`}
                    >
                      <Swatch hex={c.hex} size={22} />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-mono text-xs">
                          {codeIndex.get(cid)} · {c.code}
                        </span>
                        <span className="truncate text-[11px] text-muted">{colorLabel(c, lang)}</span>
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-muted">{highlight === cid ? '高亮' : counts.get(cid) ?? 0}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <label className="flex flex-col gap-1 text-[11px] text-muted">
              添加色号
              <select
                className="field"
                value={addColor}
                onChange={(e) => {
                  setAddColor('');
                  if (e.target.value) {
                    setActive(e.target.value);
                    setTool('brush');
                  }
                }}
              >
                <option value="">从色卡选择…</option>
                {ACTIVE_CATALOG.filter((c) => !counts.has(c.id)).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {colorLabel(c, lang)}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="flex flex-col gap-2 rounded-xl bg-sakura p-3">
            <label htmlFor="ai-local" className="text-[13px] font-bold">
              AI 局部修改
            </label>
            <input
              id="ai-local"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyAi()}
              placeholder="例如：改成金色 / 浅一点"
              className="rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-[13px]"
            />
            <button type="button" className="btn-primary !py-2" onClick={applyAi}>
              应用到选区
            </button>
            <span className="text-[11px] text-[#4A3A3E]">{aiMsg ?? (selection ? `已选 ${selection.w}×${selection.h}` : '先用「区域」框选范围')}</span>
          </section>
        </aside>

        {/* 中：画布 */}
        <section className="flex min-w-0 flex-[999_1_560px] flex-col bg-ivory">
          {(errors.length > 0 || project.idea?.feasibilityStatus === 'needs-review') && (
            <div role="status" className="border-b border-amber-soft bg-amber-soft px-5 py-2 text-xs text-amber-deep">
              {errors.length > 0 ? `图纸验证未通过：${errors.join('；')}` : `${project.idea!.feasibilityNote}。当前图纸只包含平面部分。`}
            </div>
          )}
          <div className="flex flex-1 items-start justify-center gap-8 overflow-auto p-6">
            {cells.length > 0 && (
              <BeadCanvas
                width={W}
                height={H}
                cells={cells}
                catalog={catalog}
                cell={zoom}
                view={view}
                highlight={highlight}
                activeRow={row}
                selection={tool === 'select' || selection ? selection : null}
                codeIndex={codeIndex}
                selectMode={tool === 'select'}
                onStrokeStart={onStrokeStart}
                onStrokeMove={onStrokeMove}
                onStrokeEnd={onStrokeEnd}
                onSelect={setSelection}
              />
            )}
            {view === 'compare' && v1 && (
              <figure className="flex flex-col gap-2">
                <figcaption className="text-xs text-body">v1 · 初始生成</figcaption>
                <div className="rounded-xl bg-white p-3">
                  <PatternThumb pattern={v1} catalog={catalog} maxSize={240} />
                </div>
              </figure>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-[#E3DFD7] bg-white px-5 py-3">
            <span className="text-[13px] font-bold">制作步骤</span>
            <button type="button" aria-label="上一行" onClick={() => setRow((r) => Math.max(0, r - 1))} className="btn-ghost h-8 w-8 !p-0">
              ‹
            </button>
            <span className="min-w-[96px] text-center font-mono text-[13px]">
              第 {row + 1} / {H} 行
            </span>
            <button type="button" aria-label="下一行" onClick={() => setRow((r) => Math.min(H - 1, r + 1))} className="btn-ghost h-8 w-8 !p-0">
              ›
            </button>
            <ol className="flex flex-[1_1_280px] flex-wrap gap-1.5" aria-label="本行从左到右">
              {runs.map((r, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-md border border-warm bg-paper px-2 py-1 font-mono text-xs">
                  <Swatch hex={catalog.get(r.colorId)!.hex} size={12} />
                  {codeIndex.get(r.colorId)} × {r.length}
                </li>
              ))}
            </ol>
            <label className="flex items-center gap-2 text-xs text-muted">
              缩放
              <input type="range" min={6} max={36} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-24 accent-ink" />
            </label>
          </div>
        </section>

        {/* 右：材料统计 */}
        <aside className="flex w-full flex-col gap-4 border-t border-warm bg-white p-4 lg:w-[340px] lg:border-l lg:border-t-0">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">材料统计</h2>
            <span className="text-[11px] text-matcha-dark">● 实时同步</span>
          </div>
          <SampleBadge show={!isCatalogVerified(ACTIVE_CATALOG)} />
          {summary && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-paper p-3">
                  <div className="text-[11px] text-muted">珠子总数</div>
                  <div className="font-mono text-[26px] font-bold">{summary.totalBeads}</div>
                </div>
                <div className="rounded-xl bg-paper p-3">
                  <div className="text-[11px] text-muted">颜色数量</div>
                  <div className="font-mono text-[26px] font-bold">{summary.colorCount}</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-right text-muted">
                      <th scope="col" className="border-b border-warm px-1 py-1.5 text-left font-medium">色号</th>
                      <th scope="col" className="border-b border-warm px-1 py-1.5 font-medium">用量</th>
                      <th scope="col" className="border-b border-warm px-1 py-1.5 font-medium">损耗</th>
                      <th scope="col" className="border-b border-warm px-1 py-1.5 font-medium">采购</th>
                      <th scope="col" className="border-b border-warm px-1 py-1.5 font-medium">包</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.lines.map((l) => (
                      <tr key={l.colorId} className="text-right font-mono">
                        <th scope="row" className="border-b border-warm-line px-1 py-2 text-left font-normal">
                          <span className="inline-flex items-center gap-1.5">
                            <Swatch hex={l.hex} size={12} />
                            {l.code}
                          </span>
                        </th>
                        <td className="border-b border-warm-line px-1 py-2">{l.required}</td>
                        <td className="border-b border-warm-line px-1 py-2 text-muted">+{l.reserve}</td>
                        <td className="border-b border-warm-line px-1 py-2 font-medium">{l.purchaseNeeded}</td>
                        <td className="border-b border-warm-line px-1 py-2">{l.packages ?? '?'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-2 rounded-xl bg-paper p-3 text-xs">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-muted">预留损耗</span>
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={Math.round(wastageRate * 100)}
                      onChange={(e) => setWastageRate(Number(e.target.value) / 100)}
                      className="w-14 rounded-md border border-warm-border bg-white px-1.5 py-0.5 text-right font-mono"
                    />
                    %
                  </span>
                </label>
                <div className="flex justify-between">
                  <span className="text-muted">需采购包装</span>
                  <span className="font-mono">{summary.totalPackages ?? '需确认'}</span>
                </div>
              </div>
            </>
          )}

          <section className="flex flex-col gap-2 border-t border-warm-line pt-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-bold">版本</h2>
              <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => saveVersion(project.id, `v${project.pattern.version + 1} · 手动保存`)}>
                保存版本
              </button>
            </div>
            <ul className="flex max-h-36 flex-col gap-1 overflow-auto text-xs">
              {[...project.versions].reverse().map((v) => (
                <li key={v.version} className="flex items-center justify-between gap-2 rounded-md bg-paper px-2 py-1.5">
                  <span className="truncate">{v.note}</span>
                  <button
                    type="button"
                    className="shrink-0 text-matcha-deep underline"
                    onClick={() => {
                      commit(v.cells.slice(), cells);
                      restoreVersion(project.id, v.version);
                    }}
                  >
                    恢复
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-wrap gap-2 border-t border-warm-line pt-3">
            <button
              type="button"
              className="btn-ghost !px-3 !py-2 text-xs"
              onClick={() => downloadDataUrl(`${safeFilename(project.name)}.png`, patternToPngDataUrl({ width: W, height: H, cells }, catalog, view === 'code' ? 'code' : 'bead', codeIndex))}
            >
              导出 PNG
            </button>
            <button type="button" className="btn-ghost !px-3 !py-2 text-xs" onClick={() => downloadBlob(`${safeFilename(project.name)}.tsumii.json`, projectJson({ ...project, pattern: { ...project.pattern, cells } }), 'application/json')}>
              导出 Project JSON
            </button>
            <Link href={`/print/${project.id}`} className="btn-ghost !px-3 !py-2 text-xs">
              PDF 制作图纸
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
