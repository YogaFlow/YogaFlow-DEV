import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Tenant } from '../types';

const BASE_DOMAIN = (import.meta.env.VITE_APP_BASE_DOMAIN as string) || 'omlify.de';
const DEV_SLUG_KEY = '__dev_tenant_slug__';

/**
 * Liest den Tenant-Slug aus dem aktuellen Hostname.
 *
 * Produktiv:  <slug>.omlify.de          → slug
 * DEV: ?tenant=<slug>-Override          → slug (wird in sessionStorage gesichert)
 * DEV: kein ?tenant=, aber sessionStorage hat Slug → slug (persistiert über Navigationen)
 * Apex ohne Slug                        → null (Landing Page / Onboarding)
 */
function resolveSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('tenant');

  if (import.meta.env.DEV) {
    if (override) {
      // Expliziter Override → in sessionStorage sichern und verwenden
      sessionStorage.setItem(DEV_SLUG_KEY, override);
      return override;
    }
    // Slug aus sessionStorage wiederherstellen (bleibt nach React-Router-Navigationen erhalten)
    return sessionStorage.getItem(DEV_SLUG_KEY) ?? null;
  }

  const hostname = window.location.hostname;
  if (!BASE_DOMAIN) return null;

  if (hostname === BASE_DOMAIN || hostname === `www.${BASE_DOMAIN}`) return null;

  if (hostname.endsWith(`.${BASE_DOMAIN}`)) {
    const slug = hostname.slice(0, hostname.length - BASE_DOMAIN.length - 1);
    return slug || null;
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
  const base = (import.meta.env.VITE_APP_BASE_DOMAIN as string) || 'omlify.de';
  return `${protocol}//${slug}.${base}/dashboard`;
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
  const base = (import.meta.env.VITE_APP_BASE_DOMAIN as string) || 'omlify.de';
  return `${protocol}//${trimmed}.${base}/auth`;
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
