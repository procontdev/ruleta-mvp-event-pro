import { API_BASE } from './api';

export type Brand = {
  name?: string;
  logo?: string;
  colors?: {
    bg?: string;
    card?: string;
    text?: string;
    primary?: string;
    accent?: string;
    border?: string;
    inputBg?: string;
    inputText?: string;
    buttonText?: string;
  };
  wheel?: string[];
  font?: { family?: string; href?: string };
};


const DEFAULTS: Required<Brand> = {
  name: 'default',
  logo: '/brand/logo.svg',
  colors: {
    bg: '#0f172a',
    card: '#111827',
    text: '#e2e8f0',
    primary: '#06b6d4',
    accent: '#22d3ee',
    border: '#334155',
    inputBg: '#ffffff',
    inputText: '#0f172a',
    buttonText: '#0b1220'
  },
  wheel: ['#f59e0b','#10b981','#ef4444','#3b82f6','#a855f7','#f97316','#22d3ee','#84cc16'],
  font: { family: 'Inter', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap' }
};

function applyCSSVars(b: Brand) {
  const r = document.documentElement;
  const c = { ...DEFAULTS.colors, ...(b.colors || {}) };
  r.style.setProperty('--bg', c.bg!);
  r.style.setProperty('--card', c.card!);
  r.style.setProperty('--text', c.text!);
  r.style.setProperty('--primary', c.primary!);
  r.style.setProperty('--accent', c.accent!);
  r.style.setProperty('--border', c.border!);
  r.style.setProperty('--input-bg', c.inputBg!);
  r.style.setProperty('--input-text', c.inputText!);
  r.style.setProperty('--button-text', c.buttonText!);
}

function ensureFont(b: Brand) {
  const href = b.font?.href || DEFAULTS.font.href;
  if (href && !document.getElementById('brand-font-link')) {
    const link = document.createElement('link');
    link.id = 'brand-font-link';
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  const family = b.font?.family || DEFAULTS.font.family;
  if (family) document.documentElement.style.setProperty('--font-family', family);
}

export function wheelColorsOf(b: Brand): string[] {
  return b.wheel && b.wheel.length ? b.wheel! : DEFAULTS.wheel;
}

export async function loadBrand(eventId: number): Promise<Brand> {
  try {
    const res = await fetch('/brand/default.json', { cache: 'no-store' });
    if (res.ok) {
      const fileBrand = (await res.json()) as Brand;
      applyCSSVars(fileBrand);
      ensureFont(fileBrand);
      return fileBrand;
    }
  } catch {}
  applyCSSVars(DEFAULTS);
  ensureFont(DEFAULTS);
  return DEFAULTS;
}
