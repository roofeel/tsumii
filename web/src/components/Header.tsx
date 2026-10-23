'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';
import { useApp, useT } from '@/store';
import type { Lang } from '@/lib/types';

const LANGS: { id: Lang; label: string }[] = [
  { id: 'zh', label: '中' },
  { id: 'en', label: 'EN' },
  { id: 'ja', label: '日' },
];

export function LangSwitch() {
  const lang = useApp((s) => s.lang);
  const setLang = useApp((s) => s.setLang);
  return (
    <div className="flex rounded-full border border-warm bg-white p-[3px]" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button
          key={l.id}
          type="button"
          aria-pressed={lang === l.id}
          onClick={() => setLang(l.id)}
          className={`rounded-full px-3 py-1.5 text-[13px] ${lang === l.id ? 'bg-ink text-paper' : 'text-body hover:bg-warm'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const { t } = useT();
  const links = [
    { href: '/', label: t('nav.home'), active: pathname === '/' },
    { href: '/create', label: t('nav.create'), active: pathname.startsWith('/create') },
    { href: '/upload', label: t('nav.upload'), active: pathname.startsWith('/upload') },
    { href: '/#projects', label: t('nav.projects'), active: pathname.startsWith('/editor') || pathname.startsWith('/shopping') },
  ];
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-warm bg-paper px-4 py-3 sm:px-10 print:hidden">
      <Logo />
      <nav aria-label="Main" className="order-3 flex w-full flex-wrap gap-1 sm:order-none sm:w-auto">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={l.active ? 'page' : undefined}
            className={`rounded-lg px-3.5 py-2 text-sm no-underline ${l.active ? 'bg-warm text-ink' : 'text-body hover:bg-warm/60'}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <LangSwitch />
    </header>
  );
}
