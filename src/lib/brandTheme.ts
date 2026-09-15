import {
  deriveBrandTokens,
  isBrandColorAllowed,
  normalizeHex,
  type BrandTokens,
} from '../design/brand';

const TOKEN_TO_CSS_VAR: { [K in keyof BrandTokens]: string } = {
  brand: '--color-brand',
  brandPressed: '--color-brand-pressed',
  brandSoft: '--color-brand-soft',
  brandOnSoft: '--color-brand-on-soft',
  onBrand: '--color-on-brand',
};

function cacheKey(slug: string): string {
  return `omlify:brand:${slug}`;
}

export function brandTokensToCssVars(tokens: BrandTokens): Record<string, string> {
  const vars: Record<string, string> = {};
  (Object.keys(TOKEN_TO_CSS_VAR) as (keyof BrandTokens)[]).forEach((key) => {
    vars[TOKEN_TO_CSS_VAR[key]] = tokens[key];
  });
  return vars;
}

export function applyBrandColor(hex: string | null | undefined): void {
  const root = document.documentElement.style;
  const normalized = typeof hex === 'string' ? normalizeHex(hex) : null;
  if (normalized && isBrandColorAllowed(normalized)) {
    const derived = deriveBrandTokens(normalized);
    Object.entries(brandTokensToCssVars(derived)).forEach(([name, value]) => {
      root.setProperty(name, value);
    });
    return;
  }
  (Object.keys(TOKEN_TO_CSS_VAR) as (keyof BrandTokens)[]).forEach((key) => {
    root.removeProperty(TOKEN_TO_CSS_VAR[key]);
  });
}

export function readCachedBrandColor(slug: string): string | null {
  try {
    const raw = localStorage.getItem(cacheKey(slug));
    if (!raw) return null;
    const normalized = normalizeHex(raw);
    if (!normalized || !isBrandColorAllowed(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

export function writeCachedBrandColor(slug: string, hex: string | null): void {
  try {
    if (hex == null) {
      localStorage.removeItem(cacheKey(slug));
      return;
    }
    localStorage.setItem(cacheKey(slug), hex);
  } catch {
    // Safari private mode: localStorage may throw.
  }
}
