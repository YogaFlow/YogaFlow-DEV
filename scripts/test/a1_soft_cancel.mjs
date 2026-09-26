#!/usr/bin/env node
/**
 * A1 Schritt 2 — Soft-Cancel-Akzeptanz auf DEV (nur ausführen nach db:push:dev
 * der Migration 20260926144500).
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
 * Aufräumen: registrations → user_notifications → courses (Nachrücken beim DELETE
 * würde sonst neue Benachrichtigungen erzeugen).
 *
 * Räumt am Ende auf. Zugangsdaten aus scripts/seed-dev.mjs. Passwörter nicht ausgegeben.
 *
 * Verwendung: node scripts/test/a1_soft_cancel.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'demoalpha';
const TITLE = 'A1_SOFT_CANCEL_TEST';

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
  if (!pass) {
    console.error('DEMO_PASSWORT in scripts/seed-dev.mjs nicht gefunden');
    process.exit(1);
  }
  return {
    password: pass[1],
    emailA: `${SLUG}.teilnehmer1@example.com`,
    emailB: `${SLUG}.teilnehmer2@example.com`,
    emailC: `${SLUG}.teilnehmer3@example.com`,
    emailAdmin: `${SLUG}.owner@example.com`,
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

function tag(versatzTage) {
  const d = new Date();
  d.setDate(d.getDate() + versatzTage);
  return d.toISOString().slice(0, 10);
}

function ok(name, cond, detail = '') {
  if (cond) {
    console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function login(url, anon, email, password) {
  const c = clientMitTenant(url, anon);
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) abbruch(`Login ${email}: ${error.message}`);
  return c;
}

/** registrations zuerst — DELETE würde sonst Nachrücken + neue Notifications erzeugen. */
async function raeumeTestkurse(admin, tenantId) {
  const { data: courses } = await admin
    .from('courses')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('title', TITLE);
  for (const c of courses || []) {
    await admin.from('registrations').delete().eq('course_id', c.id);
    await admin.from('user_notifications').delete().eq('course_id', c.id);
    await admin.from('courses').delete().eq('id', c.id);
  }
}

async function main() {
  const env = ladeEnv();
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) abbruch('.env unvollständig (URL/ANON/SERVICE_ROLE)');
  if (refAusKey(anon) !== ERLAUBTE_REF) abbruch('Falsches Projekt (nur DEV)');

  const seed = seedKonfig();
  const admin = clientMitTenant(url, service);

  const { data: tenant, error: tErr } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', SLUG)
    .single();
  if (tErr || !tenant) abbruch('Tenant demoalpha nicht gefunden');

  const { data: teacher } = await admin
    .from('users')
    .select('id')
    .eq('tenant_id', tenant.id)
    .in('role', ['teacher', 'owner'])
    .limit(1)
    .single();

  const { data: owner } = await admin
    .from('users')
    .select('id, email')
    .eq('tenant_id', tenant.id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  // Alte Testdaten wegräumen (Reihenfolge: registrations → notifications → courses)
  await raeumeTestkurse(admin, tenant.id);

  const { data: users } = await admin
    .from('users')
    .select('id, email, role')
    .eq('tenant_id', tenant.id)
    .in('email', [seed.emailA, seed.emailB, seed.emailC]);
  const byEmail = Object.fromEntries((users || []).map((u) => [u.email, u]));
  const userA = byEmail[seed.emailA];
  const userB = byEmail[seed.emailB];
  const userC = byEmail[seed.emailC];
  if (!userA || !userB || !userC) abbruch('Seed-Teilnehmende A/B/C fehlen — npm run seed:dev');

  const clientA = await login(url, anon, seed.emailA, seed.password);
  const clientB = await login(url, anon, seed.emailB, seed.password);
  const clientC = await login(url, anon, seed.emailC, seed.password);

  let adminClient = null;
  if (owner?.email) {
    adminClient = await login(url, anon, owner.email, seed.password);
  }

  // --- Kurs Kapazität 1 ---
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
  // C auf Warteliste (A ist schon Pos.1 waitlist, Kurs voll mit B)
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
  if (!adminClient || !owner) {
    console.log('  SKIP Admin-Fall (kein Owner-Login mit Seed-Passwort)');
  } else {
    // B ist registered, C waitlist — Admin meldet B ab → C rückt nach
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
  }

  console.log('\nFall 5 — Platzzählung');
  // Nach Admin-Abmeldung könnte C nachgerückt sein — Counts nur aktive
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
  // Neuer Kurs Kapazität 2, A+B registered, C + extra waitlist
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

  const { data: spare } = await admin
    .from('users')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('role', 'user')
    .not('id', 'in', `(${[userA.id, userB.id, userC.id].map((id) => `"${id}"`).join(',')})`)
    .limit(1)
    .maybeSingle();

  if (!spare) {
    console.log('  SKIP Race-Fall (kein 4. Teilnehmer)');
  } else {
    await admin.from('registrations').insert({
      tenant_id: tenant.id,
      course_id: course2.id,
      user_id: spare.id,
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
  }

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

  // --- Aufräumen ---
  console.log('\nAufräumen…');
  await raeumeTestkurse(admin, tenant.id);

  await clientA.auth.signOut();
  await clientB.auth.signOut();
  await clientC.auth.signOut();
  if (adminClient) await adminClient.auth.signOut();

  console.log('\nAlle Fälle durchlaufen.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
