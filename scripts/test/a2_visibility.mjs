#!/usr/bin/env node
/**
 * A2 Schritt 1 — Sichtbarkeit von registrations für Lehrende (nur DEV).
 *
 * Nicht ausführen, bevor 20260926180000_a2_registrations_select_own_courses.sql
 * auf DEV liegt. Gegen PROD nie.
 *
 * Fälle:
 *  1) T1 liest die beiden Testkurse → nur Zeilen des eigenen Kurses
 *  2) T2 analog
 *  3) Owner sieht beide Kurse
 *  4) Teilnehmerin sieht nur die eigene Zeile
 *  5) T1 meldet sich im Kurs von T2 an → sieht genau diese eigene Zeile,
 *     nicht die der anderen Teilnehmerin
 *  6) get_course_participant_counts liefert T1 Zahlen zu beiden Kursen
 *
 * Seed hat nur eine Lehrende je Studio (demoalpha.teacher). T2 wird per
 * service_role angelegt und am Ende entfernt. Testdaten (Kurse, Anmeldungen,
 * T2) räumt das Skript selbst auf, auch wenn eine Prüfung scheitert.
 *
 * Verwendung: node scripts/test/a2_visibility.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'demoalpha';
const TITLE_T1 = 'A2_VISIBILITY_T1';
const TITLE_T2 = 'A2_VISIBILITY_T2';
const EMAIL_T2 = 'demoalpha.a2teacher2@example.com';

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

async function authUserByEmail(admin, email) {
  for (let seite = 1; ; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer konnten nicht gelesen werden: ' + error.message);
    const treffer = data.users.find((u) => u.email === email);
    if (treffer) return treffer;
    if (data.users.length < 200) return null;
  }
}

async function raeumeTestkurse(admin, tenantId) {
  const { data: courses, error } = await admin
    .from('courses')
    .select('id')
    .eq('tenant_id', tenantId)
    .in('title', [TITLE_T1, TITLE_T2]);
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

async function entferneT2(admin) {
  const vorhanden = await authUserByEmail(admin, EMAIL_T2);
  if (!vorhanden) return;
  const { error } = await admin.auth.admin.deleteUser(vorhanden.id);
  if (error) abbruch('T2 löschen: ' + error.message);
}

async function anmelden(client, courseId, wer) {
  const { data, error } = await client.rpc('register_for_course', { p_course_id: courseId });
  if (error) abbruch(`Anmeldung ${wer}: ${error.message}`);
  if (!data?.success) abbruch(`Anmeldung ${wer}: ${data?.message || data?.error || 'kein Erfolg'}`);
}

async function liesBuchungen(client, courseIds) {
  const { data, error } = await client
    .from('registrations')
    .select('id, course_id, user_id')
    .in('course_id', courseIds);
  if (error) abbruch('registrations lesen: ' + error.message);
  return data || [];
}

async function kursAnlegen(admin, felder) {
  const { data, error } = await admin
    .from('courses')
    .insert(felder)
    .select('id')
    .single();
  if (error) abbruch('Kurs ' + felder.title + ': ' + error.message);
  return data.id;
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
  await entferneT2(admin);

  const { data: seedUsers, error: uErr } = await admin
    .from('users')
    .select('id, email, role')
    .eq('tenant_id', tenant.id)
    .in('email', [
      `${SLUG}.teacher@example.com`,
      `${SLUG}.owner@example.com`,
      `${SLUG}.teilnehmer1@example.com`,
      `${SLUG}.teilnehmer2@example.com`,
    ]);
  if (uErr) abbruch('Seed-Profile: ' + uErr.message);
  const byEmail = Object.fromEntries((seedUsers || []).map((u) => [u.email, u]));
  const t1 = byEmail[`${SLUG}.teacher@example.com`];
  const owner = byEmail[`${SLUG}.owner@example.com`];
  const p1 = byEmail[`${SLUG}.teilnehmer1@example.com`];
  const p2 = byEmail[`${SLUG}.teilnehmer2@example.com`];
  if (!t1 || t1.role !== 'teacher') abbruch('Seed-Lehrende fehlt');
  if (!owner || owner.role !== 'owner') abbruch('Seed-Owner fehlt');
  if (!p1 || !p2) abbruch('Seed-Teilnehmerinnen fehlen — npm run seed:dev');

  try {
    const { data: authT2, error: aErr } = await admin.auth.admin.createUser({
      email: EMAIL_T2,
      password,
      email_confirm: true,
      user_metadata: {
        tenant_id: tenant.id,
        first_name: 'Tina',
        last_name: 'Teacher',
      },
      app_metadata: { role: 'teacher' },
    });
    if (aErr || !authT2.user) abbruch('T2 anlegen: ' + (aErr?.message || 'kein User'));

    const { data: profilT2, error: pErr } = await admin
      .from('users')
      .select('id, role, tenant_id')
      .eq('auth_user_id', authT2.user.id)
      .single();
    if (pErr || !profilT2) abbruch('Profil T2 fehlt: ' + (pErr?.message || 'keine Zeile'));
    if (profilT2.role !== 'teacher' || profilT2.tenant_id !== tenant.id) {
      abbruch('Profil T2 hat Rolle ' + profilT2.role + ' oder fremdes Studio');
    }

    const { error: vErr } = await admin
      .from('users')
      .update({ email_verified: true, email_verified_at: new Date().toISOString() })
      .eq('id', profilT2.id);
    if (vErr) abbruch('email_verified T2: ' + vErr.message);

    const kursBasis = {
      tenant_id: tenant.id,
      description: 'A2 Sichtbarkeit',
      date: tag(14),
      time: '10:00:00',
      end_time: '11:00:00',
      location: 'Test',
      max_participants: 10,
      price: 0,
      status: 'active',
      frequency: 'one_time',
    };
    const courseT1 = await kursAnlegen(admin, { ...kursBasis, title: TITLE_T1, teacher_id: t1.id });
    const courseT2 = await kursAnlegen(admin, { ...kursBasis, title: TITLE_T2, time: '12:00:00', end_time: '13:00:00', teacher_id: profilT2.id });
    const courseIds = [courseT1, courseT2];

    const clientT1 = await login(url, anon, t1.email, password);
    const clientT2 = await login(url, anon, EMAIL_T2, password);
    const clientOwner = await login(url, anon, owner.email, password);
    const clientP1 = await login(url, anon, p1.email, password);
    const clientP2 = await login(url, anon, p2.email, password);

    await anmelden(clientP1, courseT1, 'P1');
    await anmelden(clientP2, courseT2, 'P2');

    const zeilenT1 = await liesBuchungen(clientT1, courseIds);
    ok(
      'T1 sieht nur den eigenen Kurs',
      zeilenT1.length === 1 && zeilenT1[0].course_id === courseT1 && zeilenT1[0].user_id === p1.id,
      `Zeilen ${zeilenT1.length}`
    );

    const zeilenT2 = await liesBuchungen(clientT2, courseIds);
    ok(
      'T2 sieht nur den eigenen Kurs',
      zeilenT2.length === 1 && zeilenT2[0].course_id === courseT2 && zeilenT2[0].user_id === p2.id,
      `Zeilen ${zeilenT2.length}`
    );

    const zeilenOwner = await liesBuchungen(clientOwner, courseIds);
    const ownerIds = new Set(zeilenOwner.map((r) => r.user_id));
    ok(
      'Owner sieht beide Kurse',
      zeilenOwner.length === 2 && ownerIds.has(p1.id) && ownerIds.has(p2.id),
      `Zeilen ${zeilenOwner.length}`
    );

    const zeilenP1 = await liesBuchungen(clientP1, courseIds);
    ok(
      'Teilnehmerin sieht nur die eigene Zeile',
      zeilenP1.length === 1 && zeilenP1[0].user_id === p1.id && zeilenP1[0].course_id === courseT1,
      `Zeilen ${zeilenP1.length}`
    );

    const { data: counts, error: cErr } = await clientT1.rpc('get_course_participant_counts', {
      p_course_ids: courseIds,
    });
    if (cErr) abbruch('get_course_participant_counts: ' + cErr.message);
    const countById = Object.fromEntries((counts || []).map((row) => [row.course_id, Number(row.registered_count)]));
    ok(
      'Zähl-RPC bleibt für T1 studioweit',
      countById[courseT1] === 1 && countById[courseT2] === 1,
      JSON.stringify(countById)
    );

    await anmelden(clientT1, courseT2, 'T1 im Kurs von T2');

    const zeilenT1Danach = await liesBuchungen(clientT1, courseIds);
    const fremdeImKursT2 = zeilenT1Danach.filter((r) => r.course_id === courseT2 && r.user_id !== t1.id);
    const eigeneImKursT2 = zeilenT1Danach.filter((r) => r.course_id === courseT2 && r.user_id === t1.id);
    const eigeneKursleitung = zeilenT1Danach.filter((r) => r.course_id === courseT1 && r.user_id === p1.id);
    ok(
      'T1 sieht im fremden Kurs nur die eigene Zeile',
      eigeneImKursT2.length === 1 && fremdeImKursT2.length === 0 && eigeneKursleitung.length === 1,
      `Kurs T2 eigene ${eigeneImKursT2.length}, fremde ${fremdeImKursT2.length}`
    );

    console.log('\n  A2-Sichtbarkeit: alle Fälle ok\n');
  } finally {
    await raeumeTestkurse(admin, tenant.id);
    await entferneT2(admin);
  }
}

main().catch((e) => {
  console.error('\n  FEHLER: ' + (e?.message || e) + '\n');
  process.exit(1);
});
