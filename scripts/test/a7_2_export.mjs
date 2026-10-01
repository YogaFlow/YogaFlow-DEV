#!/usr/bin/env node
/**
 * A7-2 — Hauptbuch-Export (nur DEV).
 *
 * Nicht ausführen, bevor 20260928143000_a7_2_ledger_export.sql auf DEV liegt.
 * Gegen PROD nie. Eigenes Studio a7export; am Ende delete_tenant_complete.
 *
 * Fälle: Owner bekommt Zeilen, Admin ebenfalls, Lehrende FORBIDDEN,
 * Zeitraum 400 Tage RANGE_TOO_LARGE, Ende vor Anfang INVALID_RANGE,
 * 366 Tage erlaubt.
 *
 * Verwendung: node scripts/test/a7_2_export.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a7export';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function ladeEnv() {
  const out = {};
  for (const zeile of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
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

function berlinToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function clientMitTenant(url, key, slug) {
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

async function login(url, anon, email, password, slug) {
  const c = clientMitTenant(url, anon, slug);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) abbruch(`Login ${email}: ${error.message}`);
  return c;
}

async function authNutzer(admin, slug) {
  const treffer = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer lesen: ' + error.message);
    for (const u of data.users) {
      if ((u.email ?? '').startsWith(slug + '.')) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function resteEntfernen(admin, slug) {
  const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', slug);
  if (error) abbruch('Studio lesen: ' + error.message);
  for (const t of tenants || []) {
    const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
    if (e) abbruch('Studio löschen: ' + e.message);
  }
  for (const u of await authNutzer(admin, slug)) {
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
    .select('id, email, role, tenant_id')
    .eq('auth_user_id', data.user.id)
    .eq('tenant_id', tenantId)
    .single();
  if (eProfil || !profil) abbruch('Profil ' + email + ': ' + (eProfil?.message ?? 'keine Zeile'));

  const { error: e2 } = await admin
    .from('users')
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq('id', profil.id);
  if (e2) abbruch('email_verified ' + email + ': ' + e2.message);
  if (profil.role !== rolle) abbruch(email + ' hat Rolle ' + profil.role + ', erwartet ' + rolle);
  return profil;
}

function sleepMs(ms) {
  const ia = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(ia, 0, 0, ms);
}

async function job(admin) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data, error } = await admin.rpc('process_ledger', { p_limit: 500 });
    if (error) abbruch(`process_ledger: ${error.message}`);
    if (data?.skipped === 'locked') {
      if (attempt === 5) abbruch('process_ledger 5× locked');
      console.log(`  … process_ledger locked, Warte 2 s (Versuch ${attempt}/5)`);
      sleepMs(2000);
      continue;
    }
    return data;
  }
  abbruch('process_ledger: unerwartet kein Ergebnis');
}

function fehlerText(error) {
  return `${error?.code || ''} ${error?.message || ''}`;
}

let devOk = false;
let admin = null;

async function main() {
  const env = ladeEnv();
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) abbruch('.env unvollständig (URL/ANON/SERVICE_ROLE)');
  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV (' + ERLAUBTE_REF + ')');
  if (refAusKey(anon) !== ERLAUBTE_REF) abbruch('Anon-Key gehört nicht zu DEV');
  if (refAusKey(service) !== ERLAUBTE_REF) abbruch('Service-Role-Key gehört nicht zu DEV');
  devOk = true;

  const password = seedPasswort();
  admin = clientMitTenant(url, service, SLUG);
  await resteEntfernen(admin, SLUG);

  const today = berlinToday();
  const yesterday = addDays(today, -1);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: 'A7 Export', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio anlegen: ' + tErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com',
    vorname: 'Olivia',
    nachname: 'Owner',
    rolle: 'owner',
    tenantId: tenant.id,
    password,
  });
  const adminUser = await nutzerAnlegen(admin, {
    email: SLUG + '.admin@example.com',
    vorname: 'Ada',
    nachname: 'Admin',
    rolle: 'admin',
    tenantId: tenant.id,
    password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com',
    vorname: 'Tom',
    nachname: 'Teacher',
    rolle: 'teacher',
    tenantId: tenant.id,
    password,
  });
  const userA = await nutzerAnlegen(admin, {
    email: SLUG + '.a@example.com',
    vorname: 'Anna',
    nachname: 'Andersen',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });

  const asOwner = await login(url, anon, owner.email, password, SLUG);
  const asAdmin = await login(url, anon, adminUser.email, password, SLUG);
  const asTeacher = await login(url, anon, teacher.email, password, SLUG);
  const asA = await login(url, anon, userA.email, password, SLUG);

  const { data: kurs, error: kErr } = await admin
    .from('courses')
    .insert({
      tenant_id: tenant.id,
      title: 'A7 Export Bar',
      date: addDays(today, 14),
      time: '10:00:00',
      end_time: '11:00:00',
      max_participants: 10,
      price: 18,
      teacher_id: teacher.id,
      location: 'Studio',
      description: 'A7 Export Testkurs Barzahlung achtzehn Euro.',
      pass_eligible: false,
    })
    .select('id')
    .single();
  if (kErr) abbruch('Kurs: ' + kErr.message);

  const { data: regData, error: regErr } = await asA.rpc('register_for_course', {
    p_course_id: kurs.id,
  });
  if (regErr || !regData?.success) {
    abbruch('Anmeldung: ' + (regErr?.message || regData?.message || regData?.error || 'kein Erfolg'));
  }

  const { data: registration, error: rErr } = await admin
    .from('registrations')
    .select('id')
    .eq('course_id', kurs.id)
    .eq('user_id', userA.id)
    .is('cancellation_timestamp', null)
    .single();
  if (rErr) abbruch('Buchung lesen: ' + rErr.message);

  const { data: pay, error: pErr } = await asOwner.rpc('record_manual_payment', {
    p_registration_id: registration.id,
    p_method: 'cash',
  });
  if (pErr || !pay?.success) abbruch('Zahlung: ' + (pErr?.message || JSON.stringify(pay)));

  const { data: tax, error: taxErr } = await asOwner.rpc('set_tax_setting', {
    p_regime: 'small_business',
    p_vat_rate_bp: 0,
    p_valid_from: yesterday,
  });
  if (taxErr || !tax?.success) abbruch('Steuerstatus: ' + (taxErr?.message || JSON.stringify(tax)));

  const jobResult = await job(admin);
  ok(
    'process_ledger failed 0',
    (jobResult?.failed ?? 0) === 0,
    JSON.stringify(jobResult),
  );

  const { data: ownEntries, error: ownErr } = await admin
    .from('ledger_entries')
    .select('account, debit_cents, credit_cents, payment_id')
    .eq('tenant_id', tenant.id)
    .eq('payment_id', pay.payment_id);
  if (ownErr) abbruch('ledger_entries: ' + ownErr.message);
  const sollSum = (ownEntries || []).reduce((s, r) => s + (r.debit_cents || 0), 0);
  const habenSum = (ownEntries || []).reduce((s, r) => s + (r.credit_cents || 0), 0);
  ok(
    'eigene Zahlung gebucht (Soll=Haben)',
    (ownEntries || []).length >= 2 && sollSum === habenSum && sollSum === 1800,
    JSON.stringify(ownEntries),
  );
  ok(
    'cash Soll 1800',
    (ownEntries || []).some((r) => r.account === 'cash' && r.debit_cents === 1800),
  );
  ok(
    'revenue_small_business Haben 1800',
    (ownEntries || []).some(
      (r) => r.account === 'revenue_small_business' && r.credit_cents === 1800,
    ),
  );

  console.log('\n1) Owner und Admin bekommen Zeilen');
  const { data: ownerRows, error: ownerErr } = await asOwner.rpc('export_ledger', {
    p_from: yesterday,
    p_to: today,
  });
  if (ownerErr) abbruch('Owner export: ' + ownerErr.message);
  ok('Owner Zeilen', Array.isArray(ownerRows) && ownerRows.length >= 2, JSON.stringify(ownerRows));
  ok(
    'Umsatz Kleinunternehmer',
    ownerRows.some((row) => row.account === 'revenue_small_business' && row.credit_cents === 1800),
  );
  ok(
    'Bar Soll',
    ownerRows.some((row) => row.account === 'cash' && row.debit_cents === 1800 && row.method === 'cash'),
  );
  const roh = JSON.stringify(ownerRows);
  ok('keine Namen', !/first_name|last_name|Andersen|Olivia|user_id/.test(roh));
  const keys = Object.keys(ownerRows[0]).sort();
  ok(
    'nur Exportspalten',
    keys.join(',') ===
      'account,booking_date,credit_cents,debit_cents,event_id,method,payment_id,sale_kind,tax_regime,vat_rate_bp',
    keys.join(','),
  );

  const { data: adminRows, error: adminErr } = await asAdmin.rpc('export_ledger', {
    p_from: yesterday,
    p_to: today,
  });
  if (adminErr) abbruch('Admin export: ' + adminErr.message);
  ok('Admin Zeilen', Array.isArray(adminRows) && adminRows.length === ownerRows.length);

  console.log('\n2) Lehrende FORBIDDEN');
  const { data: teacherRows, error: teacherErr } = await asTeacher.rpc('export_ledger', {
    p_from: yesterday,
    p_to: today,
  });
  ok(
    'Lehrende FORBIDDEN',
    Boolean(teacherErr) && /FORBIDDEN/.test(fehlerText(teacherErr)) && !teacherRows,
    fehlerText(teacherErr),
  );

  console.log('\n3) Zeitraum');
  const { error: wideErr } = await asOwner.rpc('export_ledger', {
    p_from: today,
    p_to: addDays(today, 399),
  });
  ok('400 Tage RANGE_TOO_LARGE', Boolean(wideErr) && /RANGE_TOO_LARGE/.test(fehlerText(wideErr)), fehlerText(wideErr));

  const { error: invertedErr } = await asOwner.rpc('export_ledger', {
    p_from: today,
    p_to: yesterday,
  });
  ok(
    'Ende vor Anfang INVALID_RANGE',
    Boolean(invertedErr) && /INVALID_RANGE/.test(fehlerText(invertedErr)),
    fehlerText(invertedErr),
  );

  const { data: yearRows, error: yearErr } = await asOwner.rpc('export_ledger', {
    p_from: today,
    p_to: addDays(today, 365),
  });
  ok('366 Tage erlaubt', !yearErr && Array.isArray(yearRows), fehlerText(yearErr));

  console.log('\nA7-2 Export: alle Fälle grün');
}

main()
  .catch((err) => {
    if (!err.abbruch) console.error(err);
    else console.error(err.message);
    if (!devOk) console.error('Abbruch vor DEV-Bestätigung — keine Daten geändert.');
    process.exitCode = 1;
  })
  .finally(async () => {
    if (devOk && admin) {
      try {
        await resteEntfernen(admin, SLUG);
      } catch (err) {
        console.error('Aufräumen: ' + (err?.message || err));
        process.exitCode = 1;
      }
    }
  });
