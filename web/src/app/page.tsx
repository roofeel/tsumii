'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/Header';
import { PatternThumb } from '@/components/PatternThumb';
import { useApp, useHydrated, useT } from '@/store';
import { ACTIVE_CATALOG, catalogById } from '@/lib/catalog';
import { countColors } from '@/lib/pattern';
import { ITEM_LABEL } from '@/lib/i18n';
import type { ProjectStatus } from '@/lib/types';

const SERIES = [
  { name: 'Sakura', jp: '桜', desc: '樱花粉色花朵', prompt: '樱花粉色花朵耳饰，温柔春日感', colors: ['#F3C9D3', '#E59AAE', '#FFFFFF', '#F2D27A', '#B5CBA4'] },
  { name: 'Shibuya', jp: '渋谷', desc: '都市几何', prompt: '涩谷都市几何书签，黑白加一点红', colors: ['#222222', '#C9473F', '#F2EEE6', '#B8B2A7', '#FFFFFF'] },
  { name: 'Ginza', jp: '銀座', desc: '极简精致', prompt: '银座风格极简精致项链，象牙白与金色', colors: ['#FFFFFF', '#E6D9C3', '#C99A3A', '#222222', '#F2EEE6'] },
  { name: 'Ueno', jp: '上野', desc: '自然花卉', prompt: '上野公园自然花卉吊坠，粉色与嫩绿', colors: ['#F2D27A', '#B5CBA4', '#E59AAE', '#3E5A3D', '#F2EEE6'] },
  { name: 'Asakusa', jp: '浅草', desc: '传统复古', prompt: '浅草传统复古风格手链，朱红与金色', colors: ['#C9473F', '#C99A3A', '#26324F', '#F2EEE6', '#222222'] },
  { name: 'Matcha', jp: '抹茶', desc: '抹茶绿色植物', prompt: '抹茶绿色植物项链，日系极简，适合新手', colors: ['#B5CBA4', '#789477', '#3E5A3D', '#F2EEE6', '#C99A3A'] },
  { name: 'Tokyo Night', jp: '東京夜景', desc: '深蓝夜景', prompt: '东京夜景手链，深蓝渐变，点点金色灯光', colors: ['#141B30', '#26324F', '#9DB7D6', '#F2D27A', '#FFFFFF'] },
];

const IDEAS = [
  { c: '#789477', text: '夏日抹茶色短款项链，叶片吊坠，新手友好' },
  { c: '#E59AAE', text: '樱花耳坠一对，透明珠点缀，适合春天佩戴' },
  { c: '#26324F', text: '东京夜景手链，深蓝渐变，加一点金色星光' },
];

const TEMPLATES = [
  { name: '14×14 小花胸针', prompt: '粉色小花胸针，简单可爱', meta: '初级 · 约 200 颗' },
  { name: '平面叶片吊坠', prompt: '绿色叶片吊坠，日系极简', meta: '初级 · 约 480 颗' },
  { name: '爱心挂饰', prompt: '红色爱心挂饰，复古', meta: '初级 · 约 480 颗' },
  { name: '几何书签', prompt: '蓝色几何书签', meta: '中级 · 约 770 颗' },
];

const STATUS_STYLE: Record<ProjectStatus, { label: string; cls: string }> = {
  editing: { label: '编辑中', cls: 'bg-matcha-soft text-matcha-dark' },
  exported: { label: '图纸已导出', cls: 'bg-warm text-ink' },
  purchasing: { label: '采购中', cls: 'bg-sakura text-sakura-deep' },
  draft: { label: '草稿', cls: 'border border-warm text-body' },
};

function timeAgo(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.round(h / 24);
  return d === 1 ? '昨天' : `${d} 天前`;
}

