'use client';

import { useEffect, useState } from 'react';
import type { BeadColor, Strand } from '@/lib/types';
import { MAX_STRAND_LENGTH_CM, MIN_STRAND_LENGTH_CM, strandRepeats } from '@/lib/pattern/strand';

/** 项链串链编辑：点击珠子改为当前色，增删循环单元的珠子，调整串链长度 */
export function StrandEditor({
  strand,
  catalog,
  active,
  codeIndex,
  onChange,
}: {
  strand: Strand;
  catalog: Map<string, BeadColor>;
  /** 当前画笔色号 */
  active: string;
  codeIndex: Map<string, number>;
  onChange: (next: Strand) => void;
}) {
  const [length, setLength] = useState(String(strand.lengthCm));
  useEffect(() => setLength(String(strand.lengthCm)), [strand.lengthCm]);
  const { total, repeats, remainder } = strandRepeats(strand);

  const commitLength = () => {
    const v = Math.round(Number(length));
    if (!Number.isFinite(v) || v === strand.lengthCm) return setLength(String(strand.lengthCm));
    onChange({ ...strand, lengthCm: Math.max(MIN_STRAND_LENGTH_CM, Math.min(MAX_STRAND_LENGTH_CM, v)) });
  };

  return (
    <section aria-label="串链" className="flex flex-col gap-2.5 border-t border-[#E3DFD7] bg-white px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-[13px] font-bold">串链</span>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          长度
          <input
            type="number"
            min={MIN_STRAND_LENGTH_CM}
            max={MAX_STRAND_LENGTH_CM}
            value={length}
            onChange={(e) => setLength(e.target.value)}
            onBlur={commitLength}
            onKeyDown={(e) => e.key === 'Enter' && commitLength()}
            className="w-16 rounded-md border border-warm-border bg-white px-1.5 py-0.5 text-right font-mono text-ink"
          />
          cm
        </label>
        <span className="font-mono text-xs text-body">
          约 {total} 颗 · 循环单元 {strand.sequence.length} 颗 × {repeats}
          {remainder ? ` + 前 ${remainder} 颗` : ''}
        </span>
        <span className="text-[11px] text-muted">点击珠子改为当前色号；串链不含吊坠与扣件</span>
      </div>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="串链循环单元">
        {strand.sequence.map((cid, i) => {
          const c = catalog.get(cid);
          return (
            <li key={i}>
              <button
                type="button"
                title={`${i + 1} · ${c?.code ?? cid}`}
                aria-label={`第 ${i + 1} 颗 ${c?.code ?? cid}，改为当前色号`}
                onClick={() => cid !== active && onChange({ ...strand, sequence: Object.assign(strand.sequence.slice(), { [i]: active }) })}
                className="flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10px] hover:ring-2 hover:ring-ink/40"
                style={{ background: c?.hex ?? '#ccc', boxShadow: 'inset 0 0 0 1px rgba(34,34,34,0.18)' }}
              >
                <span className="rounded bg-white/70 px-0.5 leading-none">{codeIndex.get(cid) ?? ''}</span>
              </button>
            </li>
          );
        })}
        <li className="ml-1 flex gap-1">
          <button type="button" aria-label="在末尾添加一颗当前色号" onClick={() => onChange({ ...strand, sequence: [...strand.sequence, active] })} className="btn-ghost h-7 w-7 !p-0">
            +
          </button>
          <button
            type="button"
            aria-label="删除最后一颗"
            disabled={strand.sequence.length <= 1}
            onClick={() => onChange({ ...strand, sequence: strand.sequence.slice(0, -1) })}
            className="btn-ghost h-7 w-7 !p-0"
          >
            −
          </button>
        </li>
      </ol>
    </section>
  );
}
