#!/usr/bin/env node
/**
 * A1 Schritt 2 — Soft-Cancel-Akzeptanz auf DEV (nur ausführen nach db:push:dev
 * der Migration 20260926144500).
 *
 * Gegen PROD nie. Eigenes Studio `a1softcancel`, am Ende delete_tenant_complete
 * und auth.admin.deleteUser. Bleibt etwas liegen: Studio-Slug a1softcancel,
 * Konten a1softcancel.*@example.com.
 *
 * Fälle:
 *  1) Kapazität 1: A registered, B waitlist → A abmelden → A cancelled/participant,
 *     B registered, waitlist_promoted für B
 *  2) A meldet sich erneut an → neue Waitlist-Zeile, alte cancelled bleibt
 *  3) Wartelisten-Storno → Positionen lückenlos
 *  4) Admin meldet B ab → studio, cancelled_by = Admin; C nachgerückt + waitlist_promoted
 *  5) get_course_participant_counts ignoriert Stornierte
 *  6) authenticated: direktes DELETE/UPDATE auf registrations → permission denied
 *  7) Zwei gleichzeitige Abmeldungen im vollen Kurs mit zwei Wartenden → genau zwei
 *     Nachrücker, keine Überbuchung
 *  8) Kursdatum per service_role auf gestern → unregister_from_course success=false,
 *     Zeile bleibt registered
 *
 * Verwendung: node scripts/test/a1_soft_cancel.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a1softcancel';
const TITLE = 'A1_SOFT_CANCEL_TEST';

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

function tag(versatzTage) {
  const d = new Date();
  d.setDate(d.getDate() + versatzTage);
  return d.toISOString().slice(0, 10);
}

function ok(name, cond, detail = '') {
  if (!cond) abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
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
  const admin = clientMitTenant(url, service);

  await resteEntfernen(admin);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .insert({ name: 'A1 Soft-Cancel', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio anlegen: ' + tErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com', vorname: 'Olivia', nachname: 'Owner', rolle: 'owner', tenantId: tenant.id, password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com', vorname: 'Tom', nachname: 'Teacher', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const userA = await nutzerAnlegen(admin, {
    email: SLUG + '.teilnehmer1@example.com', vorname: 'Anna', nachname: 'Eins', rolle: 'user', tenantId: tenant.id, password,
  });
  const userB = await nutzerAnlegen(admin, {
    email: SLUG + '.teilnehmer2@example.com', vorname: 'Ben', nachname: 'Zwei', rolle: 'user', tenantId: tenant.id, password,
  });
  const userC = await nutzerAnlegen(admin, {
    email: SLUG + '.teilnehmer3@example.com', vorname: 'Clara', nachname: 'Drei', rolle: 'user', tenantId: tenant.id, password,
  });
  const userD = await nutzerAnlegen(admin, {
    email: SLUG + '.teilnehmer4@example.com', vorname: 'Dana', nachname: 'Vier', rolle: 'user', tenantId: tenant.id, password,
  });

  const clientA = await login(url, anon, userA.email, password);
  const clientB = await login(url, anon, userB.email, password);
  const clientC = await login(url, anon, userC.email, password);
  const adminClient = await login(url, anon, owner.email, password);

  try {
    const { data: course1, error: c1e } = await admin
      .from('courses')
      .insert({
        tenant_id: tenant.id,
        title: TITLE,
        description: 'a1 soft cancel case 1',
        date: tag(14),
        time: '10:00:00',
        end_time: '11:00:00',
        location: 'Test',
        max_participants: 1,
        price: 0,
        teacher_id: teacher.id,
        status: 'active',
        frequency: 'one_time',
      })
      .select('id')
      .single();
    if (c1e) abbruch('Kurs1: ' + c1e.message);

    console.log('\nFall 1 — Soft-Cancel + Nachrücken');
    ok('A anmelden', (await clientA.rpc('register_for_course', { p_course_id: course1.id })).data?.success);
    ok('B Warteliste', (await clientB.rpc('register_for_course', { p_course_id: course1.id })).data?.is_waitlist === true);

    const beforeNotif = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userB.id)
      .eq('type', 'waitlist_promoted')
      .eq('course_id', course1.id);

    const unreg = await clientA.rpc('unregister_from_course', { p_course_id: course1.id });
    ok('A abmelden success', unreg.data?.success === true, unreg.data?.message);

    const { data: rowA } = await admin
      .from('registrations')
      .select('status, cancel_reason, cancelled_by, cancellation_timestamp, is_waitlist')
      .eq('course_id', course1.id)
      .eq('user_id', userA.id)
      .eq('status', 'cancelled')
      .maybeSingle();
    ok('A cancelled/participant', rowA?.status === 'cancelled' && rowA?.cancel_reason === 'participant');
    ok('A cancelled_by = A', rowA?.cancelled_by === userA.id);
    ok('A is_waitlist false bleibt', rowA?.is_waitlist === false);

    const { data: rowB } = await admin
      .from('registrations')
      .select('status, is_waitlist, waitlist_position')
      .eq('course_id', course1.id)
      .eq('user_id', userB.id)
      .eq('status', 'registered')
      .maybeSingle();
    ok('B nachgerückt registered', rowB?.status === 'registered' && rowB?.is_waitlist === false);

    const afterNotif = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userB.id)
      .eq('type', 'waitlist_promoted')
      .eq('course_id', course1.id);
    ok(
      'waitlist_promoted für B',
      (afterNotif.count ?? 0) === (beforeNotif.count ?? 0) + 1
    );

    console.log('\nFall 2 — Erneut anmelden');
    const rereg = await clientA.rpc('register_for_course', { p_course_id: course1.id });
    ok('A erneut → Warteliste', rereg.data?.success && rereg.data?.is_waitlist === true);
    const { data: rowsA } = await admin
      .from('registrations')
      .select('id, status')
      .eq('course_id', course1.id)
      .eq('user_id', userA.id);
    ok(
      'A hat cancelled + waitlist',
      (rowsA || []).some((r) => r.status === 'cancelled') &&
        (rowsA || []).some((r) => r.status === 'waitlist')
    );

    console.log('\nFall 3 — Wartelisten-Storno / Compact');
    ok('C Warteliste', (await clientC.rpc('register_for_course', { p_course_id: course1.id })).data?.is_waitlist === true);
    const { data: wlBefore } = await admin
      .from('registrations')
      .select('user_id, waitlist_position')
      .eq('course_id', course1.id)
      .eq('status', 'waitlist')
      .order('waitlist_position');
    ok('zwei Wartende vor Storno', (wlBefore || []).length === 2);

    await clientA.rpc('unregister_from_course', { p_course_id: course1.id });
    const { data: wlAfter } = await admin
      .from('registrations')
      .select('user_id, waitlist_position, status')
      .eq('course_id', course1.id)
      .eq('status', 'waitlist')
      .order('waitlist_position');
    ok('ein Wartender nach Storno', (wlAfter || []).length === 1);
    ok('Position 1 lückenlos', wlAfter?.[0]?.waitlist_position === 1 && wlAfter?.[0]?.user_id === userC.id);

    console.log('\nFall 4 — Admin-Abmeldung');
    const beforeNotifC = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userC.id)
      .eq('type', 'waitlist_promoted')
      .eq('course_id', course1.id);

    const adm = await adminClient.rpc('admin_unregister_user_from_course', {
      p_user_id: userB.id,
      p_course_id: course1.id,
    });
    ok('Admin abmelden success', adm.data?.success === true, adm.data?.message || adm.data?.error);
    const { data: rowB2 } = await admin
      .from('registrations')
      .select('status, cancel_reason, cancelled_by')
      .eq('course_id', course1.id)
      .eq('user_id', userB.id)
      .eq('status', 'cancelled')
      .order('cancellation_timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();
    ok('B cancel_reason studio', rowB2?.cancel_reason === 'studio');
    ok('B cancelled_by = owner', rowB2?.cancelled_by === owner.id);

    const { data: rowC } = await admin
      .from('registrations')
      .select('status, is_waitlist')
      .eq('course_id', course1.id)
      .eq('user_id', userC.id)
      .eq('status', 'registered')
      .maybeSingle();
    ok('C nachgerückt registered', rowC?.status === 'registered' && rowC?.is_waitlist === false);

    const afterNotifC = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userC.id)
      .eq('type', 'waitlist_promoted')
      .eq('course_id', course1.id);
    ok(
      'waitlist_promoted für C',
      (afterNotifC.count ?? 0) === (beforeNotifC.count ?? 0) + 1
    );

    console.log('\nFall 5 — Platzzählung');
    const { data: counts } = await clientA.rpc('get_course_participant_counts', {
      p_course_ids: [course1.id],
    });
    const row = (counts || []).find((c) => c.course_id === course1.id);
    const { count: cancelledN } = await admin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', course1.id)
      .eq('status', 'cancelled');
    ok('Counts vorhanden', !!row);
    ok(
      'registered_count ohne Stornierte',
      Number(row?.registered_count ?? -1) >= 0 && Number(cancelledN ?? 0) > 0
    );
    const { count: activeReg } = await admin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', course1.id)
      .eq('status', 'registered');
    ok('registered_count = aktive', Number(row?.registered_count) === Number(activeReg ?? 0));

    console.log('\nFall 6 — direkte Schreibrechte verweigert');
    const del = await clientA.from('registrations').delete().eq('course_id', course1.id).eq('user_id', userA.id);
    ok('DELETE denied', !!del.error, del.error?.message);
    const upd = await clientA
      .from('registrations')
      .update({ waitlist_position: 99 })
      .eq('course_id', course1.id)
      .eq('user_id', userC.id);
    ok('UPDATE denied', !!upd.error, upd.error?.message);

    console.log('\nFall 7 — zwei parallele Abmeldungen');
    const { data: course2, error: c2e } = await admin
      .from('courses')
      .insert({
        tenant_id: tenant.id,
        title: TITLE,
        description: 'a1 soft cancel race',
        date: tag(21),
        time: '12:00:00',
        end_time: '13:00:00',
        location: 'Test',
        max_participants: 2,
        price: 0,
        teacher_id: teacher.id,
        status: 'active',
        frequency: 'one_time',
      })
      .select('id')
      .single();
    if (c2e) abbruch('Kurs2: ' + c2e.message);

    await clientA.rpc('register_for_course', { p_course_id: course2.id });
    await clientB.rpc('register_for_course', { p_course_id: course2.id });
    await clientC.rpc('register_for_course', { p_course_id: course2.id });

    await admin.from('registrations').insert({
      tenant_id: tenant.id,
      course_id: course2.id,
      user_id: userD.id,
      status: 'waitlist',
      is_waitlist: true,
      waitlist_position: 2,
    });

    const [u1, u2] = await Promise.all([
      clientA.rpc('unregister_from_course', { p_course_id: course2.id }),
      clientB.rpc('unregister_from_course', { p_course_id: course2.id }),
    ]);
    ok(
      'parallele Abmeldungen success',
      u1.data?.success === true && u2.data?.success === true,
      `a=${u1.data?.message} b=${u2.data?.message}`
    );

    const { count: reg2 } = await admin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', course2.id)
      .eq('status', 'registered');
    ok('genau 2 registered (kein Overbook)', Number(reg2) === 2, `registered=${reg2}`);

    console.log('\nFall 8 — Abmeldung von vergangenem Kurs gesperrt');
    const { data: course3, error: c3e } = await admin
      .from('courses')
      .insert({
        tenant_id: tenant.id,
        title: TITLE,
        description: 'a1 soft cancel past unregister',
        date: tag(1),
        time: '09:00:00',
        end_time: '10:00:00',
        location: 'Test',
        max_participants: 2,
        price: 0,
        teacher_id: teacher.id,
        status: 'active',
        frequency: 'one_time',
      })
      .select('id')
      .single();
    if (c3e) abbruch('Kurs3: ' + c3e.message);

    ok('A anmelden (morgen)', (await clientA.rpc('register_for_course', { p_course_id: course3.id })).data?.success);

    const { error: dateErr } = await admin
      .from('courses')
      .update({ date: tag(-1) })
      .eq('id', course3.id);
    if (dateErr) abbruch('Kursdatum auf gestern: ' + dateErr.message);

    const pastUnreg = await clientA.rpc('unregister_from_course', { p_course_id: course3.id });
    ok(
      'unregister past → success=false',
      pastUnreg.data?.success === false,
      pastUnreg.data?.message
    );
    ok(
      'Meldung Vergangenheit',
      typeof pastUnreg.data?.message === 'string' &&
        pastUnreg.data.message.includes('vergangenen Kursen')
    );

    const { data: rowAPast } = await admin
      .from('registrations')
      .select('status, cancellation_timestamp')
      .eq('course_id', course3.id)
      .eq('user_id', userA.id)
      .maybeSingle();
    ok(
      'A bleibt registered',
      rowAPast?.status === 'registered' && rowAPast?.cancellation_timestamp == null
    );

    console.log('\nAlle Fälle durchlaufen.\n');
  } finally {
    if (devOk) {
      console.log('Aufräumen…');
      await resteEntfernen(admin);
    }
  }
}

main().catch((e) => {
  console.error('\n  FEHLER: ' + (e?.message || e) + '\n');
  process.exit(1);
});
