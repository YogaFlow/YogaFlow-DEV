/**
 * Story UX-2 Teil B3 — Desktop-Layouts; mobile 360 px pixelgleich zur Referenz.
 * Baselines: toHaveScreenshot (vor Layout-CSS anlegen, danach vergleichen).
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

const SHOT = {
  animations: 'disabled' as const,
  caret: 'hide' as const,
  fullPage: false,
};

test('B3 — Kursdetail 360 Referenz (mobil unverändert)', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'B3Detail');
  const { error: upErr } = await ctx.admin
    .from('courses')
    .update({
      title: 'UX2 B3 Kursdetail',
      date: '2026-12-15',
      time: '09:00:00',
      end_time: '10:00:00',
      description: 'Beschreibung für den Screenshot-Vergleich der mobilen Kursdetailseite.',
      location: 'Neuss',
      price: 24,
      max_participants: 8,
    })
    .eq('id', kurs.id);
  if (upErr) throw new Error('Kurs stabilisieren: ' + upErr.message);

  const person = await neuerNutzer(ctx, 'b3d', 'Yvonne');
  await ctx.admin
    .from('users')
    .update({ first_name: 'Yvonne', last_name: 'Beispiel' })
    .eq('id', person.id);

  await alsAngemeldet(page, person.session);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  await expect(page.getByRole('heading', { name: 'UX2 B3 Kursdetail' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: /Zur Buchung|Weiter zur Buchung|Anmelden/ })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('coursedetail-360.png', SHOT);
});

test('B3 — Kasse 360 Referenz (mobil unverändert)', async ({ page }) => {
  // Vor-Ort erlaubt → Anmeldung ohne pending_payment (kein driftender Hold-Countdown).
  await ctx.owner.rpc('set_allow_onsite_payment', { p_allow: true });
  try {
    const kurs = await neuerKurs(ctx, 'B3Kasse');
    const { error: upErr } = await ctx.admin
      .from('courses')
      .update({
        title: 'UX2 B3 Kasse',
        date: '2026-12-16',
        time: '11:00:00',
        end_time: '12:00:00',
        price: 24,
        max_participants: 8,
      })
      .eq('id', kurs.id);
    if (upErr) throw new Error('Kurs stabilisieren: ' + upErr.message);

    const person = await neuerNutzer(ctx, 'b3k', 'Clara');
    await ctx.admin
      .from('users')
      .update({ first_name: 'Clara', last_name: 'Beispiel' })
      .eq('id', person.id);
    const book = await person.client.rpc('register_for_course', { p_course_id: kurs.id });
    expect(book.data?.success).toBe(true);

    await alsAngemeldet(page, ctx.ownerSession);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/course/${kurs.id}/kassieren?tenant=demoalpha`);
    await expect(page.getByRole('heading', { name: 'UX2 B3 Kasse' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('.lg\\:hidden').getByText('Clara Beispiel')).toBeVisible();
    await expect(page.getByText('1 offen · 0 erledigt')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('kasse-360.png', SHOT);
  } finally {
    await ctx.owner.rpc('set_allow_onsite_payment', { p_allow: false });
  }
});

test('B3 — Desktop Kursdetail ab 1280', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'B3DeskD');
  await ctx.admin
    .from('courses')
    .update({
      title: 'UX2 B3 Desktop',
      date: '2026-12-17',
      time: '14:00:00',
      end_time: '15:00:00',
      description:
        'Längere Beschreibung, damit die linke Spalte auf Desktop scrollt und die Buchungskarte kleben bleibt.',
      location: 'Neuss',
      price: 24,
      max_participants: 8,
    })
    .eq('id', kurs.id);

  const person = await neuerNutzer(ctx, 'b3deskd', 'Doris');
  await ctx.admin
    .from('users')
    .update({ first_name: 'Doris', last_name: 'Beispiel' })
    .eq('id', person.id);

  await alsAngemeldet(page, person.session);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  await expect(page.getByTestId('course-detail-layout')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('course-booking-card')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('coursedetail-1280.png', SHOT);
});

test('B3 — Desktop Kasse ab 1280', async ({ page }) => {
  await ctx.owner.rpc('set_allow_onsite_payment', { p_allow: true });
  try {
    const kurs = await neuerKurs(ctx, 'B3DeskK');
    await ctx.admin
      .from('courses')
      .update({
        title: 'UX2 B3 Desktop Kasse',
        date: '2026-12-18',
        time: '16:00:00',
        end_time: '17:00:00',
        price: 24,
        max_participants: 8,
      })
      .eq('id', kurs.id);

    const person = await neuerNutzer(ctx, 'b3deskk', 'Elena');
    await ctx.admin
      .from('users')
      .update({ first_name: 'Elena', last_name: 'Beispiel' })
      .eq('id', person.id);
    const book = await person.client.rpc('register_for_course', { p_course_id: kurs.id });
    expect(book.data?.success).toBe(true);

    await alsAngemeldet(page, ctx.ownerSession);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/course/${kurs.id}/kassieren?tenant=demoalpha`);
    await expect(page.getByTestId('checkout-desktop-table')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('checkout-attendance')).toHaveText('1 angemeldet');
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Zahlung' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Kurskarte' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Aktion' })).toBeVisible();
    await expect(
      page.getByTestId('checkout-desktop-table').getByText('Elena Beispiel'),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('kasse-1280.png', SHOT);
  } finally {
    await ctx.owner.rpc('set_allow_onsite_payment', { p_allow: false });
  }
});
