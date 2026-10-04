/**
 * Story UX-4 — Toast-Undo Tippen, ⋯ mobil, Erfolgszeile, Kalender-Reihenfolge.
 */
import { expect, test } from '@playwright/test';
import {
  alsAngemeldet,
  buchenUndBezahlen,
  devKontext,
  neuerKurs,
  neuerNutzer,
  screenshot,
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

test('UX4 — Abmelden (bar) → Tippen Rückgängig → wieder angemeldet', async ({ page }) => {
  await ctx.owner.rpc('set_allow_onsite_payment', { p_allow: true });
  const kurs = await neuerKurs(ctx, 'Ux4Undo');
  const person = await neuerNutzer(ctx, 'ux4u', 'Ute');
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
  const undo = page.getByTestId('toast-undo');
  await expect(undo).toBeVisible();
  const bar = page.getByTestId('toast-progress');
  const fill = page.getByTestId('toast-progress-fill');
  await expect(bar).toBeVisible();
  const width1 = await fill.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
  await page.waitForTimeout(900);
  const width2 = await fill.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
  expect(width1).toBeGreaterThan(0);
  expect(width2).toBeLessThan(width1);
  await page.screenshot({
    path: 'docs/screenshots/ux4/toast-undo-360.png',
    fullPage: false,
  });
  await undo.click();
  await expect(page.locator('.fixed').getByTestId('course-unregister')).toBeVisible({
    timeout: 20_000,
  });
});

test('UX4 — Abmelden online bezahlt → Toast ohne Rückgängig', async ({ page }) => {
  await ctx.owner.rpc('set_allow_onsite_payment', { p_allow: false });
  await ctx.owner.rpc('set_online_payments_enabled', { p_enabled: true });
  const kurs = await neuerKurs(ctx, 'Ux4Paid');
  const person = await neuerNutzer(ctx, 'ux4p', 'Paul');
  await buchenUndBezahlen(ctx, person, kurs.id);

  await alsAngemeldet(page, person.session);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  await expect(page.locator('.fixed').getByTestId('course-unregister')).toBeVisible({
    timeout: 20_000,
  });
  await page.locator('.fixed').getByTestId('course-unregister').click();
  await page.getByTestId('modal-backdrop').getByRole('button', { name: 'Abmelden' }).click();
  await expect(page.getByTestId('toast-success')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('toast-undo')).toHaveCount(0);
});

test('UX4 — ⋯-Menü mobil öffnet Absage', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'Ux4Menu');
  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  await expect(page.getByTestId('course-detail-menu')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('course-detail-menu').click();
  await page.getByRole('menuitem', { name: 'Kurs absagen' }).click();
  await expect(page.getByRole('heading', { name: /absagen/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await screenshot(page, 'coursedetail-menu', 'ux4');
});

test('UX4 — Kalender-Seite Reihenfolge iPhone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      get: () =>
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
  });
  // Ohne Token: Fehlerseite, aber Actions nur bei Meta — daher Mock via route
  await page.route('**/functions/v1/calendar-ics**', async (route) => {
    if (!route.request().url().includes('format=json')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/calendar',
        body: 'BEGIN:VCALENDAR\nEND:VCALENDAR',
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Test Kurs',
        date: '2026-10-31',
        time: '10:30',
        dateLabel: 'Sa, 31. Okt',
        timeLabel: '10:30',
        place: 'Studio',
        studioName: 'Demo',
        brandColor: '#2F5A4E',
        googleUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
        icsUrl: 'https://example.test/ics',
        icsInlineUrl: 'https://example.test/ics?inline=1',
      }),
    });
  });
  await page.goto('/calendar?tenant=demoalpha&t=fake.token');
  await expect(page.getByTestId('calendar-invite-page')).toBeVisible();
  const actions = page.getByTestId('calendar-actions').locator('button');
  await expect(actions.first()).toHaveAttribute('data-testid', 'calendar-action-apple');
  await expect(actions.first()).toHaveAttribute('data-primary', '1');
  await page.screenshot({
    path: 'docs/screenshots/ux4/calendar-ios-360.png',
    fullPage: false,
  });
});
