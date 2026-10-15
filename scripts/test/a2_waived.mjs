#!/usr/bin/env node
/**
 * A2 Schritt 3 — Erlass einer offenen Buchung (nur DEV).
 *
 * Nicht ausführen, bevor 20260927093608_a2_coverage_waived.sql auf DEV liegt.
 * Gegen PROD nie. Studios `a2waivetest` und `a2waivefremd`, am Ende
 * delete_tenant_complete und auth.admin.deleteUser für beide.
 *
 * Fälle:
 *  1) Owner erlässt eine offene Buchung mit goodwill und Notiz → waived,
 *     alle vier Erlass-Felder gesetzt, genau ein Event coverage.waived
 *     und ein Audit-Eintrag. Payload ohne Notiztext.
 *  2) Lehrende im eigenen Kurs → FORBIDDEN. Teilnehmerin → FORBIDDEN.
 *  3) other ohne Notiz → NOTE_REQUIRED. Ungültiger Code → INVALID_REASON.
 *  4) Schon waived → NOT_OPEN. Kostenlose Buchung (not_required) → NOT_OPEN.
 *  5) Owner eines anderen Studios mit der ID aus Fall 1 → NOT_FOUND.
 *  6) Rücknahme ohne Notiz → open, alle Erlass-Felder NULL,
 *     Event coverage.waive_reverted und Audit.
 *  7) Direktes UPDATE coverage_status als authenticated → permission denied.
 *  8) Lehrende liest die Buchung aus Fall 1: coverage_status ist sichtbar.
 *     Ob coverage_waived_note ankommt, schreibt das Skript als BEOBACHTUNG
 *     und wertet es nicht als Fehlschlag.
 *
 * Verwendung: node scripts/test/a2_waived.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a2waivetest';
const SLUG_FREMD = 'a2waivefremd';
const SLUGS = [SLUG, SLUG_FREMD];
const TITLE_PAID = 'A2_WAIVED_PAID';
const TITLE_FREE = 'A2_WAIVED_FREE';
const NOTIZ = 'Kulanz Probe';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let devOk = false;

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

async function login(url, anon, email, password, slug) {
  const c = clientMitTenant(url, anon, slug);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) abbruch(`Login ${email}: ${error.message}`);
  return c;
}

function authEmailGehoertTest(email) {
  return SLUGS.some((s) => (email ?? '').startsWith(s + '.'));
}

async function authNutzer(admin) {
  const treffer = [];
  for (let seite = 1; ; seite++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: seite, perPage: 200 });
    if (error) abbruch('Auth-Nutzer lesen: ' + error.message);
    for (const u of data.users) {
      if (authEmailGehoertTest(u.email)) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function resteEntfernen(admin) {
  for (const slug of SLUGS) {
    const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', slug);
    if (error) abbruch('Studio lesen (' + slug + '): ' + error.message);
    for (const t of tenants || []) {
      const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
      if (e) abbruch('Studio löschen (' + slug + '): ' + e.message);
    }
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

async function anmelden(client, courseId, wer) {
  const { data, error } = await client.rpc('register_for_course', { p_course_id: courseId });
  if (error) abbruch(`Anmeldung ${wer}: ${error.message}`);
  if (!data?.success) abbruch(`Anmeldung ${wer}: ${data?.message || data?.error || 'kein Erfolg'}`);
}

async function kursAnlegen(admin, felder) {
  const { data, error } = await admin.from('courses').insert(felder).select('id').single();
  if (error) abbruch('Kurs ' + felder.title + ': ' + error.message);
  return data.id;
}

async function buchung(admin, courseId, userId) {
  const { data, error } = await admin
    .from('registrations')
    .select(
      'id, user_id, status, coverage_status, price_cents_at_booking, currency, coverage_waived_reason, coverage_waived_note, coverage_waived_by, coverage_waived_at'
    )
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .single();
  if (error) abbruch('registrations lesen: ' + error.message);
  return data;
}

async function erlass(client, id, reason, note) {
  const args = { p_registration_id: id, p_reason: reason };
  if (note !== undefined) args.p_note = note;
  const { data, error } = await client.rpc('set_coverage_waived', args);
  if (error) abbruch(`set_coverage_waived: ${error.message}`);
  return data;
}

async function ruecknahme(client, id) {
  const { data, error } = await client.rpc('revert_coverage_waived', { p_registration_id: id });
  if (error) abbruch(`revert_coverage_waived: ${error.message}`);
  return data;
}

function fehler(data, code, name) {
  ok(
    name,
    data?.success === false && data?.error === code,
    `success=${data?.success} error=${data?.error} status=${data?.coverage_status ?? ''}`
  );
}

function payloadOhneNotiz(payload, registrationId, reason, cents) {
  if (!payload || typeof payload !== 'object') return false;
  const keys = Object.keys(payload);
  return (
    payload.registration_id === registrationId
    && payload.reason === reason
    && Number(payload.price_cents_at_booking) === cents
    && !keys.includes('note')
    && !keys.includes('coverage_waived_note')
    && !JSON.stringify(payload).includes(NOTIZ)
  );
}

async function protokoll(admin, registrationId, typ) {
  const { data: events, error: eErr } = await admin
    .from('events')
    .select('id, type, subject_type, subject_id, payload')
    .eq('subject_id', registrationId)
    .eq('type', typ);
  if (eErr) abbruch('events lesen: ' + eErr.message);
  const { data: audit, error: aErr } = await admin
    .from('audit_log')
    .select('id, action, table_name, row_id, changed_fields, event_id, actor_member_id')
    .eq('row_id', registrationId)
    .eq('action', typ);
  if (aErr) abbruch('audit_log lesen: ' + aErr.message);
  return { events: events || [], audit: audit || [] };
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

  const { data: tenantMain, error: tMainErr } = await admin
    .from('tenants')
    .insert({ name: 'A2 Erlass Haupt', slug: SLUG })
    .select('id')
    .single();
  if (tMainErr) abbruch('Hauptstudio anlegen: ' + tMainErr.message);

  const { data: tenantFremd, error: tFremdErr } = await admin
    .from('tenants')
    .insert({ name: 'A2 Erlass Fremd', slug: SLUG_FREMD })
    .select('id')
    .single();
  if (tFremdErr) abbruch('Fremdstudio anlegen: ' + tFremdErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com',
    vorname: 'Olivia',
    nachname: 'Owner',
    rolle: 'owner',
    tenantId: tenantMain.id,
    password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com',
    vorname: 'Tom',
    nachname: 'Teacher',
    rolle: 'teacher',
    tenantId: tenantMain.id,
    password,
  });
  const p1 = await nutzerAnlegen(admin, {
    email: SLUG + '.teilnehmer1@example.com',
    vorname: 'Anna',
    nachname: 'Eins',
    rolle: 'user',
    tenantId: tenantMain.id,
    password,
  });
  const ownerFremd = await nutzerAnlegen(admin, {
    email: SLUG_FREMD + '.owner@example.com',
    vorname: 'Oskar',
    nachname: 'Fremd',
    rolle: 'owner',
    tenantId: tenantFremd.id,
    password,
  });

  try {
    const basis = {
      tenant_id: tenantMain.id,
      teacher_id: teacher.id,
      description: 'A2 Erlass Test',
      date: tag(14),
      location: 'Test',
      status: 'active',
      frequency: 'one_time',
      max_participants: 10,
    };
    const coursePaid = await kursAnlegen(admin, {
      ...basis,
      title: TITLE_PAID,
      time: '10:00:00',
      end_time: '11:00:00',
      price: 15,
    });
    const courseFree = await kursAnlegen(admin, {
      ...basis,
      title: TITLE_FREE,
      time: '11:00:00',
      end_time: '12:00:00',
      price: 0,
    });

    const clientOwner = await login(url, anon, owner.email, password, SLUG);
    const clientTeacher = await login(url, anon, teacher.email, password, SLUG);
    const clientP1 = await login(url, anon, p1.email, password, SLUG);
    const clientFremd = await login(url, anon, ownerFremd.email, password, SLUG_FREMD);

    await anmelden(clientP1, coursePaid, 'P1 kostenpflichtig');
    await anmelden(clientP1, courseFree, 'P1 kostenlos');
    const offen = await buchung(admin, coursePaid, p1.id);
    const gratis = await buchung(admin, courseFree, p1.id);
    ok(
      'Ausgang offen, 1500',
      offen.coverage_status === 'open' && Number(offen.price_cents_at_booking) === 1500,
      `status=${offen.coverage_status} cent=${offen.price_cents_at_booking}`
    );

    fehler(
      await erlass(clientTeacher, offen.id, 'goodwill', NOTIZ),
      'FORBIDDEN',
      'Fall 2 Lehrende im eigenen Kurs FORBIDDEN'
    );
    fehler(
      await erlass(clientP1, offen.id, 'goodwill', NOTIZ),
      'FORBIDDEN',
      'Fall 2 Teilnehmerin FORBIDDEN'
    );
    const nachVerbot = await buchung(admin, coursePaid, p1.id);
    ok('nach FORBIDDEN weiter open', nachVerbot.coverage_status === 'open' && nachVerbot.coverage_waived_at == null);

    fehler(await erlass(clientOwner, offen.id, 'other', null), 'NOTE_REQUIRED', 'Fall 3 other ohne Notiz');
    fehler(await erlass(clientOwner, offen.id, 'kulanz', NOTIZ), 'INVALID_REASON', 'Fall 3 ungültiger Code');
    const nachCodes = await buchung(admin, coursePaid, p1.id);
    ok('nach ungültigem Grund weiter open', nachCodes.coverage_status === 'open');

    const gesetzt = await erlass(clientOwner, offen.id, 'goodwill', NOTIZ);
    ok(
      'Fall 1 Erlass erfolgreich',
      gesetzt?.success === true && gesetzt?.coverage_status === 'waived',
      `success=${gesetzt?.success} status=${gesetzt?.coverage_status}`
    );
    const waived = await buchung(admin, coursePaid, p1.id);
    ok(
      'Fall 1 waived, vier Felder gesetzt',
      waived.coverage_status === 'waived'
        && waived.coverage_waived_reason === 'goodwill'
        && waived.coverage_waived_note === NOTIZ
        && waived.coverage_waived_by === owner.id
        && typeof waived.coverage_waived_at === 'string'
        && waived.coverage_waived_at.length > 0
        && Number(waived.price_cents_at_booking) === 1500,
      `reason=${waived.coverage_waived_reason} by=${waived.coverage_waived_by}`
    );

    const erstes = await protokoll(admin, offen.id, 'coverage.waived');
    ok('Fall 1 genau ein Event', erstes.events.length === 1 && erstes.events[0].subject_type === 'registration');
    ok(
      'Fall 1 Payload ohne Notiz',
      payloadOhneNotiz(erstes.events[0].payload, offen.id, 'goodwill', 1500)
    );
    ok(
      'Fall 1 genau ein Audit',
      erstes.audit.length === 1
        && erstes.audit[0].table_name === 'registrations'
        && erstes.audit[0].actor_member_id === owner.id
        && erstes.audit[0].event_id === erstes.events[0].id
        && Array.isArray(erstes.audit[0].changed_fields)
        && erstes.audit[0].changed_fields.includes('coverage_waived_note')
        && !erstes.audit[0].changed_fields.includes(NOTIZ)
    );

    fehler(await erlass(clientOwner, offen.id, 'goodwill', NOTIZ), 'NOT_OPEN', 'Fall 4 schon waived');
    ok('Fall 4 NOT_OPEN nennt waived', (await erlass(clientOwner, offen.id, 'pre_omlify')).coverage_status === 'waived');
    const freiVersuch = await erlass(clientOwner, gratis.id, 'goodwill', NOTIZ);
    fehler(freiVersuch, 'NOT_OPEN', 'Fall 4 kostenlose Buchung');
    ok(
      'Fall 4 NOT_OPEN nennt not_required',
      freiVersuch.coverage_status === 'not_required'
    );
    const gratisDanach = await buchung(admin, courseFree, p1.id);
    ok('kostenlose Buchung bleibt not_required', gratisDanach.coverage_status === 'not_required');

    fehler(
      await erlass(clientFremd, offen.id, 'goodwill', NOTIZ),
      'NOT_FOUND',
      'Fall 5 fremdes Studio'
    );

    const { data: lehrerSicht, error: leseFehler } = await clientTeacher
      .from('registrations')
      .select('id, coverage_status, coverage_waived_note')
      .eq('id', offen.id)
      .single();
    if (leseFehler) {
      console.log('  BEOBACHTUNG Lehrende und coverage_waived_note: Select fehlgeschlagen — ' + leseFehler.message);
      const nurStatus = await clientTeacher
        .from('registrations')
        .select('id, coverage_status')
        .eq('id', offen.id)
        .single();
      if (nurStatus.error) abbruch('Lehrende liest coverage_status nicht: ' + nurStatus.error.message);
      ok('Fall 8 Lehrende sieht coverage_status', nurStatus.data.coverage_status === 'waived');
    } else {
      const siehtNotiz = lehrerSicht.coverage_waived_note === NOTIZ;
      console.log(
        '  BEOBACHTUNG Lehrende sieht coverage_waived_note: ' + (siehtNotiz ? 'ja' : 'nein')
          + ' (Wert ' + JSON.stringify(lehrerSicht.coverage_waived_note) + ')'
      );
      ok(
        'Fall 8 Lehrende sieht coverage_status',
        lehrerSicht.coverage_status === 'waived',
        `status=${lehrerSicht.coverage_status}`
      );
    }

    const zurueck = await ruecknahme(clientOwner, offen.id);
    ok(
      'Fall 6 Rücknahme erfolgreich',
      zurueck?.success === true && zurueck?.coverage_status === 'open'
    );
    const wiederOffen = await buchung(admin, coursePaid, p1.id);
    ok(
      'Fall 6 open, Erlass-Felder NULL',
      wiederOffen.coverage_status === 'open'
        && wiederOffen.coverage_waived_reason == null
        && wiederOffen.coverage_waived_note == null
        && wiederOffen.coverage_waived_by == null
        && wiederOffen.coverage_waived_at == null
        && Number(wiederOffen.price_cents_at_booking) === 1500
    );
    const zweites = await protokoll(admin, offen.id, 'coverage.waive_reverted');
    ok('Fall 6 ein Event der Rücknahme', zweites.events.length === 1 && zweites.events[0].subject_type === 'registration');
    ok(
      'Fall 6 Payload trägt den alten Grund, nicht die Notiz',
      payloadOhneNotiz(zweites.events[0].payload, offen.id, 'goodwill', 1500)
    );
    ok(
      'Fall 6 ein Audit der Rücknahme',
      zweites.audit.length === 1
        && zweites.audit[0].event_id === zweites.events[0].id
        && zweites.audit[0].actor_member_id === owner.id
        && !zweites.audit[0].changed_fields.includes(NOTIZ)
    );

    const { error: updErr } = await clientOwner
      .from('registrations')
      .update({ coverage_status: 'waived' })
      .eq('id', offen.id);
    ok(
      'Fall 7 direktes UPDATE verweigert',
      Boolean(updErr) && (updErr.code === '42501' || /permission denied/i.test(updErr.message || '')),
      updErr ? `${updErr.code || ''} ${updErr.message}` : 'kein Fehler'
    );
    const nachUpdate = await buchung(admin, coursePaid, p1.id);
    ok('Fall 7 Zeile bleibt open', nachUpdate.coverage_status === 'open');

    console.log('\n  A2-Erlass: alle Fälle ok\n');
  } finally {
    if (devOk) await resteEntfernen(admin);
  }
}

main().catch((e) => {
  console.error('\n  FEHLER: ' + (e?.message || e) + '\n');
  process.exit(1);
});
