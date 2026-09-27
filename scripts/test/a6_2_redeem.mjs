#!/usr/bin/env node
/**
 * A6-2 — Einlösen beim Buchen / nachträglich / Undo (nur DEV).
 *
 * Nicht ausführen, bevor 20260927233000_a6_2_redeem.sql und
 * 20260927235000_a6_2b_tenant_delete_cycle.sql auf DEV liegen.
 * Gegen PROD nie. Eigenes Studio a62redeemtest, am Ende
 * delete_tenant_complete und auth.admin.deleteUser.
 *
 * 12) remove_member nach echter Einlösung → anonymized, Buchung+Bewegung bleiben.
 * 13) delete_tenant_complete mit eingelöster Buchung → Studio weg.
 *
 * Verwendung: node scripts/test/a6_2_redeem.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a62redeemtest';

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
      title: opts.title || 'A6-2 Kurs',
      description: 'A6-2 Testkurs Beschreibung',
      date: opts.date || berlinDate(3),
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
    .select('id, date, price, pass_eligible, max_participants')
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

async function regRow(admin, courseId, userId) {
  const { data, error } = await admin
    .from('registrations')
    .select(
      'id, coverage_status, pass_id, coverage_intent, status, is_waitlist, cancellation_timestamp'
    )
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .is('cancellation_timestamp', null)
    .maybeSingle();
  if (error) abbruch('reg lesen: ' + error.message);
  return data;
}

async function passRemaining(admin, passId) {
  // Wie yogaflow_private.pass_remaining: Summe der Bewegungs-deltas
  // (Purchase +units, redeem −1, …). units_total nicht zusätzlich addieren.
  const { data: moves, error } = await admin
    .from('pass_movements')
    .select('delta')
    .eq('pass_id', passId);
  if (error) abbruch('movements: ' + error.message);
  return (moves || []).reduce((a, m) => a + Number(m.delta), 0);
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
    .insert({ name: 'A6-2 Redeem', slug: SLUG })
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
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com',
    vorname: 'Tom',
    nachname: 'Teacher',
    rolle: 'teacher',
    tenantId: tenant.id,
    password,
  });
  const teacher2 = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher2@example.com',
    vorname: 'Tina',
    nachname: 'Teacher2',
    rolle: 'teacher',
    tenantId: tenant.id,
    password,
  });
  const user = await nutzerAnlegen(admin, {
    email: SLUG + '.user@example.com',
    vorname: 'Anna',
    nachname: 'Andersen',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });
  const user2 = await nutzerAnlegen(admin, {
    email: SLUG + '.user2@example.com',
    vorname: 'Berta',
    nachname: 'Brandt',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });
  const user3 = await nutzerAnlegen(admin, {
    email: SLUG + '.user3@example.com',
    vorname: 'Carla',
    nachname: 'Conrad',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });

  const asOwner = await login(url, anon, owner.email, password);
  const asTeacher = await login(url, anon, teacher.email, password);
  const asTeacher2 = await login(url, anon, teacher2.email, password);
  const asUser = await login(url, anon, user.email, password);
  const asUser2 = await login(url, anon, user2.email, password);
  const asUser3 = await login(url, anon, user3.email, password);

  const { data: zehnProd, error: zErr } = await asOwner.rpc('create_pass_product', {
    p_name: '10er A6-2',
    p_units: 10,
    p_price_cents: 15000,
    p_validity_rule: 'years_to_year_end',
    p_validity_value: 3,
  });
  if (zErr || !zehnProd?.success) abbruch('10er: ' + (zErr?.message || JSON.stringify(zehnProd)));

  const { data: fuenfProd, error: fErr } = await asOwner.rpc('create_pass_product', {
    p_name: '5er A6-2',
    p_units: 5,
    p_price_cents: 8000,
    p_validity_rule: 'months',
    p_validity_value: 6,
  });
  if (fErr || !fuenfProd?.success) abbruch('5er: ' + (fErr?.message || JSON.stringify(fuenfProd)));

  const { data: einsProd, error: eErr } = await asOwner.rpc('create_pass_product', {
    p_name: '1er A6-2',
    p_units: 1,
    p_price_cents: 1800,
    p_validity_rule: 'years_to_year_end',
    p_validity_value: 1,
  });
  if (eErr || !einsProd?.success) abbruch('1er: ' + (eErr?.message || JSON.stringify(einsProd)));

  // ── 1) Selbstbuchung mit Karte ──────────────────────────────────────────
  console.log('\n1) Selbstbuchung mit Karte');
  const soldAnna = await verkaufen(asOwner, user.id, zehnProd.id);
  const kurs1 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Selbstkarte',
    date: berlinDate(5),
  });

  const { data: selfOk, error: selfErr } = await asUser.rpc('register_for_course', {
    p_course_id: kurs1.id,
    p_use_pass: true,
  });
  if (selfErr) abbruch(selfErr.message);
  ok(
    'Selbst mit Karte',
    selfOk?.success === true
      && selfOk.coverage === 'pass'
      && selfOk.pass_remaining === 9
      && selfOk.is_waitlist === false,
    JSON.stringify(selfOk)
  );

  const reg1 = await regRow(admin, kurs1.id, user.id);
  ok(
    'Deckung pass + pass_id',
    reg1?.coverage_status === 'pass' && reg1?.pass_id === soldAnna.pass_id
  );
  ok('Rest 9', (await passRemaining(admin, soldAnna.pass_id)) === 9);

  const { data: mov1, error: m1Err } = await admin
    .from('pass_movements')
    .select('id, kind, delta, registration_id, actor_member_id')
    .eq('registration_id', reg1.id)
    .eq('kind', 'redeem')
    .single();
  if (m1Err) abbruch(m1Err.message);
  ok(
    'Bewegung redeem',
    mov1.delta === -1 && mov1.registration_id === reg1.id && mov1.actor_member_id === user.id
  );

  const { data: ev1, error: ev1Err } = await admin
    .from('events')
    .select('id, type')
    .eq('type', 'pass.redeemed')
    .contains('payload', { registration_id: reg1.id });
  if (ev1Err) abbruch(ev1Err.message);
  ok('Event pass.redeemed', (ev1 || []).length >= 1);

  const { data: pays1, error: pay1Err } = await admin
    .from('payments')
    .select('id')
    .eq('registration_id', reg1.id);
  if (pay1Err) abbruch(pay1Err.message);
  ok('Keine Zahlungszeile', (pays1 || []).length === 0);

  // ── 2) Ohne gültige Karte ───────────────────────────────────────────────
  console.log('\n2) Selbstbuchung ohne gültige Karte');
  const kurs2 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Ohne Karte',
    date: berlinDate(6),
  });
  const { data: noPass, error: noPassErr } = await asUser2.rpc('register_for_course', {
    p_course_id: kurs2.id,
    p_use_pass: true,
  });
  if (noPassErr) abbruch(noPassErr.message);
  ok(
    'NO_VALID_PASS',
    noPass?.success === false && noPass?.error === 'NO_VALID_PASS',
    JSON.stringify(noPass)
  );
  ok('Keine Buchung', (await regRow(admin, kurs2.id, user2.id)) == null);

  // ── 3) Früherer Ablauf gewinnt ──────────────────────────────────────────
  console.log('\n3) Zwei Karten — früherer Ablauf');
  const sold5 = await verkaufen(asOwner, user2.id, fuenfProd.id);
  const sold10b = await verkaufen(asOwner, user2.id, zehnProd.id);
  const { data: p5 } = await admin.from('passes').select('id, valid_until').eq('id', sold5.pass_id).single();
  const { data: p10 } = await admin.from('passes').select('id, valid_until').eq('id', sold10b.pass_id).single();
  ok('5er läuft früher ab', p5.valid_until < p10.valid_until, `${p5.valid_until} vs ${p10.valid_until}`);

  const kurs3 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Ablaufwahl',
    date: berlinDate(7),
  });
  const { data: pick, error: pickErr } = await asUser2.rpc('register_for_course', {
    p_course_id: kurs3.id,
    p_use_pass: true,
  });
  if (pickErr) abbruch(pickErr.message);
  ok('Buchung ok', pick?.success === true);
  const reg3 = await regRow(admin, kurs3.id, user2.id);
  ok('5er gewählt', reg3?.pass_id === sold5.pass_id, `got ${reg3?.pass_id}`);

  // ── 4) Karte läuft vor Kurstag ab ───────────────────────────────────────
  console.log('\n4) Karte vor Kurstag abgelaufen');
  const kursSpaet = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 In 8 Monaten',
    date: berlinDate(240),
  });
  // user2 hat noch 10er (lang) und 5er (kurz, Rest 4). 5er reicht nicht für Tag +240.
  // Nur 5er gültig machen: 10er entziehen durch Rest aufbrauchen? Einfacher: neue Person nur mit 5er.
  const only5 = await verkaufen(asOwner, user3.id, fuenfProd.id);
  const { data: spaet, error: spaetErr } = await asUser3.rpc('register_for_course', {
    p_course_id: kursSpaet.id,
    p_use_pass: true,
  });
  if (spaetErr) abbruch(spaetErr.message);
  ok(
    'NO_VALID_PASS (Ablauf)',
    spaet?.success === false && spaet?.error === 'NO_VALID_PASS',
    JSON.stringify(spaet)
  );
  ok('Keine Buchung spaet', (await regRow(admin, kursSpaet.id, user3.id)) == null);
  void only5;

  // ── 5) pass_eligible false + kostenlos ──────────────────────────────────
  console.log('\n5) pass_eligible / kostenlos');
  const kursNe = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Nicht eligible',
    date: berlinDate(8),
    pass_eligible: false,
  });
  // user hat noch Rest auf 10er
  const { data: ne, error: neErr } = await asUser.rpc('register_for_course', {
    p_course_id: kursNe.id,
    p_use_pass: true,
  });
  if (neErr) abbruch(neErr.message);
  ok(
    'pass_eligible false → NO_VALID_PASS',
    ne?.success === false && ne?.error === 'NO_VALID_PASS',
    JSON.stringify(ne)
  );

  const kursFree = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Kostenlos',
    date: berlinDate(9),
    price: 0,
  });
  const remBeforeFree = await passRemaining(admin, soldAnna.pass_id);
  const { data: free, error: freeErr } = await asUser.rpc('register_for_course', {
    p_course_id: kursFree.id,
    p_use_pass: true,
  });
  if (freeErr) abbruch(freeErr.message);
  ok(
    'Kostenlos ignoriert Karte',
    free?.success === true && free?.coverage === 'not_required',
    JSON.stringify(free)
  );
  const regFree = await regRow(admin, kursFree.id, user.id);
  ok('Deckung not_required', regFree?.coverage_status === 'not_required' && regFree?.pass_id == null);
  ok('Rest unverändert (free)', (await passRemaining(admin, soldAnna.pass_id)) === remBeforeFree);

  // ── 6) Parallel Rest 1 ──────────────────────────────────────────────────
  console.log('\n6) Parallel Rest 1');
  const sold1 = await verkaufen(asOwner, user3.id, einsProd.id);
  const kursP1 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Parallel A',
    date: berlinDate(10),
  });
  const kursP2 = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Parallel B',
    date: berlinDate(11),
  });
  const [rA, rB] = await Promise.all([
    asUser3.rpc('register_for_course', { p_course_id: kursP1.id, p_use_pass: true }),
    asUser3.rpc('register_for_course', { p_course_id: kursP2.id, p_use_pass: true }),
  ]);
  if (rA.error) abbruch('parallel A: ' + rA.error.message);
  if (rB.error) abbruch('parallel B: ' + rB.error.message);
  const successes = [rA.data, rB.data].filter((d) => d?.success === true);
  const fails = [rA.data, rB.data].filter((d) => d?.success === false && d?.error === 'NO_VALID_PASS');
  ok('Genau eine mit Karte', successes.length === 1, JSON.stringify([rA.data, rB.data]));
  ok('Andere NO_VALID_PASS', fails.length === 1, JSON.stringify([rA.data, rB.data]));
  ok('Rest 0', (await passRemaining(admin, sold1.pass_id)) === 0);

  // ── 7) Warteliste mit Karte ─────────────────────────────────────────────
  console.log('\n7) Warteliste mit coverage_intent');
  const kursFull = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Voll',
    date: berlinDate(12),
    max_participants: 1,
  });
  // Platz belegen (open)
  const { data: filler, error: fillErr } = await asUser2.rpc('register_for_course', {
    p_course_id: kursFull.id,
  });
  if (fillErr || !filler?.success) abbruch('Filler: ' + (fillErr?.message || JSON.stringify(filler)));

  const remWl = await passRemaining(admin, soldAnna.pass_id);
  const { data: wl, error: wlErr } = await asUser.rpc('register_for_course', {
    p_course_id: kursFull.id,
    p_use_pass: true,
  });
  if (wlErr) abbruch(wlErr.message);
  ok(
    'Warteliste',
    wl?.success === true && wl?.is_waitlist === true,
    JSON.stringify(wl)
  );
  const regWl = await regRow(admin, kursFull.id, user.id);
  ok('coverage_intent pass', regWl?.coverage_intent === 'pass' && regWl?.coverage_status === 'open');
  ok('Rest unverändert (WL)', (await passRemaining(admin, soldAnna.pass_id)) === remWl);

  // ── 8) Studio trägt ein ─────────────────────────────────────────────────
  console.log('\n8) admin_register Deckung');
  const kursAdmin = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Admin Pass',
    date: berlinDate(13),
  });
  // user2 hat noch Rest auf 5er und 10er — pass einlösen
  const { data: admPass, error: admPassErr } = await asOwner.rpc('admin_register_user_for_course', {
    p_user_id: user2.id,
    p_course_id: kursAdmin.id,
    p_coverage: 'pass',
  });
  if (admPassErr) abbruch(admPassErr.message);
  ok(
    'Studio pass',
    admPass?.success === true && admPass?.coverage === 'pass',
    JSON.stringify(admPass)
  );
  const regAdmPass = await regRow(admin, kursAdmin.id, user2.id);
  ok('Eingelöst', regAdmPass?.coverage_status === 'pass' && regAdmPass?.pass_id != null);

  const kursCash = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Admin Cash',
    date: berlinDate(14),
  });
  const { data: admCash, error: admCashErr } = await asOwner.rpc('admin_register_user_for_course', {
    p_user_id: user2.id,
    p_course_id: kursCash.id,
    p_coverage: 'cash',
  });
  if (admCashErr) abbruch(admCashErr.message);
  ok(
    'Studio cash',
    admCash?.success === true && admCash?.coverage === 'paid',
    JSON.stringify(admCash)
  );
  const regCash = await regRow(admin, kursCash.id, user2.id);
  ok('Deckung paid', regCash?.coverage_status === 'paid');
  const { data: paysCash } = await admin
    .from('payments')
    .select('id')
    .eq('registration_id', regCash.id);
  ok('Zahlung 1 Zeile', (paysCash || []).length === 1);

  const kursWlCash = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 WL Cash',
    date: berlinDate(15),
    max_participants: 1,
  });
  await asUser.rpc('register_for_course', { p_course_id: kursWlCash.id });
  const { data: wlCash, error: wlCashErr } = await asOwner.rpc('admin_register_user_for_course', {
    p_user_id: user2.id,
    p_course_id: kursWlCash.id,
    p_coverage: 'cash',
  });
  if (wlCashErr) abbruch(wlCashErr.message);
  ok(
    'WAITLIST_NO_PAYMENT',
    wlCash?.success === false && wlCash?.error === 'WAITLIST_NO_PAYMENT',
    JSON.stringify(wlCash)
  );

  const { data: inv, error: invErr } = await asOwner.rpc('admin_register_user_for_course', {
    p_user_id: user2.id,
    p_course_id: kursCash.id,
    p_coverage: 'stripe',
  });
  if (invErr) abbruch(invErr.message);
  // already registered on kursCash — need fresh course for INVALID_COVERAGE
  const kursInv = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Invalid',
    date: berlinDate(16),
  });
  const { data: inv2, error: inv2Err } = await asOwner.rpc('admin_register_user_for_course', {
    p_user_id: user2.id,
    p_course_id: kursInv.id,
    p_coverage: 'stripe',
  });
  if (inv2Err) abbruch(inv2Err.message);
  ok(
    'INVALID_COVERAGE',
    inv2?.success === false && inv2?.error === 'INVALID_COVERAGE',
    JSON.stringify(inv2)
  );
  void inv;

  // ── 9) apply_pass_to_registration ───────────────────────────────────────
  console.log('\n9) apply_pass_to_registration');
  const kursApply = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Apply',
    date: berlinDate(17),
  });
  const { data: openReg, error: openErr } = await asUser.rpc('register_for_course', {
    p_course_id: kursApply.id,
  });
  if (openErr || !openReg?.success) abbruch('open book: ' + (openErr?.message || JSON.stringify(openReg)));
  const regApply = await regRow(admin, kursApply.id, user.id);
  ok('offen', regApply?.coverage_status === 'open');

  const { data: applyOk, error: applyErr } = await asOwner.rpc('apply_pass_to_registration', {
    p_registration_id: regApply.id,
  });
  if (applyErr) abbruch(applyErr.message);
  ok(
    'open → pass',
    applyOk?.success === true && applyOk.pass_id === soldAnna.pass_id,
    JSON.stringify(applyOk)
  );

  const kursFremd = await kursAnlegen(admin, tenant.id, teacher2.id, {
    title: 'A6-2 Fremd',
    date: berlinDate(18),
  });
  const { data: openFremd } = await asUser.rpc('register_for_course', {
    p_course_id: kursFremd.id,
  });
  void openFremd;
  const regFremd = await regRow(admin, kursFremd.id, user.id);
  const { data: applyTeacher, error: atErr } = await asTeacher.rpc('apply_pass_to_registration', {
    p_registration_id: regFremd.id,
  });
  if (atErr) abbruch(atErr.message);
  ok(
    'Lehrende fremder Kurs FORBIDDEN',
    applyTeacher?.success === false && applyTeacher?.error === 'FORBIDDEN',
    JSON.stringify(applyTeacher)
  );

  // Teilnehmerin eigene vor Beginn
  const { data: applySelf, error: asErr } = await asUser.rpc('apply_pass_to_registration', {
    p_registration_id: regFremd.id,
  });
  if (asErr) abbruch(asErr.message);
  ok(
    'Teilnehmerin vor Beginn ok',
    applySelf?.success === true,
    JSON.stringify(applySelf)
  );

  // nach Beginn
  const kursPast = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Past Apply',
    date: berlinDate(20),
  });
  const { data: openPast } = await asUser.rpc('register_for_course', {
    p_course_id: kursPast.id,
  });
  void openPast;
  const regPast = await regRow(admin, kursPast.id, user.id);
  const { error: pastErr } = await admin
    .from('courses')
    .update({ date: berlinDate(-1), time: '10:00:00' })
    .eq('id', kursPast.id);
  if (pastErr) abbruch('Kurs Vergangenheit: ' + pastErr.message);
  const { data: applyPast, error: apErr } = await asUser.rpc('apply_pass_to_registration', {
    p_registration_id: regPast.id,
  });
  if (apErr) abbruch(apErr.message);
  ok(
    'nach Beginn FORBIDDEN',
    applyPast?.success === false && applyPast?.error === 'FORBIDDEN',
    JSON.stringify(applyPast)
  );

  // schon paid
  const kursPaid = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Paid Apply',
    date: berlinDate(21),
  });
  const { data: bookPaid } = await asUser.rpc('register_for_course', {
    p_course_id: kursPaid.id,
  });
  void bookPaid;
  const regPaid = await regRow(admin, kursPaid.id, user.id);
  const { data: payRec, error: payRecErr } = await asOwner.rpc('record_manual_payment', {
    p_registration_id: regPaid.id,
    p_method: 'cash',
  });
  if (payRecErr || !payRec?.success) abbruch('pay: ' + (payRecErr?.message || JSON.stringify(payRec)));
  const { data: applyPaid, error: apdErr } = await asOwner.rpc('apply_pass_to_registration', {
    p_registration_id: regPaid.id,
  });
  if (apdErr) abbruch(apdErr.message);
  ok(
    'paid → NOT_OPEN',
    applyPaid?.success === false && applyPaid?.error === 'NOT_OPEN',
    JSON.stringify(applyPaid)
  );

  // ── 10) undo_pass_redemption ────────────────────────────────────────────
  console.log('\n10) undo_pass_redemption');
  const kursUndo = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Undo',
    date: berlinDate(22),
  });
  // frische Karte für user3 (Rest war 0)
  const soldUndo = await verkaufen(asOwner, user3.id, zehnProd.id);
  const { data: admTeacher, error: admTErr } = await asTeacher.rpc('admin_register_user_for_course', {
    p_user_id: user3.id,
    p_course_id: kursUndo.id,
    p_coverage: 'pass',
  });
  if (admTErr || !admTeacher?.success) {
    abbruch('Teacher register: ' + (admTErr?.message || JSON.stringify(admTeacher)));
  }
  const regUndo = await regRow(admin, kursUndo.id, user3.id);
  const remAfterRedeem = await passRemaining(admin, soldUndo.pass_id);

  const { data: undoT, error: undoTErr } = await asTeacher.rpc('undo_pass_redemption', {
    p_registration_id: regUndo.id,
  });
  if (undoTErr) abbruch(undoTErr.message);
  ok(
    'Lehrende eigene Einlösung sofort',
    undoT?.success === true && undoT?.coverage === 'open',
    JSON.stringify(undoT)
  );
  const regUndoAfter = await regRow(admin, kursUndo.id, user3.id);
  ok('Deckung wieder open', regUndoAfter?.coverage_status === 'open' && regUndoAfter?.pass_id == null);
  ok('Rest +1', (await passRemaining(admin, soldUndo.pass_id)) === remAfterRedeem + 1);

  const { data: revMov } = await admin
    .from('pass_movements')
    .select('kind, delta')
    .eq('registration_id', regUndo.id)
    .eq('kind', 'redeem_reversal');
  ok('Bewegung redeem_reversal', (revMov || []).length === 1 && revMov[0].delta === 1);

  // erneut einlösen durch Owner, dann Teacher undo → FORBIDDEN (fremde Einlösung)
  const { data: reApply, error: reErr } = await asOwner.rpc('apply_pass_to_registration', {
    p_registration_id: regUndo.id,
  });
  if (reErr || !reApply?.success) abbruch('re-apply: ' + (reErr?.message || JSON.stringify(reApply)));
  const { data: undoFremd, error: ufErr } = await asTeacher.rpc('undo_pass_redemption', {
    p_registration_id: regUndo.id,
  });
  if (ufErr) abbruch(ufErr.message);
  ok(
    'Lehrende fremde Einlösung FORBIDDEN',
    undoFremd?.success === false && undoFremd?.error === 'FORBIDDEN',
    JSON.stringify(undoFremd)
  );

  const { data: undoOwner, error: uoErr } = await asOwner.rpc('undo_pass_redemption', {
    p_registration_id: regUndo.id,
  });
  if (uoErr) abbruch(uoErr.message);
  ok('Owner undo ok', undoOwner?.success === true, JSON.stringify(undoOwner));

  // Teilnehmerin FORBIDDEN
  const { data: applyAgain } = await asOwner.rpc('apply_pass_to_registration', {
    p_registration_id: regUndo.id,
  });
  void applyAgain;
  const { data: undoUser, error: uuErr } = await asUser3.rpc('undo_pass_redemption', {
    p_registration_id: regUndo.id,
  });
  if (uuErr) abbruch(uuErr.message);
  ok(
    'Teilnehmerin FORBIDDEN',
    undoUser?.success === false && undoUser?.error === 'FORBIDDEN',
    JSON.stringify(undoUser)
  );

  // ── 11) Deckungsregel ───────────────────────────────────────────────────
  console.log('\n11) Deckungsregel redeem-Summe');
  const { data: passRegs, error: prErr } = await admin
    .from('registrations')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('coverage_status', 'pass');
  if (prErr) abbruch(prErr.message);
  for (const r of passRegs || []) {
    const { data: moves, error: mvErr } = await admin
      .from('pass_movements')
      .select('delta, kind')
      .eq('registration_id', r.id)
      .in('kind', ['redeem', 'redeem_reversal']);
    if (mvErr) abbruch(mvErr.message);
    const sum = (moves || []).reduce((a, m) => a + Number(m.delta), 0);
    ok(`Summe redeem± für ${r.id.slice(0, 8)} = −1`, sum === -1, `sum=${sum}`);
  }

  // ── 12) remove_member mit echter Einlösung ──────────────────────────────
  console.log('\n12) remove_member nach Einlösung');
  const removeTarget = await nutzerAnlegen(admin, {
    email: SLUG + '.remove@example.com',
    vorname: 'Rita',
    nachname: 'Remove',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });
  const soldRm = await verkaufen(asOwner, removeTarget.id, zehnProd.id);
  const kursRm = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: 'A6-2 Remove',
    date: berlinDate(25),
  });
  const asRemove = await login(url, anon, removeTarget.email, password);
  const { data: rmBook, error: rmBookErr } = await asRemove.rpc('register_for_course', {
    p_course_id: kursRm.id,
    p_use_pass: true,
  });
  if (rmBookErr || !rmBook?.success) {
    abbruch('remove book: ' + (rmBookErr?.message || JSON.stringify(rmBook)));
  }
  const regRm = await regRow(admin, kursRm.id, removeTarget.id);
  const movIdBefore = (
    await admin
      .from('pass_movements')
      .select('id')
      .eq('registration_id', regRm.id)
      .eq('kind', 'redeem')
      .single()
  ).data?.id;

  const { data: removed, error: rmErr } = await asOwner.rpc('remove_member', {
    p_member_id: removeTarget.id,
  });
  if (rmErr || !removed?.success) {
    abbruch('remove_member: ' + (rmErr?.message || JSON.stringify(removed)));
  }
  const { data: anonUser } = await admin
    .from('users')
    .select('anonymized_at')
    .eq('id', removeTarget.id)
    .single();
  ok('anonymized', anonUser?.anonymized_at != null);
  const { data: regRmAfter } = await admin
    .from('registrations')
    .select('id, coverage_status, pass_id')
    .eq('id', regRm.id)
    .single();
  ok(
    'Buchung bleibt',
    regRmAfter?.coverage_status === 'pass' && regRmAfter?.pass_id === soldRm.pass_id
  );
  const { data: movRmAfter } = await admin
    .from('pass_movements')
    .select('id')
    .eq('id', movIdBefore)
    .maybeSingle();
  ok('Bewegung bleibt', movRmAfter?.id === movIdBefore);

  // ── 13) delete_tenant_complete mit eingelöster Buchung ──────────────────
  console.log('\n13) delete_tenant_complete mit Einlösung');
  const { data: stillPass, error: spErr } = await admin
    .from('registrations')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('coverage_status', 'pass')
    .limit(1);
  if (spErr) abbruch(spErr.message);
  ok('Studio hat eingelöste Buchung', (stillPass || []).length >= 1);

  const { error: delErr } = await admin.rpc('delete_tenant_complete', {
    p_tenant_id: tenant.id,
  });
  ok('delete_tenant_complete', !delErr, delErr?.message);

  const { data: gone, error: goneErr } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenant.id);
  if (goneErr) abbruch(goneErr.message);
  ok('Studio gelöscht', (gone || []).length === 0);

  console.log('\nAufräumen Auth');
  for (const u of await authNutzer(admin)) {
    const { error: e } = await admin.auth.admin.deleteUser(u.id);
    if (e && !/not found/i.test(e.message)) {
      abbruch('Auth-Nutzer ' + u.email + ': ' + e.message);
    }
  }
  console.log('\nA6-2 Redeem: alle Fälle grün\n');
}

main().catch(async (e) => {
  console.error('\n' + (e.abbruch ? e.message : e.stack || e.message));
  if (devOk) {
    try {
      const env = ladeEnv();
      const admin = clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, SLUG);
      await resteEntfernen(admin);
      console.error('(Studio-Reste entfernt)');
    } catch (cleanupErr) {
      console.error('Cleanup fehlgeschlagen:', cleanupErr.message);
    }
  }
  process.exit(1);
});
