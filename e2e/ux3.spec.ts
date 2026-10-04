/**
 * Story UX-3 — Toast, ⋯-Menü, Export-Chip, ICS-Token.
 */
import { expect, test } from '@playwright/test';
import {
  alsAngemeldet,
  devKontext,
  neuerKurs,
  neuerNutzer,
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

test('UX3 — Abmelden zeigt Toast mit Rückgängig', async ({ page }) => {
  await ctx.owner.rpc('set_allow_onsite_payment', { p_allow: true });
  const kurs = await neuerKurs(ctx, 'Ux3Toast');
  const person = await neuerNutzer(ctx, 'ux3t', 'Tina');
  const book = await person.client.rpc('register_for_course', { p_course_id: kurs.id });
  expect(book.data?.success).toBe(true);

  await alsAngemeldet(page, person.session);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  const unregister = page.locator('.fixed').getByTestId('course-unregister');
  await expect(unregister).toBeVisible({ timeout: 20_000 });
  await unregister.click();
  await page.getByTestId('modal-backdrop').getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByTestId('toast-success')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('toast-undo')).toBeVisible();
});

test('UX3 — Kurs absagen über ⋯ mit Bestätigung', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'Ux3Menu');
  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  await expect(page.getByTestId('course-detail-menu')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('course-detail-menu').click();
  await page.getByRole('menuitem', { name: 'Kurs absagen' }).click();
  await expect(page.getByRole('heading', { name: /absagen/i })).toBeVisible();
});

test('UX3 — Export Letzter Monat zeigt Vorschau und Chip', async ({ page }) => {
  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/payments?tenant=demoalpha');
  await page.getByRole('button', { name: 'Exportieren' }).click();
  await expect(page.getByTestId('export-preset-last_month')).toBeVisible();
  await page.getByTestId('export-preset-last_month').click();
  await expect(page.getByTestId('export-preview')).toContainText(/Zahlung/);
  await expect(page.getByTestId('payments-export-run')).toBeEnabled();
});
