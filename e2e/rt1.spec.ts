/**
 * RT-1 — Studio-Rechtstexte (DEV, Studio e2eapp).
 * Fuß öffentlich ohne Login; Owner-Freigabe wenn Fixtures greifen.
 */
import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertDevEnv,
  clientMitTenant,
  ladeEnv,
  legalProfileSetzen,
  login,
  nutzerAnlegen,
  resteEntfernen,
  seedPasswort,
  // @ts-expect-error — .mjs
} from '../scripts/test/_helpers.mjs';
// @ts-expect-error — .mjs
import { assertDevGuard, ERLAUBTE_DEV_REF } from '../scripts/dev/dev_guard.mjs';

const SLUG = 'e2eapp';
const EMAIL_PREFIX = 'e2eapprt1';

function hashLegal(text: string) {
  const norm = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '')
    .concat('\n');
  return createHash('sha256').update(norm, 'utf8').digest('hex');
}

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

test('RT-1 — Fuß öffentlich, Owner Freigabe', async ({ page, baseURL }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const laufId = `rt1${Date.now().toString(36)}`;

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E RT1', slug: SLUG })
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

    // (1) Öffentlicher Fuß ohne Login
    const origin = (baseURL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
    await page.goto(`${origin}/login?tenant=${SLUG}`);
    const footer = page.getByTestId('studio-footer');
    await expect(footer).toBeVisible({ timeout: 20_000 });
    await expect(footer.getByRole('link', { name: 'Impressum' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Datenschutz' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'AGB' })).toBeVisible();

    await footer.getByRole('link', { name: 'Impressum' }).click();
    await expect(page).toHaveURL(/\/impressum/);

    // (2) Owner: Impressum setzen + AGB/Datenschutz freigeben (RPC + UI-Status)
    const asOwner = await login(url, anon, owner.email, password, SLUG);
    await legalProfileSetzen(asOwner, {
      p_legal_name: 'E2E RT1 Yoga',
      p_legal_form: 'sole_trader',
      p_contact_email: owner.email,
    });

    const imprintBody =
      '# Impressum\n\nE2E RT1 Yoga\nEinzelunternehmen\nTestweg 1\n10115 Berlin\n';
    const pubImp = await asOwner.rpc('publish_studio_legal_document', {
      p_kind: 'imprint',
      p_template_version: '2026-10-05',
      p_body_md: imprintBody,
      p_values: {},
      p_content_hash: hashLegal(imprintBody),
      p_trigger: 'profile_change',
    });
    if (pubImp.error || !pubImp.data?.success) {
      throw new Error(JSON.stringify(pubImp));
    }

    for (const kind of ['terms', 'privacy'] as const) {
      const body = `# ${kind === 'terms' ? 'AGB' : 'Datenschutz'} E2E\n\nStand: Test.\n`;
      const rel = await asOwner.rpc('release_studio_legal', {
        p_kind: kind,
        p_template_version: '2026-10-05',
        p_body_md: body,
        p_values: {},
        p_content_hash: hashLegal(body),
      });
      if (rel.error || !rel.data?.success) throw new Error(JSON.stringify(rel));
    }

    const status = await asOwner.rpc('get_studio_legal_status');
    expect(status.data?.texts_ready).toBe(true);

    const { data: sessionData } = await asOwner.auth.getSession();
    await alsAngemeldet(page, sessionData.session);
    await page.goto(`${origin}/settings/rechtliches?tenant=${SLUG}`);
    await expect(page.getByTestId('studio-legal-texts')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Aktuell/)).toBeVisible();

    // Öffentliche AGB-Seite mit Inhalt
    await page.goto(`${origin}/agb?tenant=${SLUG}`);
    await expect(page.getByText(/AGB E2E|Stand/)).toBeVisible({ timeout: 15_000 });
  } finally {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX).catch(() => {});
  }
});
