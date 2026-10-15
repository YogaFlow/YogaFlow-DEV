#!/usr/bin/env node
/**
 * 2.1b-b B2 — Rauchtest Versand (nur DEV).
 *
 * Voraussetzungen (Julius):
 *   - Migration 20260929160000 auf DEV
 *   - node scripts/dev/email_dispatch_secret.mjs
 *   - npm run secrets:dev && npm run functions:dev
 *   - SMTP / EMAIL_REDIRECT_TO in supabase/.env.dev gesetzt
 *
 * Fälle:
 *   1) Online-Pflicht → Nachrücken → bis 3 Min. warten bis email_deliveries.sent
 *   2) Zweite Nachrückerin abmelden vor Lauf → skipped / NOT_PENDING
 *
 * Verwendung: node scripts/test/s2_1b_b2_dispatch_smoke.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 's21bb2dsp';
const TITLE = 'S21B_B2_DISPATCH_SMOKE';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function ladeEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const zeile of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function seedPasswort() {
  const src = readFileSync(join(root, 'scripts', 'seed-dev.mjs'), 'utf8');
  const pass = src.match(/const DEMO_PASSWORT = '([^']+)'/);
  if (!pass) {
    console.error('DEMO_PASSWORT in scripts/seed-dev.mjs nicht gefunden');
    process.exit(1);
  }
  return pass[1];
}

function abbruch(text) {
  const fehler = new Error(text);
  fehler.abbruch = true;
  throw fehler;
}

function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

function ok(name, cond, detail = '') {
  if (!cond) abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
}

function berlinDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year').value);
  const m = Number(parts.find((p) => p.type === 'month').value);
  const d = Number(parts.find((p) => p.type === 'day').value);
  const utc = Date.UTC(y, m - 1, d + offsetDays);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function clientMitTenant(url, key, slug = SLUG) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('x-omlify-tenant', slug);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function login(url, anon, email, password) {
  const c = clientMitTenant(url, anon);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) abbruch(`Login ${email}: ${error.message}`);
  return c;
}

async function authNutzer(admin) {
  const treffer = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer lesen: ' + error.message);
    for (const u of data.users) {
      if ((u.email ?? '').startsWith(SLUG + '.')) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function resteEntfernen(admin) {
  const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', SLUG);
  if (error) abbruch('Studio lesen: ' + error.message);
  for (const t of tenants || []) {
    const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
    if (e) abbruch('Studio löschen: ' + e.message);
  }
  for (const u of await authNutzer(admin)) {
    const { error: e } = await admin.auth.admin.deleteUser(u.id);
    if (e && !/not found/i.test(e.message)) {
      abbruch('Auth-Nutzer ' + u.email + ': ' + e.message);
    }
  }
}

async function nutzerAnlegen(admin, { email, vorname, nachname, rolle, tenantId, password }) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { tenant_id: tenantId, first_name: vorname, last_name: nachname },
    app_metadata: { role: rolle },
  });
  if (error) abbruch('Nutzer ' + email + ': ' + error.message);

  const { data: profil, error: eProfil } = await admin
    .from('users')
    .select('id, email, role, tenant_id, auth_user_id')
    .eq('auth_user_id', data.user.id)
    .eq('tenant_id', tenantId)
    .single();
  if (eProfil || !profil) abbruch('Profil ' + email + ': ' + (eProfil?.message ?? 'keine Zeile'));

  const { error: e2 } = await admin
    .from('users')
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq('id', profil.id);
  if (e2) abbruch('email_verified ' + email + ': ' + e2.message);
  return profil;
}

async function plattform(admin, enabled) {
  const { data, error } = await admin.rpc('set_platform_flag', {
    p_key: 'online_payments',
    p_enabled: enabled,
  });
  if (error || !data?.success) {
    abbruch('set_platform_flag ' + enabled + ': ' + (error?.message || JSON.stringify(data)));
  }
}

async function plattformStand(admin) {
  const { data, error } = await admin
    .from('platform_flags')
    .select('enabled')
    .eq('key', 'online_payments')
    .single();
  if (error) abbruch('platform_flags lesen: ' + error.message);
  return Boolean(data.enabled);
}

async function onlinePflichtAn(admin, ownerClient, tenantId) {
  await plattform(admin, true);
  const { data: up, error } = await admin.rpc('upsert_provider_account', {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_ref: `acct_s21bb2_${tenantId.replace(/-/g, '').slice(0, 16)}`,
    p_status: 'active',
    p_charges: true,
    p_payouts: true,
    p_details: true,
    p_livemode: false,
    p_capabilities: { card: 'active' },
  });
  if (error || !up?.success) abbruch('upsert_provider_account: ' + (error?.message || JSON.stringify(up)));
  {
    const { data, error: e } = await ownerClient.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    if (e || !data?.success) abbruch('set_tax_setting: ' + (e?.message || JSON.stringify(data)));
  }
  {
    const legal = await ownerClient.rpc('upsert_studio_legal_profile', {
      p_legal_name: 'Yoga Test · Inhaberin',
      p_street: 'Testweg',
      p_house_number: '1',
      p_postal_code: '10115',
      p_city: 'Berlin',
      p_country: 'DE',
      p_contact_email: 'studio@example.com',
    });
    if (legal.error || !legal.data?.success) {
      abbruch('legal: ' + (legal.error?.message || JSON.stringify(legal.data)));
    }
    const { data, error: e } = await ownerClient.rpc('set_online_payments_enabled', { p_enabled: true });
    if (e || !data?.success) abbruch('set_online_payments_enabled: ' + (e?.message || JSON.stringify(data)));
  }
  {
    const { data, error: e } = await ownerClient.rpc('set_allow_onsite_payment', { p_allow: false });
    if (e || !data?.success) abbruch('set_allow_onsite_payment: ' + (e?.message || JSON.stringify(data)));
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntilSent(admin, registrationId, maxMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data, error } = await admin
      .from('email_deliveries')
      .select('id, status, last_error_code')
      .eq('registration_id', registrationId)
      .maybeSingle();
    if (error) abbruch('email_deliveries lesen: ' + error.message);
    if (data?.status === 'sent') return data;
    if (data?.status === 'failed') {
      abbruch('Outbox failed: ' + (data.last_error_code || 'ohne Code'));
    }
    await sleep(5000);
  }
  abbruch('Timeout: Outbox nicht sent innerhalb von ' + maxMs / 1000 + ' s');
}

let devOk = false;

async function main() {
  const env = ladeEnv(join(root, '.env'));
  const envDev = ladeEnv(join(root, 'supabase', '.env.dev'));
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const dispatchSecret = envDev.EMAIL_DISPATCH_SECRET;
  if (!url || !anon || !service) abbruch('.env unvollständig');
  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV');
  if (refAusKey(anon) !== ERLAUBTE_REF) abbruch('Anon-Key gehört nicht zu DEV');
  if (refAusKey(service) !== ERLAUBTE_REF) abbruch('Service-Role-Key gehört nicht zu DEV');
  if (!dispatchSecret) {
    abbruch('EMAIL_DISPATCH_SECRET fehlt in supabase/.env.dev — zuerst email_dispatch_secret.mjs');
  }
  devOk = true;

  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin);
    console.log('2.1b-b B2 dispatch smoke');

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'S21b-b2 Dispatch', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);
    const tenantId = tenant.id;

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Dsp',
      rolle: 'owner',
      tenantId,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Lehrer',
      nachname: 'Dsp',
      rolle: 'teacher',
      tenantId,
      password,
    });
    const a = await nutzerAnlegen(admin, {
      email: SLUG + '.a@example.com',
      vorname: 'Anna',
      nachname: 'A',
      rolle: 'user',
      tenantId,
      password,
    });
    const b = await nutzerAnlegen(admin, {
      email: SLUG + '.b@example.com',
      vorname: 'Berta',
      nachname: 'B',
      rolle: 'user',
      tenantId,
      password,
    });
    const c = await nutzerAnlegen(admin, {
      email: SLUG + '.c@example.com',
      vorname: 'Carla',
      nachname: 'C',
      rolle: 'user',
      tenantId,
      password,
    });

    const ownerClient = await login(url, anon, owner.email, password);
    const aClient = await login(url, anon, a.email, password);
    const bClient = await login(url, anon, b.email, password);
    const cClient = await login(url, anon, c.email, password);

    await onlinePflichtAn(admin, ownerClient, tenantId);

    // Fall 1: Nachrücken → sent (Cron)
    console.log('\n1) Nachrücken → Outbox sent (bis 3 Min.)');
    const { data: kurs1, error: k1e } = await admin
      .from('courses')
      .insert({
        tenant_id: tenantId,
        title: TITLE + ' F1',
        description: 'B2 smoke Testkurs Beschreibung',
        date: berlinDate(3),
        time: '10:00:00',
        end_time: '11:00:00',
        location: 'Studio',
        max_participants: 1,
        price: 15,
        teacher_id: teacher.id,
        status: 'active',
      })
      .select('id')
      .single();
    if (k1e) abbruch('Kurs1: ' + k1e.message);

    await aClient.rpc('register_for_course', { p_course_id: kurs1.id });
    await bClient.rpc('register_for_course', { p_course_id: kurs1.id });
    await aClient.rpc('unregister_from_course', { p_course_id: kurs1.id });

    const { data: regB } = await admin
      .from('registrations')
      .select('id, status')
      .eq('course_id', kurs1.id)
      .eq('user_id', b.id)
      .is('cancellation_timestamp', null)
      .single();
    ok('B pending_payment', regB?.status === 'pending_payment');

    const { data: deliv1 } = await admin
      .from('email_deliveries')
      .select('id, status')
      .eq('registration_id', regB.id)
      .single();
    ok('Outbox pending', deliv1?.status === 'pending');

    console.log('  … warte auf Cron / Versand …');
    const sent = await waitUntilSent(admin, regB.id, 180_000);
    ok('Outbox sent', sent.status === 'sent');

    // Fall 2: zweite Nachrückerin abmelden → NOT_PENDING
    console.log('\n2) Abmelden vor Versand → skipped NOT_PENDING');
    const { data: kurs2, error: k2e } = await admin
      .from('courses')
      .insert({
        tenant_id: tenantId,
        title: TITLE + ' F2',
        description: 'B2 smoke Testkurs 2 Beschreibung',
        date: berlinDate(4),
        time: '11:00:00',
        end_time: '12:00:00',
        location: 'Studio',
        max_participants: 1,
        price: 15,
        teacher_id: teacher.id,
        status: 'active',
      })
      .select('id')
      .single();
    if (k2e) abbruch('Kurs2: ' + k2e.message);

    const a2 = await nutzerAnlegen(admin, {
      email: SLUG + '.a2@example.com',
      vorname: 'A2',
      nachname: 'A',
      rolle: 'user',
      tenantId,
      password,
    });
    const a2c = await login(url, anon, a2.email, password);
    await a2c.rpc('register_for_course', { p_course_id: kurs2.id });
    await cClient.rpc('register_for_course', { p_course_id: kurs2.id });
    await a2c.rpc('unregister_from_course', { p_course_id: kurs2.id });

    const { data: regC } = await admin
      .from('registrations')
      .select('id, status')
      .eq('course_id', kurs2.id)
      .eq('user_id', c.id)
      .is('cancellation_timestamp', null)
      .single();
    ok('C pending', regC?.status === 'pending_payment');

    const { data: deliv2 } = await admin
      .from('email_deliveries')
      .select('id, status')
      .eq('registration_id', regC.id)
      .single();
    ok('C Outbox pending', deliv2?.status === 'pending');

    // Vor dem nächsten Lauf abmelden
    await cClient.rpc('unregister_from_course', { p_course_id: kurs2.id });
    const { data: regC2 } = await admin
      .from('registrations')
      .select('status')
      .eq('id', regC.id)
      .single();
    ok('C abgemeldet', regC2?.status === 'cancelled');

    // Sofortiger Lauf (nicht auf nächsten Cron warten)
    const dispatchUrl = `https://${ERLAUBTE_REF}.supabase.co/functions/v1/dispatch-emails`;
    const res = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Email-Dispatch-Secret': dispatchSecret,
      },
      body: '{}',
    });
    if (!res.ok) {
      abbruch('dispatch-emails HTTP ' + res.status + ': ' + (await res.text()));
    }
    const body = await res.json();
    ok('dispatch HTTP ok', body?.success === true, JSON.stringify(body));

    const { data: deliv2b } = await admin
      .from('email_deliveries')
      .select('status, last_error_code')
      .eq('id', deliv2.id)
      .single();
    ok(
      'Outbox skipped NOT_PENDING',
      deliv2b?.status === 'skipped' && deliv2b?.last_error_code === 'NOT_PENDING',
      JSON.stringify(deliv2b)
    );

    console.log('\nALLE TESTS GRÜN');
  } finally {
    if (devOk) {
      try {
        await plattform(admin, platformWas);
      } catch (e) {
        console.error('Plattform zurücksetzen:', e?.message || e);
      }
      try {
        await resteEntfernen(admin);
      } catch (e) {
        console.error('Aufräumen:', e?.message || e);
      }
    }
  }
}

main().catch((err) => {
  console.error('\n' + (err?.abbruch ? err.message : err?.message || err));
  process.exit(1);
});
