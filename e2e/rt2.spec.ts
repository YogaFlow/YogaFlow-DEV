/**
 * RT-2 — Owner mit alter/fehlender AGB sieht Banner → stimmt zu → Banner weg.
 * Studio e2eapp (append-only).
 */
import { expect, test, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertDevEnv,
  AVV_TEST_HASH,
  AVV_TEST_VERSION,
  clientMitTenant,
  ladeEnv,
  login,
  nutzerAnlegen,
  resteEntfernen,
  seedPasswort,
  // @ts-expect-error — .mjs
} from '../scripts/test/_helpers.mjs';
// @ts-expect-error — .mjs
import { assertDevGuard, ERLAUBTE_DEV_REF } from '../scripts/dev/dev_guard.mjs';
import { TERMS_CONTENT_HASH, TERMS_VERSION } from '../src/lib/legalVersions';

const SLUG = 'e2eapp';
const EMAIL_PREFIX = 'e2eapprt2';

async function alsAngemeldet(page: Page, session: unknown) {
  const storageKey = `sb-${ERLAUBTE_DEV_REF}-auth-token`;
  await page.addInitScript(
    ([key, value, slug]) => {
      window.localStorage.setItem(key, value);
      window.sessionStorage.setItem('__dev_tenant_slug__', slug);
    },
    [storageKey, JSON.stringify(session), SLUG] as const,
  );
}

test('RT-2 — Vertragsbanner AGB + AVV, Zustimmung, Banner weg', async ({ page, baseURL }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const laufId = `rt2${Date.now().toString(36)}`;
  const origin = (baseURL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E RT2', slug: SLUG })
      .select('id')
      .single();
    if (te) throw new Error(te.message);

    const owner = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.owner@example.com`,
      vorname: 'Owner',
      nachname: laufId,
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });

    // Nur alte AVV-Version simulieren: AVV aktuell akzeptieren, AGB nicht → Banner zeigt AGB
    // Für gemeinsamen Banner beide offen lassen.
    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const { data: sessionData } = await asOwner.auth.getSession();

    await alsAngemeldet(page, sessionData.session);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${origin}/dashboard?tenant=${SLUG}`);

    const banner = page.getByTestId('contract-update-banner');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText('Aktualisierte Vertragsunterlagen');
    await expect(banner).toContainText('AGB');
    await expect(banner).toContainText('AVV');

    await page.getByTestId('contract-check-terms').check();
    await page.getByTestId('contract-check-avv').check();
    await page.getByTestId('contract-accept').click();

    await expect(banner).toHaveCount(0, { timeout: 15_000 });

    const { data: rows, error } = await admin
      .from('legal_acceptances')
      .select('document, version, content_hash')
      .eq('tenant_id', tenant.id)
      .in('document', ['terms', 'avv']);
    if (error) throw new Error(error.message);
    const docs = new Set((rows ?? []).map((r) => r.document));
    expect(docs.has('terms')).toBe(true);
    expect(docs.has('avv')).toBe(true);
    const termsRow = (rows ?? []).find((r) => r.document === 'terms');
    expect(termsRow?.version).toBe(TERMS_VERSION);
    expect(termsRow?.content_hash).toBe(TERMS_CONTENT_HASH);
    const avvRow = (rows ?? []).find((r) => r.document === 'avv');
    expect(avvRow?.version).toBe(AVV_TEST_VERSION);
    expect(avvRow?.content_hash).toBe(AVV_TEST_HASH);
  } finally {
    try {
      await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    } catch (e) {
      console.warn('Aufräumen:', e);
    }
  }
});
