import Link from 'next/link';

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <circle cx="8" cy="15" r="5.5" fill="#789477" />
      <circle cx="8" cy="15" r="1.6" fill="#FAF9F6" />
      <circle cx="20" cy="15" r="5.5" fill="#F3DCE1" stroke="#222222" strokeWidth="1" />
      <circle cx="20" cy="15" r="1.6" fill="#222222" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 text-ink no-underline" aria-label="Tsumii 首页">
      <LogoMark size={compact ? 26 : 30} />
      <span className="font-display text-[26px] italic leading-none">Tsumii</span>
      {!compact && <span className="hidden border-l border-warm pl-2 text-xs text-muted sm:inline">つみー · 串米</span>}
    </Link>
  );
}
