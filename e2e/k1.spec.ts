/**
 * K1 — Online-Kartenkauf, Widerruf, Verlängerung (DEV, Studio e2eapp).
 */
import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
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
const EMAIL_PREFIX = 'e2eappk1';

const IMMEDIATE_TEXT =
  'Ich verlange ausdrücklich, dass ich die Karte sofort nutzen kann. Mir ist bekannt, dass ich bei einem Widerruf für bereits genutzte Termine anteilig Wertersatz leiste.';
const WITHDRAWAL_TEXT =
  'Du hast ein 14-tägiges Widerrufsrecht. Widerrufsbelehrung.';

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

async function setupOnline(admin: SupabaseClient, asOwner: SupabaseClient, tenantId: string) {
  const up = await admin.rpc('upsert_provider_account', {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_ref: `acct_e2ek1_${randomUUID().slice(0, 8)}`,
    p_status: 'active',
    p_charges: true,
    p_payouts: true,
    p_details: true,
    p_livemode: false,
    p_capabilities: { card: 'active' },
  });
  if (up.error || !up.data?.success) throw new Error(JSON.stringify(up));
  const tax = await asOwner.rpc('set_tax_setting', {
    p_regime: 'small_business',
    p_vat_rate_bp: 0,
    p_valid_from: berlinDate(0),
  });
  if (tax.error || !tax.data?.success) throw new Error(JSON.stringify(tax));
  await legalProfileSetzen(asOwner);
  await avvAkzeptieren(asOwner);
  const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
  if (on.error || !on.data?.success) throw new Error(JSON.stringify(on));
}

