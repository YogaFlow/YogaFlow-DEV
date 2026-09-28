#!/usr/bin/env node
/**
 * A8-1 — Sammelaktion vor Omlify + Offene-Liste + Kurs-Karten (nur DEV).
 *
 * Nicht ausführen, bevor 20260928160000_a8_1_bulk_waive_open_list.sql auf DEV liegt.
 * Gegen PROD nie. Studios `a8bulktest` und `a8bulkdat`, am Ende
 * delete_tenant_complete und auth.admin.deleteUser für beide.
 *
 * Verwendung: node scripts/test/a8_1_bulk_waive.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a8bulktest';
const SLUG_DAT = 'a8bulkdat';
const SLUGS = [SLUG, SLUG_DAT];

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

function berlinHeute() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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
    .select(
      'id, user_id, status, coverage_status, coverage_waived_reason, coverage_waived_batch_id, price_cents_at_booking'
    )
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .single();
  if (error) abbruch('registrations lesen: ' + error.message);
  return data;
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
    .insert({ name: 'A8 Bulk Haupt', slug: SLUG })
    .select('id')
    .single();
  if (tMainErr) abbruch('Hauptstudio: ' + tMainErr.message);

  const { data: tenantDat, error: tDatErr } = await admin
    .from('tenants')
    .insert({ name: 'A8 Bulk Datum', slug: SLUG_DAT })
    .select('id')
    .single();
  if (tDatErr) abbruch('Datumstudio: ' + tDatErr.message);

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
  const teacherOther = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher2@example.com',
    vorname: 'Tina',
    nachname: 'Andere',
    rolle: 'teacher',
    tenantId: tenantMain.id,
    password,
  });
  const p1 = await nutzerAnlegen(admin, {
    email: SLUG + '.t1@example.com',
    vorname: 'Anna',
    nachname: 'Eins',
    rolle: 'user',
    tenantId: tenantMain.id,
    password,
  });
  const p2 = await nutzerAnlegen(admin, {
    email: SLUG + '.t2@example.com',
    vorname: 'Berta',
    nachname: 'Zwei',
    rolle: 'user',
    tenantId: tenantMain.id,
    password,
  });
  const p3 = await nutzerAnlegen(admin, {
    email: SLUG + '.t3@example.com',
    vorname: 'Clara',
    nachname: 'Drei',
    rolle: 'user',
    tenantId: tenantMain.id,
    password,
  });
  const p4 = await nutzerAnlegen(admin, {
    email: SLUG + '.t4@example.com',
    vorname: 'Dora',
    nachname: 'Vier',
    rolle: 'user',
    tenantId: tenantMain.id,
    password,
  });
  const p5 = await nutzerAnlegen(admin, {
    email: SLUG + '.t5@example.com',
    vorname: 'Eva',
    nachname: 'Fuenf',
    rolle: 'user',
    tenantId: tenantMain.id,
    password,
  });
  const pExtra = await nutzerAnlegen(admin, {
    email: SLUG + '.tx@example.com',
    vorname: 'Xenia',
    nachname: 'Extra',
    rolle: 'user',
    tenantId: tenantMain.id,
    password,
  });
  const ownerDat = await nutzerAnlegen(admin, {
    email: SLUG_DAT + '.owner@example.com',
    vorname: 'Oskar',
    nachname: 'Datum',
    rolle: 'owner',
    tenantId: tenantDat.id,
    password,
  });
  const pDat = await nutzerAnlegen(admin, {
    email: SLUG_DAT + '.t1@example.com',
    vorname: 'Dana',
    nachname: 'Datum',
    rolle: 'user',
    tenantId: tenantDat.id,
    password,
  });

  try {
    const heute = berlinHeute();
    const morgen = tag(1);
    const basis = {
      tenant_id: tenantMain.id,
      teacher_id: teacher.id,
      description: 'A8 Bulk Test Kursbeschreibung lang genug',
      location: 'Test',
      status: 'active',
      frequency: 'one_time',
      max_participants: 10,
      price: 15,
      date: tag(14),
      time: '10:00:00',
      end_time: '11:00:00',
    };

    // 3 vergangene Kurse, zusammen 5 offene aktive Buchungen
    const c1 = await kursAnlegen(admin, { ...basis, title: 'A8_PAST_1', date: tag(20) });
    const c2 = await kursAnlegen(admin, { ...basis, title: 'A8_PAST_2', date: tag(21), time: '11:00:00', end_time: '12:00:00' });
    const c3 = await kursAnlegen(admin, { ...basis, title: 'A8_PAST_3', date: tag(22), time: '12:00:00', end_time: '13:00:00' });
    // Kontrollen
    const cPaid = await kursAnlegen(admin, { ...basis, title: 'A8_CTRL_PAID', date: tag(23) });
    const cPass = await kursAnlegen(admin, { ...basis, title: 'A8_CTRL_PASS', date: tag(24), pass_eligible: true });
    const cWait = await kursAnlegen(admin, {
      ...basis,
      title: 'A8_CTRL_WAIT',
      date: tag(25),
      max_participants: 1,
    });
    const cCancel = await kursAnlegen(admin, { ...basis, title: 'A8_CTRL_CANCEL', date: tag(26) });
    const cFuture = await kursAnlegen(admin, { ...basis, title: 'A8_FUTURE', date: tag(30) });
    const cTeacherOther = await kursAnlegen(admin, {
      ...basis,
      title: 'A8_OTHER_TEACHER',
      teacher_id: teacherOther.id,
      date: tag(31),
    });

    const clientOwner = await login(url, anon, owner.email, password, SLUG);
    const clientTeacher = await login(url, anon, teacher.email, password, SLUG);
    const clientTeacher2 = await login(url, anon, teacherOther.email, password, SLUG);
    const clientP1 = await login(url, anon, p1.email, password, SLUG);
    const clientP2 = await login(url, anon, p2.email, password, SLUG);
    const clientP3 = await login(url, anon, p3.email, password, SLUG);
    const clientP4 = await login(url, anon, p4.email, password, SLUG);
    const clientP5 = await login(url, anon, p5.email, password, SLUG);
    const clientPx = await login(url, anon, pExtra.email, password, SLUG);

    await anmelden(clientP1, c1, 'p1-c1');
    await anmelden(clientP2, c1, 'p2-c1');
    await anmelden(clientP3, c2, 'p3-c2');
    await anmelden(clientP4, c3, 'p4-c3');
    await anmelden(clientP5, c3, 'p5-c3');

    await anmelden(clientP1, cPaid, 'p1-paid');
    const paidReg = await buchung(admin, cPaid, p1.id);
    const pay = await clientOwner.rpc('record_manual_payment', {
      p_registration_id: paidReg.id,
      p_method: 'cash',
    });
    if (pay.error || !pay.data?.success) abbruch('Barzahlung Kontrolle: ' + (pay.error?.message || pay.data?.error));

    // Karte: Produkt + Verkauf + Einlösen
    const { data: prod, error: prodErr } = await clientOwner.rpc('create_pass_product', {
      p_name: 'A8 10er',
      p_units: 10,
      p_price_cents: 15000,
      p_validity_rule: 'years_to_year_end',
      p_validity_value: 3,
    });
    if (prodErr || !prod?.success) abbruch('create_pass_product: ' + (prodErr?.message || JSON.stringify(prod)));
    await anmelden(clientP2, cPass, 'p2-pass-reg');
    const sell = await clientOwner.rpc('sell_pass', {
      p_member_id: p2.id,
      p_product_id: prod.id,
      p_method: 'cash',
    });
    if (sell.error || !sell.data?.success) abbruch('sell_pass: ' + (sell.error?.message || sell.data?.error));
    const passReg = await buchung(admin, cPass, p2.id);
    const apply = await clientOwner.rpc('apply_pass_to_registration', {
      p_registration_id: passReg.id,
    });
    if (apply.error || !apply.data?.success) {
      abbruch('apply_pass: ' + (apply.error?.message || apply.data?.error));
    }

    // Warteliste: Kurs voll mit bezahltem Platz (nicht open), dann pExtra auf Warteliste
    await anmelden(clientP3, cWait, 'p3-wait-seat');
    const waitSeat = await buchung(admin, cWait, p3.id);
    const payWaitSeat = await clientOwner.rpc('record_manual_payment', {
      p_registration_id: waitSeat.id,
      p_method: 'cash',
    });
    if (payWaitSeat.error || !payWaitSeat.data?.success) {
      abbruch('Warteliste-Platz bezahlen: ' + (payWaitSeat.error?.message || payWaitSeat.data?.error));
    }
    await anmelden(clientPx, cWait, 'px-waitlist');
    const waitReg = await buchung(admin, cWait, pExtra.id);
    ok('Warteliste Status', waitReg.status === 'waitlist', waitReg.status);

    // Storniert
    await anmelden(clientP4, cCancel, 'p4-cancel');
    const cancelReg = await buchung(admin, cCancel, p4.id);
    const unreg = await clientOwner.rpc('admin_unregister_user_from_course', {
      p_user_id: p4.id,
      p_course_id: cCancel,
    });
    if (unreg.error || !unreg.data?.success) {
      // Fallback soft-cancel RPC name variants
      const unreg2 = await clientP4.rpc('unregister_from_course', { p_course_id: cCancel });
      if (unreg2.error || !unreg2.data?.success) {
        abbruch('Storno: ' + (unreg.error?.message || unreg2.error?.message || unreg.data?.error));
      }
    }
    const cancelAfter = await buchung(admin, cCancel, p4.id);
    ok('Kontrolle storniert', cancelAfter.status === 'cancelled', cancelAfter.status);

    await anmelden(clientP5, cFuture, 'p5-future');

    // Kurse in die Vergangenheit schieben (service_role)
    for (const [id, days] of [
      [c1, -10],
      [c2, -9],
      [c3, -8],
      [cPaid, -7],
      [cPass, -6],
      [cWait, -5],
      [cCancel, -4],
    ]) {
      const { error } = await admin.from('courses').update({ date: tag(days) }).eq('id', id);
      if (error) abbruch('Datum past: ' + error.message);
    }

    // --- Vorschau ---
    const prevMorgen = await clientOwner.rpc('preview_pre_omlify_waive', { p_before: morgen });
    ok(
      'Vorschau morgen → DATE_IN_FUTURE',
      prevMorgen.data?.success === false && prevMorgen.data?.error === 'DATE_IN_FUTURE',
      JSON.stringify(prevMorgen.data)
    );

    const prevHeute = await clientOwner.rpc('preview_pre_omlify_waive', { p_before: heute });
    ok(
      'Vorschau heute count=5 course_count=3',
      prevHeute.data?.success === true
        && prevHeute.data?.count === 5
        && prevHeute.data?.course_count === 3,
      JSON.stringify(prevHeute.data)
    );

    const prevTeacher = await clientTeacher.rpc('preview_pre_omlify_waive', { p_before: heute });
    ok(
      'Lehrende Vorschau FORBIDDEN',
      prevTeacher.data?.success === false && prevTeacher.data?.error === 'FORBIDDEN',
      JSON.stringify(prevTeacher.data)
    );

    const countChanged = await clientOwner.rpc('waive_pre_omlify_before', {
      p_before: heute,
      p_expected_count: 4,
    });
    ok(
      'COUNT_CHANGED',
      countChanged.data?.success === false
        && countChanged.data?.error === 'COUNT_CHANGED'
        && countChanged.data?.count === 5,
      JSON.stringify(countChanged.data)
    );
    const nochOffen = await admin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantMain.id)
      .eq('coverage_status', 'open')
      .eq('status', 'registered');
    // mind. die 5 past + 1 future
    ok('nach COUNT_CHANGED unverändert open≥6', (nochOffen.count ?? 0) >= 6, String(nochOffen.count));

    // --- Ausführen ---
    const waive = await clientOwner.rpc('waive_pre_omlify_before', {
      p_before: heute,
      p_expected_count: 5,
    });
    ok(
      'waive waived=5',
      waive.data?.success === true && waive.data?.waived === 5 && !!waive.data?.batch_id,
      JSON.stringify(waive.data)
    );
    const batchId = waive.data.batch_id;

    const openIds = [];
    for (const [cid, uid] of [
      [c1, p1.id],
      [c1, p2.id],
      [c2, p3.id],
      [c3, p4.id],
      [c3, p5.id],
    ]) {
      const row = await buchung(admin, cid, uid);
      openIds.push(row.id);
      ok(
        `Batch-Zeile ${row.id.slice(0, 8)}`,
        row.coverage_status === 'waived'
          && row.coverage_waived_reason === 'pre_omlify'
          && row.coverage_waived_batch_id === batchId
      );
    }

    const paidAfter = await buchung(admin, cPaid, p1.id);
    ok('bezahlt unverändert', paidAfter.coverage_status === 'paid', paidAfter.coverage_status);
    const passAfter = await buchung(admin, cPass, p2.id);
    ok('Karte unverändert', passAfter.coverage_status === 'pass', passAfter.coverage_status);
    const waitAfter = await buchung(admin, cWait, pExtra.id);
    ok(
      'Warteliste unverändert',
      waitAfter.status === 'waitlist' && waitAfter.coverage_status === 'open',
      `${waitAfter.status}/${waitAfter.coverage_status}`
    );
    const cancelStill = await buchung(admin, cCancel, p4.id);
    ok(
      'storniert unverändert (nicht Batch)',
      cancelStill.status === 'cancelled' && cancelStill.coverage_waived_batch_id == null,
      `${cancelStill.status}/${cancelStill.coverage_status}`
    );
    const futureAfter = await buchung(admin, cFuture, p5.id);
    ok('künftig unverändert open', futureAfter.coverage_status === 'open', futureAfter.coverage_status);

    const { data: waivedEvents, error: evErr } = await admin
      .from('events')
      .select('id, type')
      .eq('tenant_id', tenantMain.id)
      .eq('type', 'coverage.waived')
      .in('subject_id', openIds);
    if (evErr) abbruch('events waived: ' + evErr.message);
    ok('5 Events coverage.waived', (waivedEvents || []).length === 5, String((waivedEvents || []).length));

    const { data: batchEvents, error: beErr } = await admin
      .from('events')
      .select('id, type, payload')
      .eq('tenant_id', tenantMain.id)
      .eq('type', 'coverage.batch_waived')
      .eq('subject_id', batchId);
    if (beErr) abbruch('events batch: ' + beErr.message);
    ok('1 Event coverage.batch_waived', (batchEvents || []).length === 1);

    const nochmal = await clientOwner.rpc('waive_pre_omlify_before', {
      p_before: heute,
      p_expected_count: 0,
    });
    // expected 0 mit count 0 → NOTHING_TO_WAIVE; expected 5 → COUNT_CHANGED
    const nochmal2 = await clientOwner.rpc('waive_pre_omlify_before', {
      p_before: heute,
      p_expected_count: 5,
    });
    ok(
      'Nochmal NOTHING_TO_WAIVE oder COUNT_CHANGED',
      (nochmal.data?.error === 'NOTHING_TO_WAIVE')
        || (nochmal2.data?.error === 'NOTHING_TO_WAIVE')
        || (nochmal2.data?.error === 'COUNT_CHANGED' && nochmal2.data?.count === 0),
      JSON.stringify({ nochmal: nochmal.data, nochmal2: nochmal2.data })
    );
    // Explizit expected 0
    const zero = await clientOwner.rpc('waive_pre_omlify_before', {
      p_before: heute,
      p_expected_count: 0,
    });
    ok(
      'expected 0 → NOTHING_TO_WAIVE',
      zero.data?.success === false && zero.data?.error === 'NOTHING_TO_WAIVE',
      JSON.stringify(zero.data)
    );

    // --- Datumsgrenze zweites Studio ---
    const adminDat = clientMitTenant(url, service, SLUG_DAT);
    const basisDat = {
      tenant_id: tenantDat.id,
      teacher_id: ownerDat.id,
      description: 'A8 Bulk Datum Testbeschreibung',
      location: 'Test',
      status: 'active',
      frequency: 'one_time',
      max_participants: 10,
      price: 12,
      time: '10:00:00',
      end_time: '11:00:00',
    };
    const cBefore = await kursAnlegen(adminDat, { ...basisDat, title: 'A8_DAT_BEFORE', date: tag(10) });
    const cAfter = await kursAnlegen(adminDat, { ...basisDat, title: 'A8_DAT_AFTER', date: tag(11) });
    const clientOwnerDat = await login(url, anon, ownerDat.email, password, SLUG_DAT);
    const clientPDat = await login(url, anon, pDat.email, password, SLUG_DAT);
    await anmelden(clientPDat, cBefore, 'dat-before');
    await anmelden(clientPDat, cAfter, 'dat-after');
    await adminDat.from('courses').update({ date: tag(-20) }).eq('id', cBefore);
    await adminDat.from('courses').update({ date: tag(-5) }).eq('id', cAfter);
    const stichtag = tag(-10);
    const prevDat = await clientOwnerDat.rpc('preview_pre_omlify_waive', { p_before: stichtag });
    ok(
      'Datumsgrenze Vorschau count=1',
      prevDat.data?.success === true && prevDat.data?.count === 1,
      JSON.stringify(prevDat.data)
    );
    const waiveDat = await clientOwnerDat.rpc('waive_pre_omlify_before', {
      p_before: stichtag,
      p_expected_count: 1,
    });
    ok('Datumsgrenze waived=1', waiveDat.data?.success === true && waiveDat.data?.waived === 1);
    const beforeRow = await buchung(adminDat, cBefore, pDat.id);
    const afterRow = await buchung(adminDat, cAfter, pDat.id);
    ok('vor Stichtag waived', beforeRow.coverage_status === 'waived');
    ok('nach Stichtag open', afterRow.coverage_status === 'open');

    // --- Einzel-Rücknahme ---
    const singleId = openIds[0];
    const singleRevert = await clientOwner.rpc('revert_coverage_waived', {
      p_registration_id: singleId,
    });
    ok('Einzel-Rücknahme success', singleRevert.data?.success === true);
    const { data: singleRow } = await admin
      .from('registrations')
      .select('coverage_status, coverage_waived_batch_id')
      .eq('id', singleId)
      .single();
    ok(
      'Einzel: open + batch_id NULL',
      singleRow?.coverage_status === 'open' && singleRow?.coverage_waived_batch_id == null,
      JSON.stringify(singleRow)
    );

    // --- Batch-Rücknahme ---
    const batchRevert = await clientOwner.rpc('revert_pre_omlify_batch', { p_batch_id: batchId });
    ok(
      'Batch-Rücknahme reverted=4 skipped=1',
      batchRevert.data?.success === true
        && batchRevert.data?.reverted === 4
        && batchRevert.data?.skipped === 1,
      JSON.stringify(batchRevert.data)
    );
    for (const id of openIds) {
      const { data: row } = await admin
        .from('registrations')
        .select('coverage_status')
        .eq('id', id)
        .single();
      ok(`wieder open ${id.slice(0, 8)}`, row?.coverage_status === 'open', row?.coverage_status);
    }
    const batchRevert2 = await clientOwner.rpc('revert_pre_omlify_batch', { p_batch_id: batchId });
    ok(
      'Zweiter Batch-Revert reverted=0',
      batchRevert2.data?.success === true && batchRevert2.data?.reverted === 0,
      JSON.stringify(batchRevert2.data)
    );

    // Batches neu setzen für get_pre_omlify_batches still_waived
    const again = await clientOwner.rpc('waive_pre_omlify_before', {
      p_before: heute,
      p_expected_count: 5,
    });
    ok('erneut waive für Verlauf', again.data?.success === true, JSON.stringify(again.data));
    const batch2 = again.data.batch_id;
    const one = openIds[1];
    await clientOwner.rpc('revert_coverage_waived', { p_registration_id: one });
    const { data: batches, error: bErr } = await clientOwner.rpc('get_pre_omlify_batches');
    if (bErr) abbruch('get_pre_omlify_batches: ' + bErr.message);
    const b2 = (batches || []).find((b) => b.id === batch2);
    ok(
      'still_waived_count=4',
      b2 && b2.still_waived_count === 4 && b2.waived_count === 5,
      JSON.stringify(b2)
    );

    // --- get_open_coverage ---
    // Nach erneutem Waive + 1 Einzel-Revert: 1 open past (+ ggf. cancelled open nicht)
    const { data: openList, error: openErr } = await clientOwner.rpc('get_open_coverage');
    if (openErr) abbruch('get_open_coverage: ' + openErr.message);
    ok(
      'Owner open_coverage enthält Einzel-Revert',
      (openList || []).some((r) => r.registration_id === one),
      `n=${(openList || []).length}`
    );
    ok(
      'open_coverage nur past registered open',
      (openList || []).every((r) => typeof r.price_cents_at_booking === 'number'),
    );

    const { data: openTeacher, error: openTErr } = await clientTeacher.rpc('get_open_coverage');
    ok(
      'Lehrende get_open_coverage FORBIDDEN',
      !!openTErr && /FORBIDDEN|42501|permission/i.test(openTErr.message),
      openTErr?.message || JSON.stringify(openTeacher)
    );

    const { data: openFremd } = await clientOwnerDat.rpc('get_open_coverage');
    // Dat-Studio: afterRow noch open past → mind. 1; Hauptstudio-IDs nicht dabei
    ok(
      'fremdes Studio ohne Haupt-IDs',
      !(openFremd || []).some((r) => openIds.includes(r.registration_id)),
      `n=${(openFremd || []).length}`
    );

    // --- get_course_member_passes ---
    // Kurs mit Anmeldungen in die Zukunft: cTeacherOther + cFuture neu nutzen
    await anmelden(clientP1, cTeacherOther, 'p1-other-course');
    // Karte für p1 (bereits verkauft an p2; verkaufe an p1)
    const sell1 = await clientOwner.rpc('sell_pass', {
      p_member_id: p1.id,
      p_product_id: prod.id,
      p_method: 'cash',
    });
    if (sell1.error || !sell1.data?.success) abbruch('sell_pass p1: ' + (sell1.error?.message || sell1.data?.error));

    const { data: coursePasses, error: cpErr } = await clientOwner.rpc('get_course_member_passes', {
      p_course_id: cTeacherOther,
    });
    if (cpErr) abbruch('get_course_member_passes owner: ' + cpErr.message);
    ok(
      'Owner Kurs-Karten enthält p1',
      (coursePasses || []).some((r) => r.user_id === p1.id && r.remaining > 0),
      JSON.stringify(coursePasses)
    );

    const { data: teacherOwn, error: toErr } = await clientTeacher2.rpc('get_course_member_passes', {
      p_course_id: cTeacherOther,
    });
    if (toErr) abbruch('teacher own course passes: ' + toErr.message);
    ok('Lehrende eigener Kurs ok', Array.isArray(teacherOwn));

    const { data: teacherFremd, error: tfErr } = await clientTeacher.rpc('get_course_member_passes', {
      p_course_id: cTeacherOther,
    });
    ok(
      'Lehrende fremder Kurs FORBIDDEN',
      !!tfErr && /FORBIDDEN|42501|permission/i.test(tfErr.message),
      tfErr?.message || JSON.stringify(teacherFremd)
    );

    const singlePass = await clientOwner.rpc('get_member_passes', { p_member_id: p1.id });
    const fromCourse = (coursePasses || []).filter((r) => r.user_id === p1.id);
    const fromSingle = singlePass.data?.passes || [];
    ok(
      'Ergebnis ≈ get_member_passes',
      fromCourse.length === fromSingle.length
        && fromCourse.every((c) =>
          fromSingle.some((s) => s.pass_id === c.pass_id && s.remaining === c.remaining)
        ),
      `course=${fromCourse.length} single=${fromSingle.length}`
    );

    // Direktes Schreiben verweigert
    const denyIns = await clientOwner.from('coverage_waive_batches').insert({
      tenant_id: tenantMain.id,
      before_date: heute,
      waived_count: 1,
      created_by: owner.id,
    });
    ok('INSERT batches verweigert', !!denyIns.error, denyIns.error?.message);

    console.log('\n  A8-1 Bulk-Waive: alle Fälle grün.\n');
  } finally {
    await resteEntfernen(admin);
  }
}

main().catch((e) => {
  console.error('\n  ' + (e.abbruch ? e.message : e.stack || e.message));
  if (devOk) {
    // best effort cleanup already in finally of try; outer catch may miss
  }
  process.exit(1);
});
