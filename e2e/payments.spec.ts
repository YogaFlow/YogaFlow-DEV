/**
 * Story 3.1 — Zahlungsübersicht (nur DEV, Studio demoalpha).
 * Owner filtert „Online“, öffnet die Zahlung und sieht die Teilerstattung.
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

let ctx: DevCtx;

test.beforeAll(async () => {
  ctx = await devKontext();
});

test.afterAll(async () => {
  await ctx?.restore();
});

test('Owner filtert Online und sieht die Teilerstattung im Detail', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'Zahlungen');
  const person = await neuerNutzer(ctx, 'zahl', 'Rosa');
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
      const { data } = await ctx.admin.from('payment_refunds').select('status').eq('payment_id', pay!.id);
      return (data ?? []).some((r) => r.status === 'succeeded');
    },
    120_000,
    'Teilerstattung',
  );

  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/payments?tenant=demoalpha');
  await page.getByLabel('Art').selectOption('online');
  await page.getByLabel('Name suchen').fill(ctx.laufId);
  const cards = page.getByTestId('payment-cards');
  const row = cards.getByTestId('payment-row').filter({ hasText: 'Rosa' });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('payment-status')).toHaveText('Teilweise erstattet · 10,00 € von 24,00 €');
  await expect(row).toContainText('Online');
  await screenshot(page, 'zahlungen-liste', '3_1');
  await page.setViewportSize({ width: 360, height: 780 });

  await row.getByRole('button').click();
  await expect(page).toHaveURL(new RegExp(`payment=${pay!.id}`));
  await expect(page.getByTestId('refund-list')).toContainText('10,00 €');
  await expect(page.getByTestId('refundable')).toContainText('14,00 €');
  await screenshot(page, 'zahlungen-detail', '3_1');
});
