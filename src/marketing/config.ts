/**
 * Spiegel von `normalizeAppBaseDomain` in src/lib/tenantSlug.ts.
 * Bewusst lokal: Marketing importiert nichts aus der App.
 */
function normalizeAppBaseDomain(raw: string | undefined): string {
  const fallback = 'omlify.de';
  if (raw == null || !String(raw).trim()) return fallback;
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.split('/')[0].split('?')[0];
  s = s.split(':')[0];
  s = s.replace(/\.$/, '');
  if (s.startsWith('www.')) s = s.slice(4);
  return s || fallback;
}

export const APP_BASE_DOMAIN = normalizeAppBaseDomain(
  import.meta.env.VITE_APP_BASE_DOMAIN as string | undefined,
);

const SLUG_PATTERN = /^[a-z0-9]{3,30}$/;

/** Aus Freitext (inkl. URL) den Studio-Slug für die Anmeldung ermitteln. */
export function parseStudioSlugInput(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  const escapedBase = APP_BASE_DOMAIN.replace(/\./g, '\\.');
  s = s.replace(new RegExp(`\\.${escapedBase}(/.*)?$`), '');
  s = s.replace(/[^a-z0-9]/g, '');
  return s.slice(0, 30);
}

export function isValidStudioSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

export function studioAuthUrl(slug: string): string {
  return `https://${slug}.${APP_BASE_DOMAIN}/auth`;
}
