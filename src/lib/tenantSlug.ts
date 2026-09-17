export const DEV_SLUG_KEY = '__dev_tenant_slug__';
const SLUG_RE = /^[a-z0-9]{3,30}$/;

/**
 * Env-Wert wie `https://omlify.de/` oder `www.omlify.de` → Hostname für Subdomain-Vergleiche (`omlify.de`).
 */
export function normalizeAppBaseDomain(raw: string | undefined): string {
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

/** Slug aus Host <slug>.<baseDomain>, Apex / www → null. */
export function slugFromHostname(hostname: string, baseDomain: string): string | null {
  const h = hostname.toLowerCase();
  const b = baseDomain.toLowerCase();
  if (!b) return null;
  if (h === b || h === `www.${b}`) return null;
  if (!h.endsWith(`.${b}`)) return null;
  const slug = h.slice(0, h.length - b.length - 1);
  if (!slug || slug.includes('.')) return null;
  return slug;
}

function asValidSlug(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim().toLowerCase();
  return SLUG_RE.test(normalized) ? normalized : null;
}

/**
 * Liest den Tenant-Slug:
 *
 * Zuerst immer aus dem Hostnamen (`<slug>.<APP_BASE_DOMAIN>`), damit echte Subdomains auch in DEV
 * (Tunnel/ngrok) und bei falsch formatierter VITE_APP_BASE_DOMAIN funktionieren.
 * DEV zusätzlich: ?tenant= und sessionStorage.
 * Apex ohne Slug → null (Landing / Onboarding).
 */
export function resolveSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('tenant');
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  const fromHost = slugFromHostname(hostname, APP_BASE_DOMAIN);
  if (fromHost) {
    if (import.meta.env.DEV) sessionStorage.setItem(DEV_SLUG_KEY, fromHost);
    return fromHost;
  }

  if (import.meta.env.DEV) {
    if (override) {
      sessionStorage.setItem(DEV_SLUG_KEY, override);
      return override;
    }
    return sessionStorage.getItem(DEV_SLUG_KEY) ?? null;
  }

  return null;
}

/**
 * Wie resolveSlug (Hostname zuerst; in DEV ?tenant= und sessionStorage),
 * ohne sessionStorage zu schreiben.
 * Nur Slugs, die nach trim/lower /^[a-z0-9]{3,30}$/ erfüllen.
 */
export function currentTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;

  const fromHost = asValidSlug(slugFromHostname(window.location.hostname, APP_BASE_DOMAIN));
  if (fromHost) return fromHost;

  if (import.meta.env.DEV) {
    const override = asValidSlug(new URLSearchParams(window.location.search).get('tenant'));
    if (override) return override;
    return asValidSlug(sessionStorage.getItem(DEV_SLUG_KEY));
  }

  return null;
}
