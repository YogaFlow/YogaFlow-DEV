/**
 * DEV-Helfer für Playwright: Guard, demoalpha-Kontext, Testpersonen/-kurse mit Lauf-ID,
 * Online-Zahlung über Stripe-Testmodus, Jobs anstoßen, Sitzung in den Browser legen.
 * Aufräumen nur über RPCs (cancel_course, remove_member) und Auth-Admin.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-expect-error — .mjs ohne Typen
import { assertDevGuard, ERLAUBTE_DEV_REF } from '../scripts/dev/dev_guard.mjs';
import {
  assertDevEnv,
  berlinDate,
  clientMitTenant,
  kursAnlegen,
  ladeEnv,
  legalProfileSetzen,
  login,
  nutzerAnlegen,
  plattform,
  plattformStand,
  seedPasswort,
  // @ts-expect-error — .mjs ohne Typen
} from '../scripts/test/_helpers.mjs';

export const SLUG = 'demoalpha';
const root = join(import.meta.dirname, '..');

function ladeEnvDatei(datei: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const zeile of readFileSync(join(root, datei), 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export type DevCtx = {
  url: string;
  anon: string;
  admin: SupabaseClient;
  owner: SupabaseClient;
  ownerSession: unknown;
  tenantId: string;
  teacherId: string;
  accountRef: string;
  stripeKey: string;
  jobsSecret: string;
  password: string;
  laufId: string;
  courseIds: string[];
  members: { id: string; auth_user_id: string; email: string }[];
  restore: () => Promise<void>;
};

export async function devKontext(): Promise<DevCtx> {
  assertDevGuard();
  const env = { ...ladeEnv(), ...ladeEnvDatei('supabase/.env.dev') };
  const { url, anon, service } = assertDevEnv(env) as { url: string; anon: string; service: string };
  if (!url.includes(ERLAUBTE_DEV_REF)) throw new Error('E2E nur gegen DEV');
  const stripeKey = env.STRIPE_SECRET_KEY ?? '';
  if (!/^(sk|rk)_test_/.test(stripeKey)) throw new Error('STRIPE_SECRET_KEY (test) fehlt');
  if ((env.PAYMENTS_MODE ?? '').trim() !== 'test') throw new Error('Nur PAYMENTS_MODE=test');
  const jobsSecret = (env.PROVIDER_JOBS_SECRET ?? '').trim();
  const password: string = seedPasswort();
  const admin: SupabaseClient = clientMitTenant(url, service, SLUG);

  const { data: studio } = await admin.from('tenants').select('id').eq('slug', SLUG).single();
  if (!studio) throw new Error('demoalpha fehlt');
  const tenantId = studio.id as string;
  const { data: accounts } = await admin
    .from('provider_accounts')
    .select('provider_ref, onboarding_status, disconnected_at')
    .eq('tenant_id', tenantId)
    .eq('provider', 'stripe');
  const active = (accounts ?? []).find(
    (a) => a.onboarding_status === 'active' && a.disconnected_at == null && a.provider_ref,
  );
  if (!active) throw new Error('demoalpha braucht aktives Stripe-Testkonto');

  const { data: ownerRow } = await admin
    .from('users')
    .select('id, email')
    .eq('tenant_id', tenantId)
    .eq('role', 'owner')
    .limit(1)
    .single();
  const { data: teacherRow } = await admin
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('role', ['teacher', 'owner', 'admin'])
    .limit(1)
    .single();
  if (!ownerRow || !teacherRow) throw new Error('Owner/Lehrende fehlen');

  const owner: SupabaseClient = await login(url, anon, ownerRow.email, password, SLUG);
  const { data: sess } = await owner.auth.getSession();

  const platformWas = await plattformStand(admin);
  await plattform(admin, true);
  const { data: setup } = await owner.rpc('get_payment_setup_status');
  const onlineWas = setup?.online_payments_enabled === true;
  const onsiteWas = setup?.allow_onsite_payment !== false;
  if (!setup?.tax_setting_present) {
    await owner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
  }
  await legalProfileSetzen(owner);
  // B2: Online einschalten braucht aktuelle AVV-Zustimmung (Hash = normalisierter MD).
  const { AVV_CONTENT_HASH, AVV_VERSION } = await import('../src/lib/legalVersions.ts');
  await owner.rpc('accept_legal_document', {
    p_document: 'avv',
    p_version: AVV_VERSION,
    p_content_hash: AVV_CONTENT_HASH,
  });
  await owner.rpc('set_online_payments_enabled', { p_enabled: true });
  await owner.rpc('set_allow_onsite_payment', { p_allow: false });

  const ctx: DevCtx = {
    url,
    anon,
    admin,
    owner,
    ownerSession: sess.session,
    tenantId,
    teacherId: teacherRow.id,
    accountRef: active.provider_ref,
    stripeKey,
    jobsSecret,
    password,
    laufId: `e2e${Date.now().toString(36)}`,
    courseIds: [],
    members: [],
    restore: async () => {
      for (const id of ctx.courseIds) {
        const r = await owner.rpc('cancel_course', { p_course_id: id, p_scope: 'single' });
        if (r.error) console.warn('Aufräumen cancel_course:', r.error.message);
      }
      for (const m of ctx.members) {
        const r = await owner.rpc('remove_member', { p_member_id: m.id });
        if (r.error) console.warn('Aufräumen remove_member:', r.error.message);
        const d = await admin.auth.admin.deleteUser(m.auth_user_id);
        if (d.error) console.warn('Aufräumen auth:', d.error.message);
      }
      await owner.rpc('set_online_payments_enabled', { p_enabled: onlineWas });
      await owner.rpc('set_allow_onsite_payment', { p_allow: onsiteWas });
      await plattform(admin, platformWas);
    },
  };
  return ctx;
}

export async function neuerNutzer(ctx: DevCtx, tag: string, vorname: string) {
  const p = await nutzerAnlegen(ctx.admin, {
    email: `${ctx.laufId}.${tag}@example.com`,
    vorname,
    nachname: `E2E ${ctx.laufId}`,
    rolle: 'user',
    tenantId: ctx.tenantId,
    password: ctx.password,
  });
  ctx.members.push({ id: p.id, auth_user_id: p.auth_user_id, email: p.email });
  const client: SupabaseClient = await login(ctx.url, ctx.anon, p.email, ctx.password, SLUG);
  const { data } = await client.auth.getSession();
  return { id: p.id as string, email: p.email as string, client, session: data.session };
}

export async function neuerKurs(ctx: DevCtx, suffix: string, daysAhead = 6) {
  const kurs = await kursAnlegen(ctx.admin, ctx.tenantId, ctx.teacherId, {
    title: `E2E ${suffix} ${ctx.laufId}`,
    date: berlinDate(daysAhead),
    time: '09:00:00',
    end_time: '10:00:00',
    price: 24,
    max_participants: 8,
    pass_eligible: false,
  });
  ctx.courseIds.push(kurs.id);
  return kurs as { id: string; title: string };
}

export async function stripeJobsAnstossen(ctx: DevCtx) {
  if (!ctx.jobsSecret) return;
  await fetch(`${ctx.url}/functions/v1/payments-jobs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ctx.jobsSecret}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
}

/** Buchen + online bezahlen über die API (pm_card_visa = 4242…). */
export async function buchenUndBezahlen(
  ctx: DevCtx,
  person: { client: SupabaseClient; session: { access_token: string } | null },
  courseId: string,
) {
  const book = await person.client.rpc('register_for_course', { p_course_id: courseId });
  if (!book.data?.success) throw new Error('Buchung: ' + JSON.stringify(book.data ?? book.error));
  const regId = book.data.registration_id as string;
  const res = await fetch(`${ctx.url}/functions/v1/payments-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${person.session?.access_token}`,
      apikey: ctx.anon,
      'x-omlify-tenant': SLUG,
    },
    body: JSON.stringify({ action: 'prepare', registration_id: regId }),
  });
  const prep = await res.json();
  if (res.status !== 200) throw new Error('prepare: ' + JSON.stringify(prep));
  const { data: att } = await ctx.admin
    .from('payment_attempts')
    .select('provider_ref')
    .eq('id', prep.attempt_id)
    .single();
  const conf = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(att!.provider_ref)}/confirm`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ctx.stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': ctx.accountRef,
      },
      body: new URLSearchParams({ payment_method: 'pm_card_visa' }),
    },
  );
  const pi = await conf.json();
  if (pi.status !== 'succeeded') throw new Error('confirm: ' + pi.status);
  await bisBezahlt(ctx, regId);
  return regId;
}

export async function bisBezahlt(ctx: DevCtx, regId: string, maxMs = 90_000) {
  await warteAuf(async () => {
    const { data } = await ctx.admin
      .from('registrations')
      .select('status, coverage_status')
      .eq('id', regId)
      .single();
    return data?.status === 'registered' && data?.coverage_status === 'paid';
  }, maxMs, 'bezahlt');
}

export async function warteAuf(pruef: () => Promise<boolean>, maxMs: number, label: string) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await pruef()) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`${label}: Timeout nach ${maxMs} ms`);
}

/** Supabase-Sitzung vor dem ersten Laden in den Browser legen (kein Login-Formular). */
export async function alsAngemeldet(page: Page, session: unknown) {
  const storageKey = `sb-${ERLAUBTE_DEV_REF}-auth-token`;
  await page.addInitScript(
    ([key, value, slug]) => {
      window.localStorage.setItem(key, value);
      window.sessionStorage.setItem('__dev_tenant_slug__', slug);
    },
    [storageKey, JSON.stringify(session), SLUG] as const,
  );
}

export async function screenshot(page: Page, name: string, folder = '3_2c') {
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: width === 360 ? 780 : 900 });
    await page.screenshot({
      path: join(root, 'docs', 'screenshots', folder, `${name}-${width}.png`),
      fullPage: false,
    });
  }
}
