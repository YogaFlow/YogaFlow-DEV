/**
 * RT-1 Nachtrag — E2E: kein App-Fuß, öffentliche Zeile, Menü, Weitere Regeln.
 * Studio e2eapp.
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

test('RT-1 Nachtrag — Rechtliches UX A–C', async ({ page, baseURL }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const laufId = `rt1${Date.now().toString(36)}`;
  const origin = (baseURL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');

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

    // (4) ausgeloggt: Textzeile am Ende der Auth-/Kursseite
    await page.goto(`${origin}/auth?tenant=${SLUG}`);
    await expect(page.getByTestId('studio-public-legal-line')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('studio-footer')).toHaveCount(0);
    await expect(page.getByTestId('studio-public-legal-line').getByRole('link', { name: 'Impressum' })).toBeVisible();

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
        p_values: { extra_rules: '' },
        p_content_hash: hashLegal(body),
      });
      if (rel.error || !rel.data?.success) throw new Error(JSON.stringify(rel));
    }

    // (1) Weitere Regeln ändern → change_release
    await legalProfileSetzen(asOwner, {
      p_legal_name: 'E2E RT1 Yoga',
      p_legal_form: 'sole_trader',
      p_contact_email: owner.email,
      p_extra_rules: 'Bitte Matte mitbringen.',
    });
    const statusExtra = await asOwner.rpc('get_studio_legal_status');
    expect(statusExtra.data?.terms?.status).toBe('change_release');

    // (2) Stornofrist ändern — neue Fassung, Status bleibt change_release oder current
    //    (extra rules already pending); nach Reset extra → settings alone stays current
    await asOwner.rpc('upsert_studio_legal_profile', {
      p_legal_name: 'E2E RT1 Yoga',
      p_street: 'Testweg',
      p_house_number: '1',
      p_postal_code: '10115',
      p_city: 'Berlin',
      p_country: 'DE',
      p_contact_email: owner.email,
      p_legal_form: 'sole_trader',
      p_extra_rules: '',
    });
    // Re-release with empty extra so settings-only path is clean
    {
      const body = '# AGB E2E\n\nStand: nach Reset.\n';
      await asOwner.rpc('release_studio_legal', {
        p_kind: 'terms',
        p_template_version: '2026-10-05',
        p_body_md: body,
        p_values: { extra_rules: '' },
        p_content_hash: hashLegal(body),
      });
    }
    const beforeCancel = await asOwner.rpc('get_studio_legal_status');
    expect(beforeCancel.data?.terms?.status).toBe('current');

    await admin
      .from('tenants')
      .update({ cancellation_window_hours: 12 })
      .eq('id', tenant.id);

    // Client would resync; simulate publish settings_change with same extra_rules
    {
      const body = '# AGB E2E\n\nStand: 12 Stunden.\n';
      await asOwner.rpc('publish_studio_legal_document', {
        p_kind: 'terms',
        p_template_version: '2026-10-05',
        p_body_md: body,
        p_values: { extra_rules: '', cancellation_hours: '12 Stunden' },
        p_content_hash: hashLegal(body),
        p_trigger: 'settings_change',
      });
    }
    const afterCancel = await asOwner.rpc('get_studio_legal_status');
    expect(afterCancel.data?.terms?.status).toBe('current');

    const { data: sessionData } = await asOwner.auth.getSession();
    await alsAngemeldet(page, sessionData.session);

    // (3) eingeloggt: kein Fuß, Impressum über Profil in 2 Tipps
    await page.goto(`${origin}/dashboard?tenant=${SLUG}`);
    await expect(page.getByTestId('studio-footer')).toHaveCount(0);
    await page.goto(`${origin}/profile?tenant=${SLUG}`);
    const about = page.getByTestId('studio-about-legal');
    await expect(about).toBeVisible({ timeout: 20_000 });
    await about.getByRole('button', { name: 'Impressum' }).click();
    await expect(page.getByTestId('studio-legal-sheet-body')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('studio-legal-sheet-close').click();

    await page.goto(`${origin}/settings/rechtliches?tenant=${SLUG}`);
    await expect(page.getByTestId('studio-legal-overview')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('legal-row-agb')).toBeVisible();
  } finally {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX).catch(() => {});
  }
});
