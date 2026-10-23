import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF9F6',
        ink: '#222222',
        sakura: { DEFAULT: '#F3DCE1', deep: '#6E3445' },
        matcha: { DEFAULT: '#789477', deep: '#4F6B4E', soft: '#E3EBDF', dark: '#3E5A3D' },
        warm: { DEFAULT: '#ECEAE6', line: '#F1EFEB', border: '#DAD6CF' },
        muted: '#6B6862',
        body: '#4A4843',
        ivory: '#F4F1EA',
        amber: { soft: '#FBEBD5', deep: '#7A4A0E' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Noto Sans SC', 'Hiragino Sans', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Noto Serif SC', 'serif'],
        display: ['var(--font-display)', 'Instrument Serif', 'serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: { xl2: '18px' },
    },
  },
  plugins: [],
};
export default config;
