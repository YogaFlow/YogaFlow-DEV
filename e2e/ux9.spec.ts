/**
 * UX-9 — Kauf-Sheet Consent, neuer Hash, Navigation Mehrfachkarten (DEV, e2eapp).
 */
import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertDevEnv,
  avvAkzeptieren,
  clientMitTenant,
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
const EMAIL_PREFIX = 'e2eappux9';

const IMMEDIATE_TEXT =
  'Ich möchte die Karte sofort nutzen. Bei Widerruf zahle ich genutzte Termine anteilig; sind alle genutzt, endet das Widerrufsrecht.';
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

test('UX9 — Consent-Fehler, Hash, Mehrfachkarten-Nav', async ({ page }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  const laufId = `ux9${Date.now().toString(36)}`;
  const productName = `5er ${laufId}`;

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E UX9', slug: SLUG })
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
    const buyer = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.buyer@example.com`,
      vorname: 'Buyer',
      nachname: laufId,
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asBuyer = await login(url, anon, buyer.email, password, SLUG);

    const up = await admin.rpc('upsert_provider_account', {
      p_tenant: tenant.id,
      p_provider: 'stripe',
      p_ref: `acct_e2eux9_${randomUUID().slice(0, 8)}`,
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
      p_valid_from: new Date().toISOString().slice(0, 10),
    });
    if (tax.error || !tax.data?.success) throw new Error(JSON.stringify(tax));
    const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    if (on.error || !on.data?.success) throw new Error(JSON.stringify(on));

    const created = await asOwner.rpc('create_pass_product', {
      p_name: productName,
      p_units: 5,
      p_price_cents: 6500,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: null,
      p_online_purchasable: true,
    });
    expect(created.data?.success).toBe(true);
    const productId = created.data.id as string;

    // Kauf mit neuem Consent-Hash (RPC-Pfad wie K1; UI prüft Häkchen getrennt).
    const hashImmediate = hashLegal(IMMEDIATE_TEXT);
    const prep = await admin.rpc('prepare_pass_online_payment', {
      p_product_id: productId,
      p_user_id: buyer.id,
      p_immediate_use_hash: hashImmediate,
      p_withdrawal_info_hash: hashLegal(WITHDRAWAL_TEXT),
    });
    expect(prep.data?.success).toBe(true);
    const attemptId = prep.data.attempt_id as string;
    const amount = prep.data.amount_cents as number;
    const piId = `pi_e2eux9_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const attach = await admin.rpc('attach_payment_ref', {
      p_attempt_id: attemptId,
      p_provider_ref: piId,
    });
    expect(attach.data?.success).toBe(true);
    const done = await admin.rpc('complete_online_payment', {
      p_provider_ref: piId,
      p_amount_cents: amount,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    expect(done.data?.success).toBe(true);

    const { data: consent } = await admin
      .from('pass_purchase_consents')
      .select('immediate_use_text_hash')
      .eq('attempt_id', attemptId)
      .maybeSingle();
    expect(consent?.immediate_use_text_hash).toBe(hashImmediate);

    const { data: sessionData } = await asBuyer.auth.getSession();
    await alsAngemeldet(page, sessionData.session);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/my-passes?tenant=${SLUG}`);
    await expect(page.getByTestId('my-passes-page')).toBeVisible();
    await expect(page.getByText('Aktive Mehrfachkarten')).toBeVisible();
    await expect(page.getByText(productName).first()).toBeVisible();

    // Navigation: Seitentitel im Kopf (Menüpunkt mobil hinter Drawer)
    await expect(page.getByRole('heading', { level: 1, name: 'Mehrfachkarten' })).toBeVisible();

    // Zweites Produkt für Sheet-UI (Consent ohne Häkchen).
    const buyName = `Kauf ${laufId}`;
    const buyProd = await asOwner.rpc('create_pass_product', {
      p_name: buyName,
      p_units: 5,
      p_price_cents: 6500,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: null,
      p_online_purchasable: true,
    });
    expect(buyProd.data?.success).toBe(true);

    await page.reload();
    await expect(page.getByTestId('my-passes-page')).toBeVisible();
    await page.getByTestId(`pass-buy-${buyProd.data.id}`).click();

    await expect(page.locator('#pass-purchase-title')).toHaveText(buyName, {
      timeout: 15000,
    });
    await expect(page.getByTestId('pass-checkout-tax').first()).toContainText(
      'Endpreis · keine USt (§ 19 UStG)',
    );
    await expect(page.getByTestId('pass-consent-error')).toHaveCount(0);
    await expect(page.getByText(IMMEDIATE_TEXT)).toBeVisible();

    await page.getByTestId('checkout-pay').first().click();
    await expect(page.getByTestId('pass-consent-error')).toBeVisible();
    await expect(page.getByTestId('pass-consent-error')).toContainText(
      'Bitte setze das Häkchen',
    );

    await page.getByTestId('pass-immediate-consent').check();
    await expect(page.getByTestId('pass-consent-error')).toHaveCount(0);

    await page.getByTestId('pass-consent-mehr').click();
    await expect(page.getByTestId('pass-mehr-dialog')).toBeVisible();
    await expect(page.getByTestId('pass-mehr-dialog')).toContainText('52,00');
  } finally {
    await plattform(admin, platformWas);
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX).catch(() => undefined);
  }
});
