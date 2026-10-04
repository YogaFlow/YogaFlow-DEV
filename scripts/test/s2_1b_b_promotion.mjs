#!/usr/bin/env node
/**
 * 2.1b-b Teil B1 — Nachrücken E2 + email_deliveries (nur DEV).
 *
 * Nicht ausführen, bevor 20260929150000_s2_1b_b_promotion_e2.sql auf DEV liegt.
 * Gegen PROD nie. Eigenes Studio `s21bbprom`, am Ende delete_tenant_complete
 * und auth.admin.deleteUser. Setzt Plattform-Schalter online_payments am Ende
 * auf den Ausgangswert zurück.
 *
 * Verwendung: node scripts/test/s2_1b_b_promotion.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { legalProfileSetzen, warteBis } from './_helpers.mjs';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 's21bbprom';
const TITLE = 'S21B_B_PROMOTION_TEST';

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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year').value);
  const m = Number(parts.find((p) => p.type === 'month').value);
  const d = Number(parts.find((p) => p.type === 'day').value);
  const utc = Date.UTC(y, m - 1, d + offsetDays);
  const dt = new Date(utc);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Berlin-Datum und -Uhrzeit für „jetzt + offsetMinutes“. */
function berlinInMinutes(offsetMinutes) {
  const target = new Date(Date.now() + offsetMinutes * 60_000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(target);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

/** Frist als Text wie in der Glocke: DD.MM.YYYY und HH:MM (Europe/Berlin). */
function berlinDeadlineText(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    date: `${get('day')}.${get('month')}.${get('year')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

function assertGlockeMitFrist(name, body, holdExpiresAt) {
  const { date, time } = berlinDeadlineText(holdExpiresAt);
  ok(
    `${name} Glocke enthält Frist-Datum`,
    typeof body === 'string' && body.includes(date),
    `body=${body} date=${date}`
  );
  ok(
    `${name} Glocke enthält Frist-Uhrzeit`,
    typeof body === 'string' && body.includes(time),
    `body=${body} time=${time}`
  );
  ok(
    `${name} Glocke Formulierung`,
    typeof body === 'string' &&
      /reserviert/i.test(body) &&
      /bezahlt?e bis dahin online/i.test(body),
    body
  );
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

async function plattform(admin, enabled) {
  const { data, error } = await admin.rpc('set_platform_flag', {
    p_key: 'online_payments',
    p_enabled: enabled,
  });
  if (error || !data?.success) {
    abbruch('set_platform_flag ' + enabled + ': ' + (error?.message || JSON.stringify(data)));
  }
  return data;
}

async function plattformStand(admin) {
  const { data, error } = await admin
    .from('platform_flags')
    .select('enabled')
    .eq('key', 'online_payments')
    .single();
  if (error) abbruch('platform_flags lesen: ' + error.message);
  return Boolean(data.enabled);
}

async function onlinePflichtAn(admin, ownerClient, tenantId) {
  await plattform(admin, true);
  {
    const { data: up, error } = await admin.rpc('upsert_provider_account', {
      p_tenant: tenantId,
      p_provider: 'stripe',
      p_ref: `acct_s21bb_${tenantId.replace(/-/g, '').slice(0, 16)}`,
      p_status: 'active',
      p_charges: true,
      p_payouts: true,
      p_details: true,
      p_livemode: false,
      p_capabilities: { card: 'active' },
    });
    if (error) abbruch('upsert_provider_account: ' + error.message);
    if (!up?.success) abbruch('upsert_provider_account: ' + JSON.stringify(up));
  }
  {
    const { data, error } = await ownerClient.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    if (error) abbruch('set_tax_setting: ' + error.message);
    if (!data?.success) abbruch('set_tax_setting: ' + JSON.stringify(data));
  }
  {
    await legalProfileSetzen(ownerClient);
    const { data, error } = await ownerClient.rpc('set_online_payments_enabled', { p_enabled: true });
    if (error) abbruch('set_online_payments_enabled: ' + error.message);
    if (!data?.success) abbruch('set_online_payments_enabled: ' + JSON.stringify(data));
  }
  {
    const { data, error } = await ownerClient.rpc('set_allow_onsite_payment', { p_allow: false });
    if (error) abbruch('set_allow_onsite_payment: ' + error.message);
    if (!data?.success) abbruch('set_allow_onsite_payment: ' + JSON.stringify(data));
  }
  const { data: req } = await admin.rpc('online_payment_required', { p_tenant: tenantId });
  ok('online_payment_required an', req === true);
}

async function onlinePflichtAus(ownerClient) {
  const { data, error } = await ownerClient.rpc('set_allow_onsite_payment', { p_allow: true });
  if (error) abbruch('set_allow_onsite_payment true: ' + error.message);
  if (!data?.success) abbruch('set_allow_onsite_payment true: ' + JSON.stringify(data));
}

async function kursAnlegen(admin, { tenantId, teacherId, title, date, time, price, max = 1 }) {
  const [hh, mm, ss] = (time || '10:00:00').split(':').map(Number);
  const endMin = hh * 60 + mm + 60;
  const endH = String(Math.floor(endMin / 60) % 24).padStart(2, '0');
  const endM = String(endMin % 60).padStart(2, '0');
  const { data, error } = await admin
    .from('courses')
    .insert({
      tenant_id: tenantId,
      title: title || TITLE,
      description: 'S21b-b Promotion Test',
      date,
      time: time || '10:00:00',
      end_time: `${endH}:${endM}:${String(ss || 0).padStart(2, '0')}`,
      location: 'Studio',
      max_participants: max,
      price,
      teacher_id: teacherId,
      status: 'active',
    })
    .select('id, date, time, price')
    .single();
  if (error) abbruch('Kurs anlegen: ' + error.message);
  return data;
}

async function regRow(admin, courseId, userId, { cancelled = false } = {}) {
  let q = admin
    .from('registrations')
    .select(
      'id, status, is_waitlist, waitlist_position, coverage_status, coverage_intent, hold_expires_at, hold_reason, cancel_reason, pass_id'
    )
    .eq('course_id', courseId)
    .eq('user_id', userId);
  if (cancelled) q = q.not('cancellation_timestamp', 'is', null);
  else q = q.is('cancellation_timestamp', null);
  const { data, error } = await q.maybeSingle();
  if (error) abbruch('regRow: ' + error.message);
  return data;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
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
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin);

    console.log('2.1b-b B1 promotion E2');

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'S21b-b Promotion', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio anlegen: ' + te.message);
    const tenantId = tenant.id;

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Prom',
      rolle: 'owner',
      tenantId,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Lehrer',
      nachname: 'Prom',
      rolle: 'teacher',
      tenantId,
      password,
    });
    const a = await nutzerAnlegen(admin, {
      email: SLUG + '.a@example.com',
      vorname: 'Anna',
      nachname: 'A',
      rolle: 'user',
      tenantId,
      password,
    });
    const b = await nutzerAnlegen(admin, {
      email: SLUG + '.b@example.com',
      vorname: 'Berta',
      nachname: 'B',
      rolle: 'user',
      tenantId,
      password,
    });
    const c = await nutzerAnlegen(admin, {
      email: SLUG + '.c@example.com',
      vorname: 'Carla',
      nachname: 'C',
      rolle: 'user',
      tenantId,
      password,
    });

    const ownerClient = await login(url, anon, owner.email, password);
    const aClient = await login(url, anon, a.email, password);
    const bClient = await login(url, anon, b.email, password);
    const cClient = await login(url, anon, c.email, password);

    // ── Fall 1: Online nicht Pflicht → registered + open ─────────────────
    console.log('\n1) Online nicht Pflicht → registered + open');
    await plattform(admin, false);
    {
      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F1',
        date: berlinDate(3),
        time: '10:00:00',
        price: 15,
      });
      const rA = await aClient.rpc('register_for_course', { p_course_id: kurs.id });
      if (rA.error || !rA.data?.success) abbruch('F1 A: ' + (rA.error?.message || JSON.stringify(rA.data)));
      const rB = await bClient.rpc('register_for_course', { p_course_id: kurs.id });
      ok('F1 B Warteliste', rB.data?.success === true && rB.data?.is_waitlist === true);
      const un = await aClient.rpc('unregister_from_course', { p_course_id: kurs.id });
      if (un.error || !un.data?.success) abbruch('F1 A ab: ' + (un.error?.message || JSON.stringify(un.data)));
      const rowB = await regRow(admin, kurs.id, b.id);
      ok(
        'F1 B registered open',
        rowB?.status === 'registered' && rowB?.coverage_status === 'open' && !rowB?.hold_reason,
        JSON.stringify(rowB)
      );
      const { data: deliv } = await admin
        .from('email_deliveries')
        .select('id')
        .eq('registration_id', rowB.id);
      ok('F1 keine Outbox', (deliv?.length ?? 0) === 0);
    }

    // Online-Pflicht für übrige Fälle
    await onlinePflichtAn(admin, ownerClient, tenantId);

    // ── Fall 2: Online Pflicht, Kurs in 3 Tagen → pending + 12h ───────────
    console.log('\n2) Online Pflicht, 3 Tage → pending_payment + 12h');
    let f2RegId = null;
    let f2EventId = null;
    {
      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F2',
        date: berlinDate(3),
        time: '10:00:00',
        price: 15,
      });
      await aClient.rpc('register_for_course', { p_course_id: kurs.id });
      await bClient.rpc('register_for_course', { p_course_id: kurs.id });
      const before = Date.now();
      await aClient.rpc('unregister_from_course', { p_course_id: kurs.id });
      const after = Date.now();
      const rowB = await regRow(admin, kurs.id, b.id);
      ok(
        'F2 B pending_payment promotion',
        rowB?.status === 'pending_payment' &&
          rowB?.hold_reason === 'promotion' &&
          rowB?.coverage_status === 'open',
        JSON.stringify(rowB)
      );
      f2RegId = rowB.id;
      const holdMs = new Date(rowB.hold_expires_at).getTime();
      const expectedLo = before + 12 * 3600_000 - 60_000;
      const expectedHi = after + 12 * 3600_000 + 60_000;
      ok(
        'F2 Frist ≈ jetzt + 12h (±1 Min.)',
        holdMs >= expectedLo && holdMs <= expectedHi,
        `hold=${rowB.hold_expires_at}`
      );

      const { data: glocken } = await admin
        .from('user_notifications')
        .select('type, body, metadata, action_path')
        .eq('user_id', b.id)
        .eq('course_id', kurs.id)
        .eq('type', 'waitlist_promoted_payment_required');
      ok('F2 Glocke neuer Typ', (glocken?.length ?? 0) === 1);
      ok(
        'F2 Glocke Frist im Payload',
        !!glocken?.[0]?.metadata?.hold_expires_at,
        JSON.stringify(glocken?.[0]?.metadata)
      );
      ok('F2 action_path Meine Anmeldungen', glocken?.[0]?.action_path === '/my-registrations');
      assertGlockeMitFrist('F2', glocken?.[0]?.body, rowB.hold_expires_at);

      const { data: ev } = await admin
        .from('events')
        .select('id, type, payload')
        .eq('type', 'registration.pending_payment')
        .eq('subject_id', rowB.id);
      ok('F2 Event', (ev?.length ?? 0) === 1 && ev[0].payload?.hold_reason === 'promotion');
      f2EventId = ev[0].id;

      const { data: deliv } = await admin
        .from('email_deliveries')
        .select('id, status, event_id, kind, registration_id')
        .eq('registration_id', rowB.id);
      ok(
        'F2 genau eine Outbox pending',
        deliv?.length === 1 &&
          deliv[0].status === 'pending' &&
          deliv[0].event_id === f2EventId &&
          deliv[0].kind === 'waitlist_promoted_payment_required',
        JSON.stringify(deliv)
      );
    }

    // ── Fall 3: Kurs in 5 Stunden → Frist = Beginn − 2h ───────────────────
    console.log('\n3) Kurs in 5 Stunden → Frist = Beginn − 2h');
    {
      const start = berlinInMinutes(5 * 60);
      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F3',
        date: start.date,
        time: start.time,
        price: 15,
      });
      // Frische Nutzer für Warteliste — A/B können noch F2-pending haben
      const a3 = await nutzerAnlegen(admin, {
        email: SLUG + '.a3@example.com',
        vorname: 'A3',
        nachname: 'A',
        rolle: 'user',
        tenantId,
        password,
      });
      const b3 = await nutzerAnlegen(admin, {
        email: SLUG + '.b3@example.com',
        vorname: 'B3',
        nachname: 'B',
        rolle: 'user',
        tenantId,
        password,
      });
      const a3c = await login(url, anon, a3.email, password);
      const b3c = await login(url, anon, b3.email, password);
      await a3c.rpc('register_for_course', { p_course_id: kurs.id });
      await b3c.rpc('register_for_course', { p_course_id: kurs.id });
      await a3c.rpc('unregister_from_course', { p_course_id: kurs.id });
      const rowB = await regRow(admin, kurs.id, b3.id);
      ok('F3 pending', rowB?.status === 'pending_payment' && rowB?.hold_reason === 'promotion');

      // Erwartete Frist: Kursbeginn − 2h (Europe/Berlin)
      const startParts = berlinInMinutes(5 * 60);
      // Neu berechnen aus Kurs-Zeile
      const [yy, mm, dd] = kurs.date.split('-').map(Number);
      const [hh, mi, ss] = String(kurs.time).split(':').map(Number);
      // Kursbeginn als Berlin wall-clock → UTC via Date mit Offset-Schätzung:
      // Wir vergleichen hold mit (start − 2h) über Berlin-Teile.
      const holdParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(rowB.hold_expires_at));
      const g = (t) => holdParts.find((p) => p.type === t)?.value;
      const holdDate = `${g('year')}-${g('month')}-${g('day')}`;
      const holdTime = `${g('hour')}:${g('minute')}`;

      const startMin = hh * 60 + mi - 120;
      let dayOff = 0;
      let rem = startMin;
      if (rem < 0) {
        rem += 24 * 60;
        dayOff = -1;
      }
      const expH = String(Math.floor(rem / 60)).padStart(2, '0');
      const expM = String(rem % 60).padStart(2, '0');
      const base = new Date(Date.UTC(yy, mm - 1, dd + dayOff));
      const expDate = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
      ok(
        'F3 Frist = Kursbeginn − 2h',
        holdDate === expDate && holdTime === `${expH}:${expM}`,
        `hold=${holdDate} ${holdTime} expected=${expDate} ${expH}:${expM}`
      );
      void startParts;
      void ss;
    }

    // ── Fall 4: Kurs in 90 Min. → niemand rückt nach ─────────────────────
    console.log('\n4) Kurs in 90 Min. → promotion_skipped');
    {
      const start = berlinInMinutes(90);
      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F4',
        date: start.date,
        time: start.time,
        price: 15,
      });
      const a4 = await nutzerAnlegen(admin, {
        email: SLUG + '.a4@example.com',
        vorname: 'A4',
        nachname: 'A',
        rolle: 'user',
        tenantId,
        password,
      });
      const b4 = await nutzerAnlegen(admin, {
        email: SLUG + '.b4@example.com',
        vorname: 'B4',
        nachname: 'B',
        rolle: 'user',
        tenantId,
        password,
      });
      const a4c = await login(url, anon, a4.email, password);
      const b4c = await login(url, anon, b4.email, password);
      await a4c.rpc('register_for_course', { p_course_id: kurs.id });
      await b4c.rpc('register_for_course', { p_course_id: kurs.id });
      const beforeB = await regRow(admin, kurs.id, b4.id);
      ok('F4 B Warteliste vorher', beforeB?.status === 'waitlist' && beforeB?.waitlist_position === 1);
      await a4c.rpc('unregister_from_course', { p_course_id: kurs.id });
      const afterB = await regRow(admin, kurs.id, b4.id);
      ok(
        'F4 Warteliste unverändert',
        afterB?.status === 'waitlist' &&
          afterB?.is_waitlist === true &&
          afterB?.waitlist_position === 1,
        JSON.stringify(afterB)
      );
      const { data: skipped } = await admin
        .from('events')
        .select('type, payload')
        .eq('type', 'waitlist.promotion_skipped')
        .eq('subject_id', kurs.id);
      ok(
        'F4 Event TOO_CLOSE_TO_START',
        skipped?.length === 1 && skipped[0].payload?.reason_code === 'TOO_CLOSE_TO_START',
        JSON.stringify(skipped)
      );
      const { data: deliv } = await admin
        .from('email_deliveries')
        .select('id')
        .eq('registration_id', afterB.id);
      ok('F4 keine Outbox', (deliv?.length ?? 0) === 0);
    }

    // ── Fall 5: Karte + Zustimmung → registered + pass, keine Outbox ─────
    console.log('\n5) Online Pflicht + Karte → registered + pass');
    {
      const { data: prod, error: pe } = await ownerClient.rpc('create_pass_product', {
        p_name: '10er B1',
        p_units: 10,
        p_price_cents: 15000,
        p_validity_rule: 'years_to_year_end',
        p_validity_value: 3,
      });
      if (pe || !prod?.success) abbruch('create_pass_product: ' + (pe?.message || JSON.stringify(prod)));
      const { data: sold, error: se } = await ownerClient.rpc('sell_pass', {
        p_member_id: b.id,
        p_product_id: prod.id,
        p_method: 'cash',
      });
      if (se || !sold?.success) abbruch('sell_pass: ' + (se?.message || JSON.stringify(sold)));

      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F5',
        date: berlinDate(4),
        time: '11:00:00',
        price: 15,
      });
      // A belegt, B mit Intent auf Warteliste (B hat noch F2 pending — anderer Kurs ok)
      const a5 = await nutzerAnlegen(admin, {
        email: SLUG + '.a5@example.com',
        vorname: 'A5',
        nachname: 'A',
        rolle: 'user',
        tenantId,
        password,
      });
      const a5c = await login(url, anon, a5.email, password);
      await a5c.rpc('register_for_course', { p_course_id: kurs.id });
      const rB = await bClient.rpc('register_for_course', {
        p_course_id: kurs.id,
        p_use_pass: true,
      });
      ok('F5 B Warteliste intent', rB.data?.success === true && rB.data?.is_waitlist === true);
      const wl = await regRow(admin, kurs.id, b.id);
      ok('F5 coverage_intent pass', wl?.coverage_intent === 'pass');
      await a5c.rpc('unregister_from_course', { p_course_id: kurs.id });
      const rowB = await regRow(admin, kurs.id, b.id);
      ok(
        'F5 registered + pass',
        rowB?.status === 'registered' &&
          rowB?.coverage_status === 'pass' &&
          rowB?.pass_id === sold.pass_id,
        JSON.stringify(rowB)
      );
      const { data: deliv } = await admin
        .from('email_deliveries')
        .select('id')
        .eq('registration_id', rowB.id);
      ok('F5 keine Outbox', (deliv?.length ?? 0) === 0);
      const { data: glocken } = await admin
        .from('user_notifications')
        .select('type')
        .eq('user_id', b.id)
        .eq('course_id', kurs.id)
        .eq('type', 'waitlist_promoted');
      ok('F5 Glocke wie bisher', (glocken?.length ?? 0) >= 1);
    }

    // ── Fall 5b: Karten-Intent, Einlösen scheitert → pending + Fristtext ─
    console.log('\n5b) Online Pflicht + Karte ohne Gültigkeit → pending + Fristtext');
    {
      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F5b',
        date: berlinDate(4),
        time: '16:00:00',
        price: 15,
      });
      const a5b = await nutzerAnlegen(admin, {
        email: SLUG + '.a5b@example.com',
        vorname: 'A5b',
        nachname: 'A',
        rolle: 'user',
        tenantId,
        password,
      });
      const b5b = await nutzerAnlegen(admin, {
        email: SLUG + '.b5b@example.com',
        vorname: 'B5b',
        nachname: 'B',
        rolle: 'user',
        tenantId,
        password,
      });
      const a5bc = await login(url, anon, a5b.email, password);
      const b5bc = await login(url, anon, b5b.email, password);
      await a5bc.rpc('register_for_course', { p_course_id: kurs.id });
      // Intent pass, aber keine Karte → Einlösen scheitert → pending_payment
      const rB = await b5bc.rpc('register_for_course', {
        p_course_id: kurs.id,
        p_use_pass: true,
      });
      ok('F5b B Warteliste intent', rB.data?.success === true && rB.data?.is_waitlist === true);
      const wl = await regRow(admin, kurs.id, b5b.id);
      ok('F5b coverage_intent pass', wl?.coverage_intent === 'pass');
      await a5bc.rpc('unregister_from_course', { p_course_id: kurs.id });
      const rowB = await regRow(admin, kurs.id, b5b.id);
      ok(
        'F5b pending_payment nach Karten-Fail',
        rowB?.status === 'pending_payment' &&
          rowB?.hold_reason === 'promotion' &&
          rowB?.coverage_status === 'open',
        JSON.stringify(rowB)
      );
      const { data: glocken } = await admin
        .from('user_notifications')
        .select('type, body')
        .eq('user_id', b5b.id)
        .eq('course_id', kurs.id)
        .eq('type', 'waitlist_promoted_payment_required');
      ok('F5b Glocke payment_required', (glocken?.length ?? 0) === 1);
      assertGlockeMitFrist('F5b', glocken?.[0]?.body, rowB.hold_expires_at);
      const { data: deliv } = await admin
        .from('email_deliveries')
        .select('id, status')
        .eq('registration_id', rowB.id);
      ok('F5b Outbox pending', deliv?.length === 1 && deliv[0].status === 'pending');
    }

    // ── Fall 6: Kette — B läuft ab → C pending ───────────────────────────
    console.log('\n6) Kette: promotion_expired → C pending');
    {
      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F6',
        date: berlinDate(5),
        time: '12:00:00',
        price: 15,
      });
      const holdIn3s = new Date(Date.now() + 3000).toISOString();
      // Reservierung wie 2.1b-a mit kurzer Frist (RPC), C auf Warteliste
      const { data: bRegId, error: bpe } = await admin.rpc('create_pending_registration', {
        p_course: kurs.id,
        p_user: b.id,
        p_hold_reason: 'promotion',
        p_hold_expires_at: holdIn3s,
      });
      if (bpe) abbruch('F6 create_pending: ' + bpe.message);
      const rC = await cClient.rpc('register_for_course', { p_course_id: kurs.id });
      ok('F6 C Warteliste', rC.data?.success === true && rC.data?.is_waitlist === true);

      // PC-/DB-Uhr können abweichen → warteBis statt fester Deadline.
      await warteBis(
        async () => {
          const rowB = await regRow(admin, kurs.id, b.id, { cancelled: true });
          return rowB?.status === 'cancelled' && rowB?.cancel_reason === 'promotion_expired';
        },
        { admin, maxMs: 70_000, schrittMs: 2_000, label: 'F6 promotion expire' },
      );
      const rowB = await regRow(admin, kurs.id, b.id, { cancelled: true });
      ok(
        'F6 B promotion_expired',
        rowB?.status === 'cancelled' && rowB?.cancel_reason === 'promotion_expired',
        JSON.stringify(rowB)
      );
      void bRegId;
      const rowC = await regRow(admin, kurs.id, c.id);
      ok(
        'F6 C pending_payment',
        rowC?.status === 'pending_payment' && rowC?.hold_reason === 'promotion',
        JSON.stringify(rowC)
      );
      const { data: deliv } = await admin
        .from('email_deliveries')
        .select('id, status')
        .eq('registration_id', rowC.id);
      ok('F6 Outbox für C', deliv?.length === 1 && deliv[0].status === 'pending');
    }

    // ── Fall 7: B meldet sich während pending ab → C rückt nach ───────────
    console.log('\n7) B gibt pending frei → C rückt nach');
    {
      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F7',
        date: berlinDate(6),
        time: '13:00:00',
        price: 15,
      });
      const a7 = await nutzerAnlegen(admin, {
        email: SLUG + '.a7@example.com',
        vorname: 'A7',
        nachname: 'A',
        rolle: 'user',
        tenantId,
        password,
      });
      const b7 = await nutzerAnlegen(admin, {
        email: SLUG + '.b7@example.com',
        vorname: 'B7',
        nachname: 'B',
        rolle: 'user',
        tenantId,
        password,
      });
      const c7 = await nutzerAnlegen(admin, {
        email: SLUG + '.c7@example.com',
        vorname: 'C7',
        nachname: 'C',
        rolle: 'user',
        tenantId,
        password,
      });
      const a7c = await login(url, anon, a7.email, password);
      const b7c = await login(url, anon, b7.email, password);
      const c7c = await login(url, anon, c7.email, password);
      await a7c.rpc('register_for_course', { p_course_id: kurs.id });
      await b7c.rpc('register_for_course', { p_course_id: kurs.id });
      await c7c.rpc('register_for_course', { p_course_id: kurs.id });
      await a7c.rpc('unregister_from_course', { p_course_id: kurs.id });
      const bPending = await regRow(admin, kurs.id, b7.id);
      ok('F7 B pending', bPending?.status === 'pending_payment');
      await b7c.rpc('unregister_from_course', { p_course_id: kurs.id });
      const rowC = await regRow(admin, kurs.id, c7.id);
      ok(
        'F7 C pending nach Abmeldung B',
        rowC?.status === 'pending_payment' && rowC?.hold_reason === 'promotion',
        JSON.stringify(rowC)
      );
    }

    // ── Fall 8: Kostenloser Kurs mit Online-Pflicht → registered ──────────
    console.log('\n8) Kostenlos + Online-Pflicht → registered');
    {
      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F8',
        date: berlinDate(7),
        time: '14:00:00',
        price: 0,
      });
      const a8 = await nutzerAnlegen(admin, {
        email: SLUG + '.a8@example.com',
        vorname: 'A8',
        nachname: 'A',
        rolle: 'user',
        tenantId,
        password,
      });
      const b8 = await nutzerAnlegen(admin, {
        email: SLUG + '.b8@example.com',
        vorname: 'B8',
        nachname: 'B',
        rolle: 'user',
        tenantId,
        password,
      });
      const a8c = await login(url, anon, a8.email, password);
      const b8c = await login(url, anon, b8.email, password);
      await a8c.rpc('register_for_course', { p_course_id: kurs.id });
      await b8c.rpc('register_for_course', { p_course_id: kurs.id });
      await a8c.rpc('unregister_from_course', { p_course_id: kurs.id });
      const rowB = await regRow(admin, kurs.id, b8.id);
      ok(
        'F8 registered (nicht pending)',
        rowB?.status === 'registered' && !rowB?.hold_reason,
        JSON.stringify(rowB)
      );
      const { data: deliv } = await admin
        .from('email_deliveries')
        .select('id')
        .eq('registration_id', rowB.id);
      ok('F8 keine Outbox', (deliv?.length ?? 0) === 0);
    }

    // ── claim parallel + mark Retry ───────────────────────────────────────
    console.log('\n9) claim_email_deliveries parallel / mark Retry');
    {
      // Zwei pending-Zeilen: F2 + ggf. weitere; wir legen zwei frische an
      const kurs = await kursAnlegen(admin, {
        tenantId,
        teacherId: teacher.id,
        title: TITLE + ' F9',
        date: berlinDate(8),
        time: '15:00:00',
        price: 15,
        max: 2,
      });
      const u1 = await nutzerAnlegen(admin, {
        email: SLUG + '.u1@example.com',
        vorname: 'U1',
        nachname: 'U',
        rolle: 'user',
        tenantId,
        password,
      });
      const u2 = await nutzerAnlegen(admin, {
        email: SLUG + '.u2@example.com',
        vorname: 'U2',
        nachname: 'U',
        rolle: 'user',
        tenantId,
        password,
      });
      const holdFuture = new Date(Date.now() + 3600_000).toISOString();
      const { data: r1, error: e1 } = await admin.rpc('create_pending_registration', {
        p_course: kurs.id,
        p_user: u1.id,
        p_hold_reason: 'promotion',
        p_hold_expires_at: holdFuture,
      });
      if (e1) abbruch('F9 r1: ' + e1.message);
      const { data: r2, error: e2 } = await admin.rpc('create_pending_registration', {
        p_course: kurs.id,
        p_user: u2.id,
        p_hold_reason: 'promotion',
        p_hold_expires_at: holdFuture,
      });
      if (e2) abbruch('F9 r2: ' + e2.message);

      // Outbox entsteht nur in promote — für claim-Test manuell via service insert? Spec:
      // Testdaten nur über RPCs. create_pending erzeugt Event, aber keine Outbox.
      // Wir nutzen die F2-Zeile + eine zweite aus F6/F7.
      // Stattdessen: zwei Zeilen aus bestehenden pending Outbox + ggf. F2.
      void r1;
      void r2;

      const { data: pendingRows } = await admin
        .from('email_deliveries')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'pending');
      ok('F9 mindestens 2 pending Outbox', (pendingRows?.length ?? 0) >= 2, String(pendingRows?.length));

      const admin2 = clientMitTenant(url, service, SLUG);
      const [c1, c2] = await Promise.all([
        admin.rpc('claim_email_deliveries', { p_limit: 10 }),
        admin2.rpc('claim_email_deliveries', { p_limit: 10 }),
      ]);
      if (c1.error) abbruch('claim1: ' + c1.error.message);
      if (c2.error) abbruch('claim2: ' + c2.error.message);

      const splitOwn = (rows) => {
        const all = rows || [];
        return {
          own: all.filter((r) => r.tenant_id === tenantId),
          foreign: all.filter((r) => r.tenant_id !== tenantId),
        };
      };
      const s1 = splitOwn(c1.data);
      const s2 = splitOwn(c2.data);
      let foreignReturned = 0;
      for (const r of [...s1.foreign, ...s2.foreign]) {
        const put = await admin.rpc('mark_email_delivery', {
          p_id: r.id,
          p_status: 'released',
        });
        if (put.error) abbruch('Fremd-Claim zurück: ' + put.error.message);
        foreignReturned += 1;
      }
      if (foreignReturned > 0) {
        console.log(`  Fremde Claims zurückgegeben (released, ohne Zählung): ${foreignReturned}`);
      }

      const ids1 = s1.own.map((r) => r.id);
      const ids2 = s2.own.map((r) => r.id);
      const overlap = ids1.filter((id) => ids2.includes(id));
      ok('F9 paralleles claim ohne Doppel (eigene)', overlap.length === 0, JSON.stringify({ ids1, ids2 }));
      // Cron darf eigene Zeilen mitnehmen — nicht verlangen, dass der Test alle bekommt.
      ok(
        'F9 mindestens eine eigene Claim-Zeile für Probe',
        ids1.length + ids2.length >= 1,
        JSON.stringify({ ids1, ids2 })
      );

      const probeId = ids1[0] || ids2[0];
      ok('F9 Probe-ID', !!probeId);
      const { data: beforeRelease } = await admin
        .from('email_deliveries')
        .select('attempts')
        .eq('id', probeId)
        .single();
      const { error: relErr } = await admin.rpc('mark_email_delivery', {
        p_id: probeId,
        p_status: 'released',
      });
      if (relErr) abbruch('released: ' + relErr.message);
      const { data: released } = await admin
        .from('email_deliveries')
        .select('status, attempts, locked_until')
        .eq('id', probeId)
        .single();
      ok(
        'F9 released: pending, attempts unverändert',
        released?.status === 'pending' &&
          released?.attempts === beforeRelease?.attempts &&
          released?.locked_until == null,
        JSON.stringify(released)
      );
      const { error: relTwice } = await admin.rpc('mark_email_delivery', {
        p_id: probeId,
        p_status: 'released',
      });
      ok('F9 released nur aus sending', relTwice?.message === 'NOT_SENDING', relTwice?.message);
      const beforeMark = Date.now();
      const { error: mErr } = await admin.rpc('mark_email_delivery', {
        p_id: probeId,
        p_status: 'failed',
        p_error_code: 'SMTP_ERROR',
      });
      if (mErr) abbruch('mark failed: ' + mErr.message);
      const { data: marked } = await admin
        .from('email_deliveries')
        .select('status, attempts, next_attempt_at, last_error_code')
        .eq('id', probeId)
        .single();
      ok(
        'F9 nach Fehler attempts=1 pending',
        marked?.status === 'pending' &&
          marked?.attempts === 1 &&
          marked?.last_error_code === 'SMTP_ERROR',
        JSON.stringify(marked)
      );
      const nextAt = new Date(marked.next_attempt_at).getTime();
      ok(
        'F9 next_attempt_at in der Zukunft (~1 Min.)',
        nextAt > beforeMark + 30_000 && nextAt < beforeMark + 120_000,
        marked.next_attempt_at
      );

      // Vier weitere Fehlversuche → failed
      for (let i = 0; i < 4; i++) {
        // next_attempt_at in Vergangenheit setzen: kein RPC — direkter Schreibzugriff
        // als gekennzeichneter Test-Fixture-Schritt, damit claim/mark greifen.
        const { error: upErr } = await admin
          .from('email_deliveries')
          .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
          .eq('id', probeId);
        if (upErr) {
          // RLS: service_role bypassed; wenn Guard UPDATE blockt → STOPP melden
          abbruch(
            'NEGATIV/FIXTURE: next_attempt_at setzen fehlgeschlagen (für Retry-Test nötig): ' +
              upErr.message
          );
        }
        const { data: claimed } = await admin.rpc('claim_email_deliveries', { p_limit: 50 });
        for (const r of (claimed || []).filter((row) => row.id !== probeId)) {
          const put = await admin.rpc('mark_email_delivery', { p_id: r.id, p_status: 'released' });
          if (put.error) abbruch('Claim zurück: ' + put.error.message);
        }
        const { error } = await admin.rpc('mark_email_delivery', {
          p_id: probeId,
          p_status: 'failed',
          p_error_code: 'SMTP_ERROR',
        });
        if (error) abbruch('mark retry ' + i + ': ' + error.message);
      }
      const { data: final } = await admin
        .from('email_deliveries')
        .select('status, attempts')
        .eq('id', probeId)
        .single();
      ok(
        'F9 nach 5 Fehlversuchen failed',
        final?.status === 'failed' && final?.attempts === 5,
        JSON.stringify(final)
      );
    }

    // ── authenticated darf weder lesen noch RPCs ─────────────────────────
    console.log('\n10) authenticated gesperrt');
    {
      const { data: rows, error } = await ownerClient.from('email_deliveries').select('id');
      ok(
        'authenticated SELECT leer/Fehler',
        (rows?.length ?? 0) === 0,
        error ? error.message : String(rows?.length)
      );
      const claim = await ownerClient.rpc('claim_email_deliveries', { p_limit: 1 });
      ok('authenticated claim verweigert', !!claim.error, claim.error?.message);
      const mark = await ownerClient.rpc('mark_email_delivery', {
        p_id: f2RegId,
        p_status: 'sent',
        p_error_code: null,
      });
      ok('authenticated mark verweigert', !!mark.error, mark.error?.message);
      void f2EventId;
    }

    // Vor-Ort wieder an (Aufräumen)
    await onlinePflichtAus(ownerClient);

    console.log('\nALLE TESTS GRÜN');
  } finally {
    if (devOk) {
      try {
        await plattform(admin, platformWas);
      } catch (e) {
        console.error('Plattform-Schalter zurücksetzen fehlgeschlagen:', e?.message || e);
      }
      try {
        await resteEntfernen(admin);
      } catch (e) {
        console.error('Aufräumen fehlgeschlagen:', e?.message || e);
      }
    }
  }
}

main().catch((err) => {
  console.error('\n' + (err?.abbruch ? err.message : err?.message || err));
  process.exit(1);
});
