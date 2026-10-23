'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/Header';
import { useInviteGate } from '@/components/InviteDialog';
import { NecklacePreview } from '@/components/NecklacePreview';
import { SampleBadge } from '@/components/SampleBadge';
import { Swatch } from '@/components/Swatch';
import { useApp, useHydrated, useT } from '@/store';
import { ACTIVE_CATALOG, catalogById, isCatalogVerified } from '@/lib/catalog';
import { parsePrompt } from '@/lib/ai/parse';
import { defaultSize, renderMotif } from '@/lib/pattern/motifs';
import { strandForItem } from '@/lib/pattern/strand';
import { DIFFICULTY_LABEL, ITEM_LABEL } from '@/lib/i18n';
import type { DesignIdea, DesignVariant, Difficulty, ItemType, ParsedBrief } from '@/lib/types';

const REFINE_CHIPS = ['绿色再浅一点', '使用更少的珠子颜色', '更精致', '更适合新手', '增加樱花元素', '改成短款项链', '减少金属配件', '改成手链'];
const DEFAULT_PROMPT = '我想做一个绿色的 MIYUKI 串珠项链，日系极简风格，有植物元素，适合夏天佩戴，制作难度不要太高。';

function CreateInner() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useHydrated();
  const { t, lang } = useT();
  const { session, setSession, createProject } = useApp();
  const catalog = useMemo(() => catalogById(ACTIVE_CATALOG), []);
  const { withInvite, dialog: inviteDialog } = useInviteGate();

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [override, setOverride] = useState<Partial<ParsedBrief>>({});
  const [count, setCount] = useState(4);
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const autoRan = useRef(false);

  const brief: ParsedBrief = { ...parsePrompt(prompt), ...override };

  const generate = useCallback(
    async (text: string, extra: Partial<ParsedBrief>, n: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await withInvite((headers) =>
          fetch('/api/ideas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ prompt: text, count: n, brief: extra }),
          }),
        );
        if (!res) throw new Error('需要邀请码才能使用 AI 生成');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '生成失败');
        setSession({ prompt: text, ideas: data.ideas as DesignIdea[], pickedId: (data.ideas as DesignIdea[])[0]?.id ?? null, variants: [] });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [setSession, withInvite],
  );

  // 从首页跳转过来：带上提示词并自动生成
  useEffect(() => {
    if (!hydrated || autoRan.current) return;
    autoRan.current = true;
    if (session.prompt) setPrompt(session.prompt);
    if (params.get('auto') === '1' && session.prompt && session.ideas.length === 0) void generate(session.prompt, {}, 4);
  }, [hydrated, params, session.prompt, session.ideas.length, generate]);

  const ideas = session.ideas;
  const picked = ideas.find((i) => i.id === session.pickedId) ?? null;
  const pickedVariants = session.variants.filter((v) => v.ideaId === picked?.id);
  const latest: DesignVariant | undefined = pickedVariants[pickedVariants.length - 1];
  const current: DesignIdea | null = latest?.idea ?? picked;

  const refine = async (text: string) => {
    if (!current || !text.trim()) return;
    setRefining(true);
    setError(null);
    try {
      const res = await withInvite((headers) =>
        fetch('/api/refine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ idea: current, rootIdeaId: picked?.id, instruction: text, parentVariantId: latest?.id }),
        }),
      );
      if (!res) throw new Error('需要邀请码才能使用 AI 二次设计');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '修改失败');
      const v = data.variant as DesignVariant;
      // 统一挂在原始方案上，便于版本追溯
      setSession({ variants: [...session.variants, { ...v, ideaId: picked!.id }] });
      setInstruction('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefining(false);
    }
  };

  const convert = () => {
    if (!current) return;
    const size = defaultSize(current.itemType);
    const id = createProject({
      name: `${current.name} ${ITEM_LABEL.zh[current.itemType]}`,
      description: current.description,
      creationMode: 'ai',
      itemType: current.itemType,
      width: size.width,
      height: size.height,
      cells: renderMotif(current.motif, current.palette, size),
      // 项链的主链单独保存，方格图纸只包含吊坠
      strand: strandForItem(current.itemType, current.strandSequence, ACTIVE_CATALOG),
      idea: current,
      variants: pickedVariants,
    });
    router.push(`/editor/${id}`);
  };

  const parsedRows: { k: string; v: string }[] = [
    { k: '作品类型', v: ITEM_LABEL[lang][brief.itemType] },
    { k: '主色调', v: brief.colors.join(' / ') },
    { k: '设计风格', v: brief.style },
    { k: '主题元素', v: brief.theme || '—' },
    { k: '使用场景', v: brief.scene },
    { k: '制作难度', v: DIFFICULTY_LABEL[lang][brief.difficulty] },
  ];

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1360px] flex-wrap items-start gap-8 px-4 pb-16 pt-8 sm:px-10">
        <aside className="flex w-full flex-col gap-5 lg:w-[380px] lg:shrink-0">
          <div>
            <p className="eyebrow">Mode B · Create with AI</p>
            <h1 className="mt-1 font-serif text-3xl font-bold">{t('create.title')}</h1>
          </div>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void generate(prompt, override, count);
            }}
          >
            <label className="flex flex-col gap-2 text-[13px] font-medium">
              {t('create.free')}
              <textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="resize-y rounded-2xl border border-warm-border bg-white px-4 py-3.5 text-sm font-normal leading-relaxed"
              />
            </label>

            <div className="card flex flex-col gap-2.5 p-4">
              <span className="text-[13px] font-bold">{t('create.parsed')}</span>
              <dl className="grid grid-cols-2 gap-2">
                {parsedRows.map((r) => (
                  <div key={r.k} className="rounded-[10px] border border-warm bg-paper px-3 py-2.5">
                    <dt className="text-[11px] text-muted">{r.k}</dt>
                    <dd className="text-sm font-medium">{r.v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-xs text-body">
                作品类型
                <select className="field" value={brief.itemType} onChange={(e) => setOverride({ ...override, itemType: e.target.value as ItemType })}>
                  {(Object.keys(ITEM_LABEL.zh) as ItemType[]).map((k) => (
                    <option key={k} value={k}>
                      {ITEM_LABEL[lang][k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-body">
                制作难度
                <select className="field" value={brief.difficulty} onChange={(e) => setOverride({ ...override, difficulty: e.target.value as Difficulty })}>
                  {(['beginner', 'intermediate', 'advanced'] as Difficulty[]).map((k) => (
                    <option key={k} value={k}>
                      {DIFFICULTY_LABEL[lang][k]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-body">
                {t('create.bead')}
                <select className="field" defaultValue="delica-11-0">
                  <option value="delica-11-0">Delica 11/0</option>
                  <option disabled>Delica 10/0 · 即将支持</option>
                  <option disabled>Delica 15/0 · 即将支持</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-body">
                {t('create.count')}
                <select className="field" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                  {[4, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="btn-primary py-3.5 text-[15px]" disabled={loading}>
              {loading ? '生成中…' : ideas.length ? t('create.regenerate') : t('create.generate')}
            </button>
            {error && (
              <p role="alert" className="text-sm text-[#A2342C]">
                {error}
              </p>
            )}
          </form>
        </aside>

        <section className="flex min-w-0 flex-[999_1_640px] flex-col gap-5" aria-busy={loading}>
          {ideas.length === 0 ? (
            <div className="card flex h-[420px] flex-col items-center justify-center gap-3 text-center text-sm text-muted">
              {loading ? '正在生成设计方向…' : t('create.empty')}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-[22px] font-bold">
                    {ideas.length} {t('create.directions')}
                  </h2>
                  <p className="text-[13px] text-muted">{t('create.estimateNote')}</p>
                </div>
                <SampleBadge show={!isCatalogVerified(ACTIVE_CATALOG)} />
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {ideas.map((idea, i) => {
                  const on = idea.id === session.pickedId;
                  const shown = on && current ? current : idea;
                  return (
                    <article key={idea.id} className={`flex flex-col overflow-hidden rounded-[20px] bg-white ${on ? 'border-2 border-ink' : 'border border-warm'}`}>
                      <div className="relative">
                        <NecklacePreview idea={shown} catalog={catalog} height={260} />
                        <span className="absolute left-3.5 top-3.5 rounded-md bg-white/85 px-2 py-1 text-[11px] text-body">
                          AI 效果图 · 方案 {String.fromCharCode(65 + i)}
                          {on && latest ? ` · v${pickedVariants.length + 1}` : ''}
                        </span>
                      </div>
                      <div className="flex flex-col gap-3 px-5 pb-5 pt-4">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="font-display text-[28px] leading-tight">{shown.name}</h3>
                          <span
                            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${shown.feasibilityStatus === 'flat-ok' ? 'bg-matcha-soft text-matcha-dark' : 'bg-amber-soft text-amber-deep'}`}
                            title={shown.feasibilityNote}
                          >
                            {shown.feasibilityStatus === 'flat-ok' ? '平面结构 · 可转换' : '需人工确认结构'}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-body">{shown.description}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {shown.palette.map((p) => (
                            <Swatch key={p} hex={catalog.get(p)?.hex ?? '#ccc'} size={16} round />
                          ))}
                          <span className="ml-1 text-xs text-muted">{shown.styleTags.join(' · ')}</span>
                        </div>
                        <dl className="grid grid-cols-4 gap-2 border-t border-warm-line pt-3">
                          {[
                            ['推荐珠型', 'Delica 11/0'],
                            ['颜色', `${shown.estimatedColors} 色`],
                            ['预计珠子', `约 ${shown.estimatedBeads} 颗`],
                            ['难度', DIFFICULTY_LABEL[lang][shown.difficulty]],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <dt className="text-[11px] text-muted">{k}</dt>
                              <dd className="text-[13px] font-medium">{v}</dd>
                            </div>
                          ))}
                        </dl>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => setSession({ pickedId: idea.id })}
                          className={`rounded-[10px] border border-ink py-2.5 text-sm font-medium ${on ? 'bg-ink text-paper' : 'bg-white text-ink hover:bg-paper'}`}
                        >
                          {on ? t('create.picked') : t('create.pick')}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {current && (
                <div className="flex flex-col gap-3.5 rounded-[20px] bg-sakura p-5 sm:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-bold">
                      {t('create.refine')} · 「{current.name}」
                    </h2>
                    <span className="text-xs text-sakura-deep">保留原设计方向，生成细化版本</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {REFINE_CHIPS.map((c) => (
                      <button key={c} type="button" className="chip" disabled={refining} onClick={() => void refine(c)}>
                        {c}
                      </button>
                    ))}
                  </div>
                  <form
                    className="flex flex-wrap gap-2.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void refine(instruction);
                    }}
                  >
                    <label htmlFor="refine" className="sr-only">
                      {t('create.refine')}
                    </label>
                    <input
                      id="refine"
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder={t('create.refine.placeholder')}
                      className="min-w-0 flex-[1_1_320px] rounded-xl border border-ink/15 bg-white px-3.5 py-3 text-sm"
                    />
                    <button type="submit" className="btn-ghost" disabled={refining || !instruction.trim()}>
                      {refining ? '生成中…' : t('create.refine.go')}
                    </button>
                    <button type="button" className="btn-primary" onClick={convert}>
                      {t('create.convert')} <span aria-hidden="true">→</span>
                    </button>
                  </form>
                  {pickedVariants.length > 0 && (
                    <ol className="flex flex-wrap gap-2 text-xs text-[#4A3A3E]" aria-label={t('create.versions')}>
                      <li className="rounded-md bg-white/60 px-2 py-1">v1 · 原方案</li>
                      {pickedVariants.map((v, i) => (
                        <li key={v.id} className="rounded-md bg-white/60 px-2 py-1">
                          v{i + 2} · {v.refinementPrompt}
                        </li>
                      ))}
                    </ol>
                  )}
                  {current.feasibilityStatus === 'needs-review' && (
                    <p className="text-xs text-amber-deep">{current.feasibilityNote}</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>
      {inviteDialog}
    </>
  );
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreateInner />
    </Suspense>
  );
}
