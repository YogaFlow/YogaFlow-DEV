#!/usr/bin/env node
/**
 * A7-1 — Hauptbuch (nur DEV).
 *
 * Nicht ausführen, bevor 20260928020000_a7_1_ledger.sql auf DEV liegt.
 * Gegen PROD nie. Eigene Studios a7ledgertest / a7ledgerku; am Ende
 * delete_tenant_complete und Test-Logins per auth.admin.deleteUser.
 *
 * Fälle (Kurz):
 *  Ohne Steuerstatus → Job wählt nicht (kein waiting); BEFORE_FIRST_PAYMENT;
 *  Verhungern (Studio ohne Status blockiert Limit nicht); Admin FORBIDDEN;
 *  Owner regular/1900; 18 € bar → 1800/1513/287; Karte pass; PayPal/Bank;
 *  Einlösung/Erlass/Korrektur keine Zeilen; Idempotenz; Storno; H5/H6;
 *  Kleinunternehmer; Leserechte; DML; Aufräumen. Lock-Retry bei Cron.
 *
 * Verwendung: node scripts/test/a7_1_ledger.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a7ledgertest';
const SLUG_KU = 'a7ledgerku';
const SLUG_STARVE = 'a7ledgerstv';

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
  if (profil.role !== rolle) abbruch(email + ' hat Rolle ' + profil.role + ', erwartet ' + rolle);
  return profil;
}

async function kursAnlegen(admin, felder) {
  const { data, error } = await admin.from('courses').insert(felder).select('id').single();
  if (error) abbruch('Kurs ' + felder.title + ': ' + error.message);
  return data.id;
}

async function anmelden(client, courseId) {
  const { data, error } = await client.rpc('register_for_course', { p_course_id: courseId });
  if (error) abbruch(`Anmeldung: ${error.message}`);
  if (!data?.success) abbruch(`Anmeldung: ${data?.message || data?.error || 'kein Erfolg'}`);
}

async function buchung(admin, courseId, userId) {
  const { data, error } = await admin
    .from('registrations')
    .select('id, coverage_status, price_cents_at_booking')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .is('cancellation_timestamp', null)
    .single();
  if (error) abbruch('registrations lesen: ' + error.message);
  return data;
}

async function vermerk(client, registrationId, method) {
  const { data, error } = await client.rpc('record_manual_payment', {
    p_registration_id: registrationId,
    p_method: method,
  });
  if (error) abbruch(`record_manual_payment: ${error.message}`);
  return data;
}

async function ruecknahme(client, paymentId) {
  const { data, error } = await client.rpc('reverse_manual_payment', {
    p_payment_id: paymentId,
  });
  if (error) abbruch(`reverse_manual_payment: ${error.message}`);
  return data;
}

function sleepMs(ms) {
  const ia = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(ia, 0, 0, ms);
}

/** process_ledger mit Lock-Retry (Cron hält den Advisory-Lock max. kurz). */
async function job(admin, pLimit = 500) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const { data, error } = await admin.rpc('process_ledger', { p_limit: pLimit });
    if (error) abbruch(`process_ledger: ${error.message}`);
    if (data?.skipped === 'locked') {
      if (attempt === 5) {
        abbruch('process_ledger 5× locked (Cron hält den Advisory-Lock)');
      }
      console.log(`  … process_ledger locked, Warte 2 s (Versuch ${attempt}/5)`);
      sleepMs(2000);
      continue;
    }
    return data;
  }
  abbruch('process_ledger: unerwartet kein Ergebnis');
}

async function zeilen(admin, tenantId, paymentId = null) {
  let q = admin
    .from('ledger_entries')
    .select(
      'id, event_id, payment_id, account, debit_cents, credit_cents, sale_kind, tax_regime, vat_rate_bp, booking_date'
    )
    .eq('tenant_id', tenantId);
  if (paymentId) q = q.eq('payment_id', paymentId);
  const { data, error } = await q;
  if (error) abbruch('ledger_entries: ' + error.message);
  return data || [];
}

function zeile(rows, account) {
  return rows.find((r) => r.account === account) || null;
}

function dmlVerweigert(error, name) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  ok(
    name,
    Boolean(error) && /42501|permission|denied|nicht erlaubt|append-only|unveränderlich/i.test(text),
    text
  );
}

