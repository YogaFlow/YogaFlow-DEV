/**
 * Story UX-8 — Übersicht „Zu erledigen“. Studio: e2eapp.
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
const EMAIL_PREFIX = 'e2eappux8';

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

test.describe.configure({ mode: 'serial' });

test('UX8 — zurückgeben, offen+vor Ort ohne Doppelung, leer', async ({ page }) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  const laufId = `ux8${Date.now().toString(36)}`;

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E UX8', slug: SLUG })
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
    const nina = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.nina@example.com`,
      vorname: 'Nina',
      nachname: 'Neu',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);

    // (1) Vor-Ort bezahlt, Kurs abgesagt → zurückgeben
    const cancelKurs = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `UX8 Absage ${laufId}`,
      date: berlinDate(2),
      time: '10:00:00',
      end_time: '11:00:00',
      price: 18,
    });
    const { data: regCancel, error: re } = await admin
      .from('registrations')
      .insert({
        tenant_id: tenant.id,
        course_id: cancelKurs.id,
        user_id: vera.id,
        status: 'registered',
        coverage_status: 'open',
        price_cents_at_booking: 1800,
      })
      .select('id')
      .single();
    if (re) throw new Error(re.message);
    const pay = await asOwner.rpc('record_manual_payment', {
      p_registration_id: regCancel.id,
      p_method: 'cash',
      p_amount_cents: 1800,
    });
    if (!pay.data?.success) throw new Error(JSON.stringify(pay.data ?? pay.error));
    const cancel = await asOwner.rpc('cancel_course', {
      p_course_id: cancelKurs.id,
      p_scope: 'single',
      p_note: 'E2E UX8',
    });
    if (!cancel.data?.success) throw new Error(JSON.stringify(cancel.data ?? cancel.error));

    // (2) Gestern offen + heute vor Ort
    const yin = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `UX8 Yin ${laufId}`,
      date: berlinDate(1),
      time: '10:00:00',
      end_time: '11:00:00',
      price: 16,
    });
    await admin.from('registrations').insert({
      tenant_id: tenant.id,
      course_id: yin.id,
      user_id: nina.id,
      status: 'registered',
      coverage_status: 'open',
      price_cents_at_booking: 1600,
    });
    await admin.from('courses').update({ date: berlinDate(-1) }).eq('id', yin.id);

    const start = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const hh = String(start.getHours()).padStart(2, '0');
    const mm = String(start.getMinutes()).padStart(2, '0');
    const hatha = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: `UX8 Hatha ${laufId}`,
      date: berlinDate(0),
      time: `${hh}:${mm}:00`,
      end_time: `${String((start.getHours() + 1) % 24).padStart(2, '0')}:${mm}:00`,
      price: 18,
    });
    await admin.from('registrations').insert({
      tenant_id: tenant.id,
      course_id: hatha.id,
      user_id: vera.id,
      status: 'registered',
      coverage_status: 'open',
      price_cents_at_booking: 1800,
    });

    const ownerSession = (await asOwner.auth.getSession()).data.session;
    await alsAngemeldet(page, ownerSession);
    await page.goto(`/?tenant=${SLUG}`);
    await expect(page.getByTestId('todo-card')).toBeVisible();
    await expect(page.getByTestId('todo-return_onsite')).toContainText(/zurückgeben/);
    await expect(page.getByTestId('todo-payment_open')).toContainText(/Zahlung offen/);
    await expect(page.getByTestId('todo-pay_onsite')).toContainText(/zahlen vor Ort/);
    // Nina nicht doppelt: eine payment_open-Zeile für Yin
    await expect(page.getByTestId('todo-payment_open')).toHaveCount(1);

    // (3) Leerzustand: Rückgabe vermerken + offene Zahlungen kassieren
    const rev = await asOwner.rpc('reverse_manual_payment', {
      p_payment_id: pay.data.payment_id,
    });
    if (!rev.data?.success) throw new Error('reverse: ' + JSON.stringify(rev.data ?? rev.error));

    const { data: ninaReg } = await admin
      .from('registrations')
      .select('id')
      .eq('course_id', yin.id)
      .eq('user_id', nina.id)
      .single();
    await asOwner.rpc('record_manual_payment', {
      p_registration_id: ninaReg!.id,
      p_method: 'cash',
      p_amount_cents: 1600,
    });
    const { data: veraHatha } = await admin
      .from('registrations')
      .select('id')
      .eq('course_id', hatha.id)
      .eq('user_id', vera.id)
      .single();
    await asOwner.rpc('record_manual_payment', {
      p_registration_id: veraHatha!.id,
      p_method: 'cash',
      p_amount_cents: 1800,
    });

    await page.reload();
    await expect(page.getByTestId('todo-empty')).toContainText(/Alles erledigt/);
  } finally {
    await plattform(admin, platformWas);
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
  }
});
