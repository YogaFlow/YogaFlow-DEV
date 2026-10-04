/**
 * UX-4 D2: Kontrast Titel/Icons auf Kopfleiste mit Markenstich (~8 %).
 * Eigenständige Hilfen (ohne brand.ts-Importkette — Node-Unit-Tests).
 */

const SURFACE = '#FFFFFF';
const TEXT = '#1F1B16';

function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{3}$/.test(raw)) {
    return `#${raw.split('').map((ch) => `${ch}${ch}`).join('').toUpperCase()}`;
  }
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return null;
}

function relativeLuminance(hex: string): number {
  const n = normalizeHex(hex);
  if (!n) return 0;
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Approximiert color-mix(in srgb, brand 8%, surface). */
export function headerTintBackground(
  brandHex: string,
  baseHex: string = SURFACE,
  tintPercent = 8,
): string {
  const brand = normalizeHex(brandHex) ?? '#2F5A4E';
  const base = normalizeHex(baseHex) ?? SURFACE;
  const t = Math.min(100, Math.max(0, tintPercent)) / 100;
  const mix = (i: number) => {
    const a = parseInt(brand.slice(i, i + 2), 16);
    const b = parseInt(base.slice(i, i + 2), 16);
    return Math.round(a * t + b * (1 - t))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

export function headerTextContrastRatio(
  brandHex: string,
  textHex: string = TEXT,
): number {
  return contrastRatio(headerTintBackground(brandHex), textHex);
}

export function headerMeetsContrast(
  brandHex: string,
  textHex: string = TEXT,
  min = 4.5,
): boolean {
  return headerTextContrastRatio(brandHex, textHex) >= min;
}
