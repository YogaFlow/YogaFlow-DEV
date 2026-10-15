/**
 * Story UX-5 — Buchungsleiste, Toast ohne Buchungs-Undo, Abmelden mit Undo.
 * Studio: e2eapp (append-only-sicher).
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
const EMAIL_PREFIX = 'e2eappux5';

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
  return page
    .getByTestId('book-method-line')
    .or(page.getByTestId('book-method-line-mobile'))
    .locator('visible=true')
    .first();
}

test('UX5 — Buchung ohne Undo 4s; Abmelden mit Undo 6s; Zahlart-Feld', async ({ page }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  const laufId = `ux5${Date.now().toString(36)}`;

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E UX5', slug: SLUG })
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
      title: `UX5 ${laufId}`,
      price: 16,
      date: berlinDate(6),
    });

    const asUser = await login(url, anon, user.email, password, SLUG);
    const { data: sess } = await asUser.auth.getSession();
    await alsAngemeldet(page, sess.session);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/course/${kurs.id}?tenant=${SLUG}`);

    const mobileBar = page.getByTestId('course-booking-bar-mobile');
    await expect(methodLine(page)).toContainText('Online bezahlen', { timeout: 20_000 });
    await expect(methodLine(page)).toHaveAttribute('data-bordered', '1');

    // Zahlart-Feld öffnet Auswahl
    await methodLine(page).click();
    await expect(page.getByText('Vor Ort bezahlen')).toBeVisible();
    await page.getByText('Vor Ort bezahlen').click();
    await expect(methodLine(page)).toContainText('Vor Ort bezahlen');
    await expect(mobileBar.getByTestId('book-primary')).toHaveText('Weiter zur Buchung');
    await page.screenshot({
      path: 'docs/screenshots/ux5/booking-bar-onsite-360.png',
      fullPage: false,
    });

    // Buchung → Toast ohne Rückgängig, 4 s
    await mobileBar.getByTestId('book-primary').click();
    await page.getByTestId('onsite-binding-book').click();
    const bookToast = page.getByTestId('toast-success');
    await expect(bookToast).toContainText('Du bist dabei', { timeout: 15_000 });
    await expect(page.getByTestId('toast-undo')).toHaveCount(0);
    await expect(bookToast).toHaveAttribute('data-duration-ms', '4000');
    await page.getByTestId('toast-dismiss').click();
    await expect(bookToast).toHaveCount(0);

    // Abmelden (bar) → Toast mit Rückgängig, 6 s
    await expect(mobileBar.getByTestId('course-unregister')).toBeVisible({ timeout: 15_000 });
    await mobileBar.getByTestId('course-unregister').click();
    await page.getByTestId('modal-backdrop').getByRole('button', { name: 'Abmelden' }).click();
    const unregToast = page.getByTestId('toast-success');
    await expect(unregToast).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('toast-undo')).toBeVisible();
    await expect(unregToast).toHaveAttribute('data-duration-ms', '6000');
    await expect(page.getByTestId('toast-progress')).toBeVisible();
  } finally {
    try {
      await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    } catch (e) {
      console.warn('Aufräumen', e);
    }
    await plattform(admin, platformWas);
  }
});
