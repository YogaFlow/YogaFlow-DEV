#!/usr/bin/env node
/**
 * A9 — Kurs absagen (nur DEV).
 *
 * Nicht ausführen, bevor 20260927143000_a9_course_cancel.sql auf DEV liegt.
 * Gegen PROD nie. Eigenes Studio `a9canceltest`, am Ende delete_tenant_complete.
 * Bleibt etwas liegen: Slug a9canceltest, Konten a9canceltest.*@example.com.
 *
 * Fälle:
 *  1) Kapazität 2: A und B angemeldet, C Warteliste, D hatte sich selbst abgemeldet.
 *     A bar bezahlt. Lehrende sagt ab → A, B, C cancelled/course_cancelled,
 *     C nicht nachgerückt, keine waitlist_promoted-Glocke, je eine course_canceled-Glocke,
 *     Owner-Glocke „1 Person hatte bereits bezahlt“. A bleibt paid.
 *  2) Owner vermerkt die Rückgabe → A open.
 *  3) register_for_course → kein Erfolg. admin_register → COURSE_NOT_AVAILABLE.
 *  4) Direktes UPDATE status als Owner (authenticated) → Fehler.
 *     Direkter INSERT mit status = canceled als authenticated → Fehler.
 *  5) Rücknahme → A und B registered, C Warteliste Position 1, Glocken course_uncanceled,
 *     Kurs active. A ist open. D bleibt storniert (participant).
 *  6) Serie mit 3 künftigen Terminen: Absage ab dem zweiten → 2 und 3 canceled, 1 active.
 *     Rücknahme ab dem zweiten → beide wieder active.
 *  7) Lehrende, fremder Kurs → FORBIDDEN. Serie mit einem Termin einer anderen
 *     Lehrperson → dieser bleibt active.
 *  8) Schon begonnen → ALREADY_STARTED (Datum per service_role auf gestern, nicht status).
 *  9) Regression: a1_soft_cancel.mjs und a3_payments.mjs.
 *
 * Verwendung: node scripts/test/a9_cancel.mjs
 */
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a9canceltest';
const GRUND = 'Regen';

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

function tag(versatzTage) {
  const d = new Date();
  d.setDate(d.getDate() + versatzTage);
  return d.toISOString().slice(0, 10);
}

