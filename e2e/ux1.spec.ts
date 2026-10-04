/**
 * Story UX-1 — Erstatten in einem Schritt, Zahlungen-Reiter, Einstellungen (nur DEV).
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
import { login, nutzerAnlegen } from '../scripts/test/_helpers.mjs';

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

test('1 — Owner erstattet in der Kasse Alles in einem Schritt', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'Alles');
  const person = await neuerNutzer(ctx, 'all', 'Thea');
  const regId = await buchenUndBezahlen(ctx, person, kurs.id);

  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/course/${kurs.id}/kassieren?tenant=demoalpha`);
  await expect(page.getByText('Online bezahlt · 24,00 €').first()).toBeVisible();
  await page.getByRole('button', { name: 'Erstatten' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab', { name: /Alles/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Kulanz' }).click();
  await screenshot(page, 'kasse-erstatten-alles', 'ux1');
  await dialog.getByRole('button', { name: '24,00 € erstatten' }).click();
  await expect(dialog.getByTestId('refund-success')).toContainText('24,00 € werden erstattet');
  await warteAuf(
    async () => (await refundStatus(regId)).some((r) => r.amount_cents === 2400),
    30_000,
    'Vollerstattung angelegt',
  );
});

test('2 — Teilbetrag zu hoch sperrt, dann gültig Erfolg', async ({ page }) => {
  const kurs = await neuerKurs(ctx, 'Teil');
  const person = await neuerNutzer(ctx, 'teil', 'Uta');
  const regId = await buchenUndBezahlen(ctx, person, kurs.id);

  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto(`/course/${kurs.id}/kassieren?tenant=demoalpha`);
  await page.getByRole('button', { name: 'Erstatten' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Teilbetrag' }).click();
  await dialog.locator('input[inputmode="decimal"]').fill('99,00');
  await expect(dialog.getByText('Höchstens 24,00 € möglich')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /erstatten$/ })).toBeDisabled();
  await screenshot(page, 'kasse-erstatten-zu-hoch', 'ux1');
  await dialog.locator('input[inputmode="decimal"]').fill('10,00');
  await expect(dialog.getByText('Höchstens 24,00 € möglich')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Krankheit' }).click();
  await dialog.getByRole('button', { name: '10,00 € erstatten' }).click();
  await expect(dialog.getByTestId('refund-success')).toContainText('10,00 € werden erstattet');
  await warteAuf(
    async () => (await refundStatus(regId)).some((r) => r.amount_cents === 1000),
    30_000,
    'Teilerstattung angelegt',
  );
  await stripeJobsAnstossen(ctx);
});

test('3 — Zahlungen: Reiter, URL, alte Route leitet um', async ({ page }) => {
  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/open-payments?tenant=demoalpha');
  await expect(page).toHaveURL(/\/payments\?.*tab=offen/);
  await expect(page.getByRole('tab', { name: /Offen/ })).toHaveAttribute('aria-selected', 'true');
  await screenshot(page, 'zahlungen-offen', 'ux1');
  await page.getByRole('tab', { name: 'Alle' }).click();
  await expect(page).toHaveURL(/tab=alle/);
  await expect(page.getByRole('tab', { name: 'Alle' })).toHaveAttribute('aria-selected', 'true');
  await screenshot(page, 'zahlungen-alle', 'ux1');
});

test('4 — Einstellungen: Übersicht → Buchungen → Stornofrist speichern', async ({ page }) => {
  const { data: tenant } = await ctx.admin
    .from('tenants')
    .select('cancellation_window_hours')
    .eq('id', ctx.tenantId)
    .single();
  const previous =
    typeof tenant?.cancellation_window_hours === 'number' ? tenant.cancellation_window_hours : 24;
  const next = previous === 24 ? 12 : 24;

  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/settings?tenant=demoalpha');
  await expect(page.getByTestId('settings-categories')).toBeVisible();
  await expect(page.getByTestId('settings-cat-buchungen')).toContainText(`Stornofrist ${previous} h`);
  await screenshot(page, 'einstellungen-uebersicht', 'ux1');
  await page.getByTestId('settings-cat-buchungen').click();
  await expect(page).toHaveURL(/\/settings\/buchungen/);
  await page.getByTestId('cancellation-window').fill(String(next));
  await page.getByRole('button', { name: 'Einstellungen speichern' }).click();
  await expect(page.getByText('Die Buchungseinstellungen sind gespeichert.')).toBeVisible();
  await page.getByRole('link', { name: 'Einstellungen' }).click();
  await expect(page.getByTestId('settings-cat-buchungen')).toContainText(`Stornofrist ${next} h`);
  await screenshot(page, 'einstellungen-buchungen', 'ux1');

  await ctx.owner.rpc('update_booking_settings', {
    p_default_max_participants: null,
    p_cancellation_window_hours: previous,
  });
});

test('5 — Aufmerksamkeit bei fehlendem Steuerstatus (Test-Studio)', async ({ page }) => {
  const slug = `ux1${ctx.laufId.slice(-6)}`.replace(/[^a-z0-9]/g, '').slice(0, 30);
  const { data: studio, error: tenantErr } = await ctx.admin
    .from('tenants')
    .insert({ name: `UX1 ${ctx.laufId}`, slug })
    .select('id')
    .single();
  if (tenantErr || !studio) throw new Error('Test-Studio: ' + (tenantErr?.message ?? 'fehlt'));
  const owner = await nutzerAnlegen(ctx.admin, {
    email: `${ctx.laufId}.tax@example.com`,
    vorname: 'Tax',
    nachname: 'Test',
    rolle: 'owner',
    tenantId: studio.id,
    password: ctx.password,
  });
  try {
    const client = await login(ctx.url, ctx.anon, owner.email, ctx.password, slug);
    const { data: sess } = await client.auth.getSession();
    if (!sess.session) throw new Error('Login Test-Studio fehlgeschlagen');
    await alsAngemeldet(page, sess.session);
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`/settings?tenant=${slug}`);
    await expect(page.getByTestId('settings-attention')).toContainText('Steuerstatus fehlt');
    await screenshot(page, 'einstellungen-aufmerksamkeit', 'ux1');
  } finally {
    const del = await ctx.admin.rpc('delete_tenant_complete', { p_tenant_id: studio.id });
    if (del.error) console.warn('Aufräumen Test-Studio:', del.error.message);
    const authDel = await ctx.admin.auth.admin.deleteUser(owner.auth_user_id);
    if (authDel.error) console.warn('Aufräumen Test-Owner:', authDel.error.message);
  }
});
