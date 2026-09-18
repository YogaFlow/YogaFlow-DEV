export const APP_BASE_DOMAIN = 'omlify.de';

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
