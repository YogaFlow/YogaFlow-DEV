/**
 * Story UX-6 — Teilnehmerliste Zahlstatus, Offen zweigeteilt, kein Check-in-Text.
 * Studio: e2eapp.
 */
import { expect, test, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertDevEnv,
  berlinDate,
  clientMitTenant,
  kursAnlegen,
  ladeEnv,
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
const EMAIL_PREFIX = 'e2eappux6';

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

test('UX6 — Kommt noch, Zahlt vor Ort, Bar erhalten, kein Check-in', async ({ page }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  const laufId = `ux6${Date.now().toString(36)}`;

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E UX6', slug: SLUG })
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
    const teacher = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.teacher@example.com`,
      vorname: 'Teacher',
      nachname: laufId,
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });
    const vera = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.vera@example.com`,
      vorname: 'Vera',
      nachname: 'Vorort',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });

    const future = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `UX6 Zukunft ${laufId}`,
      date: berlinDate(3),
      time: '18:00:00',
      end_time: '19:00:00',
      price: 18,
    });
    const started = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `UX6 Begonnen ${laufId}`,
      date: berlinDate(1),
      time: '09:00:00',
      end_time: '10:00:00',
      price: 18,
    });

    for (const courseId of [future.id, started.id]) {
      const { error } = await admin.from('registrations').insert({
        tenant_id: tenant.id,
        course_id: courseId,
        user_id: vera.id,
        status: 'registered',
        is_waitlist: false,
        coverage_status: 'open',
        price_cents_at_booking: 1800,
      });
      if (error) throw new Error(error.message);
    }
    await admin.from('courses').update({ date: berlinDate(-1) }).eq('id', started.id);

    const ownerClient = await login(url, anon, owner.email, password, SLUG);
    const {
      data: { session },
    } = await ownerClient.auth.getSession();
    if (!session) throw new Error('keine Session');

    await alsAngemeldet(page, session);
    await page.goto(`/payments?tab=offen&tenant=${SLUG}`);

    await expect(page.getByText('Überfällig')).toBeVisible();
    const upcomingToggle = page.getByTestId('upcoming-open-toggle');
    await expect(upcomingToggle).toBeVisible();
    await upcomingToggle.click();
    await expect(page.getByText(`UX6 Zukunft ${laufId}`)).toBeVisible();

    await page.goto(`/course/${future.id}/participants?tenant=${SLUG}`);
    await expect(page.getByText('Zahlt vor Ort')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bar erhalten' })).toBeVisible();

    await page.getByRole('button', { name: 'Bar erhalten' }).click();
    await expect(page.getByText(/bar vermerkt/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Bezahlt · bar')).toBeVisible();

    await page.goto(`/course/${started.id}/participants?tenant=${SLUG}`);
    await expect(page.getByText('Offen', { exact: true }).first()).toBeVisible();

    await page.goto(`/payments?tab=offen&tenant=${SLUG}`);
    await expect(page.getByText('Vera Vorort')).toBeVisible();

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/Check-in|Einchecken/);

    const srcHit = await page.evaluate(async () => {
      const res = await fetch('/assets/');
      return res.status;
    });
    void srcHit;
  } finally {
    await plattform(admin, platformWas);
    try {
      await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    } catch (e) {
      console.warn('cleanup', e);
    }
  }
});