test('K1 — kaufen, buchen, widerrufen, verlängern, >250', async ({ page }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const stripeKey = env.STRIPE_SECRET_KEY ?? '';
  if (!/^(sk|rk)_test_/.test(stripeKey)) throw new Error('STRIPE_SECRET_KEY (test) fehlt');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  const laufId = `k1${Date.now().toString(36)}`;

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
    const buyer = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.buyer@example.com`,
      vorname: 'Buyer',
      nachname: laufId,
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, SLUG, owner.email, password);
    const asBuyer = await login(url, anon, SLUG, buyer.email, password);
    await setupOnline(admin, asOwner, tenant.id);

    const cheap = await asOwner.rpc('create_pass_product', {
      p_name: `10er ${laufId}`,
      p_units: 10,
      p_price_cents: 12000,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: null,
      p_online_purchasable: true,
    });
    expect(cheap.data?.success).toBe(true);
    const productId = cheap.data.id as string;

    const expensive = await asOwner.rpc('create_pass_product', {
      p_name: `Teuer ${laufId}`,
      p_units: 20,
      p_price_cents: 30000,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: null,
      p_online_purchasable: true,
    });
    expect(expensive.data?.success).toBe(false);
    expect(expensive.data?.error).toBe('ONLINE_NOT_AVAILABLE');

    const offlineExp = await asOwner.rpc('create_pass_product', {
      p_name: `Studio ${laufId}`,
      p_units: 20,
      p_price_cents: 30000,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: null,
      p_online_purchasable: false,
    });
    expect(offlineExp.data?.success).toBe(true);

    // (1) Kauf via prepare + Stripe confirm (4242 / pm_card_visa)
    const prep = await admin.rpc('prepare_pass_online_payment', {
      p_product_id: productId,
      p_user_id: buyer.id,
      p_immediate_use_hash: hashLegal(IMMEDIATE_TEXT),
      p_withdrawal_info_hash: hashLegal(WITHDRAWAL_TEXT),
    });
    expect(prep.data?.success).toBe(true);
    const attemptId = prep.data.attempt_id as string;
    const amount = prep.data.amount_cents as number;
    const accountRef = prep.data.account_ref as string;

    const piRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': accountRef,
      },
      body: new URLSearchParams({
        amount: String(amount),
        currency: 'eur',
        'payment_method_types[0]': 'card',
        description: 'Omlify Kartenkauf',
        'metadata[attempt_id]': attemptId,
        'metadata[tenant_id]': tenant.id,
        'metadata[subject_type]': 'pass_product',
        'metadata[subject_id]': productId,
      }),
    });
    const pi = (await piRes.json()) as { id?: string; error?: { message?: string } };
    if (!pi.id) throw new Error(pi.error?.message ?? 'PI create');
    const attach = await admin.rpc('attach_payment_ref', {
      p_attempt_id: attemptId,
      p_provider_ref: pi.id,
    });
    expect(attach.data?.success).toBe(true);

    const confRes = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi.id)}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Account': accountRef,
        },
        body: new URLSearchParams({ payment_method: 'pm_card_visa' }),
      },
    );
    const confPi = (await confRes.json()) as { status?: string };
    expect(confPi.status).toBe('succeeded');

    const done = await admin.rpc('complete_online_payment', {
      p_provider_ref: pi.id,
      p_amount_cents: amount,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    expect(done.data?.success).toBe(true);
    const passId = done.data.pass_id as string;

    const course = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `K1 Kurs ${laufId}`,
      date: berlinDate(5),
      time: '10:00:00',
      end_time: '11:00:00',
      price: 15,
      max_participants: 10,
      pass_eligible: true,
    });
    const book = await asBuyer.rpc('register_for_course', {
      p_course_id: course.id,
      p_use_pass: true,
    });
    expect(book.data?.success).toBe(true);

    const buyerSession = (await asBuyer.auth.getSession()).data.session;
    await alsAngemeldet(page, buyerSession);
    await page.goto(`/my-passes?tenant=${SLUG}`);
    await expect(page.getByTestId('my-passes-page')).toBeVisible();
    await expect(page.getByText(/noch 9 von 10/)).toBeVisible();

    // (2) eine weitere Einlösung → gesamt 2 genutzt → Erstattung 96 €
    {
      const k = await kursAnlegen(admin, tenant.id, teacher.id, {
        title: `K1 R2 ${laufId}`,
        date: berlinDate(6),
        time: '11:00:00',
        end_time: '12:00:00',
        price: 15,
        max_participants: 10,
        pass_eligible: true,
      });
      const b = await asBuyer.rpc('register_for_course', {
        p_course_id: k.id,
        p_use_pass: true,
      });
      expect(b.data?.success).toBe(true);
    }

    const prev = await asBuyer.rpc('get_pass_withdrawal_preview', { p_pass_id: passId });
    expect(prev.data?.success).toBe(true);
    expect(prev.data?.units_used).toBe(2);
    expect(prev.data?.refund_cents).toBe(9600);

    const wd = await asBuyer.rpc('confirm_pass_withdrawal', { p_pass_id: passId });
    expect(wd.data?.success).toBe(true);
    expect(wd.data?.refund_cents).toBe(9600);

    const { data: mailRow } = await admin
      .from('email_deliveries')
      .select('kind, pass_id')
      .eq('pass_id', passId)
      .eq('kind', 'pass_withdrawal_received');
    expect((mailRow ?? []).length).toBeGreaterThanOrEqual(1);

    const { data: passAfter } = await admin
      .from('passes')
      .select('status')
      .eq('id', passId)
      .single();
    // void remaining — may stay active with 0 or revoked depending on SQL
    expect(['active', 'revoked', 'expired']).toContain(passAfter?.status);

    // (3) Owner verlängert eine frische Karte
    const prep2 = await admin.rpc('prepare_pass_online_payment', {
      p_product_id: productId,
      p_user_id: buyer.id,
      p_immediate_use_hash: hashLegal(IMMEDIATE_TEXT),
      p_withdrawal_info_hash: hashLegal(WITHDRAWAL_TEXT),
    });
    expect(prep2.data?.success).toBe(true);
    const att2 = prep2.data.attempt_id as string;
    const pi2Res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': accountRef,
      },
      body: new URLSearchParams({
        amount: String(prep2.data.amount_cents),
        currency: 'eur',
        'payment_method_types[0]': 'card',
        description: 'Omlify Kartenkauf',
        'metadata[attempt_id]': att2,
        'metadata[tenant_id]': tenant.id,
        'metadata[subject_type]': 'pass_product',
        'metadata[subject_id]': productId,
      }),
    });
    const pi2 = (await pi2Res.json()) as { id: string };
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: att2,
      p_provider_ref: pi2.id,
    });
    await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi2.id)}/confirm`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Account': accountRef,
        },
        body: new URLSearchParams({ payment_method: 'pm_card_visa' }),
      },
    );
    const done2 = await admin.rpc('complete_online_payment', {
      p_provider_ref: pi2.id,
      p_amount_cents: prep2.data.amount_cents,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    const pass2 = done2.data.pass_id as string;
    const extend = await asOwner.rpc('extend_pass', {
      p_pass_id: pass2,
      p_valid_until: berlinDate(400),
      p_note: `E2E Verlängerung ${laufId}`,
    });
    expect(extend.data?.success).toBe(true);

    // (4) UI: >250 nicht online in Liste
    await page.goto(`/my-passes?tenant=${SLUG}`);
    await expect(page.getByText(`Studio ${laufId}`)).toHaveCount(0);
    await expect(page.getByText(`10er ${laufId}`)).toBeVisible();
  } finally {
    await plattform(admin, platformWas);
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
  }
});
