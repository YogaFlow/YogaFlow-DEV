import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Tenant } from '../types';
import {
  APP_BASE_DOMAIN,
  DEV_SLUG_KEY,
  normalizeAppBaseDomain,
  resolveSlug,
  slugFromHostname,
} from '../lib/tenantSlug';

export { APP_BASE_DOMAIN, normalizeAppBaseDomain, slugFromHostname };

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

/**
 * Link auf die Apex-Seite (Landing / Onboarding), von überall aus.
 *
 * Leitet Protokoll und Port aus der aktuellen Adresse ab, statt `https://` fest zu verdrahten:
 * auf `yomita.localhost:5173` ergibt das `http://localhost:5173` statt des nicht existierenden
 * `https://localhost`. In PROD unverändert `https://omlify.de`.
 */
export function buildApexHref(): string {
  if (typeof window === 'undefined') return `https://${APP_BASE_DOMAIN}`;
  const { protocol, hostname, port } = window.location;
  const host = slugFromHostname(hostname, APP_BASE_DOMAIN) ? APP_BASE_DOMAIN : hostname;
  return `${protocol}//${host}${port ? `:${port}` : ''}`;
}

/** Aktueller DEV-Tenant-Slug (URL ?tenant= oder sessionStorage). */
export function getDevTenantSlug(): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  const fromUrl = new URLSearchParams(window.location.search).get('tenant')?.trim().toLowerCase() ?? '';
  if (fromUrl && /^[a-z0-9]{3,30}$/.test(fromUrl)) return fromUrl;
  const fromStore = sessionStorage.getItem(DEV_SLUG_KEY)?.trim().toLowerCase() ?? '';
  return fromStore && /^[a-z0-9]{3,30}$/.test(fromStore) ? fromStore : null;
}

/**
 * Hängt in DEV `?tenant=` an interne Pfade, damit Redirects (z. B. /auth, /dashboard)
 * den Studio-Kontext behalten, wenn sessionStorage nach signOut geleert wurde.
 */
export function withDevTenant(path: string, extraParams?: Record<string, string>): string {
  if (!import.meta.env.DEV) return path;
  const slug = getDevTenantSlug();
  if (!slug) return path;
  const [pathname, existingSearch = ''] = path.split('?');
  const params = new URLSearchParams(existingSearch);
  params.set('tenant', slug);
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      params.set(key, value);
    }
  }
  return `${pathname}?${params.toString()}`;
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

function isAbortError(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

/** Lädt Tenant mit Deadline; bricht den REST-Call bei Timeout ab (kein „Zombie“-Request). */
async function fetchTenantWithDeadline(slug: string, ms: number): Promise<TenantRowResult | 'timeout'> {
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), ms);
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .abortSignal(ac.signal)
      .maybeSingle();
    window.clearTimeout(timer);
    return {
      data: data as Tenant | null,
      error: error ? new Error(error.message) : null,
    };
  } catch (e) {
    window.clearTimeout(timer);
    if (ac.signal.aborted && isAbortError(e)) return 'timeout';
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const tenantSlug = resolveSlug();

  /** Häufiger Konfigurationsfehler: Basis-ENV = komplette Studio-URL → Slug bleibt immer null. */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window.location.hostname.toLowerCase();
    const base = APP_BASE_DOMAIN.toLowerCase();
    if (host === base && base.split('.').filter(Boolean).length >= 3) {
      console.warn(
        '[Omlify] VITE_APP_BASE_DOMAIN ist gleich dem aktuellen Hostnamen (z. B. eine Studio-Subdomain). ' +
          'In Cloudflare muss die Variable nur die gemeinsame Apex-Domain sein (z. B. omlify.de), nicht studionr1.omlify.de.',
      );
    }
  }, []);
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
        let outcome = await fetchTenantWithDeadline(tenantSlug, TENANT_REQUEST_MS);
        if (cancelled) return;
        if (outcome === 'timeout') {
          console.warn('TenantContext: erste Anfrage Timeout — einmaliger Retry');
          outcome = await fetchTenantWithDeadline(tenantSlug, TENANT_REQUEST_MS);
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
