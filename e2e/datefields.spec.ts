/**
 * Kleine Punkte e) — Datumsfelder deutsch anzeigen, ISO unverändert senden (nur DEV, demoalpha).
 * Liest nur: kein Speichern des Steuerstatus, kein Abhaken.
 */
import { expect, test, type Page } from '@playwright/test';
import { alsAngemeldet, devKontext, screenshot, type DevCtx } from './_dev';

let ctx: DevCtx;

test.beforeAll(async () => {
  ctx = await devKontext();
});

test.afterAll(async () => {
  await ctx?.restore();
});

const GERMAN = /^\d{2}\.\d{2}\.\d{4}$/;

function isoFromGerman(value: string): string {
  const [d, m, y] = value.split('.');
  return `${y}-${m}-${d}`;
}

async function ersterTagWaehlen(page: Page, inputSelector: string): Promise<string> {
  await page.locator(inputSelector).click();
  await page
    .locator('.react-datepicker__day--001:not(.react-datepicker__day--outside-month)')
    .first()
    .click();
  const value = await page.locator(inputSelector).inputValue();
  expect(value).toMatch(GERMAN);
  expect(value.startsWith('01.')).toBe(true);
  return isoFromGerman(value);
}

async function rpcBody(page: Page, name: string, action: () => Promise<unknown>) {
  const request = page.waitForRequest((req) => req.url().includes(`/rest/v1/rpc/${name}`));
  await action();
  return (await request).postDataJSON() as Record<string, unknown>;
}

test('Export-Zeitraum und Steuerstatus zeigen TT.MM.JJJJ und senden ISO', async ({ page }) => {
  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/settings?tenant=demoalpha#steuern');

  await page.getByRole('button', { name: 'Von–Bis' }).click();
  await expect(page.locator('#tax-export-from')).toHaveValue(GERMAN);
  await expect(page.locator('#tax-export-to')).toHaveValue(GERMAN);
  const fromIso = await ersterTagWaehlen(page, '#tax-export-from');
  const toIso = isoFromGerman(await page.locator('#tax-export-to').inputValue());
  const body = await rpcBody(page, 'export_ledger', () =>
    page.getByRole('button', { name: 'CSV herunterladen' }).click(),
  );
  expect(body.p_from).toBe(fromIso);
  expect(body.p_to).toBe(toIso);
  await screenshot(page, 'export-zeitraum', 'kleine_e');

  await page.getByRole('button', { name: 'Ändern' }).click();
  const field = page.locator('#tax-valid-from');
  await expect(field).toHaveValue(GERMAN);
  await field.click();
  await expect(page.locator('.react-datepicker__month').first()).toBeVisible();
  await screenshot(page, 'steuerstatus-kalender', 'kleine_e');
});

test('Abhaken „Alles vor dem“ sendet ISO an die Vorschau', async ({ page }) => {
  await alsAngemeldet(page, ctx.ownerSession);
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/open-payments?tenant=demoalpha');
  const field = page.locator('#pre-omlify-before');
  const visible = await field
    .waitFor({ state: 'visible', timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!visible, 'Keine offenen Zahlungen in demoalpha — Abschnitt wird nicht angezeigt.');

  await expect(field).toHaveValue(GERMAN);
  const sent: unknown[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/rest/v1/rpc/preview_pre_omlify_waive')) {
      sent.push((req.postDataJSON() as Record<string, unknown>).p_before);
    }
  });
  const iso = await ersterTagWaehlen(page, '#pre-omlify-before');
  await expect.poll(() => sent.includes(iso)).toBe(true);
  await screenshot(page, 'abhaken-datum', 'kleine_e');
});
