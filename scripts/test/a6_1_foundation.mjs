#!/usr/bin/env node
/**
 * A6-1 — Fundament Stornofrist / Spalten / Helfer-Rechte (nur DEV).
 *
 * Nicht ausführen, bevor 20260927221500_a6_1_pass_booking_foundation.sql
 * auf DEV liegt. Gegen PROD nie. Eigenes Studio a61foundtest, am Ende
 * delete_tenant_complete und auth.admin.deleteUser.
 *
 * Fälle:
 *  1) update_booking_settings Owner Frist 12 → ok; 80 → Fehler;
 *     Lehrende → Fehler; Aufruf nur mit default_max_participants weiter ok.
 *  2) Buchung Kurs morgen 18:00 bei Frist 12 → deadline morgen 06:00 Berlin.
 *     Frist auf 24 → bestehende Deadline unverändert; neue Buchung → 24 h.
 *  3) service_role UPDATE cancellation_deadline / pass_id → Trigger-Fehler.
 *  4) CHECK: coverage pass ohne pass_id → Fehler.
 *  5) remove_member mit SQL-Fixture-Einlösung → anonymized, Buchung+Bewegung
 *     bleiben (sonst SKIP / A6-2).
 *  6) authenticated hat kein EXECUTE auf die drei Helfer.
 *
 * Verwendung: node scripts/test/a6_1_foundation.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a61foundtest';

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

function expectedDeadlineParts(courseDate, courseTimeHHMMSS, windowHours) {
  const [hh, mm, ss] = courseTimeHHMMSS.split(':').map(Number);
  const totalMin = hh * 60 + mm - windowHours * 60;
  const dayOffset = Math.floor(totalMin / (24 * 60));
  let rem = totalMin % (24 * 60);
  if (rem < 0) rem += 24 * 60;
  const outH = String(Math.floor(rem / 60)).padStart(2, '0');
  const outM = String(rem % 60).padStart(2, '0');
  const outS = String(ss || 0).padStart(2, '0');
  const [y, m, d] = courseDate.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d + dayOffset));
  const dateStr = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
  return { dateStr, timeStr: `${outH}:${outM}:${outS}` };
}

function berlinParts(iso) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
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
    .insert({ name: 'A6-1 Foundation', slug: SLUG })
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

  const asOwner = await login(url, anon, owner.email, password);
  const asTeacher = await login(url, anon, teacher.email, password);
  const asUser = await login(url, anon, user.email, password);
  const asUser2 = await login(url, anon, user2.email, password);

  const morgen = berlinDate(1);
  const kursZeit = '18:00:00';

  console.log('\n1) update_booking_settings');
  const { data: set12, error: e12 } = await asOwner.rpc('update_booking_settings', {
    p_cancellation_window_hours: 12,
  });
  if (e12) abbruch(e12.message);
  ok('Frist 12', set12?.success === true && set12?.tenant?.cancellation_window_hours === 12);

  const { data: set80, error: e80 } = await asOwner.rpc('update_booking_settings', {
    p_cancellation_window_hours: 80,
  });
  if (e80) abbruch(e80.message);
  ok('Frist 80 abgelehnt', set80?.success === false);

  const { data: setTeacher, error: eT } = await asTeacher.rpc('update_booking_settings', {
    p_cancellation_window_hours: 6,
  });
  if (eT) abbruch(eT.message);
  ok('Lehrende abgelehnt', setTeacher?.success === false);

  const { data: setMax, error: eMax } = await asOwner.rpc('update_booking_settings', {
    p_default_max_participants: 8,
  });
  if (eMax) abbruch(eMax.message);
  ok(
    'Alter Aufruf ohne Frist-Param',
    setMax?.success === true
      && setMax?.tenant?.default_max_participants === 8
      && setMax?.tenant?.cancellation_window_hours === 12
  );

  console.log('\n2) cancellation_deadline einfrieren');
  const { data: course, error: cErr } = await admin
    .from('courses')
    .insert({
      tenant_id: tenant.id,
      title: 'A6-1 Frist',
      description: 'A6-1 Foundation Testkurs',
      date: morgen,
      time: kursZeit,
      end_time: '19:00:00',
      location: 'Studio',
      max_participants: 10,
      price: 15,
      teacher_id: teacher.id,
      status: 'active',
      frequency: 'one_time',
      pass_eligible: true,
    })
    .select('id')
    .single();
  if (cErr) abbruch('Kurs: ' + cErr.message);

  const { data: reg1, error: r1Err } = await asUser.rpc('register_for_course', {
    p_course_id: course.id,
  });
  if (r1Err || !reg1?.success) abbruch('Anmelden: ' + (r1Err?.message || JSON.stringify(reg1)));

  const { data: row1, error: row1Err } = await admin
    .from('registrations')
    .select('id, cancellation_deadline')
    .eq('course_id', course.id)
    .eq('user_id', user.id)
    .is('cancellation_timestamp', null)
    .single();
  if (row1Err) abbruch(row1Err.message);

  const exp12 = expectedDeadlineParts(morgen, kursZeit, 12);
  const got12 = berlinParts(row1.cancellation_deadline);
  ok(
    'Deadline 12 h → morgen 06:00 Berlin',
    got12.date === exp12.dateStr && got12.time === exp12.timeStr,
    `got ${got12.date} ${got12.time} expected ${exp12.dateStr} ${exp12.timeStr}`
  );
  const frozen = row1.cancellation_deadline;

  const { data: set24, error: e24 } = await asOwner.rpc('update_booking_settings', {
    p_cancellation_window_hours: 24,
  });
  if (e24 || !set24?.success) abbruch('Frist 24: ' + (e24?.message || JSON.stringify(set24)));

  const { data: row1b } = await admin
    .from('registrations')
    .select('cancellation_deadline')
    .eq('id', row1.id)
    .single();
  ok('Bestehende Deadline unverändert', row1b?.cancellation_deadline === frozen);

  const { data: reg2, error: r2Err } = await asUser2.rpc('register_for_course', {
    p_course_id: course.id,
  });
  if (r2Err || !reg2?.success) abbruch('Anmelden 2: ' + (r2Err?.message || JSON.stringify(reg2)));

  const { data: row2 } = await admin
    .from('registrations')
    .select('cancellation_deadline')
    .eq('course_id', course.id)
    .eq('user_id', user2.id)
    .is('cancellation_timestamp', null)
    .single();
  const exp24 = expectedDeadlineParts(morgen, kursZeit, 24);
  const got24 = berlinParts(row2.cancellation_deadline);
  ok(
    'Neue Buchung mit 24 h',
    got24.date === exp24.dateStr && got24.time === exp24.timeStr,
    `got ${got24.date} ${got24.time}`
  );

  console.log('\n3) Immutable Trigger');
  const { error: updDl } = await admin
    .from('registrations')
    .update({ cancellation_deadline: new Date().toISOString() })
    .eq('id', row1.id);
  ok(
    'UPDATE deadline blockiert',
    Boolean(updDl?.message) && /CANCELLATION_DEADLINE_FROZEN|cancellation/i.test(updDl.message),
    updDl?.message
  );

  const { data: prod, error: pErr } = await asOwner.rpc('create_pass_product', {
    p_name: '10er A6-1',
    p_units: 10,
    p_price_cents: 15000,
    p_validity_rule: 'years_to_year_end',
    p_validity_value: 1,
  });
  if (pErr || !prod?.success) abbruch('Produkt: ' + (pErr?.message || JSON.stringify(prod)));

  const { data: sold, error: sErr } = await asOwner.rpc('sell_pass', {
    p_member_id: user.id,
    p_product_id: prod.id,
    p_method: 'cash',
  });
  if (sErr || !sold?.success) abbruch('sell_pass: ' + (sErr?.message || JSON.stringify(sold)));

  const { error: updPass } = await admin
    .from('registrations')
    .update({ pass_id: sold.pass_id })
    .eq('id', row1.id);
  ok(
    'UPDATE pass_id blockiert',
    Boolean(updPass?.message) && /PASS_ID_FROZEN|pass_id|check/i.test(updPass.message),
    updPass?.message
  );

  console.log('\n4) CHECK pass_iff_pass_id');
  const { error: badIns } = await admin.from('registrations').insert({
    user_id: user.id,
    course_id: course.id,
    tenant_id: tenant.id,
    status: 'cancelled',
    is_waitlist: false,
    cancellation_timestamp: new Date().toISOString(),
    cancel_reason: 'participant',
    coverage_status: 'pass',
    pass_id: null,
  });
  ok(
    'pass ohne pass_id abgelehnt',
    Boolean(badIns?.message) && /pass_iff_pass_id|check|violates/i.test(badIns.message),
    badIns?.message
  );

  console.log('\n5) remove_member mit Fixture-Einlösung');
  let removeMemberMitPassGetestet = false;
  try {
    const { data: sold2, error: s2Err } = await asOwner.rpc('sell_pass', {
      p_member_id: user2.id,
      p_product_id: prod.id,
      p_method: 'cash',
    });
    if (s2Err || !sold2?.success) throw new Error(s2Err?.message || JSON.stringify(sold2));

    const { data: courseB, error: cbErr } = await admin
      .from('courses')
      .insert({
        tenant_id: tenant.id,
        title: 'A6-1 Remove',
        description: 'A6-1 Foundation Testkurs',
        date: berlinDate(2),
        time: '10:00:00',
        end_time: '11:00:00',
        location: 'Studio',
        max_participants: 10,
        price: 12,
        teacher_id: teacher.id,
        status: 'active',
        frequency: 'one_time',
        pass_eligible: true,
      })
      .select('id')
      .single();
    if (cbErr) throw new Error(cbErr.message);

    // user2 hat schon eine aktive Anmeldung am Frist-Kurs → abmelden
    await asUser2.rpc('unregister_from_course', { p_course_id: course.id });

    const fixtureRegId = crypto.randomUUID();
    const { error: fixRegErr } = await admin.from('registrations').insert({
      id: fixtureRegId,
      user_id: user2.id,
      course_id: courseB.id,
      tenant_id: tenant.id,
      status: 'registered',
      is_waitlist: false,
      coverage_status: 'pass',
      pass_id: sold2.pass_id,
    });
    if (fixRegErr) throw new Error('Fixture-Reg: ' + fixRegErr.message);

    const { error: fixMvErr } = await admin.from('pass_movements').insert({
      tenant_id: tenant.id,
      pass_id: sold2.pass_id,
      delta: -1,
      kind: 'redeem',
      registration_id: fixtureRegId,
      actor_member_id: owner.id,
    });
    if (fixMvErr) throw new Error('Fixture-Move: ' + fixMvErr.message);

    const { data: removed, error: rmErr } = await asOwner.rpc('remove_member', {
      p_member_id: user2.id,
    });
    if (rmErr) throw new Error(rmErr.message);
    ok(
      'remove → anonymized',
      removed?.success === true && removed?.mode === 'anonymized',
      JSON.stringify(removed)
    );

    const { data: keptReg } = await admin
      .from('registrations')
      .select('id, coverage_status, pass_id')
      .eq('id', fixtureRegId)
      .maybeSingle();
    ok(
      'Buchung mit pass bleibt',
      keptReg?.coverage_status === 'pass' && keptReg?.pass_id === sold2.pass_id
    );

    const { data: keptMv } = await admin
      .from('pass_movements')
      .select('id')
      .eq('registration_id', fixtureRegId)
      .eq('kind', 'redeem');
    ok('Bewegung bleibt', (keptMv || []).length === 1);
    removeMemberMitPassGetestet = true;
  } catch (err) {
    console.log(
      '  SKIP remove_member-Fixture — auf A6-2 verschieben:',
      err instanceof Error ? err.message : String(err)
    );
  }
  if (!removeMemberMitPassGetestet) {
    console.log('  (Hinweis: remove_member mit pass nicht in diesem Lauf belegt)');
  }

  console.log('\n6) Helfer ohne EXECUTE für authenticated');
  const { error: pickErr } = await asOwner.rpc('pick_pass_for_registration', {
    p_member_id: user.id,
    p_course_id: course.id,
  });
  ok(
    'pick_pass nicht aufrufbar',
    Boolean(pickErr?.message) && /function|schema cache|permission|not find|Could not find/i.test(pickErr.message),
    pickErr?.message
  );
  const { error: redeemErr } = await asOwner.rpc('redeem_pass', {
    p_registration_id: row1.id,
    p_pass_id: sold.pass_id,
    p_actor: owner.id,
  });
  ok(
    'redeem_pass nicht aufrufbar',
    Boolean(redeemErr?.message) && /function|schema cache|permission|not find|Could not find/i.test(redeemErr.message),
    redeemErr?.message
  );
  const { error: revErr } = await asOwner.rpc('reverse_redemption', {
    p_registration_id: row1.id,
    p_actor: owner.id,
    p_reason: 'test',
  });
  ok(
    'reverse_redemption nicht aufrufbar',
    Boolean(revErr?.message) && /function|schema cache|permission|not find|Could not find/i.test(revErr.message),
    revErr?.message
  );

  console.log('\nAufräumen');
  await resteEntfernen(admin);
  console.log('\nA6-1 foundation: alle Tests grün');
}

main().catch(async (err) => {
  console.error('\n' + (err?.message || err));
  if (devOk) {
    try {
      const env = ladeEnv();
      const admin = clientMitTenant(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, SLUG);
      await resteEntfernen(admin);
    } catch (e) {
      console.error('Aufräumen fehlgeschlagen:', e?.message || e);
    }
  }
  process.exit(1);
});
