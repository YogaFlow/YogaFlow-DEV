#!/usr/bin/env node
/**
 * Race-Test für register_for_course auf DEV (Story 0.2 / Befund L1).
 *
 * Fall 1: Zwei Seed-Teilnehmende von demoalpha buchen 20-mal gleichzeitig einen
 * Kurs mit Kapazität 1. Ausgabe: Runden mit 2 × registered (= Überbuchung).
 * Fall 2: Eine Person ist registered, eine auf der Warteliste. Gleichzeitig
 * meldet sich die registrierte Person ab und eine dritte bucht. 20 Runden.
 * Ein Deadlock (40P01) wird gemeldet und nicht wiederholt.
 *
 * Zugangsdaten kommen aus scripts/seed-dev.mjs, nicht aus der Umgebung.
 * Passwörter werden nicht ausgegeben.
 *
 * Verwendung: node scripts/test/overbooking_race.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'demoalpha';
const ROUNDS = 20;
const COURSE_TITLE = 'OVERBOOKING_RACE_0_2';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function ladeEnv() {
  const out = {};
  for (const zeile of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function seedKonfig() {
  const src = readFileSync(join(root, 'scripts', 'seed-dev.mjs'), 'utf8');
  const pass = src.match(/const DEMO_PASSWORT = '([^']+)'/);
  const slugs = src.match(/const DEMO_SLUGS = \[([^\]]+)\]/);
  if (!pass) {
    console.error('DEMO_PASSWORT in scripts/seed-dev.mjs nicht gefunden');
    process.exit(1);
  }
  if (!slugs || !slugs[1].includes("'" + SLUG + "'")) {
    console.error('demoalpha fehlt in DEMO_SLUGS in scripts/seed-dev.mjs');
    process.exit(1);
  }
  return {
    password: pass[1],
    emailA: SLUG + '.teilnehmer1@example.com',
    emailB: SLUG + '.teilnehmer2@example.com',
    emailC: SLUG + '.teilnehmer3@example.com',
  };
}

function abbruch(text) {
  console.error('\n  FEHLER: ' + text + '\n');
  process.exit(1);
}

function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

function clientMitTenant(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('x-omlify-tenant', SLUG);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

function slotAusAntwort(data, error) {
  if (error) return { slot: 'error', detail: error.message };
  const row = data && typeof data === 'object' ? data : {};
  if (row.success === false) return { slot: 'rejected', detail: row.message || row.error || 'rejected' };
  if (row.is_waitlist === true || row.on_waitlist === true) return { slot: 'waitlist' };
  if (row.success === true) return { slot: 'registered' };
  return { slot: 'error', detail: 'unexpected rpc payload' };
}

function istDeadlock(error) {
  if (!error) return false;
  return error.code === '40P01' || /deadlock detected/i.test(error.message ?? '');
}

function tag(versatzTage) {
  const d = new Date();
  d.setDate(d.getDate() + versatzTage);
  return d.toISOString().slice(0, 10);
}

const env = ladeEnv();
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) abbruch('VITE_SUPABASE_URL fehlt in .env');
if (!anon) abbruch('VITE_SUPABASE_ANON_KEY fehlt in .env');
if (!service) abbruch('SUPABASE_SERVICE_ROLE_KEY fehlt in .env');
if (!url.includes(ERLAUBTE_REF)) {
  abbruch('VITE_SUPABASE_URL zeigt nicht auf DEV (' + ERLAUBTE_REF + ').');
}
if (refAusKey(service) !== ERLAUBTE_REF) {
  abbruch('Service-Role-Key gehört nicht zum DEV-Projekt.');
}

const seed = seedKonfig();
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: tenant, error: tenantErr } = await admin
  .from('tenants')
  .select('id')
  .eq('slug', SLUG)
  .maybeSingle();
if (tenantErr || !tenant) abbruch('Studio demoalpha nicht gefunden: ' + (tenantErr?.message ?? 'keine Zeile'));

const { data: teacher, error: teacherErr } = await admin
  .from('users')
  .select('id')
  .eq('tenant_id', tenant.id)
  .eq('role', 'teacher')
  .eq('email', SLUG + '.teacher@example.com')
  .maybeSingle();
if (teacherErr || !teacher) abbruch('Lehrerin demoalpha nicht gefunden: ' + (teacherErr?.message ?? 'keine Zeile'));

const { data: alt } = await admin.from('courses').select('id').eq('title', COURSE_TITLE).eq('tenant_id', tenant.id);
if (alt?.length) {
  const ids = alt.map((row) => row.id);
  await admin.from('registrations').delete().in('course_id', ids);
  await admin.from('courses').delete().in('id', ids);
}

const { data: course, error: courseErr } = await admin
  .from('courses')
  .insert({
    title: COURSE_TITLE,
    description: 'Kapazität-1-Kurs für den Überbuchungs-Race von Story 0.2',
    date: tag(7),
    time: '18:00:00',
    end_time: '19:00:00',
    location: 'Race-Test',
    max_participants: 1,
    price: 0,
    teacher_id: teacher.id,
    tenant_id: tenant.id,
    duration: 60,
    frequency: 'one_time',
    status: 'active',
  })
  .select('id')
  .single();
if (courseErr || !course) abbruch('Test-Kurs konnte nicht angelegt werden: ' + (courseErr?.message ?? 'keine Zeile'));

const courseId = course.id;
console.log('Test-Kurs ID: ' + courseId);
console.log('Kapazität: 1 · Runden: ' + ROUNDS + ' · Studio: ' + SLUG);

const teilnehmerA = clientMitTenant(url, anon);
const teilnehmerB = clientMitTenant(url, anon);
const teilnehmerC = clientMitTenant(url, anon);

const loginA = await teilnehmerA.auth.signInWithPassword({ email: seed.emailA, password: seed.password });
if (loginA.error) abbruch('Login Teilnehmer 1 fehlgeschlagen: ' + loginA.error.message);
const loginB = await teilnehmerB.auth.signInWithPassword({ email: seed.emailB, password: seed.password });
if (loginB.error) abbruch('Login Teilnehmer 2 fehlgeschlagen: ' + loginB.error.message);
const loginC = await teilnehmerC.auth.signInWithPassword({ email: seed.emailC, password: seed.password });
if (loginC.error) abbruch('Login Teilnehmer 3 fehlgeschlagen: ' + loginC.error.message);

async function anmeldungLeeren() {
  const clients = [teilnehmerA, teilnehmerB, teilnehmerC];
  for (const client of clients) {
    await client.rpc('unregister_from_course', { p_course_id: courseId });
  }
  for (const client of clients) {
    await client.rpc('unregister_from_course', { p_course_id: courseId });
  }
  const { error } = await admin.from('registrations').delete().eq('course_id', courseId);
  if (error) abbruch('Aufräumen der Anmeldungen fehlgeschlagen: ' + error.message);
}

async function zaehle() {
  const { data: rows, error } = await admin
    .from('registrations')
    .select('status, is_waitlist')
    .eq('course_id', courseId)
    .is('cancellation_timestamp', null);
  if (error) abbruch('Zählen der Anmeldungen fehlgeschlagen: ' + error.message);
  return {
    registered: (rows ?? []).filter((r) => r.status === 'registered' && r.is_waitlist === false).length,
    waitlist: (rows ?? []).filter((r) => r.status === 'waitlist' || r.is_waitlist === true).length,
  };
}

let overbookedRounds = 0;
let promoteOverbookedRounds = 0;
let deadlockRounds = 0;

try {
  console.log('Fall 1: zwei Buchungen gleichzeitig');
  for (let round = 1; round <= ROUNDS; round++) {
    await anmeldungLeeren();

    const [resA, resB] = await Promise.all([
      teilnehmerA.rpc('register_for_course', { p_course_id: courseId }),
      teilnehmerB.rpc('register_for_course', { p_course_id: courseId }),
    ]);

    const slotA = slotAusAntwort(resA.data, resA.error);
    const slotB = slotAusAntwort(resB.data, resB.error);
    const deadlock = istDeadlock(resA.error) || istDeadlock(resB.error);
    if (deadlock) {
      deadlockRounds += 1;
      console.log('Fall 1 Runde ' + String(round).padStart(2, '0') + ': DEADLOCK (kein Retry)');
    }

    const counts = await zaehle();
    const overbooked = counts.registered >= 2;
    if (overbooked) overbookedRounds += 1;

    console.log(
      'Fall 1 Runde ' +
        String(round).padStart(2, '0') +
        ': RPC ' +
        slotA.slot +
        '+' +
        slotB.slot +
        ' · DB registered=' +
        counts.registered +
        ' waitlist=' +
        counts.waitlist +
        (overbooked ? ' · ÜBERBUCHUNG' : '')
    );
    if (slotA.detail) console.log('         RPC-A: ' + slotA.detail);
    if (slotB.detail) console.log('         RPC-B: ' + slotB.detail);
  }

  console.log('Fall 2: Abmelden und dritte Buchung gleichzeitig');
  for (let round = 1; round <= ROUNDS; round++) {
    await anmeldungLeeren();

    const setupA = await teilnehmerA.rpc('register_for_course', { p_course_id: courseId });
    const setupB = await teilnehmerB.rpc('register_for_course', { p_course_id: courseId });
    const before = await zaehle();
    if (before.registered !== 1 || before.waitlist !== 1) {
      const slotA = slotAusAntwort(setupA.data, setupA.error);
      const slotB = slotAusAntwort(setupB.data, setupB.error);
      abbruch(
        'Fall 2 Runde ' +
          round +
          ': Aufbau ist nicht 1 registered + 1 waitlist (registered=' +
          before.registered +
          ', waitlist=' +
          before.waitlist +
          ', RPC ' +
          slotA.slot +
          '+' +
          slotB.slot +
          ')'
      );
    }

    const [unreg, book] = await Promise.all([
      teilnehmerA.rpc('unregister_from_course', { p_course_id: courseId }),
      teilnehmerC.rpc('register_for_course', { p_course_id: courseId }),
    ]);

    const deadlock = istDeadlock(unreg.error) || istDeadlock(book.error);
    if (deadlock) {
      deadlockRounds += 1;
      console.log('Fall 2 Runde ' + String(round).padStart(2, '0') + ': DEADLOCK (kein Retry)');
      if (unreg.error) console.log('         Abmelden: ' + unreg.error.message);
      if (book.error) console.log('         Buchen: ' + book.error.message);
    }

    const counts = await zaehle();
    const overbooked = counts.registered >= 2;
    if (overbooked) promoteOverbookedRounds += 1;
    const slotUnreg = slotAusAntwort(unreg.data, unreg.error);
    const slotBook = slotAusAntwort(book.data, book.error);

    console.log(
      'Fall 2 Runde ' +
        String(round).padStart(2, '0') +
        ': Abmelden ' +
        slotUnreg.slot +
        ' + Buchen ' +
        slotBook.slot +
        ' · DB registered=' +
        counts.registered +
        ' waitlist=' +
        counts.waitlist +
        (overbooked ? ' · ÜBERBUCHUNG' : '')
    );
    if (!deadlock && slotUnreg.detail) console.log('         Abmelden: ' + slotUnreg.detail);
    if (!deadlock && slotBook.detail) console.log('         Buchen: ' + slotBook.detail);
  }
} finally {
  await anmeldungLeeren();
  const { error: delErr } = await admin.from('courses').delete().eq('id', courseId);
  if (delErr) {
    console.error('Test-Kurs konnte nicht gelöscht werden: ' + delErr.message);
  } else {
    console.log('Test-Kurs gelöscht.');
  }
  await teilnehmerA.auth.signOut();
  await teilnehmerB.auth.signOut();
  await teilnehmerC.auth.signOut();
}

console.log('---');
console.log('Runden je Fall: ' + ROUNDS);
console.log('Fall 1, Runden mit 2 × registered: ' + overbookedRounds);
console.log('Fall 2, Runden mit 2 × registered: ' + promoteOverbookedRounds);
console.log('Deadlocks (kein Retry): ' + deadlockRounds);
if (overbookedRounds === 0 && promoteOverbookedRounds === 0) {
  console.log('Hinweis: 0 Überbuchungen sind kein Gegenbeweis (Timing).');
}
