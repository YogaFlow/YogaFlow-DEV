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
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  tenantSlug: null,
  loading: true,
  notFound: false
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const tenantSlug = resolveSlug();

  useEffect(() => {
    if (!tenantSlug) {
      setLoading(false);
      return;
    }

    supabase
      .from('tenants')
      .select('*')
      .eq('slug', tenantSlug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('TenantContext: fetch error', error);
        if (data) {
          setTenant(data);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      });
  }, [tenantSlug]);

  return (
    <TenantContext.Provider value={{ tenant, tenantSlug, loading, notFound }}>
      {children}
    </TenantContext.Provider>
  );
};
