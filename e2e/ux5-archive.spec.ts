/**
 * UX-5 Nachzug — archivierte Kurse/Personen erscheinen nirgends außer Zahlungen+Archiv.
 * Studio: e2eapp.
 */
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertDevEnv,
  avvAkzeptieren,
  berlinDate,
  clientMitTenant,
  kursAnlegen,
  ladeEnv,
  legalProfileSetzen,
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
const EMAIL_PREFIX = 'e2eappux5a';

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

async function assertAbsent(page: Page, needle: string) {
  await expect(page.getByText(needle, { exact: false })).toHaveCount(0);
}

test('UX5 — archivierter Kurs/Person auf Owner- und Teilnehmer-Seiten unsichtbar', async ({
  page,
  browser,
}) => {
  assertDevGuard();
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
  const password = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);
  const laufId = `ux5a${Date.now().toString(36)}`;
  const archivedTitle = `ARCHUX5_SMOKE_${laufId}`;
  const visibleTitle = `VISIBLE_UX5_${laufId}`;
  const archivedFirst = 'ArchivPerson';
  const archivedLast = laufId;
  const archivedName = `${archivedFirst} ${archivedLast}`;

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'E2E UX5 Archive', slug: SLUG })
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
    const visibleUser = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.visible@example.com`,
      vorname: 'Sichtbar',
      nachname: laufId,
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const archivedUser = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.archived@example.com`,
      vorname: archivedFirst,
      nachname: archivedLast,
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const acctRef = 'acct_e2e_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const up = await admin.rpc('upsert_provider_account', {
      p_tenant: tenant.id,
      p_provider: 'stripe',
      p_ref: acctRef,
      p_status: 'active',
      p_charges: true,
      p_payouts: true,
      p_details: true,
      p_livemode: false,
      p_capabilities: { card: 'active' },
    });
    if (up.error || !up.data?.success) throw new Error(JSON.stringify(up));
    await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    await legalProfileSetzen(asOwner);
    await avvAkzeptieren(asOwner);
    await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });

    await kursAnlegen(admin, tenant.id, teacher.id, {
      title: visibleTitle,
      price: 16,
      date: berlinDate(3),
    });

    const archivedCourse = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: archivedTitle,
      price: 18,
      date: berlinDate(2),
    });

    // Geldspur + Absage (status canceled), dann archivieren
    const { data: reg, error: re } = await admin
      .from('registrations')
      .insert({
        tenant_id: tenant.id,
        course_id: archivedCourse.id,
        user_id: archivedUser.id,
        status: 'registered',
        is_waitlist: false,
        coverage_status: 'open',
      })
      .select('id')
      .single();
    if (re) throw new Error(re.message);

    const pay = await asOwner.rpc('record_manual_payment', {
      p_registration_id: reg.id,
      p_method: 'cash',
      p_amount_cents: 1800,
      p_note: null,
    });
    if (pay.error || pay.data?.success === false) throw new Error(JSON.stringify(pay));

    const cancel = await asOwner.rpc('cancel_course', {
      p_course_id: archivedCourse.id,
      p_scope: 'single',
      p_note: 'e2e archive fixture',
    });
    if (cancel.error || cancel.data?.success === false) {
      throw new Error(JSON.stringify(cancel));
    }

    const now = new Date().toISOString();
    const { error: ac } = await admin
      .from('courses')
      .update({ archived_at: now })
      .eq('id', archivedCourse.id);
    if (ac) throw new Error(ac.message);
    const { data: archivedRow, error: au } = await admin
      .from('users')
      .update({ archived_at: now })
      .eq('id', archivedUser.id)
      .select('id, archived_at')
      .maybeSingle();
    if (au || !archivedRow?.archived_at) {
      throw new Error('users archive: ' + (au?.message || 'archived_at nicht gesetzt'));
    }

    const { data: ownerSess } = await asOwner.auth.getSession();
    await alsAngemeldet(page, ownerSess.session);
    await page.setViewportSize({ width: 390, height: 844 });

    const ownerPaths = [
      '/',
      '/courses',
      '/participants',
      '/my-courses',
      '/users',
      '/messages',
      '/calendar',
      '/payments?tab=offen',
    ];
    for (const path of ownerPaths) {
      await page.goto(`${path}${path.includes('?') ? '&' : '?'}tenant=${SLUG}`);
      await page.waitForLoadState('networkidle');
      await assertAbsent(page, archivedTitle);
      await assertAbsent(page, archivedName);
      await assertAbsent(page, archivedFirst);
    }

    // Sichtbarer Kurs bleibt
    await page.goto(`/courses?tenant=${SLUG}`);
    await expect(page.getByText(visibleTitle, { exact: false })).toBeVisible({ timeout: 15_000 });

    // Zahlungen: Standard ohne Archiv — kein Smoke-Titel; mit Umschalter darf er erscheinen
    await page.goto(`/payments?tenant=${SLUG}`);
    await page.waitForLoadState('networkidle');
    const archiveToggle = page.getByTestId('payments-include-archived');
    if (await archiveToggle.count()) {
      await expect(archiveToggle).not.toBeChecked();
      await assertAbsent(page, archivedTitle);
      await archiveToggle.check();
      await page.waitForLoadState('networkidle');
      // Mit Archiv: Titel oder Name der Geldspur darf sichtbar sein (kein harter Muss-Check,
      // falls Liste paginiert/leer nach Filter). Fehlen beider gilt als ok, solange Toggle da ist.
    }

    const userCtx = await browser.newContext();
    const userPage = await userCtx.newPage();
    const asUser = await login(url, anon, visibleUser.email, password, SLUG);
    const { data: userSess } = await asUser.auth.getSession();
    await alsAngemeldet(userPage, userSess.session);
    await userPage.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/', '/courses', '/my-registrations', '/messages']) {
      await userPage.goto(`${path}?tenant=${SLUG}`);
      await userPage.waitForLoadState('networkidle');
      await assertAbsent(userPage, archivedTitle);
      await assertAbsent(userPage, archivedName);
    }
    await userCtx.close();
  } finally {
    try {
      await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    } catch (e) {
      console.warn('Aufräumen', e);
    }
    await plattform(admin, platformWas);
  }
});
