'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { PatternThumb } from '@/components/PatternThumb';
import { SampleBadge } from '@/components/SampleBadge';
import { useApp, useT } from '@/store';
import { ACTIVE_CATALOG, DELICA_11_0_SIZE_MM, catalogById, isCatalogVerified } from '@/lib/catalog';
import { convertToCells, type ConversionMode } from '@/lib/pattern/convert';
import { countColors, productSizeCm } from '@/lib/pattern';
import { ITEM_LABEL } from '@/lib/i18n';
import type { ItemType } from '@/lib/types';

const MODES: { id: ConversionMode; t: string; d: string }[] = [
  { id: 'faithful', t: '原图保真', d: '尽量保留细节与渐变' },
  { id: 'pixel', t: '日系像素风', d: '清晰色块，适合小尺寸' },
  { id: 'cartoon', t: '卡通简化', d: '合并相近色，线条干净' },
  { id: 'outline', t: '轮廓优先', d: '强化边缘，适合图标' },
  { id: 'low-color', t: '低颜色数量', d: '最多 4 色，新手友好' },
];

const STEPS = ['上传图片', '识别与预处理', '珠型与尺寸', '生成图案', '匹配色号', '编辑调整', '材料清单', '导出图纸'];

interface Prep {
  rotate: 0 | 90 | 180 | 270;
  zoom: number;
  brightness: number;
  contrast: number;
  removeBg: boolean;
  autoCenter: boolean;
  squareCrop: boolean;
}

const MAX = 480;

/** 预处理：旋转 → 裁剪/缩放 → 亮度对比度 → 背景移除 → 主体提取居中 */
function preprocess(img: HTMLImageElement, p: Prep): HTMLCanvasElement {
  const rot = p.rotate % 180 !== 0;
  const iw = rot ? img.naturalHeight : img.naturalWidth;
  const ih = rot ? img.naturalWidth : img.naturalHeight;
  // 先把旋转后的整图画到临时画布
  const scale0 = Math.min(1, (MAX * 2) / Math.max(iw, ih));
  const tmp = document.createElement('canvas');
  tmp.width = Math.round(iw * scale0);
  tmp.height = Math.round(ih * scale0);
  const tc = tmp.getContext('2d')!;
  tc.translate(tmp.width / 2, tmp.height / 2);
  tc.rotate((p.rotate * Math.PI) / 180);
  const dw = img.naturalWidth * scale0;
  const dh = img.naturalHeight * scale0;
  tc.drawImage(img, -dw / 2, -dh / 2, dw, dh);

  // 裁剪：中心区域，zoom 越大裁得越紧
  let cw = tmp.width / p.zoom;
  let ch = tmp.height / p.zoom;
  if (p.squareCrop) cw = ch = Math.min(cw, ch);
  const out = document.createElement('canvas');
  const s = Math.min(1, MAX / Math.max(cw, ch));
  out.width = Math.max(1, Math.round(cw * s));
  out.height = Math.max(1, Math.round(ch * s));
  const oc = out.getContext('2d', { willReadFrequently: true })!;
  oc.drawImage(tmp, (tmp.width - cw) / 2, (tmp.height - ch) / 2, cw, ch, 0, 0, out.width, out.height);

  const data = oc.getImageData(0, 0, out.width, out.height);
  const d = data.data;
  const c = (p.contrast + 100) / 100;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, (d[i + k] - 128) * c + 128 + p.brightness * 1.28));
  }

  if (p.removeBg) {
    // 从四边开始按与边缘平均色的距离做泛洪，相近颜色设为透明
    const W = out.width;
    const H = out.height;
    let r = 0, g = 0, b = 0, n = 0;
    for (let x = 0; x < W; x++)
      for (const y of [0, H - 1]) {
        const i = (y * W + x) * 4;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    r /= n; g /= n; b /= n;
    const tol = 48 * 48;
    const seen = new Uint8Array(W * H);
    const stack: number[] = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const k = stack.pop()!;
      if (seen[k]) continue;
      seen[k] = 1;
      const i = k * 4;
      const dist = (d[i] - r) ** 2 + (d[i + 1] - g) ** 2 + (d[i + 2] - b) ** 2;
      if (dist > tol) continue;
      d[i + 3] = 0;
      const x = k % W;
      const y = (k - x) / W;
      if (x > 0) stack.push(k - 1);
      if (x < W - 1) stack.push(k + 1);
      if (y > 0) stack.push(k - W);
      if (y < H - 1) stack.push(k + W);
    }
  }
  oc.putImageData(data, 0, 0);

  if (p.autoCenter) {
    let x0 = out.width, y0 = out.height, x1 = -1, y1 = -1;
    for (let y = 0; y < out.height; y++)
      for (let x = 0; x < out.width; x++)
        if (d[(y * out.width + x) * 4 + 3] > 128) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 >= x0 && y1 >= y0) {
      const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.06);
      const side = Math.max(x1 - x0, y1 - y0) + pad * 2;
      const centered = document.createElement('canvas');
      centered.width = centered.height = Math.min(MAX, side);
      const cc = centered.getContext('2d', { willReadFrequently: true })!;
      const k = centered.width / side;
      cc.drawImage(out, x0 - pad - (side - (x1 - x0) - pad * 2) / 2, y0 - pad - (side - (y1 - y0) - pad * 2) / 2, side, side, 0, 0, side * k, side * k);
      return centered;
    }
  }
  return out;
}