export default function HomePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { t, lang } = useT();
  const { projects, order, seedDemo, setSession } = useApp();
  const [prompt, setPrompt] = useState('');
  const catalog = useMemo(() => catalogById(ACTIVE_CATALOG), []);

  useEffect(() => {
    if (hydrated) seedDemo();
  }, [hydrated, seedDemo]);

  const list = order.map((id) => projects[id]).filter(Boolean);
  const sheets = list.filter((p) => p.exportedAt);

  const goCreate = (text: string) => {
    setSession({ prompt: text, ideas: [], pickedId: null, variants: [] });
    router.push(`/create?auto=1`);
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        sessionStorage.setItem('tsumii-upload', String(reader.result));
      } catch {
        // 存储不可用（隐私模式等）：直接进入上传页重新选择
      }
      router.push('/upload');
    };
    reader.readAsDataURL(f);
  };

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1280px] flex-col gap-16 px-4 pb-20 pt-14 sm:px-10">
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3.5 lg:max-w-[760px]">
            <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-matcha-deep">{t('brand.tagline')}</p>
            <h1 className="font-serif text-4xl font-bold leading-tight sm:text-5xl">{t('brand.slogan')}</h1>
            <p className="text-base leading-relaxed text-body">{t('home.intro')}</p>
          </div>

          <div className="flex flex-wrap gap-6">
            <div className="card flex min-w-0 flex-[1_1_420px] flex-col gap-5 p-7">
              <div>
                <p className="eyebrow">Mode A · Upload image</p>
                <h2 className="mt-1.5 text-2xl font-bold">{t('home.upload.title')}</h2>
                <p className="mt-1 text-sm text-body">{t('home.upload.desc')}</p>
              </div>
              <label
                className="flex h-[148px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#CFCBC3] bg-paper hover:bg-ivory"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onFile(e.dataTransfer.files?.[0]);
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#222" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
                </svg>
                <span className="text-[15px] font-medium">{t('home.upload.drop')}</span>
                <span className="text-xs text-muted">JPG · PNG · WebP</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            </div>

            <form
              className="flex min-w-0 flex-[1_1_420px] flex-col gap-5 rounded-[20px] bg-sakura p-7"
              onSubmit={(e) => {
                e.preventDefault();
                goCreate(prompt.trim() || IDEAS[0].text);
              }}
            >
              <div>
                <p className="eyebrow !text-sakura-deep">Mode B · Create with AI</p>
                <h2 className="mt-1.5 text-2xl font-bold">{t('home.ai.title')}</h2>
                <p className="mt-1 text-sm text-[#4A3A3E]">{t('home.ai.desc')}</p>
              </div>
              <label htmlFor="home-prompt" className="sr-only">
                {t('home.ai.title')}
              </label>
              <textarea
                id="home-prompt"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('home.ai.placeholder')}
                className="resize-none rounded-2xl border border-ink/10 bg-white px-4 py-3.5 text-sm leading-relaxed"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {['Sakura', 'Matcha', 'Tokyo Night'].map((n) => (
                    <button key={n} type="button" className="chip" onClick={() => setPrompt(SERIES.find((s) => s.name === n)!.prompt)}>
                      {n}
                    </button>
                  ))}
                </div>
                <button type="submit" className="btn-primary">
                  {t('home.ai.go')} <span aria-hidden="true">→</span>
                </button>
              </div>
            </form>
          </div>
        </section>

        <section id="projects" className="flex flex-col gap-5">
          <h2 className="text-xl font-bold">
            {t('home.projects')} <span className="ml-1.5 font-display text-xl font-normal italic text-muted">My projects</span>
          </h2>
          {hydrated && list.length === 0 && <p className="text-sm text-muted">{t('home.projects.empty')}</p>}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {hydrated &&
              list.map((p) => (
                <Link key={p.id} href={`/editor/${p.id}`} className="card flex flex-col gap-3.5 p-3.5 text-ink no-underline hover:border-ink/30">
                  <div className="flex h-[200px] items-center justify-center rounded-xl bg-ivory p-4">
                    <PatternThumb pattern={p.pattern} catalog={catalog} maxSize={168} label={p.name} />
                  </div>
                  <div className="flex flex-col gap-1.5 px-1 pb-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[15px] font-bold">{p.name}</span>
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[p.status].cls}`}>{STATUS_STYLE[p.status].label}</span>
                    </div>
                    <span className="font-mono text-xs text-muted">
                      {ITEM_LABEL[lang][p.itemType]} · {p.pattern.width}×{p.pattern.height} · {countColors(p.pattern.cells).size} 色
                    </span>
                    <span className="text-xs text-muted">{timeAgo(p.updatedAt)}</span>
                  </div>
                </Link>
              ))}
          </div>
        </section>

        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="text-xl font-bold">
              {t('home.series')} <span className="ml-1.5 font-display text-xl font-normal italic text-muted">Tokyo collection</span>
            </h2>
            <span className="text-[13px] text-muted">{t('home.series.note')}</span>
          </div>
          <div className="flex gap-3.5 overflow-x-auto pb-1.5">
            {SERIES.map((s) => (
              <button key={s.name} type="button" onClick={() => goCreate(s.prompt)} className="card flex w-[164px] shrink-0 flex-col gap-3.5 px-4 py-4 text-left hover:border-ink/30">
                <span className="flex gap-1" aria-hidden="true">
                  {s.colors.map((c, i) => (
                    <span key={i} className="h-[18px] w-[18px] rounded-full" style={{ background: c, boxShadow: 'inset 0 0 0 1px rgba(34,34,34,.12)' }} />
                  ))}
                </span>
                <span className="flex flex-col">
                  <span className="font-display text-[22px] leading-tight">{s.name}</span>
                  <span className="text-xs text-muted">
                    {s.jp} · {s.desc}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3.5">
            <h2 className="text-[17px] font-bold">{t('home.ideas')}</h2>
            {IDEAS.map((i) => (
              <button key={i.text} type="button" onClick={() => goCreate(i.text)} className="card flex items-start gap-3 px-4 py-3.5 text-left text-sm leading-relaxed hover:border-ink/30">
                <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: i.c }} />
                {i.text}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3.5">
            <h2 className="text-[17px] font-bold">{t('home.templates')}</h2>
            <div className="card flex flex-col">
              {TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => goCreate(tpl.prompt)}
                  className="flex items-center justify-between gap-3 border-b border-warm-line px-4 py-3.5 text-left last:border-0 hover:bg-paper"
                >
                  <span className="text-sm">{tpl.name}</span>
                  <span className="text-xs text-muted">{tpl.meta}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3.5">
            <h2 className="text-[17px] font-bold">{t('home.sheets')}</h2>
            {hydrated && sheets.length === 0 && <p className="text-sm text-muted">{t('home.sheets.empty')}</p>}
            {sheets.map((p) => (
              <Link key={p.id} href={`/print/${p.id}`} className="card flex items-center gap-3.5 px-3.5 py-3 text-ink no-underline hover:border-ink/30">
                <span className="flex h-[46px] w-[38px] items-center justify-center rounded-md bg-warm font-mono text-[10px] font-bold text-body">PDF</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{p.name} · 制作图纸</span>
                  <span className="text-xs text-muted">{new Date(p.exportedAt!).toLocaleDateString()}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-warm px-4 py-6 text-xs text-muted sm:px-10">
        <span>Tsumii つみー · 串米 — Tiny Beads. Endless Possibilities.</span>
        <span>MIYUKI Delica 11/0 · MVP</span>
      </footer>
    </>
  );
}
