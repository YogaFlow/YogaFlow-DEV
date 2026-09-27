#!/usr/bin/env node
/**
 * 4.3 — Person entfernen (nur DEV).
 *
 * Nicht ausführen, bevor 20260927145006_4_3_member_removal.sql auf DEV liegt.
 * Gegen PROD nie. Eigenes Studio s43removetest und s43removeb, am Ende
 * delete_tenant_complete und die Test-Logins per auth.admin.deleteUser.
 *
 * Regression danach, nicht aus diesem Skript:
 *   node scripts/test/a1_soft_cancel.mjs
 *   node scripts/test/a3_payments.mjs
 *   node scripts/test/a9_cancel.mjs
 *
 * Verwendung: node scripts/test/s4_3_remove_member.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 's43removetest';
const SLUG_B = 's43removeb';
const ERLASS_NOTIZ = 'Erlass Testnotiz';

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

async function login(url, anon, email, password, slug) {
  const c = clientMitTenant(url, anon, slug);
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
      const mail = u.email ?? '';
      if (mail.startsWith(SLUG + '.') || mail.startsWith(SLUG_B + '.')) treffer.push(u);
    }
    if (data.users.length < 200) return treffer;
  }
}

async function resteEntfernen(admin) {
  for (const slug of [SLUG, SLUG_B]) {
    const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', slug);
    if (error) abbruch('Studio lesen: ' + error.message);
    for (const t of tenants || []) {
      const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
      if (e) abbruch('Studio löschen: ' + e.message);
    }
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
    .select('id, email, role, tenant_id, auth_user_id, first_name, last_name')
    .eq('auth_user_id', data.user.id)
    .eq('tenant_id', tenantId)
    .single();
  if (eProfil || !profil) abbruch('Profil ' + email + ': ' + (eProfil?.message ?? 'keine Zeile'));

  const { error: e2 } = await admin
    .from('users')
    .update({
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      street: 'Testweg',
      phone: '0171000000',
    })
    .eq('id', profil.id);
  if (e2) abbruch('Profilfelder ' + email + ': ' + e2.message);
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
}

async function buchung(admin, courseId, userId) {
  const { data, error } = await admin
    .from('registrations')
    .select('id, status, is_waitlist, waitlist_position, cancel_reason, cancelled_by, coverage_status, coverage_waived_note, user_id')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) abbruch('registrations lesen: ' + error.message);
  return data;
}

async function profilLesen(admin, id) {
  const { data, error } = await admin
    .from('users')
    .select('id, email, first_name, last_name, role, street, phone, auth_user_id, anonymized_at, email_verified, email_verified_at, tenant_id')
    .eq('id', id)
    .maybeSingle();
  if (error) abbruch('Profil lesen: ' + error.message);
  return data;
}

async function entfernen(client, memberId) {
  const { data, error } = await client.rpc('remove_member', { p_member_id: memberId });
  if (error) abbruch('remove_member: ' + error.message);
  return data;
}

function code(data, erwartet, name) {
  ok(
    name,
    data?.success === false && data?.error === erwartet,
    `success=${data?.success} error=${data?.error}`
  );
}

async function zaehlen(admin, table, column, value) {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);
  if (error) abbruch(table + ' zählen: ' + error.message);
  return count ?? 0;
}

async function spur(admin, person) {
  const { error: mErr } = await admin.from('messages').insert({
    tenant_id: person.tenant_id,
    course_id: person.courseId,
    sender_id: person.id,
    recipient_id: person.empfaengerId,
    content: 'Nachricht ' + person.first_name,
    is_broadcast: false,
  });
  if (mErr) abbruch('Nachricht: ' + mErr.message);
  const { error: nErr } = await admin.from('user_notifications').insert({
    tenant_id: person.tenant_id,
    user_id: person.id,
    type: 'course_added',
    body: 'Glocke ' + person.first_name,
    action_path: '/my-courses',
  });
  if (nErr) abbruch('Glocke: ' + nErr.message);
}

function platzhalter(zeile, id) {
  return (
    zeile
    && zeile.first_name === 'Entfernte'
    && zeile.last_name === 'Person'
    && zeile.email === `entfernt-${id}@anonymisiert.invalid`
    && zeile.auth_user_id === null
    && zeile.anonymized_at
    && zeile.street === null
    && zeile.phone === null
    && zeile.email_verified === false
    && zeile.email_verified_at === null
    && zeile.role === 'user'
  );
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
    .insert({ name: 'S43 Entfernen', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio anlegen: ' + tErr.message);

  const { data: tenantB, error: bErr } = await admin
    .from('tenants')
    .insert({ name: 'S43 Anderes Studio', slug: SLUG_B })
    .select('id')
    .single();
  if (bErr) abbruch('Studio B anlegen: ' + bErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com', vorname: 'Olivia', nachname: 'Owner', rolle: 'owner', tenantId: tenant.id, password,
  });
  const owner2 = await nutzerAnlegen(admin, {
    email: SLUG + '.owner2@example.com', vorname: 'Otto', nachname: 'Zweit', rolle: 'owner', tenantId: tenant.id, password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com', vorname: 'Thea', nachname: 'Lehrer', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const teacherPast = await nutzerAnlegen(admin, {
    email: SLUG + '.teacherpast@example.com', vorname: 'Tara', nachname: 'Vergangen', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const teacherNext = await nutzerAnlegen(admin, {
    email: SLUG + '.teachernext@example.com', vorname: 'Timo', nachname: 'Kommend', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const adminA = await nutzerAnlegen(admin, {
    email: SLUG + '.admin@example.com', vorname: 'Anja', nachname: 'Admin', rolle: 'admin', tenantId: tenant.id, password,
  });
  const adminB = await nutzerAnlegen(admin, {
    email: SLUG + '.admin2@example.com', vorname: 'Arne', nachname: 'Admin', rolle: 'admin', tenantId: tenant.id, password,
  });
  const teacherLoose = await nutzerAnlegen(admin, {
    email: SLUG + '.teacherloose@example.com', vorname: 'Lina', nachname: 'Lose', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const seat = await nutzerAnlegen(admin, {
    email: SLUG + '.seat@example.com', vorname: 'Sina', nachname: 'Platz', rolle: 'user', tenantId: tenant.id, password,
  });
  const waitFirst = await nutzerAnlegen(admin, {
    email: SLUG + '.wait1@example.com', vorname: 'Wiebke', nachname: 'Eins', rolle: 'user', tenantId: tenant.id, password,
  });
  const waitSecond = await nutzerAnlegen(admin, {
    email: SLUG + '.wait2@example.com', vorname: 'Wilfried', nachname: 'Zwei', rolle: 'user', tenantId: tenant.id, password,
  });
  const plain = await nutzerAnlegen(admin, {
    email: SLUG + '.plain@example.com', vorname: 'Pia', nachname: 'Ohne', rolle: 'user', tenantId: tenant.id, password,
  });
  const paid = await nutzerAnlegen(admin, {
    email: SLUG + '.paid@example.com', vorname: 'Klara', nachname: 'Kasse', rolle: 'user', tenantId: tenant.id, password,
  });
  const waiter = await nutzerAnlegen(admin, {
    email: SLUG + '.waiter@example.com', vorname: 'Wera', nachname: 'Warte', rolle: 'user', tenantId: tenant.id, password,
  });
  const waived = await nutzerAnlegen(admin, {
    email: SLUG + '.waived@example.com', vorname: 'Wilma', nachname: 'Erlass', rolle: 'user', tenantId: tenant.id, password,
  });
  const multi = await nutzerAnlegen(admin, {
    email: SLUG + '.multi@example.com', vorname: 'Mia', nachname: 'Multi', rolle: 'user', tenantId: tenant.id, password,
  });
  const fremd = await nutzerAnlegen(admin, {
    email: SLUG_B + '.fremd@example.com', vorname: 'Frida', nachname: 'Fremd', rolle: 'user', tenantId: tenantB.id, password,
  });

  const basis = {
    tenant_id: tenant.id,
    description: 'S43 Entfernen Testkurs',
    location: 'Test',
    status: 'active',
    frequency: 'one_time',
    max_participants: 10,
    price: 15,
  };
  const courseChat = await kursAnlegen(admin, {
    ...basis, teacher_id: owner.id, title: 'S43_CHAT', date: tag(4), time: '09:00:00', end_time: '10:00:00',
  });
  const coursePaid = await kursAnlegen(admin, {
    ...basis, teacher_id: teacher.id, title: 'S43_BAR', date: tag(5), time: '10:00:00', end_time: '11:00:00',
  });
  const courseOpen = await kursAnlegen(admin, {
    ...basis, teacher_id: teacher.id, title: 'S43_OFFEN', date: tag(6), time: '11:00:00', end_time: '12:00:00',
  });
  const courseFull = await kursAnlegen(admin, {
    ...basis, teacher_id: teacher.id, title: 'S43_VOLL', date: tag(7), time: '12:00:00', end_time: '13:00:00', max_participants: 1,
  });
  const courseWaived = await kursAnlegen(admin, {
    ...basis, teacher_id: teacher.id, title: 'S43_ERLASS', date: tag(8), time: '13:00:00', end_time: '14:00:00',
  });
  const coursePastTeach = await kursAnlegen(admin, {
    ...basis, teacher_id: teacherPast.id, title: 'S43_LEHR_VERGANGEN', date: tag(-3), time: '10:00:00', end_time: '11:00:00',
  });
  const courseNextTeach = await kursAnlegen(admin, {
    ...basis, teacher_id: teacherNext.id, title: 'S43_LEHR_KOMMEND', date: tag(9), time: '15:00:00', end_time: '16:00:00',
  });
  const courseAdminPast = await kursAnlegen(admin, {
    ...basis, teacher_id: adminB.id, title: 'S43_ADMIN_VERGANGEN', date: tag(-4), time: '10:00:00', end_time: '11:00:00',
  });
  const courseLoose = await kursAnlegen(admin, {
    ...basis, teacher_id: teacherLoose.id, title: 'S43_LEHR_LOSE', date: tag(-4), time: '11:00:00', end_time: '12:00:00',
  });
  const courseQueue = await kursAnlegen(admin, {
    ...basis, teacher_id: owner.id, title: 'S43_WARTE', date: tag(10), time: '16:00:00', end_time: '17:00:00', max_participants: 1,
  });

  const clientOwner = await login(url, anon, owner.email, password, SLUG);
  const clientAdmin = await login(url, anon, adminA.email, password, SLUG);
  const clientSeat = await login(url, anon, seat.email, password, SLUG);
  const clientWaitFirst = await login(url, anon, waitFirst.email, password, SLUG);
  const clientWaitSecond = await login(url, anon, waitSecond.email, password, SLUG);
  const clientTeacher = await login(url, anon, teacher.email, password, SLUG);
  const clientPlain = await login(url, anon, plain.email, password, SLUG);
  const clientPaid = await login(url, anon, paid.email, password, SLUG);
  const clientWaiter = await login(url, anon, waiter.email, password, SLUG);
  const clientWaived = await login(url, anon, waived.email, password, SLUG);
  const clientMulti = await login(url, anon, multi.email, password, SLUG);
  const clientMultiB = await login(url, anon, multi.email, password, SLUG_B);

  await anmelden(clientPaid, coursePaid, 'Klara bar');
  await anmelden(clientPaid, courseOpen, 'Klara offen');
  await anmelden(clientPaid, courseFull, 'Klara voll');
  await anmelden(clientWaiter, courseFull, 'Wera warteliste');
  await anmelden(clientWaived, courseWaived, 'Wilma erlass');
  await anmelden(clientSeat, courseQueue, 'Sina platz');
  await anmelden(clientWaitFirst, courseQueue, 'Wiebke warteliste');
  await anmelden(clientWaitSecond, courseQueue, 'Wilfried warteliste');

  const regPaid = await buchung(admin, coursePaid, paid.id);
  const regOpen = await buchung(admin, courseOpen, paid.id);
  const regFull = await buchung(admin, courseFull, paid.id);
  const regWait = await buchung(admin, courseFull, waiter.id);
  const regWaived = await buchung(admin, courseWaived, waived.id);
  if (!regPaid || !regOpen || !regFull || !regWait || !regWaived) abbruch('Buchungen fehlen');
  ok('Warteliste vor dem Entfernen', regWait.status === 'waitlist' && regFull.status === 'registered');

  const bar = await clientOwner.rpc('record_manual_payment', {
    p_registration_id: regPaid.id,
    p_method: 'cash',
  });
  if (bar.error || !bar.data?.success) abbruch('Barvermerk: ' + (bar.error?.message || bar.data?.error));

  const erlass = await clientOwner.rpc('set_coverage_waived', {
    p_registration_id: regWaived.id,
    p_reason: 'goodwill',
    p_note: ERLASS_NOTIZ,
  });
  if (erlass.error || !erlass.data?.success) abbruch('Erlass: ' + (erlass.error?.message || erlass.data?.error));

  for (const id of [coursePaid, courseOpen, courseWaived]) {
    const { error } = await admin.from('courses').update({ date: tag(-3) }).eq('id', id);
    if (error) abbruch('Kurs in die Vergangenheit: ' + error.message);
  }

  await spur(admin, { ...plain, courseId: courseChat, empfaengerId: owner.id });
  await spur(admin, { ...paid, courseId: courseChat, empfaengerId: owner.id });

  console.log('Ablehnungen');
  code(await entfernen(clientOwner, owner.id), 'CANNOT_REMOVE_SELF', 'sich selbst');
  code(await entfernen(clientOwner, owner2.id), 'OWNER_NOT_REMOVABLE', 'Owner als Ziel');
  code(await entfernen(clientTeacher, plain.id), 'FORBIDDEN', 'Lehrende als Aufruferin');
  code(await entfernen(clientOwner, fremd.id), 'NOT_FOUND', 'Profil aus fremdem Studio');
  const upcoming = await entfernen(clientOwner, teacherNext.id);
  ok(
    'Lehrende mit künftigem Kurs',
    upcoming?.success === false
      && upcoming?.error === 'HAS_UPCOMING_COURSES'
      && upcoming?.upcoming_courses === 1,
    JSON.stringify(upcoming)
  );
  const teacherNextBleibt = await profilLesen(admin, teacherNext.id);
  ok('künftige Lehrende unverändert', teacherNextBleibt?.anonymized_at === null && teacherNextBleibt?.role === 'teacher');

  console.log('ohne Geldbezug');
  const weg = await entfernen(clientOwner, plain.id);
  ok('plain deleted', weg?.success === true && weg?.mode === 'deleted' && weg?.remaining_profiles === 0, JSON.stringify(weg));
  ok('plain Zeile weg', (await profilLesen(admin, plain.id)) === null);
  ok('plain Nachricht weg', (await zaehlen(admin, 'messages', 'sender_id', plain.id)) === 0);
  ok('plain Glocke weg', (await zaehlen(admin, 'user_notifications', 'user_id', plain.id)) === 0);

  console.log('mit Barzahlung');
  const barWeg = await entfernen(clientOwner, paid.id);
  ok(
    'Klara anonymized',
    barWeg?.success === true && barWeg?.mode === 'anonymized' && barWeg?.remaining_profiles === 0 && barWeg?.auth_user_id === paid.auth_user_id,
    JSON.stringify(barWeg)
  );
  ok('Klara cancelled 1 deleted 1', barWeg.cancelled_registrations === 1 && barWeg.deleted_registrations === 1, JSON.stringify(barWeg));
  const klara = await profilLesen(admin, paid.id);
  ok('Klara Platzhalter', platzhalter(klara, paid.id), JSON.stringify(klara));
  const { error: nameErr } = await clientOwner.from('users').update({ first_name: 'Neu' }).eq('id', paid.id);
  const nameText = `${nameErr?.code || ''} ${nameErr?.message || ''}`;
  ok('Vorname der anonymisierten Klara abgelehnt', Boolean(nameErr) && /MEMBER_IDENTITY_LOCKED/.test(nameText), nameText);
  ok('Klara Vorname bleibt Entfernte', (await profilLesen(admin, paid.id))?.first_name === 'Entfernte');
  const zahlung = await admin.from('payments').select('id, amount_cents, registration_id, method').eq('registration_id', regPaid.id);
  if (zahlung.error) abbruch(zahlung.error.message);
  ok('Zahlungszeile unverändert', zahlung.data?.length === 1 && zahlung.data[0].amount_cents === 1500 && zahlung.data[0].method === 'cash');
  const bezahlt = await buchung(admin, coursePaid, paid.id);
  ok('bezahlte Anmeldung unverändert', bezahlt?.status === 'registered' && bezahlt?.coverage_status === 'paid' && bezahlt?.cancel_reason === null);
  ok('unbezahlte vergangene Anmeldung gelöscht', (await buchung(admin, courseOpen, paid.id)) === null);
  const kuenftig = await buchung(admin, courseFull, paid.id);
  ok(
    'künftige Anmeldung member_removed',
    kuenftig?.status === 'cancelled' && kuenftig?.cancel_reason === 'member_removed' && kuenftig?.cancelled_by === owner.id
  );
  const nachgerueckt = await buchung(admin, courseFull, waiter.id);
  ok('Wartende nachgerückt', nachgerueckt?.status === 'registered');
  ok('Klara Nachricht weg', (await zaehlen(admin, 'messages', 'sender_id', paid.id)) === 0);
  ok('Klara Glocke weg', (await zaehlen(admin, 'user_notifications', 'user_id', paid.id)) === 0);

  const { data: events, error: evErr } = await admin
    .from('events')
    .select('type, subject_id, payload')
    .eq('type', 'member.removed')
    .eq('subject_id', paid.id);
  if (evErr) abbruch(evErr.message);
  const payloadText = JSON.stringify(events?.[0]?.payload ?? {});
  ok(
    'Event ohne Namen oder E-Mail',
    events?.length === 1
      && events[0].payload?.mode === 'anonymized'
      && events[0].payload?.member_id === paid.id
      && !payloadText.includes('Klara')
      && !payloadText.includes(paid.email)
      && !payloadText.includes('@example.com')
  );
  const { data: audit, error: aErr } = await admin
    .from('audit_log')
    .select('actor_member_id, action')
    .eq('action', 'member.removed')
    .eq('row_id', paid.id);
  if (aErr) abbruch(aErr.message);
  ok('Audit-Akteur ist die Ownerin', audit?.length === 1 && audit[0].actor_member_id === owner.id);

  code(await entfernen(clientOwner, paid.id), 'ALREADY_REMOVED', 'zweiter Aufruf');

  console.log('Erlass ohne Zahlung');
  const erlassWeg = await entfernen(clientOwner, waived.id);
  ok('Wilma anonymized', erlassWeg?.success === true && erlassWeg?.mode === 'anonymized', JSON.stringify(erlassWeg));
  const wilma = await profilLesen(admin, waived.id);
  ok('Wilma Platzhalter', platzhalter(wilma, waived.id));
  const erlassZeile = await buchung(admin, courseWaived, waived.id);
  ok(
    'Erlass-Anmeldung bleibt',
    erlassZeile?.coverage_status === 'waived' && erlassZeile?.coverage_waived_note === ERLASS_NOTIZ && erlassZeile?.status === 'registered'
  );
  ok('Erlass ohne Zahlungszeile', (await zaehlen(admin, 'payments', 'registration_id', regWaived.id)) === 0);

  console.log('Mehrfachmitgliedschaft');
  const beitritt = await clientMultiB.rpc('join_tenant', { p_first_name: 'Mia', p_last_name: 'Multi' });
  if (beitritt.error || !beitritt.data?.success) abbruch('join_tenant: ' + (beitritt.error?.message || beitritt.data?.error));
  const profilBVorher = await admin
    .from('users')
    .select('id, first_name, email, auth_user_id, anonymized_at, tenant_id')
    .eq('auth_user_id', multi.auth_user_id)
    .eq('tenant_id', tenantB.id)
    .single();
  if (profilBVorher.error) abbruch(profilBVorher.error.message);
  const multiWeg = await entfernen(clientOwner, multi.id);
  ok('Mia remaining_profiles 1', multiWeg?.success === true && multiWeg?.remaining_profiles === 1 && multiWeg?.mode === 'deleted', JSON.stringify(multiWeg));
  const profilB = await profilLesen(admin, profilBVorher.data.id);
  ok(
    'Profil in Studio B unverändert',
    profilB?.first_name === 'Mia'
      && profilB?.email === multi.email
      && profilB?.auth_user_id === multi.auth_user_id
      && profilB?.anonymized_at === null
      && profilB?.tenant_id === tenantB.id
  );

  console.log('Lehrende nur mit vergangenem Kurs');
  const lehrWeg = await entfernen(clientOwner, teacherPast.id);
  ok('Tara anonymized', lehrWeg?.success === true && lehrWeg?.mode === 'anonymized', JSON.stringify(lehrWeg));
  const tara = await profilLesen(admin, teacherPast.id);
  ok('Tara Platzhalter', platzhalter(tara, teacherPast.id));
  const { data: kursTara, error: kErr } = await admin.from('courses').select('teacher_id').eq('id', coursePastTeach).single();
  if (kErr) abbruch(kErr.message);
  ok('teacher_id unverändert', kursTara.teacher_id === teacherPast.id);

  console.log('Admin entfernt Admin und Lehrende');
  // Vergangene Kurse, damit der Weg anonymisiert und die Rolle auf user setzt.
  // Dabei läuft prevent_role_escalation. Ein Fehler daraus bricht entfernen ab.
  const adminWeg = await entfernen(clientAdmin, adminB.id);
  const adminZeile = await profilLesen(admin, adminB.id);
  ok(
    'andere Admin entfernt',
    adminWeg?.success === true
      && (adminWeg.mode === 'anonymized' || adminWeg.mode === 'deleted')
      && (adminWeg.mode === 'deleted' ? adminZeile === null : platzhalter(adminZeile, adminB.id)),
    JSON.stringify(adminWeg)
  );
  const { data: kursAdmin, error: kaErr } = await admin.from('courses').select('teacher_id').eq('id', courseAdminPast).single();
  if (kaErr) abbruch(kaErr.message);
  ok('Kurs der anderen Admin bleibt', kursAdmin.teacher_id === adminB.id);
  const lehrLoose = await entfernen(clientAdmin, teacherLoose.id);
  const lina = await profilLesen(admin, teacherLoose.id);
  ok(
    'Lehrende durch Admin entfernt',
    lehrLoose?.success === true
      && (lehrLoose.mode === 'anonymized' || lehrLoose.mode === 'deleted')
      && (lehrLoose.mode === 'deleted' ? lina === null : platzhalter(lina, teacherLoose.id)),
    JSON.stringify(lehrLoose)
  );
  const { data: kursLina, error: klErr } = await admin.from('courses').select('teacher_id').eq('id', courseLoose).single();
  if (klErr) abbruch(klErr.message);
  ok('Kurs der Lehrenden bleibt', kursLina.teacher_id === teacherLoose.id);

  console.log('Warteliste verdichtet');
  const erste = await buchung(admin, courseQueue, waitFirst.id);
  const zweite = await buchung(admin, courseQueue, waitSecond.id);
  ok(
    'zwei Wartende',
    erste?.status === 'waitlist' && erste.waitlist_position === 1
      && zweite?.status === 'waitlist' && zweite.waitlist_position === 2,
    JSON.stringify({ erste, zweite })
  );
  const warteWeg = await entfernen(clientOwner, waitFirst.id);
  ok('erste Wartende entfernt', warteWeg?.success === true, JSON.stringify(warteWeg));
  const zweiteDanach = await buchung(admin, courseQueue, waitSecond.id);
  ok(
    'zweite Wartende auf Position 1',
    zweiteDanach?.status === 'waitlist' && zweiteDanach.waitlist_position === 1,
    JSON.stringify(zweiteDanach)
  );

  console.log('direktes DELETE und Identität');
  const { error: delErr } = await clientOwner.from('users').delete().eq('id', owner2.id).select('id');
  const delText = `${delErr?.code || ''} ${delErr?.message || ''}`;
  ok('direktes DELETE verweigert', Boolean(delErr) && /42501|permission|denied/i.test(delText), delText);
  const owner2Bleibt = await profilLesen(admin, owner2.id);
  ok('Owner-Zeile bleibt', owner2Bleibt?.id === owner2.id && owner2Bleibt?.role === 'owner');

  const authVorher = (await profilLesen(admin, teacherNext.id))?.auth_user_id;
  const { error: authErr } = await clientOwner.from('users').update({ auth_user_id: null }).eq('id', teacherNext.id);
  const authText = `${authErr?.code || ''} ${authErr?.message || ''}`;
  ok('auth_user_id per Client abgelehnt', Boolean(authErr), authText);
  const authNachher = await profilLesen(admin, teacherNext.id);
  ok(
    'auth_user_id unverändert',
    authVorher !== null && authNachher?.auth_user_id === authVorher && authNachher?.role === 'teacher'
  );

  const nachbuchen = await clientOwner.rpc('admin_register_user_for_course', {
    p_user_id: paid.id,
    p_course_id: courseNextTeach,
  });
  if (nachbuchen.error) abbruch('admin_register: ' + nachbuchen.error.message);
  code(nachbuchen.data, 'MEMBER_REMOVED', 'Nachbuchung anonymisiertes Profil');

  console.log('Login löschen und neu registrieren');
  const { error: loginWeg } = await admin.auth.admin.deleteUser(paid.auth_user_id);
  if (loginWeg) abbruch('deleteUser: ' + loginWeg.message);
  const klaraNachLogin = await profilLesen(admin, paid.id);
  ok('anonymisierte Zeile überlebt deleteUser', platzhalter(klaraNachLogin, paid.id));
  ok('Zahlung überlebt deleteUser', (await zaehlen(admin, 'payments', 'registration_id', regPaid.id)) === 1);

  const { data: neu, error: neuErr } = await admin.auth.admin.createUser({
    email: paid.email,
    password,
    email_confirm: true,
    user_metadata: { tenant_id: tenant.id, first_name: 'Klara', last_name: 'Neu' },
    app_metadata: { role: 'user' },
  });
  if (neuErr) abbruch('Neu registrieren: ' + neuErr.message);
  const { data: neuProfil, error: neuProfilErr } = await admin
    .from('users')
    .select('id, email, auth_user_id, tenant_id')
    .eq('auth_user_id', neu.user.id)
    .eq('tenant_id', tenant.id)
    .single();
  if (neuProfilErr) abbruch(neuProfilErr.message);
  ok(
    'neue Registrierung ohne Kollision',
    neuProfil.id !== paid.id && neuProfil.email === paid.email && neuProfil.auth_user_id === neu.user.id
  );
  ok('anonymisierte Zeile bleibt daneben', (await profilLesen(admin, paid.id))?.email === `entfernt-${paid.id}@anonymisiert.invalid`);

  console.log('Geldbezug nur über Karte (A5)');
  const passHolder = await nutzerAnlegen(admin, {
    email: SLUG + '.passholder@example.com',
    vorname: 'Petra',
    nachname: 'Pass',
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });
  const { data: produkt, error: prodErr } = await clientOwner.rpc('create_pass_product', {
    p_name: '4.3-Testkarte',
    p_units: 5,
    p_price_cents: 5000,
    p_validity_rule: 'months',
    p_validity_value: 6,
  });
  if (prodErr || !produkt?.success) abbruch('Pass-Produkt: ' + (prodErr?.message || JSON.stringify(produkt)));
  const { data: verkauf, error: verkErr } = await clientOwner.rpc('sell_pass', {
    p_member_id: passHolder.id,
    p_product_id: produkt.id,
    p_method: 'cash',
  });
  if (verkErr || !verkauf?.success) abbruch('sell_pass: ' + (verkErr?.message || JSON.stringify(verkauf)));
  const passWeg = await entfernen(clientOwner, passHolder.id);
  ok(
    'nur Karte → anonymized',
    passWeg?.success === true && passWeg?.mode === 'anonymized',
    JSON.stringify(passWeg)
  );
  const { data: karteBleibt, error: karteErr } = await admin
    .from('passes')
    .select('id, member_id, status')
    .eq('id', verkauf.pass_id)
    .single();
  if (karteErr) abbruch(karteErr.message);
  ok(
    'Karte bleibt an anonymisiertem Profil',
    karteBleibt?.member_id === passHolder.id && karteBleibt?.status === 'active'
  );

  console.log('Studio mit anonymisierten Profilen');
  const { error: studioWeg } = await admin.rpc('delete_tenant_complete', { p_tenant_id: tenant.id });
  if (studioWeg) abbruch('delete_tenant_complete: ' + studioWeg.message);
  ok('Studio A weg', (await zaehlen(admin, 'tenants', 'id', tenant.id)) === 0);
  ok('Profile von Studio A weg', (await zaehlen(admin, 'users', 'tenant_id', tenant.id)) === 0);
  ok('Zahlungen von Studio A weg', (await zaehlen(admin, 'payments', 'tenant_id', tenant.id)) === 0);

  const { error: studioBWeg } = await admin.rpc('delete_tenant_complete', { p_tenant_id: tenantB.id });
  if (studioBWeg) abbruch('Studio B: ' + studioBWeg.message);

  console.log('grün');
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
      console.error('Reste: Studios s43removetest und s43removeb, Konten s43removetest.* und s43removeb.*');
      process.exitCode = 1;
    }
  });
