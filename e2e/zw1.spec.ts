/**
 * ZW-1 — Ein-Tipp-Buchung / Zahlungswege (DEV, Studio e2eapp — nicht demoalpha).
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
const EMAIL_PREFIX = 'e2eappzw1';

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

function methodLine(page: Page) {
  return page.getByTestId('book-method-line').or(page.getByTestId('book-method-line-mobile')).first();
}

test('ZW1 — Ein-Tipp, Anders bezahlen, nur Vor Ort, letzter Schalter', async ({ page, browser }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  const laufId = `zw1${Date.now().toString(36)}`;

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E App', slug: SLUG })
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
    const acctRef = 'acct_e2e_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const up = await admin.rpc('upsert_provider_account', {
      p_tenant: tenant.id,
      p_provider: 'stripe',
      p_ref: acctRef,
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
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });

    const kurs = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `ZW1 ${laufId}`,
      price: 16,
      date: berlinDate(6),
    });

    const asUser = await login(url, anon, user.email, password, SLUG);
    const { data: sess } = await asUser.auth.getSession();

    // (1) beide + ohne Karte → Standard Online, Anders bezahlen zeigt Vor Ort
    await alsAngemeldet(page, sess.session);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/course/${kurs.id}?tenant=${SLUG}`);
    await expect(methodLine(page)).toContainText('Online bezahlen', { timeout: 20_000 });
    await expect(page.getByTestId('book-primary')).toBeVisible();
    await page.getByTestId('book-alt-pay').click();
    await expect(page.getByText('Vor Ort bezahlen')).toBeVisible();
    await page.getByText('Vor Ort bezahlen').click();
    await expect(methodLine(page)).toContainText('Du bezahlst vor Ort');

    // (3) nur Vor Ort → Bestätigungs-Sheet
    await asOwner.rpc('set_online_payments_enabled', { p_enabled: false });
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
    await page.reload();
    await expect(methodLine(page)).toContainText('Du bezahlst vor Ort', { timeout: 20_000 });
    await expect(page.getByTestId('book-alt-pay')).toHaveCount(0);
    await page.getByTestId('book-primary').click();
    await expect(page.getByTestId('onsite-book-confirm')).toBeVisible();
    await expect(page.getByTestId('onsite-binding-book')).toHaveText('Zahlungspflichtig buchen');
    await page.getByTestId('onsite-binding-book').click();
    await expect(page.getByText('Angemeldet').first()).toBeVisible({ timeout: 15_000 });

    // (2) mit 10er-Karte → Ein-Tipp
    const kurs2 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `ZW1 Pass ${laufId}`,
      price: 16,
      date: berlinDate(8),
    });
    await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
    const prod = await asOwner.rpc('create_pass_product', {
      p_name: '10er-Karte',
      p_units: 10,
      p_price_cents: 15000,
      p_validity_rule: 'months',
      p_validity_value: 6,
    });
    if (prod.error || !prod.data?.success) throw new Error(JSON.stringify(prod));
    const sell = await asOwner.rpc('sell_pass', {
      p_member_id: user.id,
      p_product_id: prod.data.id,
      p_method: 'cash',
    });
    if (sell.error || !sell.data?.success) throw new Error(JSON.stringify(sell));

    await page.goto(`/course/${kurs2.id}?tenant=${SLUG}`);
    await expect(methodLine(page)).toContainText('10er-Karte', { timeout: 20_000 });
    await expect(page.getByTestId('book-primary')).toContainText('Mit 10er-Karte buchen');
    await page.getByTestId('book-primary').click();
    await expect(page.getByText(/mit Karte bezahlt/i).first()).toBeVisible({ timeout: 15_000 });

    // (4) Einstellungen: letzter Schalter
    const ownerCtx = await browser.newContext();
    const ownerPage = await ownerCtx.newPage();
    const { data: ownerSess } = await asOwner.auth.getSession();
    await alsAngemeldet(ownerPage, ownerSess.session);
    await asOwner.rpc('set_online_payments_enabled', { p_enabled: false });
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
    await ownerPage.goto(`/settings/zahlungen?tenant=${SLUG}`);
    const onsite = ownerPage.getByTestId('toggle-onsite-method');
    await expect(onsite).toBeVisible({ timeout: 20_000 });
    await expect(onsite).toBeChecked();
    await onsite.click();
    await expect(ownerPage.getByText(/Mindestens ein Zahlungsweg/i)).toBeVisible();
    await ownerCtx.close();
  } finally {
    try {
      await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    } catch (e) {
      console.warn('Aufräumen', e);
    }
    await plattform(admin, platformWas);
  }
});
