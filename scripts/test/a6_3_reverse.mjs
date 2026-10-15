#!/usr/bin/env node
/**
 * A6-3 — Zurückbuchen, Nachrücken, adjust_pass_units, expire_passes (nur DEV).
 *
 * Nicht ausführen, bevor 20260928010000_a6_3_reverse_and_expire.sql auf DEV liegt.
 * Gegen PROD nie. Eigenes Studio a63reversetest, am Ende
 * delete_tenant_complete und auth.admin.deleteUser.
 *
 * Verwendung: node scripts/test/a6_3_reverse.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a63reversetest';

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

function berlinDate(offsetDays = 0) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
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
  if (profil.role !== rolle) abbruch(email + ' hat Rolle ' + profil.role + ', erwartet ' + rolle);
  return profil;
}

async function kursAnlegen(admin, tenantId, teacherId, opts = {}) {
  const { data, error } = await admin
    .from('courses')
    .insert({
      tenant_id: tenantId,
      title: opts.title || 'A6-3 Kurs',
      description: 'A6-3 Testkurs Beschreibung lang genug',
      date: opts.date || berlinDate(5),
      time: opts.time || '18:00:00',
      end_time: opts.end_time || '19:00:00',
      location: 'Studio',
      max_participants: opts.max_participants ?? 10,
      price: opts.price ?? 15,
      teacher_id: teacherId,
      status: 'active',
      frequency: 'one_time',
      pass_eligible: opts.pass_eligible ?? true,
    })
    .select('id, date, time, price, max_participants')
    .single();
  if (error) abbruch('Kurs: ' + error.message);
  return data;
}

async function verkaufen(client, memberId, productId, method = 'cash') {
  const { data, error } = await client.rpc('sell_pass', {
    p_member_id: memberId,
    p_product_id: productId,
    p_method: method,
  });
  if (error) abbruch('sell_pass: ' + error.message);
  if (!data?.success) abbruch('sell_pass: ' + JSON.stringify(data));
  return data;
}

async function regRow(admin, courseId, userId, { cancelled = false } = {}) {
  let q = admin
    .from('registrations')
    .select(
      'id, coverage_status, pass_id, coverage_intent, status, is_waitlist, cancellation_timestamp, cancellation_deadline'
    )
    .eq('course_id', courseId)
    .eq('user_id', userId);
  if (cancelled) q = q.not('cancellation_timestamp', 'is', null);
  else q = q.is('cancellation_timestamp', null);
  const { data, error } = await q.maybeSingle();
  if (error) abbruch('reg lesen: ' + error.message);
  return data;
}

async function passRemaining(admin, passId) {
  const { data: moves, error } = await admin
    .from('pass_movements')
    .select('delta')
    .eq('pass_id', passId);
  if (error) abbruch('movements: ' + error.message);
  return (moves || []).reduce((a, m) => a + Number(m.delta), 0);
}

async function netDeltaForReg(admin, registrationId) {
  const { data: moves, error } = await admin
    .from('pass_movements')
    .select('delta, kind, reason')
    .eq('registration_id', registrationId);
  if (error) abbruch('reg movements: ' + error.message);
  return {
    net: (moves || []).reduce((a, m) => a + Number(m.delta), 0),
    moves: moves || [],
  };
}

let devOk = false;

async function main() {
  const env = ladeEnv();
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) abbruch('.env unvollständig (URL/ANON/SERVICE_ROLE)');
  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV');
  if (refAusKey(anon) !== ERLAUBTE_REF) abbruch('Anon-Key gehört nicht zu DEV');
  if (refAusKey(service) !== ERLAUBTE_REF) abbruch('Service-Role-Key gehört nicht zu DEV');
  devOk = true;

  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);

  await resteEntfernen(admin);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: 'A6-3 Reverse', slug: SLUG, cancellation_window_hours: 72 })
    .select('id, cancellation_window_hours')
    .single();
  if (tErr) abbruch('Studio anlegen: ' + tErr.message);
  ok('Studio-Frist 72 h', tenant.cancellation_window_hours === 72);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com',
    vorname: 'Olivia',
    nachname: 'Owner',
    rolle: 'owner',
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
    vorname: 'Carla',
    nachname: 'Conrad',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });
  const userD = await nutzerAnlegen(admin, {
    email: SLUG + '.d@example.com',
    vorname: 'Doris',
    nachname: 'Dorn',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });

  const asOwner = await login(url, anon, owner.email, password);
  const asTeacher = await login(url, anon, teacher.email, password);
  const asA = await login(url, anon, userA.email, password);
  const asB = await login(url, anon, userB.email, password);
  const asC = await login(url, anon, userC.email, password);
  const asD = await login(url, anon, userD.email, password);

  const { data: zehnProd, error: zErr } = await asOwner.rpc('create_pass_product', {
    p_name: '10er A6-3',
    p_units: 10,
    p_price_cents: 15000,
    p_validity_rule: 'years_to_year_end',
    p_validity_value: 3,
  });
  if (zErr || !zehnProd?.success) abbruch('10er: ' + (zErr?.message || JSON.stringify(zehnProd)));

  const { data: einsProd, error: eErr } = await asOwner.rpc('create_pass_product', {
    p_name: '1er A6-3',
    p_units: 1,
    p_price_cents: 2000,
    p_validity_rule: 'months',
    p_validity_value: 6,
  });
  if (eErr || !einsProd?.success) abbruch('1er: ' + (eErr?.message || JSON.stringify(einsProd)));

  const passRegs = []; // { regId, expectedNet } für Deckungsregel

  // ── 1) Abmeldung vor der Frist ──────────────────────────────────────────
  console.log('\n1) Abmeldung vor der Frist');
  const soldA1 = await verkaufen(asOwner, userA.id, zehnProd.id);
  const kurs1 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-3 Vor Frist',
    date: berlinDate(10),
  });
  const { data: reg1ok, error: r1e } = await asA.rpc('register_for_course', {
    p_course_id: kurs1.id,
    p_use_pass: true,
  });
  if (r1e || !reg1ok?.success) abbruch('reg1: ' + (r1e?.message || JSON.stringify(reg1ok)));
  const reg1 = await regRow(admin, kurs1.id, userA.id);
  const restBefore = await passRemaining(admin, soldA1.pass_id);

  const { data: un1, error: u1e } = await asA.rpc('unregister_from_course', {
    p_course_id: kurs1.id,
  });
  if (u1e) abbruch(u1e.message);
  ok(
    'pass_refunded true',
    un1?.success === true && un1?.pass_refunded === true,
    JSON.stringify(un1)
  );
  ok('Rest +1', (await passRemaining(admin, soldA1.pass_id)) === restBefore + 1);
  const reg1c = await regRow(admin, kurs1.id, userA.id, { cancelled: true });
  ok('Deckung open', reg1c?.coverage_status === 'open' && reg1c?.pass_id == null);
  const { data: mov1 } = await admin
    .from('pass_movements')
    .select('kind, reason, delta')
    .eq('registration_id', reg1.id)
    .eq('kind', 'redeem_reversal')
    .single();
  ok(
    'redeem_reversal self_in_window',
    mov1?.reason === 'self_in_window' && mov1?.delta === 1
  );
  passRegs.push({ regId: reg1.id, expectedNet: 0 });

  // ── 2) Abmeldung nach der Frist (Kurs in 24 h, Studio-Frist 72 h) ────────
  // Einfrierene Frist = Kursbeginn − 72 h → bei Kurs morgen bereits vorbei.
  console.log('\n2) Abmeldung nach der Frist');
  const soldA2 = await verkaufen(asOwner, userA.id, zehnProd.id);
  const kurs2 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-3 Nach Frist',
    date: berlinDate(1),
    time: '12:00:00',
    end_time: '13:00:00',
  });
  const { data: reg2ok } = await asA.rpc('register_for_course', {
    p_course_id: kurs2.id,
    p_use_pass: true,
  });
  if (!reg2ok?.success) abbruch('reg2: ' + JSON.stringify(reg2ok));
  const reg2 = await regRow(admin, kurs2.id, userA.id);
  ok(
    'Deadline liegt in der Vergangenheit',
    reg2?.cancellation_deadline != null &&
      new Date(reg2.cancellation_deadline).getTime() < Date.now(),
    String(reg2?.cancellation_deadline)
  );
  // Rest der tatsächlich eingelösten Karte (pick_pass, nicht zwingend soldA2).
  const pass2 = reg2.pass_id;
  ok('Fall 2 hat pass_id', !!pass2);
  const rest2before = await passRemaining(admin, pass2);
  const { data: un2, error: u2e } = await asA.rpc('unregister_from_course', {
    p_course_id: kurs2.id,
  });
  if (u2e) abbruch(u2e.message);
  ok(
    'pass_refunded false',
    un2?.success === true && un2?.pass_refunded === false,
    JSON.stringify(un2)
  );
  ok('Rest unverändert', (await passRemaining(admin, pass2)) === rest2before);
  void soldA2;
  const reg2c = await regRow(admin, kurs2.id, userA.id, { cancelled: true });
  ok('Deckung bleibt pass', reg2c?.coverage_status === 'pass');
  passRegs.push({ regId: reg2.id, expectedNet: -1 });

  // ── 3) Studio meldet ab (nach Frist) → trotzdem +1 (W1) ─────────────────
  console.log('\n3) Studio meldet ab nach Frist');
  const soldB3 = await verkaufen(asOwner, userB.id, zehnProd.id);
  const kurs3 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-3 Studio Ab',
    date: berlinDate(1),
    time: '14:00:00',
    end_time: '15:00:00',
  });
  const { data: reg3ok } = await asB.rpc('register_for_course', {
    p_course_id: kurs3.id,
    p_use_pass: true,
  });
  if (!reg3ok?.success) abbruch('reg3: ' + JSON.stringify(reg3ok));
  const reg3 = await regRow(admin, kurs3.id, userB.id);
  ok(
    'Deadline 3 Vergangenheit',
    reg3?.cancellation_deadline != null &&
      new Date(reg3.cancellation_deadline).getTime() < Date.now()
  );
  const rest3b = await passRemaining(admin, soldB3.pass_id);
  const { data: admUn, error: admUe } = await asOwner.rpc('admin_unregister_user_from_course', {
    p_user_id: userB.id,
    p_course_id: kurs3.id,
  });
  if (admUe) abbruch(admUe.message);
  ok('Studio pass_refunded', admUn?.success === true && admUn?.pass_refunded === true);
  ok('Rest +1 trotz Frist', (await passRemaining(admin, soldB3.pass_id)) === rest3b + 1);
  const { data: glocke3 } = await admin
    .from('user_notifications')
    .select('body')
    .eq('user_id', userB.id)
    .eq('course_id', kurs3.id)
    .eq('type', 'course_removed')
    .order('created_at', { ascending: false })
    .limit(1);
  ok(
    'Glocke Kartenhinweis',
    (glocke3?.[0]?.body || '').includes('Karteneinheit ist zurückgebucht')
  );
  const { data: mov3 } = await admin
    .from('pass_movements')
    .select('reason')
    .eq('registration_id', reg3.id)
    .eq('kind', 'redeem_reversal')
    .single();
  ok('reason studio_unregister', mov3?.reason === 'studio_unregister');
  passRegs.push({ regId: reg3.id, expectedNet: 0 });

  // ── 4) Kursabsage: 2 Karten + 1 Bar ─────────────────────────────────────
  console.log('\n4) Kursabsage 2 Karten + 1 Bar');
  const soldA4 = await verkaufen(asOwner, userA.id, zehnProd.id);
  const soldB4 = await verkaufen(asOwner, userB.id, zehnProd.id);
  const kurs4 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-3 Absage Mix',
    date: berlinDate(8),
    max_participants: 10,
  });
  await asA.rpc('register_for_course', { p_course_id: kurs4.id, p_use_pass: true });
  await asB.rpc('register_for_course', { p_course_id: kurs4.id, p_use_pass: true });
  await asC.rpc('register_for_course', { p_course_id: kurs4.id });
  const regA4 = await regRow(admin, kurs4.id, userA.id);
  const regB4 = await regRow(admin, kurs4.id, userB.id);
  const regC4 = await regRow(admin, kurs4.id, userC.id);
  const { data: payC, error: payCe } = await asOwner.rpc('record_manual_payment', {
    p_registration_id: regC4.id,
    p_method: 'cash',
  });
  if (payCe || !payC?.success) abbruch('pay C: ' + (payCe?.message || JSON.stringify(payC)));
  // pick_pass wählt die älteste passende Karte — nicht zwingend den frischen Verkauf.
  const passA4 = regA4.pass_id;
  const passB4 = regB4.pass_id;
  ok('Fall 4 A/B pass_id', !!passA4 && !!passB4);
  const ra4 = await passRemaining(admin, passA4);
  const rb4 = await passRemaining(admin, passB4);

  const { data: cancel4, error: c4e } = await asOwner.rpc('cancel_course', {
    p_course_id: kurs4.id,
    p_scope: 'single',
  });
  if (c4e) abbruch(c4e.message);
  ok(
    'pass_refunded 2',
    cancel4?.success === true && cancel4?.pass_refunded === 2,
    JSON.stringify(cancel4)
  );
  ok('paid_registrations 1', cancel4?.paid_registrations === 1);
  ok('Rest A +1', (await passRemaining(admin, passA4)) === ra4 + 1);
  ok('Rest B +1', (await passRemaining(admin, passB4)) === rb4 + 1);
  void soldA4;
  void soldB4;
  const regC4c = await regRow(admin, kurs4.id, userC.id, { cancelled: true });
  ok('Bar bleibt paid', regC4c?.coverage_status === 'paid');
  const { data: glA4 } = await admin
    .from('user_notifications')
    .select('body')
    .eq('user_id', userA.id)
    .eq('course_id', kurs4.id)
    .eq('type', 'course_canceled');
  ok(
    'Glocke A Karte',
    (glA4 || []).some((g) => (g.body || '').includes('Karteneinheit ist zurückgebucht'))
  );
  passRegs.push({ regId: regA4.id, expectedNet: 0 });
  passRegs.push({ regId: regB4.id, expectedNet: 0 });

  // ── 5) Absage mit inzwischen „abgelaufener“ Karte (E17) ─────────────────
  // Datumstrick: nach Einlösung Kursdatum hinter valid_until setzen →
  // reverse_redemption meldet pass_inactive (valid_until < Kursdatum).
  console.log('\n5) Absage, Karte abgelaufen → pass_refunded_inactive');
  const soldD5 = await verkaufen(asOwner, userD.id, zehnProd.id);
  const kurs5 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-3 Absage Expired',
    date: berlinDate(9),
  });
  await asD.rpc('register_for_course', { p_course_id: kurs5.id, p_use_pass: true });
  const regD5 = await regRow(admin, kurs5.id, userD.id);
  const passD5used = regD5.pass_id;
  ok('Fall 5 pass_id', !!passD5used);
  const { data: passD5 } = await admin
    .from('passes')
    .select('valid_until')
    .eq('id', passD5used)
    .single();
  const [yy, mm, dd] = passD5.valid_until.split('-').map(Number);
  const afterVu = new Date(Date.UTC(yy, mm - 1, dd + 1));
  const afterVuStr = `${afterVu.getUTCFullYear()}-${String(afterVu.getUTCMonth() + 1).padStart(2, '0')}-${String(afterVu.getUTCDate()).padStart(2, '0')}`;
  const { error: kursVu } = await admin
    .from('courses')
    .update({ date: afterVuStr, time: '18:00:00' })
    .eq('id', kurs5.id);
  if (kursVu) abbruch('Kurs nach Ablauf: ' + kursVu.message);

  const restD5 = await passRemaining(admin, passD5used);
  const { data: cancel5, error: c5e } = await asOwner.rpc('cancel_course', {
    p_course_id: kurs5.id,
    p_scope: 'single',
  });
  if (c5e) abbruch(c5e.message);
  ok(
    'pass_refunded_inactive 1',
    cancel5?.pass_refunded === 1 && cancel5?.pass_refunded_inactive === 1,
    JSON.stringify(cancel5)
  );
  ok('Trotzdem Rest +1', (await passRemaining(admin, passD5used)) === restD5 + 1);
  void soldD5;
  const { data: e17 } = await admin
    .from('user_notifications')
    .select('body')
    .eq('user_id', owner.id)
    .eq('course_id', kurs5.id)
    .ilike('body', '%abgelaufene Karten%');
  ok('Owner-Glocke E17', (e17 || []).length >= 1);
  passRegs.push({ regId: regD5.id, expectedNet: 0 });

  // ── 6) Absage zurücknehmen ──────────────────────────────────────────────
  console.log('\n6) Absage zurücknehmen');
  const soldA6 = await verkaufen(asOwner, userA.id, zehnProd.id);
  const soldB6 = await verkaufen(asOwner, userB.id, einsProd.id); // 1 Einheit
  const kurs6 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-3 Uncancel',
    date: berlinDate(12),
    max_participants: 5,
  });
  await asA.rpc('register_for_course', { p_course_id: kurs6.id, p_use_pass: true });
  await asB.rpc('register_for_course', { p_course_id: kurs6.id, p_use_pass: true });
  const regA6 = await regRow(admin, kurs6.id, userA.id);
  const regB6 = await regRow(admin, kurs6.id, userB.id);
  const { data: can6 } = await asOwner.rpc('cancel_course', {
    p_course_id: kurs6.id,
    p_scope: 'single',
  });
  if (!can6?.success) abbruch('cancel6: ' + JSON.stringify(can6));
  // Berta hat aus früheren Fällen noch 10er — alle Reste aufbrauchen, sonst
  // gelingt uncancel mit einer anderen Karte und W7 greift nicht.
  let regDrain = null;
  {
    let drainN = 0;
    for (;;) {
      const { data: bPasses } = await admin
        .from('passes')
        .select('id')
        .eq('member_id', userB.id)
        .eq('status', 'active');
      let total = 0;
      for (const p of bPasses || []) total += await passRemaining(admin, p.id);
      if (total <= 0) break;
      drainN += 1;
      const kDrain = await kursAnlegen(admin, tenant.id, teacher.id, {
        title: 'A6-3 Drain ' + drainN,
        date: berlinDate(13 + Math.min(drainN, 20)),
      });
      const { data: d } = await asB.rpc('register_for_course', {
        p_course_id: kDrain.id,
        p_use_pass: true,
      });
      if (!d?.success) abbruch('drain: ' + JSON.stringify(d));
      if (!regDrain) regDrain = await regRow(admin, kDrain.id, userB.id);
      if (drainN > 40) abbruch('drain: zu viele Iterationen');
    }
  }
  ok('Berta-Karten leer', true);
  void soldB6;

  const { data: annaPasses } = await admin
    .from('passes')
    .select('id')
    .eq('member_id', userA.id)
    .eq('status', 'active');
  const remAnnaBefore = {};
  for (const p of annaPasses || []) {
    remAnnaBefore[p.id] = await passRemaining(admin, p.id);
  }

  const { data: unc6, error: unc6e } = await asOwner.rpc('uncancel_course', {
    p_course_id: kurs6.id,
    p_scope: 'single',
  });
  if (unc6e) abbruch(unc6e.message);
  ok('uncancel success', unc6?.success === true, JSON.stringify(unc6));
  const regA6b = await regRow(admin, kurs6.id, userA.id);
  const regB6b = await regRow(admin, kurs6.id, userB.id);
  ok('Anna wieder pass', regA6b?.coverage_status === 'pass' && !!regA6b?.pass_id);
  ok(
    'Rest Anna −1',
    (await passRemaining(admin, regA6b.pass_id)) === remAnnaBefore[regA6b.pass_id] - 1
  );
  ok('Berta open (leer)', regB6b?.coverage_status === 'open');
  const { data: w7 } = await admin
    .from('user_notifications')
    .select('body')
    .eq('user_id', owner.id)
    .eq('course_id', kurs6.id)
    .ilike('body', '%nicht erneut mit Karte%');
  ok('Owner-Glocke W7', (w7 || []).length >= 1);
  passRegs.push({ regId: regA6.id, expectedNet: -1 }); // redeem, reverse, redeem
  passRegs.push({ regId: regB6.id, expectedNet: 0 }); // redeem, reverse, kein re-redeem
  if (regDrain) passRegs.push({ regId: regDrain.id, expectedNet: -1 });
  void soldA6;

  // ── 7) Warteliste Intent ────────────────────────────────────────────────
  console.log('\n7) Warteliste Nachrücken mit Intent');
  const soldA7 = await verkaufen(asOwner, userA.id, zehnProd.id);
  const soldB7 = await verkaufen(asOwner, userB.id, zehnProd.id);
  const kurs7 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-3 Waitlist',
    date: berlinDate(14),
    max_participants: 1,
  });
  await asA.rpc('register_for_course', { p_course_id: kurs7.id, p_use_pass: true });
  await asB.rpc('register_for_course', { p_course_id: kurs7.id, p_use_pass: true });
  const regA7 = await regRow(admin, kurs7.id, userA.id);
  const regB7wl = await regRow(admin, kurs7.id, userB.id);
  ok('Berta Warteliste intent', regB7wl?.is_waitlist === true && regB7wl?.coverage_intent === 'pass');
  // Nach Fall 6 sind Bertas Karten leer — frische soldB7 ist die einzige mit Rest.
  const rb7 = await passRemaining(admin, soldB7.pass_id);
  ok('Berta nur frische Karte mit Rest', rb7 >= 1);
  const { data: un7 } = await asA.rpc('unregister_from_course', { p_course_id: kurs7.id });
  if (!un7?.success) abbruch('un7: ' + JSON.stringify(un7));
  const regB7 = await regRow(admin, kurs7.id, userB.id);
  ok('Berta nachgerückt pass', regB7?.status === 'registered' && regB7?.coverage_status === 'pass');
  ok(
    'Rest Berta −1',
    regB7?.pass_id === soldB7.pass_id &&
      (await passRemaining(admin, soldB7.pass_id)) === rb7 - 1
  );
  const { data: glB7 } = await admin
    .from('user_notifications')
    .select('body')
    .eq('user_id', userB.id)
    .eq('type', 'waitlist_promoted')
    .eq('course_id', kurs7.id);
  ok(
    'Glocke mit Karte',
    (glB7 || []).some((g) => /mit deiner Karte bezahlt/i.test(g.body || ''))
  );
  passRegs.push({ regId: regA7.id, expectedNet: 0 });
  passRegs.push({ regId: regB7.id, expectedNet: -1 });
  void soldA7;

  // Variante ohne gültige Karte
  console.log('\n7b) Nachrücken ohne gültige Karte');
  const soldA7b = await verkaufen(asOwner, userA.id, zehnProd.id);
  const kurs7b = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-3 Waitlist Fail',
    date: berlinDate(15),
    max_participants: 1,
  });
  await asA.rpc('register_for_course', { p_course_id: kurs7b.id, p_use_pass: true });
  // Carla ohne Karte auf Warteliste mit Intent
  const { data: cWl } = await asC.rpc('register_for_course', {
    p_course_id: kurs7b.id,
    p_use_pass: true,
  });
  ok('Carla Warteliste', cWl?.success === true && cWl?.is_waitlist === true);
  const { data: un7b } = await asA.rpc('unregister_from_course', { p_course_id: kurs7b.id });
  ok('Abmeldung Anna ok', un7b?.success === true, JSON.stringify(un7b));
  const regC7b = await regRow(admin, kurs7b.id, userC.id);
  ok('Carla open', regC7b?.status === 'registered' && regC7b?.coverage_status === 'open');
  const { data: glC7b } = await admin
    .from('user_notifications')
    .select('body')
    .eq('user_id', userC.id)
    .eq('type', 'waitlist_promoted')
    .eq('course_id', kurs7b.id);
  ok(
    'Glocke vor Ort',
    (glC7b || []).some((g) => /bitte bezahle vor Ort/i.test(g.body || ''))
  );
  const regA7b = await regRow(admin, kurs7b.id, userA.id, { cancelled: true });
  passRegs.push({ regId: regA7b.id, expectedNet: 0 });
  void soldA7b;

  // ── 8) adjust_pass_units ────────────────────────────────────────────────
  console.log('\n8) adjust_pass_units');
  const soldAdj = await verkaufen(asOwner, userA.id, zehnProd.id);
  const remAdj = await passRemaining(admin, soldAdj.pass_id);
  const { data: adjOk, error: adjE } = await asOwner.rpc('adjust_pass_units', {
    p_pass_id: soldAdj.pass_id,
    p_delta: 2,
    p_reason: 'Korrektur Inventur',
  });
  if (adjE) abbruch(adjE.message);
  ok('adjust +2', adjOk?.success === true && adjOk?.remaining === remAdj + 2);
  const { data: adjNo } = await asOwner.rpc('adjust_pass_units', {
    p_pass_id: soldAdj.pass_id,
    p_delta: 1,
    p_reason: '',
  });
  ok('REASON_REQUIRED', adjNo?.success === false && adjNo?.error === 'REASON_REQUIRED');
  const { data: adjNeg } = await asOwner.rpc('adjust_pass_units', {
    p_pass_id: soldAdj.pass_id,
    p_delta: -100,
    p_reason: 'zu viel Abzug Test',
  });
  ok('NEGATIVE_BALANCE', adjNeg?.success === false && adjNeg?.error === 'NEGATIVE_BALANCE');
  const { data: adjT } = await asTeacher.rpc('adjust_pass_units', {
    p_pass_id: soldAdj.pass_id,
    p_delta: 1,
    p_reason: 'Lehrende darf nicht',
  });
  ok('Lehrer FORBIDDEN', adjT?.success === false && adjT?.error === 'FORBIDDEN');
  const { data: adjMov } = await admin
    .from('pass_movements')
    .select('reason, kind, delta')
    .eq('pass_id', soldAdj.pass_id)
    .eq('kind', 'manual_adjustment')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  ok('Grund in movement', adjMov?.reason === 'Korrektur Inventur' && adjMov?.delta === 2);
  const { data: adjEv } = await admin
    .from('events')
    .select('payload')
    .eq('type', 'pass.adjusted')
    .contains('payload', { pass_id: soldAdj.pass_id })
    .order('occurred_at', { ascending: false })
    .limit(1);
  ok(
    'Event ohne reason',
    adjEv?.[0]?.payload != null && !('reason' in (adjEv[0].payload || {}))
  );

  // ── 9) expire_passes ────────────────────────────────────────────────────
  console.log('\n9) expire_passes');
  const gestern = berlinDate(-1);
  const in14 = berlinDate(14);

  async function fixturePass({ memberId, name, units, validFrom, validUntil }) {
    const payId = crypto.randomUUID();
    const passId = crypto.randomUUID();
    const receivedAt = new Date().toISOString();
    const { error: payE } = await admin.from('payments').insert({
      id: payId,
      tenant_id: tenant.id,
      subject_type: 'pass_purchase',
      subject_id: passId,
      registration_id: null,
      provider: 'manual',
      method: 'cash',
      status: 'succeeded',
      amount_cents: 1000,
      currency: 'EUR',
      received_at: receivedAt,
      recorded_by: owner.id,
      created_at: receivedAt,
    });
    if (payE) abbruch('Fixture payment: ' + payE.message);
    const { data: pass, error: passE } = await admin
      .from('passes')
      .insert({
        id: passId,
        tenant_id: tenant.id,
        member_id: memberId,
        product_id: zehnProd.id,
        name,
        units_total: units,
        price_cents: 1000,
        validity_rule: 'months',
        validity_value: 1,
        valid_from: validFrom,
        valid_until: validUntil,
        payment_id: payId,
        status: 'active',
      })
      .select('id')
      .single();
    if (passE) abbruch('Fixture pass: ' + passE.message);
    const { error: movE } = await admin.from('pass_movements').insert({
      tenant_id: tenant.id,
      pass_id: pass.id,
      delta: units,
      kind: 'purchase',
      actor_member_id: owner.id,
    });
    if (movE) abbruch('Fixture movement: ' + movE.message);
    return pass;
  }

  const fixPass = await fixturePass({
    memberId: userA.id,
    name: 'Fixture Expired',
    units: 5,
    validFrom: berlinDate(-40),
    validUntil: gestern,
  });
  const warnPass = await fixturePass({
    memberId: userB.id,
    name: 'Fixture Expiring',
    units: 3,
    validFrom: berlinDate(-1),
    validUntil: in14,
  });

  const { data: n1, error: n1e } = await admin.rpc('expire_passes', { p_limit: 500 });
  if (n1e) abbruch('expire_passes: ' + n1e.message);
  ok('expire verarbeitet ≥ 1', typeof n1 === 'number' && n1 >= 1, String(n1));
  const { data: fixAfter } = await admin
    .from('passes')
    .select('status')
    .eq('id', fixPass.id)
    .single();
  ok('Status expired', fixAfter?.status === 'expired');
  const { data: expMov } = await admin
    .from('pass_movements')
    .select('kind, delta')
    .eq('pass_id', fixPass.id)
    .eq('kind', 'expire');
  ok('Bewegung expire −5', expMov?.length === 1 && expMov[0].delta === -5);
  const { data: expEv } = await admin
    .from('events')
    .select('id')
    .eq('type', 'pass.expired')
    .eq('subject_id', fixPass.id);
  ok('Event pass.expired', (expEv || []).length >= 1);

  const { data: n2, error: n2e } = await admin.rpc('expire_passes', { p_limit: 500 });
  if (n2e) abbruch('expire 2: ' + n2e.message);
  ok('zweiter Aufruf 0 für Verfall', n2 === 0 || n2 === 1, String(n2));
  // n2 kann 1 sein wenn Vorwarnung erst im zweiten Lauf kam — dann n3 = 0
  const { data: warnEv } = await admin
    .from('events')
    .select('id')
    .eq('type', 'pass.expiring')
    .eq('subject_id', warnPass.id);
  ok('genau ein pass.expiring', (warnEv || []).length === 1);
  const { data: n3, error: n3e } = await admin.rpc('expire_passes', { p_limit: 500 });
  if (n3e) abbruch('expire 3: ' + n3e.message);
  ok('dritter Aufruf 0', n3 === 0, String(n3));
  const { data: warnEv2 } = await admin
    .from('events')
    .select('id')
    .eq('type', 'pass.expiring')
    .eq('subject_id', warnPass.id);
  ok('weiterhin ein pass.expiring', (warnEv2 || []).length === 1);

  // ── 10) Deckungsregel ───────────────────────────────────────────────────
  console.log('\n10) Deckungsregel Netto');
  for (const { regId, expectedNet } of passRegs) {
    const { net } = await netDeltaForReg(admin, regId);
    ok(`Netto reg ${regId.slice(0, 8)} = ${expectedNet}`, net === expectedNet, `ist ${net}`);
  }

  console.log('\nAufräumen…');
  await resteEntfernen(admin);
  console.log('\nA6-3 reverse: alle Checks grün.\n');
}

main().catch(async (err) => {
  console.error('\n' + (err?.message || err));
  if (devOk) {
    try {
      const env = ladeEnv();
      const admin = clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      await resteEntfernen(admin);
    } catch (e) {
      console.error('Aufräumen fehlgeschlagen:', e?.message || e);
    }
  }
  process.exit(1);
});
