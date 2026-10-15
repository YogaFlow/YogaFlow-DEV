/**
 * UX-10 — Checkout-Zusammenfassung, Zahlarten-Überschrift, Kurskarte-Wording (DEV, e2eapp).
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
const EMAIL_PREFIX = 'e2eappux10';

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

test('UX10 — Kurs-Checkout Zusammenfassung, Kurskarte Sheet, Menü', async ({ page }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  const laufId = `ux10${Date.now().toString(36)}`;

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E UX10', slug: SLUG })
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
      vorname: 'Lena',
      nachname: laufId,
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });
    const buyer = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.buyer@example.com`,
      vorname: 'Buyer',
      nachname: laufId,
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const up = await admin.rpc('upsert_provider_account', {
      p_tenant: tenant.id,
      p_provider: 'stripe',
      p_ref: `acct_e2eux10_${randomUUID().slice(0, 8)}`,
      p_status: 'active',
      p_charges: true,
      p_payouts: true,
      p_details: true,
      p_livemode: false,
      p_capabilities: { card: 'active' },
    });
    if (up.error || !up.data?.success) throw new Error(JSON.stringify(up));

    await legalProfileSetzen(asOwner);
    await avvAkzeptieren(asOwner);
    const tax = await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    if (tax.error || !tax.data?.success) throw new Error(JSON.stringify(tax));
    const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    if (on.error || !on.data?.success) throw new Error(JSON.stringify(on));
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });

    const kurs = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `Hatha ${laufId}`,
      date: berlinDate(7),
      time: '18:00:00',
      end_time: '19:15:00',
      price: 18,
      max_participants: 8,
      location: 'Studio Neuss',
      pass_eligible: true,
    });

    const productName = `10er-Karte ${laufId}`;
    const prod = await asOwner.rpc('create_pass_product', {
      p_name: productName,
      p_units: 10,
      p_price_cents: 12000,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: null,
      p_online_purchasable: true,
    });
    if (prod.error || !prod.data?.success) {
      throw new Error('create_pass_product: ' + JSON.stringify(prod));
    }

    const asBuyer = await login(url, anon, buyer.email, password, SLUG);
    const book = await asBuyer.rpc('register_for_course', { p_course_id: kurs.id });
    expect(book.data?.success).toBe(true);
    const regId = book.data.registration_id as string;

    const { data: sessionData } = await asBuyer.auth.getSession();
    await alsAngemeldet(page, sessionData.session);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/course/${kurs.id}?tenant=${SLUG}`);
    await page.getByRole('button', { name: /Jetzt bezahlen|Zahlungspflichtig/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('booking-summary')).toBeVisible({ timeout: 25_000 });
    await expect(dialog.getByTestId('booking-summary')).toContainText(`Hatha ${laufId}`);
    await expect(dialog.getByTestId('booking-summary-reassurance')).toBeVisible();
    await expect(dialog.getByTestId('booking-summary-reassurance')).toContainText(
      /Kostenlos abmelden bis|Abmeldefrist ist vorbei/,
    );
    await expect(dialog.getByTestId('payment-how-to-pay')).toHaveText(
      'Wie möchtest du bezahlen?',
    );
    await expect(dialog.getByText(/Kartendaten sehen wir nicht/)).toBeVisible();

    // PaymentIntent nur über prepare (Doppeltipp im UI erzeugt keinen zweiten Attempt-Pfad hier)
    const prep = await fetch(`${url}/functions/v1/payments-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session!.access_token}`,
        apikey: anon,
        'x-omlify-tenant': SLUG,
      },
      body: JSON.stringify({ action: 'prepare', registration_id: regId }),
    });
    const prepBody = await prep.json();
    // Fake-Connect-Konto: prepare kann scheitern — dann zählt nur die UI-Zusammenfassung.
    if (prep.status === 200 && prepBody.attempt_id) {
      const prep2 = await fetch(`${url}/functions/v1/payments-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session!.access_token}`,
          apikey: anon,
          'x-omlify-tenant': SLUG,
        },
        body: JSON.stringify({ action: 'prepare', registration_id: regId }),
      });
      const prep2Body = await prep2.json();
      expect(prep2Body.attempt_id).toBe(prepBody.attempt_id);
    }

    await dialog.getByRole('button', { name: 'Schließen' }).click();

    await page.goto(`/my-passes?tenant=${SLUG}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Kurskarten' })).toBeVisible();
    await page.getByTestId(`pass-buy-${prod.data.id}`).click();
    await expect(page.locator('#pass-purchase-title')).toHaveText(productName, {
      timeout: 15_000,
    });
    await expect(page.getByTestId('pass-checkout-summary')).toContainText(
      '10 Termine · 12 Monate gültig · 12,00 € pro Termin',
    );
    await expect(page.getByTestId('pass-checkout-summary')).toContainText(
      'mit Kurskarte buchbar',
    );
  } finally {
    await plattform(admin, platformWas);
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX).catch(() => undefined);
  }
});
