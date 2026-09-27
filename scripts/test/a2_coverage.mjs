#!/usr/bin/env node
/**
 * A2 Schritt 2 — Deckung und eingefrorener Preis (nur DEV).
 *
 * Nicht ausführen, bevor 20260926190000_a2_registrations_coverage_and_price.sql
 * auf DEV liegt. Gegen PROD nie.
 *
 * Fälle:
 *  1) Kurs 15,00 €: Teilnehmerin meldet sich an → open, 1500, EUR
 *  2) Kurspreis auf 18,00 € → bestehende Buchung bleibt 1500
 *  3) Zweite Teilnehmerin danach → 1800
 *  4) Kostenloser Kurs → not_required, 0
 *  5) Warteliste: Kapazität 1, zweite Anmeldung hat den Preis zum Eintrag.
 *     Preis ändern, erste abmelden → die Nachgerückte behält den alten Preis
 *  6) Abmelden und erneut anmelden → neue Zeile zum aktuellen Kurspreis,
 *     alte Zeile unverändert
 *  7) service_role ändert price_cents_at_booking → PRICE_FROZEN
 *  8) Lehrende sieht coverage_status der Buchungen ihres Kurses.
 *     Teilnehmerin sieht nur die eigene Zeile
 *
 * Testdaten räumt das Skript selbst auf (registrations → user_notifications
 * → courses), auch wenn eine Prüfung scheitert.
 *
 * Verwendung: node scripts/test/a2_coverage.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'demoalpha';
const TITLE_PAID = 'A2_COVERAGE_PAID';
const TITLE_FREE = 'A2_COVERAGE_FREE';
const TITLE_WAIT = 'A2_COVERAGE_WAITLIST';
const TITLE_REREG = 'A2_COVERAGE_REREG';
const TITEL = [TITLE_PAID, TITLE_FREE, TITLE_WAIT, TITLE_REREG];

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

async function login(url, anon, email, password) {
  const c = clientMitTenant(url, anon);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) abbruch(`Login ${email}: ${error.message}`);
  return c;
}

async function raeumeTestkurse(admin, tenantId) {
  const { data: courses, error } = await admin
    .from('courses')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('title', TITEL);
  if (error) abbruch('Testkurse lesen: ' + error.message);
  for (const c of courses || []) {
    const { error: e1 } = await admin.from('registrations').delete().eq('course_id', c.id);
    if (e1) abbruch('Registrations löschen: ' + e1.message);
    const { error: e2 } = await admin.from('user_notifications').delete().eq('course_id', c.id);
    if (e2) abbruch('Benachrichtigungen löschen: ' + e2.message);
    const { error: e3 } = await admin.from('courses').delete().eq('id', c.id);
    if (e3) abbruch('Kurs löschen: ' + e3.message);
  }
}

async function anmelden(client, courseId, wer) {
  const { data, error } = await client.rpc('register_for_course', { p_course_id: courseId });
  if (error) abbruch(`Anmeldung ${wer}: ${error.message}`);
  if (!data?.success) abbruch(`Anmeldung ${wer}: ${data?.message || data?.error || 'kein Erfolg'}`);
}

async function abmelden(client, courseId, wer) {
  const { data, error } = await client.rpc('unregister_from_course', { p_course_id: courseId });
  if (error) abbruch(`Abmeldung ${wer}: ${error.message}`);
  if (!data?.success) abbruch(`Abmeldung ${wer}: ${data?.message || 'kein Erfolg'}`);
}

async function buchungen(client, courseId) {
  const { data, error } = await client
    .from('registrations')
    .select('id, user_id, status, is_waitlist, coverage_status, price_cents_at_booking, currency')
    .eq('course_id', courseId);
  if (error) abbruch('registrations lesen: ' + error.message);
  return data || [];
}

function eine(zeilen, pred, name) {
  const treffer = zeilen.filter(pred);
  if (treffer.length !== 1) abbruch(`${name}: ${treffer.length} Zeilen statt 1`);
  return treffer[0];
}

function preisOk(row, cents, status, name) {
  ok(
    name,
    Number(row.price_cents_at_booking) === cents
      && row.currency === 'EUR'
      && row.coverage_status === status,
    `status=${row.coverage_status} cent=${row.price_cents_at_booking} currency=${row.currency}`
  );
}

async function kursAnlegen(admin, felder) {
  const { data, error } = await admin.from('courses').insert(felder).select('id').single();
  if (error) abbruch('Kurs ' + felder.title + ': ' + error.message);
  return data.id;
}

async function setzePreis(admin, courseId, preis) {
  const { data, error } = await admin
    .from('courses')
    .update({ price: preis })
    .eq('id', courseId)
    .select('price')
    .single();
  if (error) abbruch('Kurspreis setzen: ' + error.message);
  if (Number(data.price) !== preis) abbruch(`Kurspreis ist ${data.price}, erwartet ${preis}`);
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

  const password = seedPasswort();
  const admin = clientMitTenant(url, service);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', SLUG)
    .single();
  if (tErr || !tenant) abbruch('Tenant demoalpha nicht gefunden — npm run seed:dev');

  await raeumeTestkurse(admin, tenant.id);

  const { data: seedUsers, error: uErr } = await admin
    .from('users')
    .select('id, email, role')
    .eq('tenant_id', tenant.id)
    .in('email', [
      `${SLUG}.teacher@example.com`,
      `${SLUG}.teilnehmer1@example.com`,
      `${SLUG}.teilnehmer2@example.com`,
    ]);
  if (uErr) abbruch('Seed-Profile: ' + uErr.message);
  const byEmail = Object.fromEntries((seedUsers || []).map((u) => [u.email, u]));
  const teacher = byEmail[`${SLUG}.teacher@example.com`];
  const p1 = byEmail[`${SLUG}.teilnehmer1@example.com`];
  const p2 = byEmail[`${SLUG}.teilnehmer2@example.com`];
  if (!teacher || teacher.role !== 'teacher') abbruch('Seed-Lehrende fehlt');
  if (!p1 || !p2) abbruch('Seed-Teilnehmerinnen fehlen — npm run seed:dev');

  try {
    const basis = {
      tenant_id: tenant.id,
      teacher_id: teacher.id,
      description: 'A2 Deckung',
      date: tag(14),
      location: 'Test',
      status: 'active',
      frequency: 'one_time',
    };
    const coursePaid = await kursAnlegen(admin, {
      ...basis,
      title: TITLE_PAID,
      time: '10:00:00',
      end_time: '11:00:00',
      max_participants: 10,
      price: 15,
    });
    const courseFree = await kursAnlegen(admin, {
      ...basis,
      title: TITLE_FREE,
      time: '11:00:00',
      end_time: '12:00:00',
      max_participants: 10,
      price: 0,
    });
    const courseWait = await kursAnlegen(admin, {
      ...basis,
      title: TITLE_WAIT,
      time: '12:00:00',
      end_time: '13:00:00',
      max_participants: 1,
      price: 15,
    });
    const courseRereg = await kursAnlegen(admin, {
      ...basis,
      title: TITLE_REREG,
      time: '13:00:00',
      end_time: '14:00:00',
      max_participants: 10,
      price: 15,
    });

    const clientTeacher = await login(url, anon, teacher.email, password);
    const clientP1 = await login(url, anon, p1.email, password);
    const clientP2 = await login(url, anon, p2.email, password);

    await anmelden(clientP1, coursePaid, 'P1 kostenpflichtig');
    const erste = eine(await buchungen(admin, coursePaid), (z) => z.user_id === p1.id, 'P1 im 15-€-Kurs');
    preisOk(erste, 1500, 'open', '15-€-Kurs: open, 1500, EUR');

    await setzePreis(admin, coursePaid, 18);
    const ersteDanach = eine(await buchungen(admin, coursePaid), (z) => z.user_id === p1.id, 'P1 nach Preiserhöhung');
    preisOk(ersteDanach, 1500, 'open', 'bestehende Buchung bleibt 1500');

    await anmelden(clientP2, coursePaid, 'P2 nach Preiserhöhung');
    const zweite = eine(await buchungen(admin, coursePaid), (z) => z.user_id === p2.id, 'P2 im 18-€-Kurs');
    preisOk(zweite, 1800, 'open', 'Anmeldung nach Preiserhöhung: 1800');

    await anmelden(clientP1, courseFree, 'P1 kostenlos');
    const gratis = eine(await buchungen(admin, courseFree), (z) => z.user_id === p1.id, 'P1 im kostenlosen Kurs');
    preisOk(gratis, 0, 'not_required', 'kostenloser Kurs: not_required, 0');

    await anmelden(clientP1, courseWait, 'P1 Wartelistenkurs');
    await anmelden(clientP2, courseWait, 'P2 Warteliste');
    const vorNachruecken = await buchungen(admin, courseWait);
    const fest = eine(vorNachruecken, (z) => z.user_id === p1.id && z.status === 'registered', 'P1 fest');
    const warte = eine(vorNachruecken, (z) => z.user_id === p2.id && z.status === 'waitlist', 'P2 Warteliste');
    preisOk(fest, 1500, 'open', 'erste Anmeldung vor der Warteliste: 1500');
    preisOk(warte, 1500, 'open', 'Warteliste hat den Preis zum Eintrag: 1500');

    await setzePreis(admin, courseWait, 20);
    await abmelden(clientP1, courseWait, 'P1 macht den Platz frei');
    const nachNachruecken = await buchungen(admin, courseWait);
    const nachgerueckt = eine(nachNachruecken, (z) => z.id === warte.id, 'nachgerückte Zeile');
    ok(
      'Nachgerückte behält den alten Preis',
      nachgerueckt.status === 'registered'
        && nachgerueckt.is_waitlist === false
        && Number(nachgerueckt.price_cents_at_booking) === 1500
        && nachgerueckt.currency === 'EUR'
        && nachgerueckt.coverage_status === 'open',
      `status=${nachgerueckt.status} cent=${nachgerueckt.price_cents_at_booking}`
    );
    const storniertWarte = eine(nachNachruecken, (z) => z.id === fest.id, 'stornierte erste Zeile');
    preisOk(storniertWarte, 1500, 'open', 'abgemeldete Zeile behält 1500');

    await anmelden(clientP1, courseRereg, 'P1 erstmals');
    const alt = eine(await buchungen(admin, courseRereg), (z) => z.user_id === p1.id, 'erste Zeile erneut anmelden');
    preisOk(alt, 1500, 'open', 'erste Anmeldung vor erneutem Anmelden: 1500');
    await setzePreis(admin, courseRereg, 22);
    await abmelden(clientP1, courseRereg, 'P1 vor erneuter Anmeldung');
    await anmelden(clientP1, courseRereg, 'P1 erneut');
    const nachErneut = await buchungen(admin, courseRereg);
    const alteZeile = eine(nachErneut, (z) => z.id === alt.id, 'alte Zeile');
    const neueZeile = eine(
      nachErneut,
      (z) => z.user_id === p1.id && z.id !== alt.id,
      'neue Zeile'
    );
    ok(
      'alte Zeile unverändert',
      alteZeile.status === 'cancelled' && Number(alteZeile.price_cents_at_booking) === 1500,
      `status=${alteZeile.status} cent=${alteZeile.price_cents_at_booking}`
    );
    preisOk(neueZeile, 2200, 'open', 'erneute Anmeldung zum aktuellen Kurspreis: 2200');

    const { error: freezeErr } = await admin
      .from('registrations')
      .update({ price_cents_at_booking: Number(erste.price_cents_at_booking) + 1 })
      .eq('id', erste.id);
    ok(
      'service_role scheitert an PRICE_FROZEN',
      Boolean(freezeErr) && String(freezeErr.message).includes('PRICE_FROZEN'),
      freezeErr ? freezeErr.message : 'kein Fehler'
    );
    const unveraendert = eine(await buchungen(admin, coursePaid), (z) => z.id === erste.id, 'Zeile nach abgelehntem Update');
    preisOk(unveraendert, 1500, 'open', 'abgelehntes Update lässt 1500 stehen');

    const lehrerin = await buchungen(clientTeacher, coursePaid);
    const lehrerIds = new Set(lehrerin.map((z) => z.user_id));
    ok(
      'Lehrende sieht coverage_status ihrer Kursbuchungen',
      lehrerin.length === 2
        && lehrerIds.has(p1.id)
        && lehrerIds.has(p2.id)
        && lehrerin.every((z) => z.coverage_status === 'open'),
      `Zeilen ${lehrerin.length}`
    );

    const nurP1 = await buchungen(clientP1, coursePaid);
    ok(
      'Teilnehmerin sieht nur die eigene Zeile',
      nurP1.length === 1 && nurP1[0].user_id === p1.id && nurP1[0].coverage_status === 'open',
      `Zeilen ${nurP1.length}`
    );
    const nurP2 = await buchungen(clientP2, coursePaid);
    ok(
      'zweite Teilnehmerin sieht nur die eigene Zeile',
      nurP2.length === 1 && nurP2[0].user_id === p2.id,
      `Zeilen ${nurP2.length}`
    );

    console.log('\n  A2-Deckung: alle Fälle ok\n');
  } finally {
    await raeumeTestkurse(admin, tenant.id);
  }
}

main().catch((e) => {
  console.error('\n  FEHLER: ' + (e?.message || e) + '\n');
  process.exit(1);
});
