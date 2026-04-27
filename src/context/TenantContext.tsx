import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Tenant } from '../types';

const DEV_SLUG_KEY = '__dev_tenant_slug__';

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

/**
 * Liest den Tenant-Slug:
 *
 * Zuerst immer aus dem Hostnamen (`<slug>.<APP_BASE_DOMAIN>`), damit echte Subdomains auch in DEV
 * (Tunnel/ngrok) und bei falsch formatierter VITE_APP_BASE_DOMAIN funktionieren.
 * DEV zusätzlich: ?tenant= und sessionStorage.
 * Apex ohne Slug → null (Landing / Onboarding).
 */
function resolveSlug(): string | null {
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

/** Löscht den DEV-Slug aus sessionStorage (beim Abmelden aufrufen). */
export function clearDevTenantSlug() {
  if (import.meta.env.DEV) sessionStorage.removeItem(DEV_SLUG_KEY);
}

/**
 * Link in die Tenant-App (Dashboard).
 * PROD: Subdomain. DEV: /?tenant=… (Slug landet in sessionStorage).
 */
export function buildStudioEntryHref(slug: string): string {
  const safe = encodeURIComponent(slug);
  if (import.meta.env.DEV) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/?tenant=${safe}`;
  }
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  return `${protocol}//${slug}.${APP_BASE_DOMAIN}/dashboard`;
}

/**
 * Anmeldeseite unter dem Tenant (Session liegt pro Origin auf der Subdomain).
 * DEV: /auth?tenant=… setzt den Slug wie resolveSlug().
 */
export function buildStudioAuthHref(slug: string): string {
  const trimmed = slug.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const safe = encodeURIComponent(trimmed);
  if (import.meta.env.DEV) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/auth?tenant=${safe}`;
  }
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'https:';
  return `${protocol}//${trimmed}.${APP_BASE_DOMAIN}/auth`;
}

interface TenantContextType {
  tenant: Tenant | null;
  tenantSlug: string | null;
  loading: boolean;
  /** true wenn Slug aus URL aufgelöst, aber kein Tenant in DB gefunden */
  notFound: boolean;
  /** Supabase-/Netzwerkfehler oder Timeout — nicht mit „nicht gefunden“ verwechseln */
  lookupError: string | null;
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  tenantSlug: null,
  loading: true,
  notFound: false,
  lookupError: null,
});

export const useTenant = () => useContext(TenantContext);

/** Ein Request kann nach Projekt-Pause / kaltem Edge sehr lange brauchen; 12s war in der Praxis zu knapp. */
const TENANT_REQUEST_MS = 55_000;

type TenantRowResult = { data: Tenant | null; error: Error | null };

function raceTenantQuery(
  slug: string,
  ms: number,
): Promise<TenantRowResult | 'timeout'> {
  const query = supabase.from('tenants').select('*').eq('slug', slug).maybeSingle();
  const timeout = new Promise<'timeout'>((resolve) => {
    window.setTimeout(() => resolve('timeout'), ms);
  });
  return Promise.race([
    query.then(({ data, error }) => ({
      data: data as Tenant | null,
      error: error ? new Error(error.message) : null,
    })),
    timeout,
  ]);
}

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const tenantSlug = resolveSlug();
  /** Apex / ohne Slug: sofort fertig — nicht auf den ersten useEffect warten (sonst Dauer-Spinner). */
  const [loading, setLoading] = useState(() => tenantSlug !== null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!tenantSlug) {
      setTenant(null);
      setNotFound(false);
      setLookupError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    setLookupError(null);

    let cancelled = false;

    const applyResult = (res: TenantRowResult) => {
      if (cancelled) return;
      if (res.error) {
        console.error('TenantContext: fetch error', res.error);
        setTenant(null);
        setNotFound(false);
        setLookupError(
          res.error.message ||
            'Tenant konnte nicht geladen werden. Prüfe in Cloudflare, ob VITE_SUPABASE_URL und der Anon-Key zum gleichen Projekt wie in der Supabase-Konsole gehören.',
        );
        return;
      }
      if (res.data) {
        setTenant(res.data);
        setLookupError(null);
        setNotFound(false);
      } else {
        setTenant(null);
        setNotFound(true);
        setLookupError(null);
      }
    };

    void (async () => {
      try {
        let outcome = await raceTenantQuery(tenantSlug, TENANT_REQUEST_MS);
        if (cancelled) return;
        if (outcome === 'timeout') {
          console.warn('TenantContext: erste Anfrage Timeout — einmaliger Retry');
          outcome = await raceTenantQuery(tenantSlug, TENANT_REQUEST_MS);
        }
        if (cancelled) return;
        if (outcome === 'timeout') {
          setTenant(null);
          setNotFound(false);
          setLookupError(
            'Die Datenbank-Anfrage hat zu lange gedauert (auch nach Wiederholung). ' +
              'Im Supabase-Dashboard prüfen, ob das PROD-Projekt pausiert ist; in den Browser-Entwicklertools (Netzwerk) den Aufruf zu …supabase.co/rest/v1/tenants prüfen. ' +
              'Nach Änderung von VITE_* in Cloudflare einen neuen Pages-Build auslösen.',
          );
          return;
        }
        applyResult(outcome);
      } catch (e) {
        if (cancelled) return;
        console.error('TenantContext: unerwarteter Fehler', e);
        setTenant(null);
        setNotFound(false);
        setLookupError(
          e instanceof Error ? e.message : 'Unerwarteter Fehler beim Laden des Studios.',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  return (
    <TenantContext.Provider value={{ tenant, tenantSlug, loading, notFound, lookupError }}>
      {children}
    </TenantContext.Provider>
  );
};
