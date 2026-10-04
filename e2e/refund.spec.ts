/**
 * Story 3.2c — Erstattung in der Oberfläche (nur DEV, Studio demoalpha).
 * Bezahlen läuft über die API (pm_card_visa = Testkarte 4242…), alles Weitere im Browser.
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

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ctx = await devKontext();
});

test.afterAll(async () => {
  await ctx?.restore();
});

async function refundStatus(regId: string) {
  const { data: pays } = await ctx.admin.from('payments').select('id').eq('registration_id', regId);
  const ids = (pays ?? []).map((p) => p.id as string);
  if (ids.length === 0) return [];
  const { data, error } = await ctx.admin
    .from('payment_refunds')
    .select('status, amount_cents')
    .in('payment_id', ids);
  if (error) throw new Error('payment_refunds: ' + error.message);
  return data ?? [];
}

test('1 — Teilnehmerin meldet sich vor der Frist ab und sieht die Erstattung', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'Abmelden');
  const person = await neuerNutzer(ctx, 'abm', 'Mara');
  const regId = await buchenUndBezahlen(ctx, person, kurs.id);

  await alsAngemeldet(page, person.session);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  await page.getByTestId('course-unregister').click();
  const confirm = page.locator('div.fixed.inset-0').filter({ hasText: 'Du bekommst 24,00 € zurück' });
  await expect(confirm).toBeVisible();
  await screenshot(page, 'abmelden-dialog');
  await confirm.getByRole('button', { name: 'Abmelden', exact: true }).click();
  await expect(confirm).toBeHidden();

  await page.goto('/my-registrations?tenant=demoalpha');
  const line = page.getByTestId('refund-progress').first();
  await expect(line).toContainText(/Erstattung läuft|Erstattet/);
  await screenshot(page, 'meine-anmeldungen-erstattung-laeuft');

  await warteAuf(
    async () => {
      await stripeJobsAnstossen(ctx);
      return (await refundStatus(regId)).some((r) => r.status === 'succeeded');
    },
    120_000,
    'Erstattung abgeschlossen',
  );
  await page.reload();
  await expect(page.getByTestId('refund-progress').first()).toContainText('Erstattet · 24,00 €');
  await screenshot(page, 'meine-anmeldungen-erstattet');
});

test('2 — Owner erstattet 10 € von Hand, Teilnehmerin sieht Teilerstattung', async ({
  browser,
}) => {
  const kurs = await neuerKurs(ctx, 'Teil');
  const person = await neuerNutzer(ctx, 'teil', 'Lene');
  const regId = await buchenUndBezahlen(ctx, person, kurs.id);

  const ownerPage = await browser.newPage();
  await alsAngemeldet(ownerPage, ctx.ownerSession);
  await ownerPage.setViewportSize({ width: 360, height: 780 });
  await ownerPage.goto(`/course/${kurs.id}/kassieren?tenant=demoalpha`);
  await ownerPage.getByRole('button', { name: 'Erstatten' }).click();
  await expect(ownerPage.getByTestId('refundable')).toContainText('noch erstattbar 24,00 €');
  await ownerPage.getByRole('tab', { name: 'Teilbetrag' }).click();
  await ownerPage.locator('input[inputmode="decimal"]').fill('10,00');
  await ownerPage.getByRole('button', { name: 'Kulanz' }).click();
  await screenshot(ownerPage, 'owner-erstatten-bestaetigen');
  await ownerPage.getByRole('button', { name: '10,00 € erstatten' }).click();
  await expect(ownerPage.getByTestId('refund-success')).toContainText('10,00 € werden erstattet');
  await expect(ownerPage.getByTestId('refundable')).toContainText('noch erstattbar 14,00 €');
  await screenshot(ownerPage, 'owner-erstattungsliste');
  await ownerPage.close();

  await warteAuf(
    async () => {
      await stripeJobsAnstossen(ctx);
      return (await refundStatus(regId)).some((r) => r.status === 'succeeded');
    },
    120_000,
    'Teilerstattung abgeschlossen',
  );

  const userPage = await browser.newPage();
  await alsAngemeldet(userPage, person.session);
  await userPage.setViewportSize({ width: 360, height: 780 });
  await userPage.goto('/my-registrations?tenant=demoalpha');
  await expect(userPage.getByTestId('refund-progress').first()).toContainText(
    'Teilweise erstattet · 10,00 € von 24,00 €',
  );
  await screenshot(userPage, 'meine-anmeldungen-teilweise');
  await userPage.close();
});

test('3 — Kursabsage-Dialog zeigt Anzahl und Summe der Online-Erstattungen', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'Absage');
  for (const [tag, name] of [
    ['a1', 'Ida'],
    ['a2', 'Jo'],
    ['a3', 'Kim'],
  ] as const) {
    const p = await neuerNutzer(ctx, tag, name);
    await buchenUndBezahlen(ctx, p, kurs.id);
  }

  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  await page.getByRole('button', { name: 'Kurs absagen' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('cancel-online-refund')).toHaveText(
    '3 haben online bezahlt. 72,00 € werden automatisch erstattet.',
  );
  await screenshot(page, 'kursabsage-dialog');
  await dialog.getByRole('button', { name: 'Kurs absagen' }).click();
  await expect(page.getByText('72,00 € werden automatisch erstattet', { exact: false })).toBeVisible();
  await screenshot(page, 'kursabsage-erfolg');
});