export default function UploadPage() {
  const router = useRouter();
  const { t, lang } = useT();
  const createProject = useApp((s) => s.createProject);
  const catalog = useMemo(() => catalogById(ACTIVE_CATALOG), []);

  const [src, setSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [prep, setPrep] = useState<Prep>({ rotate: 0, zoom: 1, brightness: 0, contrast: 0, removeBg: false, autoCenter: false, squareCrop: false });
  const [mode, setMode] = useState<ConversionMode>('pixel');
  const [cols, setCols] = useState(28);
  const [lockRatio, setLockRatio] = useState(true);
  const [rowsManual, setRowsManual] = useState(28);
  const [maxColors, setMaxColors] = useState(6);
  const [opts, setOpts] = useState({ removeIsolated: true, symmetry: false, smallAreaMerge: true });
  const [itemType, setItemType] = useState<ItemType>('pendant');
  const [cells, setCells] = useState<string[] | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [processed, setProcessed] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('tsumii-upload');
      if (stored) {
        setSrc(stored);
        setFileName('upload');
        sessionStorage.removeItem('tsumii-upload');
      }
    } catch {
      // 存储不可用时忽略，用户可在本页重新选择图片
    }
  }, []);

  useEffect(() => {
    if (!src) return;
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = src;
  }, [src]);

  useEffect(() => {
    if (!img) return;
    setProcessed(preprocess(img, prep));
  }, [img, prep]);

  // 行数：锁定比例时按 Delica 珠子宽高比换算，使成品比例与原图一致
  const rows = useMemo(() => {
    if (!lockRatio || !processed) return rowsManual;
    const r = (processed.height / processed.width) * (DELICA_11_0_SIZE_MM.width / DELICA_11_0_SIZE_MM.height);
    return Math.max(4, Math.min(120, Math.round(cols * r)));
  }, [lockRatio, processed, cols, rowsManual]);

  useEffect(() => {
    const c = previewRef.current;
    if (!c || !processed) return;
    c.width = processed.width;
    c.height = processed.height;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(processed, 0, 0);
  }, [processed]);

  useEffect(() => {
    if (!processed) return;
    const h = setTimeout(() => {
      const ctx = processed.getContext('2d', { willReadFrequently: true })!;
      const data = ctx.getImageData(0, 0, processed.width, processed.height);
      setCells(convertToCells(data, { cols, rows, maxColors, mode, catalog: ACTIVE_CATALOG, ...opts }));
    }, 120);
    return () => clearTimeout(h);
  }, [processed, cols, rows, maxColors, mode, opts]);

  const onFile = (f?: File) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      alert('仅支持 JPG / PNG / WebP');
      return;
    }
    const r = new FileReader();
    r.onload = () => setSrc(String(r.result));
    r.readAsDataURL(f);
    setFileName(f.name);
  };

  const finish = () => {
    if (!cells) return;
    const id = createProject({
      name: `${fileName.replace(/\.[^.]+$/, '') || '图片'} ${ITEM_LABEL.zh[itemType]}`,
      creationMode: 'image',
      itemType,
      width: cols,
      height: rows,
      cells,
    });
    router.push(`/editor/${id}`);
  };

  // 有预览时，上传→预处理→珠型→生成→匹配色号均已完成，下一步是编辑
  const step = !src ? 0 : cells ? 5 : 1;
  const size = productSizeCm(cols, rows);
  const toggle = (k: keyof Prep) => setPrep((p) => ({ ...p, [k]: !p[k] }));

  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-[1360px] flex-col gap-6 px-4 pb-14 pt-7 sm:px-10">
        <ol aria-label="转换步骤" className="flex flex-wrap gap-1.5">
          {STEPS.map((s, i) => {
            const done = i < step;
            const cur = i === step;
            return (
              <li
                key={s}
                aria-current={cur ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-[13px] ${cur ? 'bg-ink text-paper' : done ? 'bg-matcha-soft text-matcha-dark' : 'bg-white text-muted'}`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full font-mono text-[11px] ${cur ? 'bg-paper text-ink' : done ? 'bg-matcha text-white' : 'bg-warm text-body'}`}>{i + 1}</span>
                {s}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-start gap-6">
          <section className="flex min-w-0 flex-[999_1_640px] flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              <figure className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5">
                <figcaption className="flex justify-between text-[13px]">
                  <span className="font-bold">原图 · 预处理</span>
                  <span className="font-mono text-xs text-muted">{img ? `${img.naturalWidth}×${img.naturalHeight}` : ''}</span>
                </figcaption>
                <label className="relative flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-[1.5px] border-dashed border-[#CFCBC3] bg-[repeating-conic-gradient(#F4F1EA_0_25%,#FAF9F6_0_50%)] bg-[length:20px_20px]">
                  {src ? (
                    <canvas ref={previewRef} className="max-h-full max-w-full" aria-label="预处理后的图片" />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-sm text-body">
                      <span className="btn-primary">{t('upload.choose')}</span>
                      <span className="text-xs text-muted">{t('upload.noImage')}</span>
                    </span>
                  )}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
                </label>
              </figure>
              <figure className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5">
                <figcaption className="flex justify-between text-[13px]">
                  <span className="font-bold">串珠预览 · {MODES.find((m) => m.id === mode)!.t}</span>
                  <span className="font-mono text-xs text-muted">
                    {cols} × {rows} · {cells ? countColors(cells).size : 0} 色
                  </span>
                </figcaption>
                <div className="card flex aspect-square items-center justify-center p-4">
                  {cells ? (
                    <PatternThumb pattern={{ width: cols, height: rows, cells }} catalog={catalog} maxSize={360} />
                  ) : (
                    <span className="text-sm text-muted">上传后自动生成预览</span>
                  )}
                </div>
              </figure>
            </div>

            <div className="flex flex-wrap gap-2" aria-label="预处理工具">
              <button type="button" className="btn-ghost" disabled={!img} onClick={() => setPrep((p) => ({ ...p, rotate: (((p.rotate + 90) % 360) as Prep['rotate']) }))}>
                旋转 90°
              </button>
              <button type="button" className="btn-ghost" aria-pressed={prep.squareCrop} disabled={!img} onClick={() => toggle('squareCrop')}>
                {prep.squareCrop ? '✓ ' : ''}正方形裁剪
              </button>
              <button type="button" className="btn-ghost" aria-pressed={prep.removeBg} disabled={!img} onClick={() => toggle('removeBg')}>
                {prep.removeBg ? '✓ ' : ''}背景移除
              </button>
              <button type="button" className="btn-ghost" aria-pressed={prep.autoCenter} disabled={!img} onClick={() => toggle('autoCenter')}>
                {prep.autoCenter ? '✓ ' : ''}主体提取 · 自动居中
              </button>
              <button type="button" className="btn-ghost" disabled={!img} onClick={() => setPrep({ rotate: 0, zoom: 1, brightness: 0, contrast: 0, removeBg: false, autoCenter: false, squareCrop: false })}>
                重置
              </button>
            </div>

            <div className="card grid grid-cols-1 gap-x-7 gap-y-4 p-5 sm:grid-cols-2">
              {(
                [
                  ['缩放裁剪', 'zoom', 1, 3, 0.05, `${prep.zoom.toFixed(2)}×`],
                  ['亮度', 'brightness', -50, 50, 1, `${prep.brightness > 0 ? '+' : ''}${prep.brightness}`],
                  ['对比度', 'contrast', -50, 80, 1, `${prep.contrast > 0 ? '+' : ''}${prep.contrast}`],
                ] as const
              ).map(([label, key, min, max, stepV, shown]) => (
                <label key={key} className="flex flex-col gap-2 text-[13px]">
                  <span className="flex justify-between">
                    <span>{label}</span>
                    <span className="font-mono text-muted">{shown}</span>
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={stepV}
                    value={prep[key]}
                    disabled={!img}
                    onChange={(e) => setPrep((p) => ({ ...p, [key]: Number(e.target.value) }))}
                    className="accent-ink"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-2 text-[13px]">
                <span className="flex justify-between">
                  <span>最大颜色数（色彩简化）</span>
                  <span className="font-mono text-muted">{mode === 'low-color' ? Math.min(4, maxColors) : maxColors}</span>
                </span>
                <input type="range" min={2} max={16} value={maxColors} onChange={(e) => setMaxColors(Number(e.target.value))} className="accent-ink" />
              </label>
            </div>
          </section>

          <aside className="flex w-full flex-col gap-4 lg:w-[400px] lg:shrink-0">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-2 text-[15px] font-bold">{t('upload.mode')}</legend>
              {MODES.map((m) => (
                <label key={m.id} className={`flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-3 ${mode === m.id ? 'border-ink bg-white' : 'border-warm bg-paper'}`}>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{m.t}</span>
                    <span className="text-xs text-muted">{m.d}</span>
                  </span>
                  <input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} className="accent-ink" />
                </label>
              ))}
            </fieldset>

            <div className="card flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[15px] font-bold">{t('upload.settings')}</h2>
                <SampleBadge show={!isCatalogVerified(ACTIVE_CATALOG)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  珠型
                  <select className="field" defaultValue="delica-11-0">
                    <option value="delica-11-0">Delica 11/0</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  作品类型
                  <select className="field" value={itemType} onChange={(e) => setItemType(e.target.value as ItemType)}>
                    {(Object.keys(ITEM_LABEL.zh) as ItemType[]).map((k) => (
                      <option key={k} value={k}>
                        {ITEM_LABEL[lang][k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  列数
                  <input type="number" min={4} max={120} value={cols} onChange={(e) => setCols(Math.max(4, Math.min(120, Number(e.target.value) || 4)))} className="field font-mono" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  行数
                  <input
                    type="number"
                    min={4}
                    max={120}
                    value={rows}
                    disabled={lockRatio}
                    onChange={(e) => setRowsManual(Math.max(4, Math.min(120, Number(e.target.value) || 4)))}
                    className="field font-mono disabled:bg-paper"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={lockRatio} onChange={(e) => setLockRatio(e.target.checked)} className="accent-ink" />
                按原图比例计算行数
              </label>
              <p className="text-xs text-muted">
                成品约 {size.w} × {size.h} cm · 平面方格排列 · CIELAB / ΔE2000 匹配
              </p>
              <div className="flex flex-col gap-2 border-t border-warm-line pt-3">
                {(
                  [
                    ['removeIsolated', '删除孤立像素'],
                    ['symmetry', '对称修正（左右镜像）'],
                    ['smallAreaMerge', '小区域色彩优化'],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} className="accent-ink" />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <button type="button" className="btn-primary py-3.5 text-[15px]" disabled={!cells} onClick={finish}>
              {t('upload.generate')} <span aria-hidden="true">→</span>
            </button>
            <p className="text-xs leading-relaxed text-muted">色号只从色卡数据库中匹配，不会生成数据库以外的色号。</p>
          </aside>
        </div>
      </main>
    </>
  );
}