let devOk = false;

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
  const admin = clientMitTenant(url, service, SLUG);

  await resteEntfernen(admin, SLUG);
  await resteEntfernen(admin, SLUG_KU);
  await resteEntfernen(admin, SLUG_STARVE);

  const today = berlinToday();
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);

  // ── Studio 1: regular ───────────────────────────────────────────────────
  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: 'A7 Ledger', slug: SLUG })
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
  const userB = await nutzerAnlegen(admin, {
    email: SLUG + '.b@example.com',
    vorname: 'Berta',
    nachname: 'Brandt',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });
  const userC = await nutzerAnlegen(admin, {
    email: SLUG + '.c@example.com',
    vorname: 'Clara',
    nachname: 'Conrad',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });

  const asOwner = await login(url, anon, owner.email, password, SLUG);
  const asAdmin = await login(url, anon, adminUser.email, password, SLUG);
  const asTeacher = await login(url, anon, teacher.email, password, SLUG);
  const asA = await login(url, anon, userA.email, password, SLUG);
  const asB = await login(url, anon, userB.email, password, SLUG);
  const asC = await login(url, anon, userC.email, password, SLUG);

  const kursCash = await kursAnlegen(admin, {
    tenant_id: tenant.id,
    title: 'A7 Bar',
    date: addDays(today, 14),
    time: '10:00:00',
    end_time: '11:00:00',
    max_participants: 10,
    price: 18,
    teacher_id: teacher.id,
    location: 'Studio',
    description: 'A7 Ledger Testkurs Barzahlung achtzehn Euro.',
    pass_eligible: true,
  });
  const kursPayPal = await kursAnlegen(admin, {
    tenant_id: tenant.id,
    title: 'A7 PayPal',
    date: addDays(today, 15),
    time: '10:00:00',
    end_time: '11:00:00',
    max_participants: 10,
    price: 18,
    teacher_id: teacher.id,
    location: 'Studio',
    description: 'A7 Ledger Testkurs PayPal Zahlung achtzehn Euro.',
    pass_eligible: true,
  });
  const kursBank = await kursAnlegen(admin, {
    tenant_id: tenant.id,
    title: 'A7 Bank',
    date: addDays(today, 16),
    time: '10:00:00',
    end_time: '11:00:00',
    max_participants: 10,
    price: 18,
    teacher_id: teacher.id,
    location: 'Studio',
    description: 'A7 Ledger Testkurs Ueberweisung achtzehn Euro.',
    pass_eligible: true,
  });
  const kursRedeem = await kursAnlegen(admin, {
    tenant_id: tenant.id,
    title: 'A7 Einloesung',
    date: addDays(today, 17),
    time: '10:00:00',
    end_time: '11:00:00',
    max_participants: 10,
    price: 18,
    teacher_id: teacher.id,
    location: 'Studio',
    description: 'A7 Ledger Testkurs fuer Karteneinloesung ohne Ledger.',
    pass_eligible: true,
  });
  const kursWaive = await kursAnlegen(admin, {
    tenant_id: tenant.id,
    title: 'A7 Erlass',
    date: addDays(today, 18),
    time: '10:00:00',
    end_time: '11:00:00',
    max_participants: 10,
    price: 18,
    teacher_id: teacher.id,
    location: 'Studio',
    description: 'A7 Ledger Testkurs fuer Erlass ohne Hauptbuchzeile.',
    pass_eligible: true,
  });

  await anmelden(asA, kursCash);
  const regCash = await buchung(admin, kursCash, userA.id);
  const payCash1 = await vermerk(asOwner, regCash.id, 'cash');
  ok('Barzahlung 18 €', payCash1?.success === true && payCash1.payment_id, JSON.stringify(payCash1));

  console.log('\n1) Ohne Steuerstatus → Job wählt Studio nicht');
  const j1 = await job(admin);
  ok('booked 0', j1?.booked === 0, JSON.stringify(j1));
  ok('waiting 0 (nicht angewählt)', j1?.waiting === 0, JSON.stringify(j1));
  ok('keine Zeilen', (await zeilen(admin, tenant.id)).length === 0);

  console.log('\n2) BEFORE_FIRST_PAYMENT + Admin FORBIDDEN + Owner setzt Status');
  const { data: beforeFirst } = await asOwner.rpc('set_tax_setting', {
    p_regime: 'regular',
    p_vat_rate_bp: 1900,
    p_valid_from: tomorrow,
  });
  ok(
    'BEFORE_FIRST_PAYMENT',
    beforeFirst?.success === false
      && beforeFirst?.error === 'BEFORE_FIRST_PAYMENT'
      && beforeFirst?.earliest_booking_date === today,
    JSON.stringify(beforeFirst)
  );

  const { data: adminSet } = await asAdmin.rpc('set_tax_setting', {
    p_regime: 'regular',
    p_vat_rate_bp: 1900,
    p_valid_from: yesterday,
  });
  ok(
    'Admin FORBIDDEN',
    adminSet?.success === false && adminSet?.error === 'FORBIDDEN',
    JSON.stringify(adminSet)
  );

  const { data: ownerSet, error: osErr } = await asOwner.rpc('set_tax_setting', {
    p_regime: 'regular',
    p_vat_rate_bp: 1900,
    p_valid_from: yesterday,
  });
  if (osErr) abbruch(osErr.message);
  ok(
    'Owner regular/1900',
    ownerSet?.success === true && ownerSet.regime === 'regular' && ownerSet.vat_rate_bp === 1900,
    JSON.stringify(ownerSet)
  );

  console.log('\n3) Barzahlung buchen + Verhungern verhindern');
  // Rechenweg: 1800 × 10000 / 11900 = 1512,605… → 1513; USt 1800 − 1513 = 287
  const j2 = await job(admin);
  ok('booked ≥ 1', (j2?.booked ?? 0) >= 1, JSON.stringify(j2));
  const rowsCash = await zeilen(admin, tenant.id, payCash1.payment_id);
  ok('3 Zeilen Bar', rowsCash.length === 3, JSON.stringify(rowsCash));
  ok('cash Soll 1800', zeile(rowsCash, 'cash')?.debit_cents === 1800 && zeile(rowsCash, 'cash')?.credit_cents === 0);
  ok(
    'revenue_standard Haben 1513',
    zeile(rowsCash, 'revenue_standard')?.credit_cents === 1513
      && zeile(rowsCash, 'revenue_standard')?.debit_cents === 0
  );
  ok(
    'vat_output Haben 287',
    zeile(rowsCash, 'vat_output')?.credit_cents === 287 && zeile(rowsCash, 'vat_output')?.debit_cents === 0
  );
  ok('sale_kind course', rowsCash.every((r) => r.sale_kind === 'course'));

  // Studio A ohne Steuerstatus mit > p_limit Zahlungen darf B nicht verhungern lassen.
  const adminStv = clientMitTenant(url, service, SLUG_STARVE);
  const { data: tenantStv, error: tsErr } = await adminStv
    .from('tenants')
    .insert({ name: 'A7 Ledger Starve', slug: SLUG_STARVE })
    .select('id')
    .single();
  if (tsErr) abbruch('Studio Starve: ' + tsErr.message);
  const ownerStv = await nutzerAnlegen(adminStv, {
    email: SLUG_STARVE + '.owner@example.com',
    vorname: 'Sven',
    nachname: 'Starve',
    rolle: 'owner',
    tenantId: tenantStv.id,
    password,
  });
  const teacherStv = await nutzerAnlegen(adminStv, {
    email: SLUG_STARVE + '.teacher@example.com',
    vorname: 'Tea',
    nachname: 'Teacher',
    rolle: 'teacher',
    tenantId: tenantStv.id,
    password,
  });
  const asOwnerStv = await login(url, anon, ownerStv.email, password, SLUG_STARVE);
  const starvePayIds = [];
  for (let i = 0; i < 3; i++) {
    const u = await nutzerAnlegen(adminStv, {
      email: SLUG_STARVE + `.u${i}@example.com`,
      vorname: 'U' + i,
      nachname: 'Starve',
      rolle: 'user',
      tenantId: tenantStv.id,
      password,
    });
    const asU = await login(url, anon, u.email, password, SLUG_STARVE);
    const kid = await kursAnlegen(adminStv, {
      tenant_id: tenantStv.id,
      title: `A7 Starve ${i + 1}`,
      date: addDays(today, 21 + i),
      time: '10:00:00',
      end_time: '11:00:00',
      max_participants: 10,
      price: 18,
      teacher_id: teacherStv.id,
      location: 'Studio',
      description: `A7 Verhungern Testkurs Nummer ${i + 1} ohne Steuerstatus.`,
      pass_eligible: false,
    });
    await anmelden(asU, kid);
    const reg = await buchung(adminStv, kid, u.id);
    const pay = await vermerk(asOwnerStv, reg.id, 'cash');
    starvePayIds.push(pay.payment_id);
  }
  ok('Starve 3 Zahlungen ohne Status', starvePayIds.length === 3);

  const kursB = await kursAnlegen(admin, {
    tenant_id: tenant.id,
    title: 'A7 B nach Starve',
    date: addDays(today, 25),
    time: '10:00:00',
    end_time: '11:00:00',
    max_participants: 10,
    price: 18,
    teacher_id: teacher.id,
    location: 'Studio',
    description: 'A7 Studio B Zahlung trotz Starve-Studio ohne Steuerstatus.',
    pass_eligible: true,
  });
  await anmelden(asB, kursB);
  const regB = await buchung(admin, kursB, userB.id);
  const payB = await vermerk(asOwner, regB.id, 'cash');
  const jStarve = await job(admin, 2);
  ok('Verhungern: B gebucht', (jStarve?.booked ?? 0) >= 1, JSON.stringify(jStarve));
  const rowsB = await zeilen(admin, tenant.id, payB.payment_id);
  ok('Studio B hat Zeilen trotz Limit 2', rowsB.length === 3, JSON.stringify(rowsB));
  ok('Starve-Studio weiterhin 0 Zeilen', (await zeilen(adminStv, tenantStv.id)).length === 0);

  console.log('\n4) Kartenverkauf 150 € bar');
  const { data: zehnProd, error: zErr } = await asOwner.rpc('create_pass_product', {
    p_name: '10er A7',
    p_units: 10,
    p_price_cents: 15000,
    p_validity_rule: 'years_to_year_end',
    p_validity_value: 3,
  });
  if (zErr || !zehnProd?.success) abbruch('10er: ' + (zErr?.message || JSON.stringify(zehnProd)));

  const { data: sell, error: sErr } = await asOwner.rpc('sell_pass', {
    p_member_id: userB.id,
    p_product_id: zehnProd.id,
    p_method: 'cash',
  });
  if (sErr || !sell?.success) abbruch('sell_pass: ' + (sErr?.message || JSON.stringify(sell)));

  const beforePassLines = (await zeilen(admin, tenant.id)).length;
  const j3 = await job(admin);
  ok('Karte gebucht', (j3?.booked ?? 0) >= 1, JSON.stringify(j3));
  const rowsPass = await zeilen(admin, tenant.id, sell.payment_id);
  // 15000 × 10000 / 11900 = 12605,042… → 12605; USt 2395
  ok('cash 15000', zeile(rowsPass, 'cash')?.debit_cents === 15000);
  ok('revenue_standard 12605', zeile(rowsPass, 'revenue_standard')?.credit_cents === 12605);
  ok('vat_output 2395', zeile(rowsPass, 'vat_output')?.credit_cents === 2395);
  ok('sale_kind pass', rowsPass.every((r) => r.sale_kind === 'pass'));

  const { data: passPurchased } = await admin
    .from('events')
    .select('id')
    .eq('type', 'pass.purchased')
    .eq('subject_id', sell.pass_id);
  const passPurchasedIds = (passPurchased || []).map((e) => e.id);
  const { data: logPass } = await admin
    .from('ledger_event_log')
    .select('event_id')
    .in('event_id', passPurchasedIds.length ? passPurchasedIds : ['00000000-0000-0000-0000-000000000000']);
  ok('pass.purchased ohne Log', (logPass || []).length === 0);
  ok(
    'keine Extra-Zeilen für pass.purchased',
    (await zeilen(admin, tenant.id)).length === beforePassLines + 3
  );

  console.log('\n5) PayPal und Überweisung');
  await anmelden(asB, kursPayPal);
  const regPp = await buchung(admin, kursPayPal, userB.id);
  const payPp = await vermerk(asOwner, regPp.id, 'paypal_manual');
  await anmelden(asC, kursBank);
  const regBank = await buchung(admin, kursBank, userC.id);
  const payBank = await vermerk(asOwner, regBank.id, 'bank_transfer');
  await job(admin);
  const rowsPp = await zeilen(admin, tenant.id, payPp.payment_id);
  const rowsBank = await zeilen(admin, tenant.id, payBank.payment_id);
  ok('paypal_clearing', Boolean(zeile(rowsPp, 'paypal_clearing')));
  ok('bank', Boolean(zeile(rowsBank, 'bank')));

  console.log('\n6) Einlösung, Erlass, Korrektur → keine Zeilen');
  const linesBeforeSide = (await zeilen(admin, tenant.id)).length;
  const { data: regPass } = await asB.rpc('register_for_course', {
    p_course_id: kursRedeem,
    p_use_pass: true,
  });
  ok('Einlösung ok', regPass?.success === true, JSON.stringify(regPass));

  await anmelden(asA, kursWaive);
  const regWaive = await buchung(admin, kursWaive, userA.id);
  const { data: waive } = await asOwner.rpc('set_coverage_waived', {
    p_registration_id: regWaive.id,
    p_reason: 'goodwill',
    p_note: null,
  });
  ok('Erlass ok', waive?.success === true, JSON.stringify(waive));

  const { data: adj } = await asOwner.rpc('adjust_pass_units', {
    p_pass_id: sell.pass_id,
    p_delta: 1,
    p_reason: 'Testkorrektur A7',
  });
  ok('Korrektur ok', adj?.success === true, JSON.stringify(adj));

  const jSide = await job(admin);
  ok('keine Side-Buchungen', (jSide?.booked ?? 0) === 0, JSON.stringify(jSide));
  ok('Zeilenzahl unverändert', (await zeilen(admin, tenant.id)).length === linesBeforeSide);

  const { data: sideEvents } = await admin
    .from('events')
    .select('id, type')
    .eq('tenant_id', tenant.id)
    .in('type', ['pass.redeemed', 'coverage.waived', 'pass.adjusted']);
  const sideIds = (sideEvents || []).map((e) => e.id);
  if (sideIds.length) {
    const { data: sideLog } = await admin.from('ledger_event_log').select('event_id').in('event_id', sideIds);
    ok('Side-Events nicht im Log', (sideLog || []).length === 0);
  } else {
    ok('Side-Events vorhanden', false, 'keine Side-Events gefunden');
  }

  console.log('\n7) Idempotenz');
  const countBefore = (await zeilen(admin, tenant.id)).length;
  const jIdem = await job(admin);
  ok('zweite Lauf booked 0', jIdem?.booked === 0, JSON.stringify(jIdem));
  ok('Zeilen gleich', (await zeilen(admin, tenant.id)).length === countBefore);

  console.log('\n8) Storno spiegelt');
  const rev = await ruecknahme(asOwner, payCash1.payment_id);
  ok('Rücknahme', rev?.success === true, JSON.stringify(rev));
  await job(admin);
  const rowsRev = await zeilen(admin, tenant.id, rev.payment_id);
  ok('Storno 3 Zeilen', rowsRev.length === 3);
  ok('Storno cash Haben 1800', zeile(rowsRev, 'cash')?.credit_cents === 1800);
  ok('Storno revenue Soll 1513', zeile(rowsRev, 'revenue_standard')?.debit_cents === 1513);
  ok('Storno vat Soll 287', zeile(rowsRev, 'vat_output')?.debit_cents === 287);

  const cashNet =
    (zeile(rowsCash, 'cash')?.debit_cents || 0) -
    (zeile(rowsCash, 'cash')?.credit_cents || 0) +
    (zeile(rowsRev, 'cash')?.debit_cents || 0) -
    (zeile(rowsRev, 'cash')?.credit_cents || 0);
  ok('Netto cash über beide Events 0', cashNet === 0);

  console.log('\n9) Statuswechsel H6 / Storno nach Wechsel H5');
  // Neue Barzahlung für „letzte Buchung“, dann ALREADY_BOOKED
  const kurs2 = await kursAnlegen(admin, {
    tenant_id: tenant.id,
    title: 'A7 Status',
    date: addDays(today, 20),
    time: '10:00:00',
    end_time: '11:00:00',
    max_participants: 10,
    price: 18,
    teacher_id: teacher.id,
    location: 'Studio',
    description: 'A7 Ledger Testkurs Statuswechsel und Storno Steuer.',
    pass_eligible: true,
  });
  await anmelden(asA, kurs2);
  const reg2 = await buchung(admin, kurs2, userA.id);
  const pay2 = await vermerk(asOwner, reg2.id, 'cash');
  await job(admin);
  const rowsPay2 = await zeilen(admin, tenant.id, pay2.payment_id);
  ok('Zahlung vor Wechsel 19 %', zeile(rowsPay2, 'vat_output')?.credit_cents === 287);

  const { data: tooEarly } = await asOwner.rpc('set_tax_setting', {
    p_regime: 'small_business',
    p_vat_rate_bp: 0,
    p_valid_from: today,
  });
  ok(
    'ALREADY_BOOKED',
    tooEarly?.success === false && tooEarly?.error === 'ALREADY_BOOKED' && tooEarly?.last_booking_date,
    JSON.stringify(tooEarly)
  );

  const { data: laterOk } = await asOwner.rpc('set_tax_setting', {
    p_regime: 'small_business',
    p_vat_rate_bp: 0,
    p_valid_from: tomorrow,
  });
  ok('small_business ab morgen', laterOk?.success === true, JSON.stringify(laterOk));

  const rev2 = await ruecknahme(asOwner, pay2.payment_id);
  ok('Storno nach Wechsel', rev2?.success === true, JSON.stringify(rev2));
  await job(admin);
  const rowsRev2 = await zeilen(admin, tenant.id, rev2.payment_id);
  ok(
    'Storno spiegelt 19 %',
    rowsRev2.every((r) => r.tax_regime === 'regular' && r.vat_rate_bp === 1900)
      && zeile(rowsRev2, 'vat_output')?.debit_cents === 287,
    JSON.stringify(rowsRev2)
  );

  // ── Studio 2: Kleinunternehmer ──────────────────────────────────────────
  console.log('\n10) Kleinunternehmer-Studio');
  const adminKu = clientMitTenant(url, service, SLUG_KU);
  const { data: tenantKu, error: tkErr } = await adminKu
    .from('tenants')
    .insert({ name: 'A7 Ledger KU', slug: SLUG_KU })
    .select('id')
    .single();
  if (tkErr) abbruch('Studio KU: ' + tkErr.message);

  const ownerKu = await nutzerAnlegen(adminKu, {
    email: SLUG_KU + '.owner@example.com',
    vorname: 'Klara',
    nachname: 'Klein',
    rolle: 'owner',
    tenantId: tenantKu.id,
    password,
  });
  const teacherKu = await nutzerAnlegen(adminKu, {
    email: SLUG_KU + '.teacher@example.com',
    vorname: 'Tim',
    nachname: 'Teacher',
    rolle: 'teacher',
    tenantId: tenantKu.id,
    password,
  });
  const userKu = await nutzerAnlegen(adminKu, {
    email: SLUG_KU + '.a@example.com',
    vorname: 'Ute',
    nachname: 'User',
    rolle: 'user',
    tenantId: tenantKu.id,
    password,
  });

  const asOwnerKu = await login(url, anon, ownerKu.email, password, SLUG_KU);
  const asUserKu = await login(url, anon, userKu.email, password, SLUG_KU);

  const { data: taxKu } = await asOwnerKu.rpc('set_tax_setting', {
    p_regime: 'small_business',
    p_vat_rate_bp: 0,
    p_valid_from: yesterday,
  });
  ok('KU Steuerstatus', taxKu?.success === true, JSON.stringify(taxKu));

  const kursKu = await kursAnlegen(adminKu, {
    tenant_id: tenantKu.id,
    title: 'A7 KU Bar',
    date: addDays(today, 14),
    time: '10:00:00',
    end_time: '11:00:00',
    max_participants: 10,
    price: 18,
    teacher_id: teacherKu.id,
    location: 'Studio',
    description: 'A7 Kleinunternehmer Testkurs Barzahlung achtzehn.',
    pass_eligible: false,
  });
  await anmelden(asUserKu, kursKu);
  const regKu = await buchung(adminKu, kursKu, userKu.id);
  const payKu = await vermerk(asOwnerKu, regKu.id, 'cash');
  await job(adminKu);
  const rowsKu = await zeilen(adminKu, tenantKu.id, payKu.payment_id);
  ok('KU 2 Zeilen', rowsKu.length === 2, JSON.stringify(rowsKu));
  ok('KU cash 1800', zeile(rowsKu, 'cash')?.debit_cents === 1800);
  ok(
    'KU revenue_small_business 1800',
    zeile(rowsKu, 'revenue_small_business')?.credit_cents === 1800
  );
  ok('KU keine vat_output', !zeile(rowsKu, 'vat_output'));

  console.log('\n11) Ausgeglichen');
  const { data: unbal1, error: u1 } = await admin.rpc('ledger_unbalanced_events', {
    p_tenant: tenant.id,
  });
  if (u1) abbruch(u1.message);
  const { data: unbal2, error: u2 } = await adminKu.rpc('ledger_unbalanced_events', {
    p_tenant: tenantKu.id,
  });
  if (u2) abbruch(u2.message);
  ok('Studio1 ausgeglichen', !unbal1 || unbal1.length === 0, JSON.stringify(unbal1));
  ok('Studio2 ausgeglichen', !unbal2 || unbal2.length === 0, JSON.stringify(unbal2));

  console.log('\n12) Leserechte');
  const { data: tTeacher, error: et } = await asTeacher.from('ledger_entries').select('id');
  const { data: tUser, error: eu } = await asA.from('ledger_entries').select('id');
  const { data: taxT, error: ett } = await asTeacher.from('tenant_tax_settings').select('id');
  const { data: taxU, error: etu } = await asA.from('tenant_tax_settings').select('id');
  ok('Lehrende ledger 0', !et && (tTeacher || []).length === 0);
  ok('Teilnehmerin ledger 0', !eu && (tUser || []).length === 0);
  ok('Lehrende tax 0', !ett && (taxT || []).length === 0);
  ok('Teilnehmerin tax 0', !etu && (taxU || []).length === 0);

  const { data: ownerLines, error: eo } = await asOwner.from('ledger_entries').select('id');
  const { data: ownerTax, error: eot } = await asOwner.from('tenant_tax_settings').select('id');
  ok('Owner sieht ledger', !eo && (ownerLines || []).length > 0, String((ownerLines || []).length));
  ok('Owner sieht tax', !eot && (ownerTax || []).length > 0);

  console.log('\n13) Direktes DML verweigert');
  const { error: insErr } = await asOwner.from('ledger_entries').insert({
    tenant_id: tenant.id,
    event_id: rowsCash[0].event_id,
    payment_id: payCash1.payment_id,
    account: 'cash',
    debit_cents: 1,
    credit_cents: 0,
    sale_kind: 'course',
    tax_regime: 'regular',
    vat_rate_bp: 1900,
    booking_date: today,
  });
  dmlVerweigert(insErr, 'INSERT ledger verweigert');

  const { error: updErr } = await asOwner
    .from('ledger_entries')
    .update({ debit_cents: 1 })
    .eq('id', rowsCash[0].id);
  dmlVerweigert(updErr, 'UPDATE ledger verweigert');

  const { error: delErr } = await asOwner.from('ledger_entries').delete().eq('id', rowsCash[0].id);
  dmlVerweigert(delErr, 'DELETE ledger verweigert');

  const { error: taxUpd } = await asOwner
    .from('tenant_tax_settings')
    .update({ vat_rate_bp: 700 })
    .eq('id', ownerSet.id);
  dmlVerweigert(taxUpd, 'UPDATE tax verweigert');

  console.log('\n14) Aufräumen');
  await resteEntfernen(admin, SLUG);
  await resteEntfernen(adminKu, SLUG_KU);
  await resteEntfernen(admin, SLUG_STARVE);
  ok('Studios entfernt', true);

  console.log('\nA7-1 Ledger: alle Fälle grün');
}

main().catch((err) => {
  if (!err.abbruch) console.error(err);
  else console.error(err.message);
  if (!devOk) {
    console.error('Abbruch vor DEV-Bestätigung — keine Daten geändert.');
  }
  process.exit(1);
});