function ok(name, cond, detail = '') {
  if (!cond) abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
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

async function login(url, anon, email, password) {
  const c = clientMitTenant(url, anon, SLUG);
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
    if (e) abbruch('Auth-Nutzer ' + u.email + ': ' + e.message);
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

async function anmelden(client, courseId, wer) {
  const { data, error } = await client.rpc('register_for_course', { p_course_id: courseId });
  if (error) abbruch(`Anmeldung ${wer}: ${error.message}`);
  if (!data?.success) abbruch(`Anmeldung ${wer}: ${data?.message || data?.error || 'kein Erfolg'}`);
  return data;
}

async function buchung(admin, courseId, userId) {
  const { data, error } = await admin
    .from('registrations')
    .select('id, user_id, status, cancel_reason, is_waitlist, waitlist_position, coverage_status, cancellation_timestamp')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .order('registered_at', { ascending: false });
  if (error) abbruch('registrations lesen: ' + error.message);
  return (data || [])[0] ?? null;
}

async function glocken(admin, userId, courseId, type) {
  const { data, error } = await admin
    .from('user_notifications')
    .select('id, type, body, action_path')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('type', type);
  if (error) abbruch('Glocken lesen: ' + error.message);
  return data || [];
}

function regression(datei) {
  console.log('\nRegression ' + datei);
  const ergebnis = spawnSync(process.execPath, [join(root, 'scripts', 'test', datei)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (ergebnis.status !== 0) abbruch(datei + ' nicht grün');
  ok(datei, true);
}

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
  await resteEntfernen(admin);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: 'A9 Absagetest', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio anlegen: ' + tErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com', vorname: 'Olivia', nachname: 'Owner', rolle: 'owner', tenantId: tenant.id, password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com', vorname: 'Tom', nachname: 'Teacher', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const personen = {};
  for (const [key, vorname] of [['a', 'Anna'], ['b', 'Ben'], ['c', 'Cora'], ['d', 'Dina'], ['e', 'Eva']]) {
    personen[key] = await nutzerAnlegen(admin, {
      email: `${SLUG}.${key}@example.com`,
      vorname,
      nachname: 'Test',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
  }

  const basis = {
    tenant_id: tenant.id,
    teacher_id: teacher.id,
    description: 'A9 Absage Testkurs',
    location: 'Test',
    status: 'active',
    frequency: 'one_time',
    price: 15,
    end_time: '11:00:00',
  };

  const courseId = await kursAnlegen(admin, {
    ...basis,
    title: 'A9_HAUPT',
    date: tag(14),
    time: '10:00:00',
    max_participants: 2,
  });

  const clientOwner = await login(url, anon, owner.email, password);
  const clientTeacher = await login(url, anon, teacher.email, password);
  const clientA = await login(url, anon, personen.a.email, password);
  const clientB = await login(url, anon, personen.b.email, password);
  const clientC = await login(url, anon, personen.c.email, password);
  const clientD = await login(url, anon, personen.d.email, password);
  const clientE = await login(url, anon, personen.e.email, password);

  await anmelden(clientA, courseId, 'A');
  await anmelden(clientB, courseId, 'B');
  const warteC = await anmelden(clientC, courseId, 'C');
  ok('C auf der Warteliste', warteC.is_waitlist === true);
  await anmelden(clientD, courseId, 'D');
  const abD = await clientD.rpc('unregister_from_course', { p_course_id: courseId });
  ok('D meldet sich selbst ab', abD.data?.success === true, abD.data?.message);

  const buchungA = await buchung(admin, courseId, personen.a.id);
  const vermerk = await clientTeacher.rpc('record_manual_payment', {
    p_registration_id: buchungA.id,
    p_method: 'cash',
  });
  ok('A bar bezahlt', vermerk.data?.success === true, vermerk.data?.error);

  console.log('\nFall 1 — Absage');
  const abgesagt = await clientTeacher.rpc('cancel_course', {
    p_course_id: courseId,
    p_scope: 'single',
    p_note: GRUND,
  });
  ok('cancel success', abgesagt.data?.success === true, JSON.stringify(abgesagt.data));
  ok('drei storniert, eine bezahlt',
    abgesagt.data?.cancelled_registrations === 3 && abgesagt.data?.paid_registrations === 1);

  for (const key of ['a', 'b', 'c']) {
    const row = await buchung(admin, courseId, personen[key].id);
    ok(key.toUpperCase() + ' course_cancelled',
      row?.status === 'cancelled' && row?.cancel_reason === 'course_cancelled');
  }
  const rowC = await buchung(admin, courseId, personen.c.id);
  ok('C nicht nachgerückt', rowC?.is_waitlist === true && rowC?.status === 'cancelled');
  const promoted = await glocken(admin, personen.c.id, courseId, 'waitlist_promoted');
  ok('keine waitlist_promoted-Glocke', promoted.length === 0);

  for (const key of ['a', 'b', 'c']) {
    const rows = await glocken(admin, personen[key].id, courseId, 'course_canceled');
    ok(key.toUpperCase() + ' Glocke course_canceled',
      rows.length === 1 && rows[0].body.includes('fällt aus') && rows[0].body.includes('Grund: ' + GRUND));
  }
  const ownerGlocke = await glocken(admin, owner.id, courseId, 'course_canceled');
  ok('Owner-Glocke eine bezahlte Person',
    ownerGlocke.some((row) => row.body.includes('1 Person hatte bereits bezahlt')));

  const nachAbsage = await buchung(admin, courseId, personen.a.id);
  ok('A bleibt paid', nachAbsage?.coverage_status === 'paid');

  console.log('\nFall 2 — Rückgabe');
  const { data: zahlung, error: zErr } = await admin
    .from('payments')
    .select('id, amount_cents, reverses_payment_id')
    .eq('registration_id', buchungA.id)
    .gt('amount_cents', 0);
  if (zErr) abbruch('Zahlung lesen: ' + zErr.message);
  const positiv = (zahlung || []).find((row) => !row.reverses_payment_id);
  if (!positiv) abbruch('positive Zahlung fehlt');
  const rueck = await clientOwner.rpc('reverse_manual_payment', { p_payment_id: positiv.id });
  ok('Rückgabe vermerkt', rueck.data?.success === true, rueck.data?.error);
  ok('A ist open', (await buchung(admin, courseId, personen.a.id))?.coverage_status === 'open');

  console.log('\nFall 3 — keine neue Anmeldung');
  const selbst = await clientE.rpc('register_for_course', { p_course_id: courseId });
  ok('register_for_course abgelehnt', selbst.data?.success === false, selbst.data?.message);
  const adminReg = await clientTeacher.rpc('admin_register_user_for_course', {
    p_user_id: personen.e.id,
    p_course_id: courseId,
  });
  ok('admin COURSE_NOT_AVAILABLE',
    adminReg.data?.success === false && adminReg.data?.error === 'COURSE_NOT_AVAILABLE',
    adminReg.data?.error);

  console.log('\nFall 4 — direktes UPDATE');
  const { error: updErr } = await clientOwner.from('courses').update({ status: 'not_planned' }).eq('id', courseId);
  const updText = `${updErr?.code || ''} ${updErr?.message || ''}`;
  ok('Owner UPDATE status abgelehnt', Boolean(updErr) && /42501|cancel_course|permission|denied/i.test(updText), updText);
  const { data: unveraendert } = await admin.from('courses').select('status').eq('id', courseId).single();
  ok('Status bleibt canceled', unveraendert?.status === 'canceled');

  const { error: insErr } = await clientOwner.from('courses').insert({
    tenant_id: tenant.id,
    title: 'A9_INSERT_CANCELED',
    date: tag(14),
    time: '10:00:00',
    max_participants: 4,
    price: 15,
    teacher_id: teacher.id,
    status: 'canceled',
  });
  const insText = `${insErr?.code || ''} ${insErr?.message || ''}`;
  ok('Owner INSERT status canceled abgelehnt', Boolean(insErr) && /42501|cancel_course|permission|denied/i.test(insText), insText);

  console.log('\nFall 5 — Rücknahme');
  const zurueck = await clientTeacher.rpc('uncancel_course', { p_course_id: courseId, p_scope: 'single' });
  ok('uncancel success', zurueck.data?.success === true, JSON.stringify(zurueck.data));
  ok('A wieder registered', (await buchung(admin, courseId, personen.a.id))?.status === 'registered');
  ok('B wieder registered', (await buchung(admin, courseId, personen.b.id))?.status === 'registered');
  const cNachher = await buchung(admin, courseId, personen.c.id);
  ok('C Warteliste Position 1',
    cNachher?.status === 'waitlist' && cNachher?.is_waitlist === true && cNachher?.waitlist_position === 1);
  ok('A bleibt open', (await buchung(admin, courseId, personen.a.id))?.coverage_status === 'open');
  const dNachher = await buchung(admin, courseId, personen.d.id);
  ok('D bleibt selbst storniert',
    dNachher?.status === 'cancelled' && dNachher?.cancel_reason === 'participant');
  const { data: kursNachher, error: kErr } = await admin
    .from('courses')
    .select('status, canceled_at')
    .eq('id', courseId)
    .single();
  if (kErr) abbruch('Kurs lesen: ' + kErr.message);
  ok('Kurs wieder active', kursNachher.status === 'active' && kursNachher.canceled_at === null);
  for (const key of ['a', 'b']) {
    const rows = await glocken(admin, personen[key].id, courseId, 'course_uncanceled');
    ok(key.toUpperCase() + ' wieder angemeldet',
      rows.some((row) => row.body.includes('wieder angemeldet')));
  }
  const cGlocke = await glocken(admin, personen.c.id, courseId, 'course_uncanceled');
  ok('C wieder auf der Warteliste', cGlocke.some((row) => row.body.includes('Warteliste')));

  console.log('\nFall 6 — Serie ab diesem Termin');
  const serie = randomUUID();
  const s1 = await kursAnlegen(admin, { ...basis, title: 'A9_S1', date: tag(21), time: '09:00:00', max_participants: 8, series_id: serie });
  const s2 = await kursAnlegen(admin, { ...basis, title: 'A9_S2', date: tag(28), time: '09:00:00', max_participants: 8, series_id: serie });
  const s3 = await kursAnlegen(admin, { ...basis, title: 'A9_S3', date: tag(35), time: '09:00:00', max_participants: 8, series_id: serie });
  const serieAb = await clientTeacher.rpc('cancel_course', {
    p_course_id: s2,
    p_scope: 'series_from_here',
  });
  ok('Serie abgesagt', serieAb.data?.success === true, JSON.stringify(serieAb.data));
  const { data: serieRows, error: sErr } = await admin.from('courses').select('id, status').in('id', [s1, s2, s3]);
  if (sErr) abbruch('Serie lesen: ' + sErr.message);
  const statusVon = Object.fromEntries((serieRows || []).map((row) => [row.id, row.status]));
  ok('Termin 1 aktiv', statusVon[s1] === 'active');
  ok('Termin 2 und 3 canceled', statusVon[s2] === 'canceled' && statusVon[s3] === 'canceled');
  const serieZurueck = await clientTeacher.rpc('uncancel_course', {
    p_course_id: s2,
    p_scope: 'series_from_here',
  });
  ok('Serie zurück', serieZurueck.data?.success === true, JSON.stringify(serieZurueck.data));
  const { data: serieNach, error: sErr2 } = await admin.from('courses').select('id, status').in('id', [s2, s3]);
  if (sErr2) abbruch('Serie nach Rücknahme: ' + sErr2.message);
  ok('Termin 2 und 3 wieder active', (serieNach || []).every((row) => row.status === 'active'));

  console.log('\nFall 7 — Rechte');
  const fremd = await kursAnlegen(admin, {
    ...basis,
    teacher_id: owner.id,
    title: 'A9_FREMD',
    date: tag(16),
    time: '12:00:00',
    max_participants: 8,
  });
  const verboten = await clientTeacher.rpc('cancel_course', { p_course_id: fremd, p_scope: 'single' });
  ok('fremder Kurs FORBIDDEN', verboten.data?.success === false && verboten.data?.error === 'FORBIDDEN', verboten.data?.error);

  const serieFremd = randomUUID();
  const eigen = await kursAnlegen(admin, {
    ...basis, title: 'A9_EIGEN', date: tag(18), time: '10:00:00', max_participants: 8, series_id: serieFremd,
  });
  const fremdTermin = await kursAnlegen(admin, {
    ...basis,
    teacher_id: owner.id,
    title: 'A9_ANDERER',
    date: tag(25),
    time: '10:00:00',
    max_participants: 8,
    series_id: serieFremd,
  });
  const teil = await clientTeacher.rpc('cancel_course', { p_course_id: eigen, p_scope: 'series_from_here' });
  ok('eigene Termine der Serie abgesagt', teil.data?.success === true, JSON.stringify(teil.data));
  const { data: anderer } = await admin.from('courses').select('status').eq('id', fremdTermin).single();
  ok('Termin der anderen Lehrperson bleibt active', anderer?.status === 'active');

  console.log('\nFall 8 — schon begonnen');
  const alt = await kursAnlegen(admin, {
    ...basis, title: 'A9_ALT', date: tag(10), time: '10:00:00', max_participants: 8,
  });
  const { error: datumErr } = await admin.from('courses').update({ date: tag(-1) }).eq('id', alt);
  if (datumErr) abbruch('Datum auf gestern: ' + datumErr.message);
  const zuSpaet = await clientTeacher.rpc('cancel_course', { p_course_id: alt, p_scope: 'single' });
  ok('ALREADY_STARTED', zuSpaet.data?.success === false && zuSpaet.data?.error === 'ALREADY_STARTED', zuSpaet.data?.error);

  regression('a1_soft_cancel.mjs');
  regression('a3_payments.mjs');

  console.log('\ngrün');
}

let devOk = false;

main()
  .catch((e) => {
    console.error(e.abbruch ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!devOk) return;
    try {
      const env = ladeEnv();
      await resteEntfernen(clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, SLUG));
    } catch (e) {
      console.error('Aufräumen fehlgeschlagen: ' + e.message);
      console.error('Reste: Studio a9canceltest, Konten a9canceltest.*@example.com');
      process.exitCode = 1;
    }
  });
