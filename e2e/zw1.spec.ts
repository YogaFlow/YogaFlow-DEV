/**
 * ZW-1 / Nachtrag N3 — Zahlungswege + Zahlart-Zeile (DEV, Studio e2eapp).
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
  // Desktop- und Mobil-Zeile existieren parallel; nur die sichtbare antasten.
  return page
    .getByTestId('book-method-line')
    .or(page.getByTestId('book-method-line-mobile'))
    .locator('visible=true')
    .first();
}

test('ZW1 N3 — Zahlungswege, Zahlart-Zeile, Neu-Hinweis, letzter Schalter', async ({
  page,
  browser,
}) => {
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
    const habitUser = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.habit@example.com`,
      vorname: 'Habit',
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

    // (1) beide + ohne Karte → Standard Online
    // (5) Zahlart-Zeile + Knopftext Online
    await alsAngemeldet(page, sess.session);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/course/${kurs.id}?tenant=${SLUG}`);
    const mobileBar = page.getByTestId('course-booking-bar-mobile');
    await expect(methodLine(page)).toContainText('Online bezahlen', { timeout: 20_000 });
    await expect(methodLine(page)).toHaveAttribute('data-bordered', '1');
    await expect(mobileBar.getByTestId('book-primary')).toHaveText('Weiter zur Zahlung');

    // Zahlart-Feld öffnet Sheet → Vor Ort
    await methodLine(page).click();
    await expect(page.getByText('Vor Ort bezahlen')).toBeVisible();
    await page.getByText('Vor Ort bezahlen').click();
    await expect(methodLine(page)).toContainText('Vor Ort bezahlen');
    await expect(methodLine(page)).toContainText('im Studio');
    await expect(mobileBar.getByTestId('book-primary')).toHaveText('Weiter zur Buchung');

    // (3) nur Vor Ort → Bestätigungs-Sheet mit Zahlungspflichtig buchen
    await asOwner.rpc('set_online_payments_enabled', { p_enabled: false });
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
    await page.reload();
    await expect(methodLine(page)).toContainText('Vor Ort bezahlen', { timeout: 20_000 });
    await expect(methodLine(page)).toHaveAttribute('data-bordered', '0');
    await expect(mobileBar.getByTestId('book-primary')).toHaveText('Weiter zur Buchung');
    await mobileBar.getByTestId('book-primary').click();
    await expect(page.getByTestId('onsite-book-confirm')).toBeVisible();
    await expect(page.getByTestId('onsite-binding-book')).toHaveText('Zahlungspflichtig buchen');
    await page.getByTestId('onsite-binding-book').click();
    await expect(page.getByTestId('toast-success')).toContainText('Du bist dabei', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('toast-undo')).toHaveCount(0);

    // (2) mit 10er-Karte → Ein-Tipp + Toast ohne Rückgängig (UX-5)
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
    await expect(mobileBar.getByTestId('book-primary')).toContainText('Mit 10er-Karte buchen');
    await mobileBar.getByTestId('book-primary').click();
    await expect(page.getByTestId('toast-success')).toContainText('Du bist dabei', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('toast-undo')).toHaveCount(0);

    // (6) Neu-Hinweis einmal für Gewohnheits-Vor-Ort-Zahler
    const histKurs = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `ZW1 Hist ${laufId}`,
      price: 16,
      date: berlinDate(5),
    });
    const asHabitSeed = await login(url, anon, habitUser.email, password, SLUG);
    const histBook = await asHabitSeed.rpc('register_for_course', {
      p_course_id: histKurs.id,
      p_use_pass: false,
      p_method: 'onsite',
    });
    if (histBook.error || !histBook.data?.success) {
      throw new Error(JSON.stringify(histBook));
    }
    // Wie Bestandskundin vor N1/Z7: Hinweis noch nicht gesehen, keine gespeicherte Wahl
    // (Z7 würde sonst nach der Hist-Buchung Vor Ort als Default setzen)
    const { error: clearHint } = await admin
      .from('users')
      .update({ online_pay_hint_seen_at: null, last_booking_pay_method: null })
      .eq('id', habitUser.id);
    if (clearHint) throw new Error(clearHint.message);

    const kursHint = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `ZW1 Hint ${laufId}`,
      price: 18,
      date: berlinDate(10),
    });
    const asHabit = await login(url, anon, habitUser.email, password, SLUG);
    const { data: habitSess } = await asHabit.auth.getSession();
    const habitCtx = await browser.newContext();
    const habitPage = await habitCtx.newPage();
    await alsAngemeldet(habitPage, habitSess.session);
    await habitPage.setViewportSize({ width: 360, height: 780 });
    await habitPage.goto(`/course/${kursHint.id}?tenant=${SLUG}`);
    await expect(methodLine(habitPage)).toContainText('Online bezahlen', { timeout: 20_000 });
    await expect(methodLine(habitPage).getByTestId('book-online-pay-badge')).toHaveText('Neu');
    await expect(methodLine(habitPage).getByTestId('book-online-pay-hint')).toContainText(
      'Du kannst jetzt direkt online bezahlen',
    );

    // Nach einer Buchung (Vor Ort) kein Hinweis mehr
    await methodLine(habitPage).click();
    await habitPage.locator('label').filter({ hasText: 'Vor Ort bezahlen' }).click();
    await habitPage.getByTestId('course-booking-bar-mobile').getByTestId('book-primary').click();
    await habitPage.getByTestId('onsite-binding-book').click();
    await expect(habitPage.getByTestId('toast-success')).toBeVisible({ timeout: 15_000 });

    const kursHint2 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `ZW1 Hint2 ${laufId}`,
      price: 18,
      date: berlinDate(12),
    });
    await habitPage.goto(`/course/${kursHint2.id}?tenant=${SLUG}`);
    // Z7: zuletzt Vor Ort → Standard Vor Ort; Neu-Hinweis weg
    await expect(methodLine(habitPage)).toContainText('Vor Ort bezahlen', { timeout: 20_000 });
    await expect(methodLine(habitPage).getByTestId('book-online-pay-badge')).toHaveCount(0);
    await expect(methodLine(habitPage).getByTestId('book-online-pay-hint')).toHaveCount(0);
    await habitCtx.close();

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
