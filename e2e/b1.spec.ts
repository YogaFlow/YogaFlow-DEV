/**
 * Story B1 — Anbieterangaben, Bestellknopf, Beleg (nur DEV, demoalpha).
 */
import { expect, test } from '@playwright/test';
import {
  alsAngemeldet,
  buchenUndBezahlen,
  devKontext,
  neuerKurs,
  neuerNutzer,
  screenshot,
  stripeJobsAnstossen,
  warteAuf,
  type DevCtx,
} from './_dev';
// @ts-expect-error — .mjs ohne Typen
import { legalProfileSetzen } from '../scripts/test/_helpers.mjs';

let ctx: DevCtx;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ctx = await devKontext();
});

test.afterAll(async () => {
  await ctx?.restore();
});

test('1 — ohne Anbieterangaben kein Online-Checkout, Aufmerksamkeit', async ({ page }) => {
  const saved = await ctx.admin
    .from('tenant_legal_profiles')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  await ctx.admin.from('tenant_legal_profiles').delete().eq('tenant_id', ctx.tenantId);
  try {
    const kurs = await neuerKurs(ctx, 'OhneAngaben');
    const person = await neuerNutzer(ctx, 'ohne', 'Vera');
    await alsAngemeldet(page, ctx.ownerSession);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/settings?tenant=demoalpha');
    await expect(page.getByTestId('settings-attention')).toContainText('Anbieterangaben fehlen');
    await screenshot(page, 'einstellungen-anbieter', 'b1');

    await alsAngemeldet(page, person.session);
    await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
    await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Weiter zur Buchung' })).toHaveCount(0);
  } finally {
    await legalProfileSetzen(ctx.owner);
  }
  void saved;
});

test('2 — Sheet K5, Zahlungspflichtig buchen, Beleg', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'Beleg');
  const person = await neuerNutzer(ctx, 'bel', 'Wilma');
  const book = await person.client.rpc('register_for_course', { p_course_id: kurs.id });
  expect(book.data?.success).toBe(true);
  const regId = book.data.registration_id as string;

  await alsAngemeldet(page, person.session);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  await page.getByRole('button', { name: 'Jetzt bezahlen' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('booking-summary')).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('button', { name: 'Zahlungspflichtig buchen' })).toBeVisible();
  await expect(dialog.getByText(/gemäß § 19 UStG ohne USt|inkl\. \d+ % USt/)).toBeVisible();
  await screenshot(page, 'sheet-k5', 'b1');
  await page.getByRole('button', { name: 'Schließen' }).click();

  const res = await fetch(`${ctx.url}/functions/v1/payments-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${person.session?.access_token}`,
      apikey: ctx.anon,
      'x-omlify-tenant': 'demoalpha',
    },
    body: JSON.stringify({ action: 'prepare', registration_id: regId }),
  });
  const prep = await res.json();
  expect(res.status).toBe(200);
  const { data: att } = await ctx.admin
    .from('payment_attempts')
    .select('provider_ref')
    .eq('id', prep.attempt_id)
    .single();
  const conf = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(att!.provider_ref)}/confirm`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': ctx.accountRef,
      },
      body: new URLSearchParams({ payment_method: 'pm_card_visa' }),
    },
  );
  const pi = await conf.json();
  expect(pi.status).toBe('succeeded');
  await warteAuf(
    async () => {
      await stripeJobsAnstossen(ctx);
      const { data } = await ctx.admin
        .from('receipts')
        .select('id')
        .eq('kind', 'receipt')
        .in(
          'payment_id',
          (
            await ctx.admin.from('payments').select('id').eq('registration_id', regId)
          ).data?.map((row) => row.id) ?? [],
        );
      return (data ?? []).length > 0;
    },
    120_000,
    'Beleg nach Zahlung',
  );

  await page.goto('/my-registrations?tenant=demoalpha');
  await expect(page.getByTestId('receipt-link')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('receipt-link').click();
  await expect(page.getByText('Beleg', { exact: true })).toBeVisible();
  await expect(page.getByText(/2026-\d{5}/)).toBeVisible();
  await screenshot(page, 'beleg', 'b1');
});

test('3 — Owner erstattet 10 €, Erstattungsbeleg in Zahlungen', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'Erstattung');
  const person = await neuerNutzer(ctx, 'erst', 'Xenia');
  const regId = await buchenUndBezahlen(ctx, person, kurs.id);
  const { data: pay } = await ctx.admin
    .from('payments')
    .select('id')
    .eq('registration_id', regId)
    .eq('provider', 'stripe')
    .gt('amount_cents', 0)
    .single();
  const req = await ctx.owner.rpc('request_payment_refund', {
    p_payment_id: pay!.id,
    p_amount_cents: 1000,
    p_note: `E2E ${ctx.laufId}`,
  });
  expect(req.data?.success).toBe(true);
  await warteAuf(
    async () => {
      await stripeJobsAnstossen(ctx);
      const { data } = await ctx.admin
        .from('receipts')
        .select('id')
        .eq('payment_id', pay!.id)
        .eq('kind', 'refund_receipt');
      return (data ?? []).length > 0;
    },
    120_000,
    'Erstattungsbeleg',
  );

  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/payments?tab=alle&tenant=demoalpha');
  await page.getByLabel('Art').selectOption('online');
  await page.getByLabel('Name suchen').fill(ctx.laufId);
  await page.getByTestId('payment-cards').getByTestId('payment-row').filter({ hasText: 'Xenia' }).click();
  await expect(page.getByTestId('refund-receipt-link')).toBeVisible();
});
