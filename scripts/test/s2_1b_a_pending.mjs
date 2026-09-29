#!/usr/bin/env node
/**
 * 2.1b-a — pending_payment, payment_attempts, Expire-Job (nur DEV).
 *
 * Nicht ausführen, bevor 20260929140000 + 20260929140001 auf DEV liegen.
 * Gegen PROD nie. Eigenes Studio `s21bapend`, am Ende delete_tenant_complete
 * und auth.admin.deleteUser. Setzt Plattform-Schalter online_payments am Ende
 * auf den Ausgangswert zurück.
 *
 * Verwendung: node scripts/test/s2_1b_a_pending.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 's21bapend';
const TITLE = 'S21B_A_PENDING_TEST';

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
  for (const slug of [SLUG, SLUG + 'x']) {
    const { data: tenants, error } = await admin.from('tenants').select('id').eq('slug', slug);
    if (error) abbruch('Studio lesen (' + slug + '): ' + error.message);
    for (const t of tenants || []) {
      const { error: e } = await admin.rpc('delete_tenant_complete', { p_tenant_id: t.id });
      if (e) abbruch('Studio löschen (' + slug + '): ' + e.message);
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

    console.log('2.1b-a pending_payment');

    // Studio + Owner
    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'S21b-a Pending', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio anlegen: ' + te.message);
    const tenantId = tenant.id;

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com',
    vorname: 'Owner',
    nachname: 'Pend',
    rolle: 'owner',
    tenantId,
    password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com',
    vorname: 'Lehrer',
    nachname: 'Pend',
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
    vorname: 'Ben',
    nachname: 'B',
    rolle: 'user',
    tenantId,
    password,
  });
  const c = await nutzerAnlegen(admin, {
    email: SLUG + '.c@example.com',
    vorname: 'Cara',
    nachname: 'C',
    rolle: 'user',
    tenantId,
    password,
  });
  // zweites Studio für fremden Owner-Test
  const { data: tenant2, error: t2e } = await admin
    .from('tenants')
    .insert({ name: 'S21b-a Fremd', slug: SLUG + 'x' })
    .select('id')
    .single();
  if (t2e) abbruch('Studio anlegen (fremd): ' + t2e.message);
  const fremd = await nutzerAnlegen(admin, {
    email: SLUG + '.fremd@example.com',
    vorname: 'Fremd',
    nachname: 'Owner',
    rolle: 'owner',
    tenantId: tenant2.id,
    password,
  });

  const ownerClient = await login(url, anon, owner.email, password);
  const teacherClient = await login(url, anon, teacher.email, password);
  const aClient = await login(url, anon, a.email, password);
  const bClient = await login(url, anon, b.email, password);
  const cClient = await login(url, anon, c.email, password);
  const fremdClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('x-omlify-tenant', SLUG + 'x');
        return fetch(input, { ...init, headers });
      },
    },
  });
  {
    const { error } = await fremdClient.auth.signInWithPassword({
      email: fremd.email,
      password,
    });
    if (error) abbruch('Login fremd: ' + error.message);
  }

  const kursDatum = berlinDate(7);
  const kursZeit = '10:00:00';
  const { data: course, error: ce } = await admin
    .from('courses')
    .insert({
      tenant_id: tenant.id,
      title: TITLE,
      description: 'S21b-a Pending Testkurs',
      date: kursDatum,
      time: kursZeit,
      end_time: '11:00:00',
      location: 'Studio',
      max_participants: 2,
      price: 15,
      teacher_id: teacher.id,
      status: 'active',
      frequency: 'one_time',
      pass_eligible: true,
    })
    .select('id')
    .single();
  if (ce) abbruch('Kurs: ' + ce.message);
  const courseId = course.id;

  // A registered
  {
    const { data, error } = await aClient.rpc('register_for_course', {
      p_course_id: courseId,
    });
    if (error) abbruch('A register: ' + error.message);
    ok('A registered', data?.success === true && data?.is_waitlist === false);
  }

  // B pending_payment (checkout)
  const holdFuture = new Date(Date.now() + 15 * 60_000).toISOString();
  const { data: bRegId, error: bpe } = await admin.rpc('create_pending_registration', {
    p_course: courseId,
    p_user: b.id,
    p_hold_reason: 'checkout',
    p_hold_expires_at: holdFuture,
  });
  if (bpe) abbruch('B pending: ' + bpe.message);
  ok('B pending_payment', Boolean(bRegId));

  // C → Warteliste (Überbuchung)
  {
    const { data, error } = await cClient.rpc('register_for_course', {
      p_course_id: courseId,
    });
    if (error) abbruch('C register: ' + error.message);
    ok('C Warteliste', data?.success === true && data?.is_waitlist === true);
  }

  {
    const { data, error } = await ownerClient.rpc('get_course_participant_counts', {
      p_course_ids: [courseId],
    });
    if (error) abbruch('counts: ' + error.message);
    const row = data?.[0];
    ok('counts = 2', Number(row?.registered_count) === 2, `got ${row?.registered_count}`);
    ok('waitlist = 1', Number(row?.waitlist_count) === 1);
  }

  // Eindeutigkeit
  {
    const { data, error } = await admin.rpc('create_pending_registration', {
      p_course: courseId,
      p_user: b.id,
      p_hold_reason: 'checkout',
      p_hold_expires_at: holdFuture,
    });
    ok(
      'B erneut → ALREADY_REGISTERED',
      Boolean(error) && /ALREADY_REGISTERED/i.test(error.message + (data ?? '')),
      error?.message,
    );
  }

  // Geld-Aktionen
  {
    const { data, error } = await ownerClient.rpc('record_manual_payment', {
      p_registration_id: bRegId,
      p_method: 'cash',
    });
    if (error) abbruch('kassieren rpc: ' + error.message);
    ok('Kassieren → PAYMENT_PENDING', data?.success === false && data?.error === 'PAYMENT_PENDING');
  }
  {
    const { data, error } = await ownerClient.rpc('set_coverage_waived', {
      p_registration_id: bRegId,
      p_reason: 'goodwill',
    });
    if (error) abbruch('erlass rpc: ' + error.message);
    ok('Erlassen → PAYMENT_PENDING', data?.success === false && data?.error === 'PAYMENT_PENDING');
  }
  {
    const { data, error } = await ownerClient.rpc('get_open_coverage');
    if (error) abbruch('open coverage: ' + error.message);
    ok(
      'B nicht in Offene Zahlungen',
      !(data || []).some((r) => r.registration_id === bRegId),
    );
  }
  {
    const { data, error } = await ownerClient.rpc('get_course_member_passes', {
      p_course_id: courseId,
    });
    if (error) abbruch('member passes: ' + error.message);
    // Ohne Pass liefert die RPC keine Zeile — Filter akzeptiert pending (kein Fehler).
    ok('get_course_member_passes ohne Fehler', !error && Array.isArray(data));
    const { data: regs } = await ownerClient
      .from('registrations')
      .select('id, status, user_id')
      .eq('course_id', courseId)
      .eq('user_id', b.id);
    ok('B Status pending sichtbar', regs?.[0]?.status === 'pending_payment');
  }

  // Versuch
  const { data: attemptId, error: ae } = await admin.rpc('create_payment_attempt', {
    p_registration: bRegId,
    p_provider: 'stripe',
    p_livemode: false,
  });
  if (ae) abbruch('attempt: ' + ae.message);
  ok('Versuch angelegt', Boolean(attemptId));

  {
    const { data: att } = await admin
      .from('payment_attempts')
      .select('amount_cents, status')
      .eq('id', attemptId)
      .single();
    ok('Betrag 1500', att?.amount_cents === 1500 && att?.status === 'initiated');
  }
  {
    const { count } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'payment_attempt.created')
      .eq('subject_id', attemptId);
    ok('Event payment_attempt.created', count === 1);
  }
  {
    const { error } = await admin.rpc('create_payment_attempt', {
      p_registration: bRegId,
      p_provider: 'stripe',
      p_livemode: false,
    });
    ok('Zweiter Versuch → ACTIVE_ATTEMPT_EXISTS', /ACTIVE_ATTEMPT_EXISTS/i.test(error?.message ?? ''));
  }
  {
    const { data: aReg } = await admin
      .from('registrations')
      .select('id')
      .eq('course_id', courseId)
      .eq('user_id', a.id)
      .eq('status', 'registered')
      .single();
    const { error } = await admin.rpc('create_payment_attempt', {
      p_registration: aReg.id,
      p_provider: 'stripe',
      p_livemode: false,
    });
    ok('Versuch für A → NOT_PENDING', /NOT_PENDING/i.test(error?.message ?? ''));
  }
  // Negativtest: direktes UPDATE muss scheitern
  {
    const { data: before, error: beforeErr } = await admin
      .from('payment_attempts')
      .select('amount_cents')
      .eq('id', attemptId)
      .single();
    if (beforeErr) abbruch('amount vor Negativtest: ' + beforeErr.message);
    const amountVorher = before.amount_cents;

    const { error } = await admin
      .from('payment_attempts')
      .update({ amount_cents: 999 })
      .eq('id', attemptId);
    if (!error) abbruch('UPDATE amount hätte scheitern müssen (service_role)');
    ok('UPDATE amount verweigert', Boolean(error));

    const { data: ownerRows, error: ownerErr } = await ownerClient
      .from('payment_attempts')
      .update({ amount_cents: 999 })
      .eq('id', attemptId)
      .select('id');
    ok(
      'Owner UPDATE amount keine Änderung',
      Boolean(ownerErr) || !ownerRows?.length,
      ownerErr?.message ?? `rows=${ownerRows?.length ?? 0}`,
    );

    const { data: after, error: afterErr } = await admin
      .from('payment_attempts')
      .select('amount_cents')
      .eq('id', attemptId)
      .single();
    if (afterErr) abbruch('amount nach Negativtest: ' + afterErr.message);
    ok('amount_cents unverändert', after.amount_cents === amountVorher, String(after.amount_cents));
  }
  {
    const { error } = await admin.rpc('set_payment_attempt_status', {
      p_attempt_id: attemptId,
      p_status: 'succeeded',
    });
    ok('succeeded verweigert', Boolean(error));
  }
  {
    const { error: e1 } = await admin.rpc('set_payment_attempt_status', {
      p_attempt_id: attemptId,
      p_status: 'processing',
    });
    ok('initiated → processing', !e1, e1?.message);
    const { error: e2 } = await admin.rpc('set_payment_attempt_status', {
      p_attempt_id: attemptId,
      p_status: 'failed',
      p_failure_code: 'CARD_DECLINED',
    });
    ok('processing → failed', !e2, e2?.message);
  }
  {
    const { data: attempt2, error } = await admin.rpc('create_payment_attempt', {
      p_registration: bRegId,
      p_provider: 'stripe',
      p_livemode: false,
    });
    ok('neuer Versuch nach failed', Boolean(attempt2) && !error, error?.message);
    // für Abmelden behalten
    globalThis.__attempt2 = attempt2;
  }

  // Abmelden während pending
  {
    const { data, error } = await bClient.rpc('unregister_from_course', {
      p_course_id: courseId,
    });
    if (error) abbruch('B unregister: ' + error.message);
    ok('B abgemeldet', data?.success === true);
  }
  {
    const { data: bRow } = await admin
      .from('registrations')
      .select('status, cancel_reason')
      .eq('id', bRegId)
      .single();
    ok('B cancelled/participant', bRow?.status === 'cancelled' && bRow?.cancel_reason === 'participant');
  }
  {
    const { data: att } = await admin
      .from('payment_attempts')
      .select('status')
      .eq('id', globalThis.__attempt2)
      .single();
    ok('Versuch canceled', att?.status === 'canceled');
  }
  {
    const { data: cRow } = await admin
      .from('registrations')
      .select('status')
      .eq('course_id', courseId)
      .eq('user_id', c.id)
      .is('cancellation_timestamp', null)
      .single();
    ok('C nachgerückt registered', cRow?.status === 'registered');
  }

  // Ablauf Checkout
  const d = await nutzerAnlegen(admin, {
    email: SLUG + '.d@example.com',
    vorname: 'Dora',
    nachname: 'D',
    rolle: 'user',
    tenantId,
    password,
  });
  // freier Platz: A+C registered → Kapazität 2 voll. A abmelden für Platz.
  {
    const { error } = await aClient.rpc('unregister_from_course', { p_course_id: courseId });
    if (error) abbruch('A unregister für Ablauf: ' + error.message);
  }
  const past = new Date(Date.now() - 60_000).toISOString();
  const { data: dRegId, error: dpe } = await admin.rpc('create_pending_registration', {
    p_course: courseId,
    p_user: d.id,
    p_hold_reason: 'checkout',
    p_hold_expires_at: past,
  });
  if (dpe) abbruch('D pending past: ' + dpe.message);
  {
    const { data: n1, error } = await admin.rpc('expire_payment_holds');
    if (error) abbruch('expire: ' + error.message);
    ok('expire Checkout ≥1', Number(n1) >= 1, `n=${n1}`);
  }
  {
    const { data: dRow } = await admin.from('registrations').select('status, cancel_reason').eq('id', dRegId).single();
    ok(
      'D payment_expired',
      dRow?.status === 'cancelled' && dRow?.cancel_reason === 'payment_expired',
    );
  }
  {
    const { count } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'registration.hold_expired')
      .eq('subject_id', dRegId);
    ok('Event hold_expired', count === 1);
  }
  {
    const { data: n2, error } = await admin.rpc('expire_payment_holds');
    if (error) abbruch('expire2: ' + error.message);
    ok('zweiter Expire-Lauf 0', Number(n2) === 0);
  }

  // Ablauf promotion + Attempt canceled
  // Platz: C registered. Kapazität 2. Nach D-expire und A-unregister: nur C → 1 Platz frei.
  // Hold bereits abgelaufen: create_payment_attempt lehnt ab (HOLD_EXPIRED) —
  // Versuche storniert expire trotzdem (0 Treffer); Cancel-Pfad ist bei B belegt.
  const eUser = await nutzerAnlegen(admin, {
    email: SLUG + '.e@example.com',
    vorname: 'Eva',
    nachname: 'E',
    rolle: 'user',
    tenantId,
    password,
  });
  const { data: eRegId, error: epe } = await admin.rpc('create_pending_registration', {
    p_course: courseId,
    p_user: eUser.id,
    p_hold_reason: 'promotion',
    p_hold_expires_at: past,
  });
  if (epe) abbruch('E pending: ' + epe.message);
  {
    const { error } = await admin.rpc('create_payment_attempt', {
      p_registration: eRegId,
      p_provider: 'stripe',
      p_livemode: false,
    });
    ok('E Versuch auf abgelaufenem Hold → HOLD_EXPIRED', /HOLD_EXPIRED/i.test(error?.message ?? ''));
  }
  {
    const { data: n, error } = await admin.rpc('expire_payment_holds');
    if (error) abbruch('expire promotion: ' + error.message);
    ok('expire promotion', Number(n) >= 1);
  }
  {
    const { data: eRow } = await admin.from('registrations').select('cancel_reason').eq('id', eRegId).single();
    ok('E promotion_expired', eRow?.cancel_reason === 'promotion_expired');
  }

  // E2: Hold läuft ab mit aktivem Versuch (kurz warten; Cron kann schon vorher greifen)
  const e2User = await nutzerAnlegen(admin, {
    email: SLUG + '.e2@example.com',
    vorname: 'E2',
    nachname: 'E',
    rolle: 'user',
    tenantId,
    password,
  });
  const holdIn3s = new Date(Date.now() + 3_000).toISOString();
  const { data: e2RegId, error: e2pe } = await admin.rpc('create_pending_registration', {
    p_course: courseId,
    p_user: e2User.id,
    p_hold_reason: 'checkout',
    p_hold_expires_at: holdIn3s,
  });
  if (e2pe) abbruch('E2 pending: ' + e2pe.message);
  const { data: e2Attempt, error: e2ae } = await admin.rpc('create_payment_attempt', {
    p_registration: e2RegId,
    p_provider: 'stripe',
    p_livemode: false,
  });
  if (e2ae) abbruch('E2 attempt: ' + e2ae.message);
  ok('E2 Versuch angelegt', Boolean(e2Attempt));
  await new Promise((r) => setTimeout(r, 4_000));
  {
    const { error } = await admin.rpc('expire_payment_holds');
    if (error) abbruch('E2 expire: ' + error.message);
  }
  {
    const { data: e2Row } = await admin
      .from('registrations')
      .select('status, cancel_reason')
      .eq('id', e2RegId)
      .single();
    ok(
      'E2 payment_expired',
      e2Row?.status === 'cancelled' && e2Row?.cancel_reason === 'payment_expired',
    );
    const { data: att } = await admin
      .from('payment_attempts')
      .select('status')
      .eq('id', e2Attempt)
      .single();
    ok('E2 Versuch canceled', att?.status === 'canceled');
  }
  {
    const { count } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'registration.hold_expired')
      .eq('subject_id', e2RegId);
    ok('E2 Event hold_expired', count === 1);
  }
  {
    const { data: n2, error } = await admin.rpc('expire_payment_holds');
    if (error) abbruch('E2 expire2: ' + error.message);
    ok('E2 zweiter Expire-Lauf 0', Number(n2) === 0);
  }

  // Absage: registered+open und pending_payment → cancelled_from_status; uncancel nur registered
  {
    const { data: seats } = await admin
      .from('registrations')
      .select('user_id')
      .eq('course_id', courseId)
      .in('status', ['registered', 'pending_payment', 'waitlist'])
      .is('cancellation_timestamp', null);
    for (const s of seats || []) {
      await ownerClient.rpc('admin_unregister_user_from_course', {
        p_user_id: s.user_id,
        p_course_id: courseId,
      });
    }
  }
  const fRegUser = await nutzerAnlegen(admin, {
    email: SLUG + '.freg@example.com',
    vorname: 'Freg',
    nachname: 'F',
    rolle: 'user',
    tenantId,
    password,
  });
  const fPendUser = await nutzerAnlegen(admin, {
    email: SLUG + '.fpend@example.com',
    vorname: 'Fpend',
    nachname: 'F',
    rolle: 'user',
    tenantId,
    password,
  });
  const fRegClient = await login(url, anon, fRegUser.email, password);
  {
    const { data, error } = await fRegClient.rpc('register_for_course', {
      p_course_id: courseId,
    });
    if (error) abbruch('Freg register: ' + error.message);
    ok('Freg registered', data?.success === true && data?.is_waitlist === false);
  }
  const { data: fRegOpenId } = await admin
    .from('registrations')
    .select('id')
    .eq('course_id', courseId)
    .eq('user_id', fRegUser.id)
    .eq('status', 'registered')
    .single();
  const { data: fRegId, error: fpe } = await admin.rpc('create_pending_registration', {
    p_course: courseId,
    p_user: fPendUser.id,
    p_hold_reason: 'checkout',
    p_hold_expires_at: holdFuture,
  });
  if (fpe) abbruch('Fpend pending: ' + fpe.message);
  const { data: fAttempt } = await admin.rpc('create_payment_attempt', {
    p_registration: fRegId,
    p_provider: 'stripe',
    p_livemode: false,
  });
  {
    const { data, error } = await ownerClient.rpc('cancel_course', {
      p_course_id: courseId,
      p_scope: 'single',
    });
    if (error) abbruch('cancel: ' + error.message);
    ok('Kurs abgesagt', data?.success === true);
  }
  {
    const { data: regRow } = await admin
      .from('registrations')
      .select('status, cancel_reason, cancelled_from_status')
      .eq('id', fRegOpenId.id)
      .single();
    const { data: pendRow } = await admin
      .from('registrations')
      .select('status, cancel_reason, cancelled_from_status')
      .eq('id', fRegId)
      .single();
    ok(
      'registered → cancelled_from_status registered',
      regRow?.status === 'cancelled'
        && regRow?.cancel_reason === 'course_cancelled'
        && regRow?.cancelled_from_status === 'registered',
      JSON.stringify(regRow),
    );
    ok(
      'pending → cancelled_from_status pending_payment',
      pendRow?.status === 'cancelled'
        && pendRow?.cancel_reason === 'course_cancelled'
        && pendRow?.cancelled_from_status === 'pending_payment',
      JSON.stringify(pendRow),
    );
    const { data: att } = await admin.from('payment_attempts').select('status').eq('id', fAttempt).single();
    ok('F Versuch canceled', att?.status === 'canceled');
  }
  {
    const { data, error } = await ownerClient.rpc('uncancel_course', {
      p_course_id: courseId,
      p_scope: 'single',
    });
    if (error) abbruch('uncancel: ' + error.message);
    ok('Absage zurückgenommen', data?.success === true);
  }
  {
    const { data: regRow } = await admin.from('registrations').select('status').eq('id', fRegOpenId.id).single();
    const { data: pendRow } = await admin.from('registrations').select('status').eq('id', fRegId).single();
    ok('registered nach uncancel wieder da', regRow?.status === 'registered');
    ok('pending bleibt cancelled nach uncancel', pendRow?.status === 'cancelled');
  }

  // Person entfernen mit pending
  const gUser = await nutzerAnlegen(admin, {
    email: SLUG + '.g@example.com',
    vorname: 'Gina',
    nachname: 'G',
    rolle: 'user',
    tenantId,
    password,
  });
  {
    const { count } = await admin
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', courseId)
      .in('status', ['registered', 'pending_payment'])
      .is('cancellation_timestamp', null);
    // Kurs active again after uncancel — may have restored C etc. Free a seat if needed.
    if (count >= 2) {
      const { data: seats } = await admin
        .from('registrations')
        .select('user_id, status')
        .eq('course_id', courseId)
        .in('status', ['registered', 'pending_payment'])
        .is('cancellation_timestamp', null);
      const victim = seats.find((s) => s.user_id !== gUser.id);
      if (victim) {
        await ownerClient.rpc('admin_unregister_user_from_course', {
          p_user_id: victim.user_id,
          p_course_id: courseId,
        });
      }
    }
  }
  const { data: gRegId, error: gpe } = await admin.rpc('create_pending_registration', {
    p_course: courseId,
    p_user: gUser.id,
    p_hold_reason: 'checkout',
    p_hold_expires_at: holdFuture,
  });
  if (gpe) abbruch('G pending: ' + gpe.message);
  {
    const { data, error } = await ownerClient.rpc('remove_member', { p_member_id: gUser.id });
    if (error) abbruch('remove_member: ' + error.message);
    ok('Person entfernen ok', data?.success === true);
  }
  {
    const { data: gRow } = await admin
      .from('registrations')
      .select('status, cancel_reason')
      .eq('id', gRegId)
      .maybeSingle();
    // deleted mode may remove reg; anonymized keeps member_removed
    ok(
      'G weg oder member_removed',
      !gRow || (gRow.status === 'cancelled' && gRow.cancel_reason === 'member_removed'),
      JSON.stringify(gRow),
    );
  }

  // RLS Lesen
  {
    const { data: oRows } = await ownerClient.from('payment_attempts').select('id');
    ok('Owner sieht Versuche', (oRows?.length ?? 0) > 0);
    const { data: tRows } = await teacherClient.from('payment_attempts').select('id');
    ok('Lehrer 0', (tRows?.length ?? 0) === 0);
    const { data: uRows } = await aClient.from('payment_attempts').select('id');
    ok('Teilnehmer 0', (uRows?.length ?? 0) === 0);
    const { data: frRows } = await fremdClient.from('payment_attempts').select('id');
    ok('fremder Owner 0', (frRows?.length ?? 0) === 0);
  }

  // P10 — wie 1.2a: Flag → Konto bereit → Steuerstatus → Owner-Schalter
  await plattform(admin, false);
  {
    const { data: eff } = await admin.rpc('online_payments_effective', { p_tenant: tenantId });
    const { data: req } = await admin.rpc('online_payment_required', { p_tenant: tenantId });
    ok('P10 platform aus → effective false', eff === false && req === false);
  }
  await plattform(admin, true);
  {
    const { data: eff } = await admin.rpc('online_payments_effective', { p_tenant: tenantId });
    ok('P10 platform an / studio aus → effective false', eff === false);
  }
  {
    const { data: up, error } = await admin.rpc('upsert_provider_account', {
      p_tenant: tenantId,
      p_provider: 'stripe',
      p_ref: `acct_s21ba_${tenantId.replace(/-/g, '').slice(0, 16)}`,
      p_status: 'active',
      p_charges: true,
      p_payouts: true,
      p_details: true,
      p_livemode: false,
      p_capabilities: { card: 'active' },
    });
    if (error) abbruch('upsert_provider_account: ' + error.message);
    ok('P10 Konto bereit', up?.success === true, JSON.stringify(up));
  }
  {
    const { data, error } = await ownerClient.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    if (error) abbruch('set_tax_setting: ' + error.message);
    ok('P10 Steuerstatus', data?.success === true, JSON.stringify(data));
  }
  {
    const { data, error } = await ownerClient.rpc('set_online_payments_enabled', { p_enabled: true });
    if (error) abbruch('set_online_payments_enabled: ' + error.message);
    ok('P10 Studio online an', data?.success === true, JSON.stringify(data));
  }
  {
    const { data: eff } = await admin.rpc('online_payments_effective', { p_tenant: tenantId });
    const { data: req } = await admin.rpc('online_payment_required', { p_tenant: tenantId });
    ok('P10 beide an / onsite ja → effective true, required false', eff === true && req === false);
  }
  {
    const { data, error } = await ownerClient.rpc('set_allow_onsite_payment', { p_allow: false });
    if (error) abbruch('set_allow_onsite_payment: ' + error.message);
    ok('P10 onsite aus', data?.success === true, JSON.stringify(data));
  }
  {
    const { data: req } = await admin.rpc('online_payment_required', { p_tenant: tenantId });
    ok('P10 required true', req === true);
  }

  // Unverändert: normales Buchen
  const hUser = await nutzerAnlegen(admin, {
    email: SLUG + '.h@example.com',
    vorname: 'Hans',
    nachname: 'H',
    rolle: 'user',
    tenantId,
    password,
  });
  const hClient = await login(url, anon, hUser.email, password);
  {
    // free seat
    const { data: seats } = await admin
      .from('registrations')
      .select('user_id')
      .eq('course_id', courseId)
      .in('status', ['registered', 'pending_payment'])
      .is('cancellation_timestamp', null);
    for (const s of seats || []) {
      await ownerClient.rpc('admin_unregister_user_from_course', {
        p_user_id: s.user_id,
        p_course_id: courseId,
      });
    }
    const { data, error } = await hClient.rpc('register_for_course', {
      p_course_id: courseId,
    });
    if (error) abbruch('H register: ' + error.message);
    ok('normales Buchen ok', data?.success === true);
    const { data: regs } = await admin
      .from('registrations')
      .select('id, coverage_status')
      .eq('course_id', courseId)
      .eq('user_id', hUser.id)
      .eq('status', 'registered')
      .single();
    const { data: pay, error: pe } = await ownerClient.rpc('record_manual_payment', {
      p_registration_id: regs.id,
      p_method: 'cash',
    });
    if (pe) abbruch('H kassieren: ' + pe.message);
    ok('Kassieren auf registered ok', pay?.success === true);
  }

    console.log('ALLE TESTS GRÜN');
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
