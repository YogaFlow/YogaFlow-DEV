/**
 * Story UX-2 Teil A — Checkout-Fuß, Legal-Pop-up, Abdunklung (nur DEV).
 */
import { expect, test } from '@playwright/test';
import {
  alsAngemeldet,
  devKontext,
  neuerKurs,
  neuerNutzer,
  screenshot,
  type DevCtx,
} from './_dev';
import { AVV_CONTENT_HASH, AVV_VERSION } from '../src/lib/legalVersions';
import { LEGAL_DOCUMENTS } from '../src/generated/legalDocuments';

let ctx: DevCtx;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ctx = await devKontext();
});

test.afterAll(async () => {
  await ctx?.restore();
});

test('A — Checkout fester Fuß + Legal-Pop-up + Hash', async ({ page }) => {
  expect(LEGAL_DOCUMENTS.auftragsverarbeitung.pageHash).toBe(AVV_CONTENT_HASH);
  expect(LEGAL_DOCUMENTS.auftragsverarbeitung.standDate).toBe(AVV_VERSION);

  const kurs = await neuerKurs(ctx, 'Ux2A');
  const person = await neuerNutzer(ctx, 'ux2a', 'Yvonne');
  const book = await person.client.rpc('register_for_course', { p_course_id: kurs.id });
  expect(book.data?.success).toBe(true);

  await alsAngemeldet(page, person.session);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(`/course/${kurs.id}?tenant=demoalpha`);
  await page.getByRole('button', { name: 'Jetzt bezahlen' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('booking-summary')).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByTestId('checkout-sticky-footer')).toBeVisible();
  await expect(dialog.getByTestId('checkout-price')).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Zahlungspflichtig buchen' })).toBeInViewport();
  await expect(page.getByTestId('modal-backdrop')).toBeVisible();

  await dialog.getByRole('button', { name: 'AGB' }).click();
  await expect(page.getByTestId('legal-document-body')).toBeVisible();
  await page.getByTestId('legal-sheet-close').click();
  await expect(page.getByTestId('legal-document-body')).toHaveCount(0);

  await screenshot(page, 'checkout-360', 'ux2');
  await page.setViewportSize({ width: 1280, height: 800 });
  await screenshot(page, 'checkout-1280', 'ux2');
});

test('A — AVV Volltext-Pop-up statt Übersicht', async ({ page }) => {
  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/settings/rechtliches?tenant=demoalpha');
  await expect(page.getByTestId('avv-section')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('avv-open-fulltext').click();
  const body = page.getByTestId('legal-document-body');
  await expect(body).toBeVisible();
  await expect(body).toContainText(/Art\.?\s*28|Auftragsverarbeitung/i);
  const hash = await body.getAttribute('data-hash');
  expect(hash).toBe(AVV_CONTENT_HASH);
  await screenshot(page, 'avv-popup-360', 'ux2');
});
