import type { BeadColor, DesignIdea } from '@/lib/types';
import { renderMotif } from '@/lib/pattern/motifs';

/**
 * AI 效果图占位：在接入图像生成模型前，用方案的配色与 motif 画出项链示意。
 * 接入后，若 idea.previewImage 存在则直接显示生成图。
 */
export function NecklacePreview({ idea, catalog, height = 260 }: { idea: DesignIdea; catalog: Map<string, BeadColor>; height?: number }) {
  if (idea.previewImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={idea.previewImage} alt={idea.name} className="h-full w-full object-cover" style={{ height }} />;
  }
  const n = idea.itemType === 'bracelet' ? 44 : 38;
  const beads = Array.from({ length: n }, (_, i) => {
    const isLoop = idea.itemType === 'bracelet';
    const t = isLoop ? (2 * Math.PI * i) / n : Math.PI * (0.05 + (0.9 * i) / (n - 1));
    const x = isLoop ? 50 + 30 * Math.cos(t) : 50 + 38 * Math.cos(t);
    const y = isLoop ? 46 + 30 * Math.sin(t) : 6 + 62 * Math.sin(t);
    return { x, y, c: idea.strandSequence[i % idea.strandSequence.length] };
  });
  const pend = renderMotif(idea.motif, idea.palette, { width: 9, height: 11 });
  const hex = (id: string) => catalog.get(id)?.hex ?? '#ccc';
  const bg = hex(idea.palette[0]);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ height, width: '100%' }} role="img" aria-label={`${idea.name} preview`}>
      <rect width="100" height="100" fill="#ECE7DD" />
      {beads.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y} r={2.1} fill={b.c} stroke="rgba(34,34,34,0.22)" strokeWidth={0.25} />
          <circle cx={b.x - 0.5} cy={b.y - 0.6} r={0.6} fill="rgba(255,255,255,0.5)" />
        </g>
      ))}
      {idea.itemType !== 'bracelet' && (
        <g transform="translate(40.5 70)">
          {pend.map((id, i) => {
            const x = (i % 9) * 2.1;
            const y = Math.floor(i / 9) * 2.1;
            if (id === idea.palette[0] && bg) return null;
            return <rect key={i} x={x} y={y} width={1.9} height={1.9} rx={0.4} fill={hex(id)} stroke="rgba(34,34,34,0.18)" strokeWidth={0.15} />;
          })}
        </g>
      )}
    </svg>
  );
}
