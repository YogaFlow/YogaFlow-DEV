/**
 * Leitet die fünf Brand-Tokens aus einer Studiofarbe ab.
 * Die Datei bleibt plattformneutral (kein DOM, kein React), damit dieselbe Ableitung später in Expo gilt.
 * Text auf brandSoft nur über brandOnSoft — nie über brand.
 */

import { tokens } from './tokens';

export type BrandTokens = {
  brand: string;
  brandPressed: string;
  brandSoft: string;
  brandOnSoft: string;
  onBrand: string;
};

export const BRAND_MIN_CONTRAST = 4.5;

export const BRAND_PRESETS: ReadonlyArray<{ id: string; label: string; hex: string }> = [
  { id: 'sage', label: 'Salbei', hex: '#2F5A4E' },
  { id: 'olive', label: 'Olive', hex: '#5A6B2E' },
  { id: 'petrol', label: 'Petrol', hex: '#1F5F6B' },
  { id: 'night', label: 'Nachtblau', hex: '#2C4A7A' },
  { id: 'lavender', label: 'Lavendel', hex: '#5B4B8A' },
  { id: 'plum', label: 'Pflaume', hex: '#6E3B5E' },
  { id: 'berry', label: 'Beere', hex: '#A23B62' },
  { id: 'earth', label: 'Erde', hex: '#6A4E3B' },
  { id: 'slate', label: 'Schiefer', hex: '#3D4852' },
];

export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{3}$/.test(raw)) {
    return `#${raw.split('').map((ch) => `${ch}${ch}`).join('').toUpperCase()}`;
  }
  if (/^[0-9A-Fa-f]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return null;
}

function parseRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

function formatHex(r: number, g: number, b: number): string {
  const byte = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseRgb(hex);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isBrandColorAllowed(hex: string): boolean {
  const normalized = normalizeHex(hex);
  if (!normalized) return false;
  return (
    contrastRatio(normalized, tokens.colors.surface) >= BRAND_MIN_CONTRAST &&
    contrastRatio(normalized, tokens.colors.bg) >= BRAND_MIN_CONTRAST
  );
}

export function mixHex(a: string, b: string, weightOfB: number): string {
  const [ar, ag, ab] = parseRgb(a);
  const [br, bg, bb] = parseRgb(b);
  const mix = (ca: number, cb: number) => Math.round(ca * (1 - weightOfB) + cb * weightOfB);
  return formatHex(mix(ar, br), mix(ag, bg), mix(ab, bb));
}

export function deriveBrandTokens(hex: string): BrandTokens {
  const brand = normalizeHex(hex);
  if (!brand || !isBrandColorAllowed(brand)) {
    throw new Error('Brand color is invalid or not allowed');
  }

  if (brand === normalizeHex(tokens.colors.brand)) {
    return {
      brand: tokens.colors.brand,
      brandPressed: tokens.colors.brandPressed,
      brandSoft: tokens.colors.brandSoft,
      brandOnSoft: tokens.colors.brandOnSoft,
      onBrand: tokens.colors.onBrand,
    };
  }

  const brandPressed = mixHex(brand, '#000000', 0.25);
  const brandSoft = mixHex('#FFFFFF', brand, 0.13);
  let brandOnSoft = brandPressed;
  for (let i = 0; i < 30 && contrastRatio(brandOnSoft, brandSoft) < BRAND_MIN_CONTRAST; i += 1) {
    brandOnSoft = mixHex(brandOnSoft, '#000000', 0.1);
  }

  return {
    brand,
    brandPressed,
    brandSoft,
    brandOnSoft,
    onBrand: tokens.colors.onBrand,
  };
}
