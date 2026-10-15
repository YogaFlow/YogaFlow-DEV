/**
 * UX-7 — Kartenhinweis an/aus im Kursdetail (DEV, Studio e2eapp).
 */
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertDevEnv,
  avvAkzeptieren,
  berlinDate,
  clientMitTenant,
  kursAnlegen,
  ladeEnv,
  legalProfileSetzen,
  login,
  nutzerAnlegen,
  plattform,
  plattformStand,
  resteEntfernen,
  seedPasswort,
  // @ts-expect-error — .mjs
} from '../scripts/test/_helpers.mjs';
// @ts-expect-error — .mjs
import { assertDevGuard, ERLAUBTE_DEV_REF } from '../scripts/dev/dev_guard.mjs';

const SLUG = 'e2eapp';
const EMAIL_PREFIX = 'e2eappux7';

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

test('UX7 — Hinweis an mit Text; aus → nichts', async ({ page }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  const laufId = `ux7${Date.now().toString(36)}`;

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E UX7', slug: SLUG })
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
    const teacher = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.teacher@example.com`,
      vorname: 'Teacher',
      nachname: laufId,
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });
    const user = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.user@example.com`,
      vorname: 'User',
      nachname: laufId,
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asUser = await login(url, anon, user.email, password, SLUG);

    const up = await admin.rpc('upsert_provider_account', {
      p_tenant: tenant.id,
      p_provider: 'stripe',
      p_ref: `acct_e2eux7_${randomUUID().slice(0, 8)}`,
      p_status: 'active',
      p_charges: true,
      p_payouts: true,
      p_details: true,
      p_livemode: false,
      p_capabilities: { card: 'active' },
    });
    if (up.error || !up.data?.success) throw new Error(JSON.stringify(up));
    await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    await legalProfileSetzen(asOwner);
    await avvAkzeptieren(asOwner);
    await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });

    const prod = await asOwner.rpc('create_pass_product', {
      p_name: `5er ${laufId}`,
      p_units: 5,
      p_price_cents: 6500,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: null,
      p_online_purchasable: true,
    });
    expect(prod.data?.success).toBe(true);

    const course = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `UX7 Kurs ${laufId}`,
      date: berlinDate(3),
      time: '18:00:00',
      end_time: '19:00:00',
      price: 18,
      max_participants: 10,
      pass_eligible: true,
    });

    const on = await asOwner.rpc('update_pass_hint_settings', {
      p_enabled: true,
      p_template: 'Mit der {karte} sparst du {ersparnis}.',
    });
    expect(on.data?.success).toBe(true);

    const session = (await asUser.auth.getSession()).data.session;
    await alsAngemeldet(page, session);
    await page.goto(`/course/${course.id}?tenant=${SLUG}`);
    const hint = page
      .getByTestId('pass-savings-hint')
      .or(page.getByTestId('pass-savings-hint-mobile'))
      .locator('visible=true')
      .first();
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await expect(hint).toContainText(`Mit der 5er ${laufId} sparst du 5,00 €.`);

    const off = await asOwner.rpc('update_pass_hint_settings', {
      p_enabled: false,
      p_template: null,
    });
    expect(off.data?.success).toBe(true);

    await page.reload();
    await expect(
      page
        .getByTestId('pass-savings-hint')
        .or(page.getByTestId('pass-savings-hint-mobile')),
    ).toHaveCount(0);
  } finally {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX).catch(() => undefined);
    await plattform(admin, platformWas).catch(() => undefined);
  }
});
