#!/usr/bin/env node
/**
 * A3 — Zahlungsvermerk (nur DEV).
 *
 * Nicht ausführen, bevor 20260927121500_a3_payments.sql auf DEV liegt.
 * Gegen PROD nie. Dieses Skript legt ein eigenes Studio `a3paytest` an
 * und löscht es am Ende über delete_tenant_complete (Zahlungen inklusive).
 * Bleibt etwas liegen: Studio-Slug a3paytest, Konten a3paytest.*@example.com.
 *
 * Fälle:
 *  1) Lehrende vermerkt bar im eigenen Kurs und schickt amount 1 mit
 *     → Zahlung 1500, paid, Event payment.recorded, Audit. Payload ohne Notiz.
 *  2) Zweiter Tipp → NOT_OPEN, coverage_status paid.
 *  3) Lehrende in fremdem Kurs → FORBIDDEN. Teilnehmerin → FORBIDDEN.
 *  4) Lehrende nimmt den eigenen Vermerk zurück → Gegenzeile −1500, open,
 *     beide Zeilen bleiben.
 *  5) Lehrende nimmt einen Vermerk zurück, den sie nicht gesetzt hat → FORBIDDEN.
 *  6) Owner PayPal 1200 ohne Notiz → NOTE_REQUIRED. Mit Notiz → 1200, paid.
 *     Payload enthält die Notiz nicht.
 *  7) Zweite Rücknahme derselben Zahlung → ALREADY_REVERSED.
 *  8) Stornierte Buchung → CANCELLED. Warteliste → NOT_REGISTERED.
 *     Erlassene → NOT_OPEN.
 *  9) Sichtbarkeit: Owner alle, Teilnehmerin nur eigene, Lehrende keine.
 * 10) Direktes INSERT/UPDATE/DELETE als authenticated → Fehler.
 *     service_role: UPDATE der Notiz und DELETE treffen die Trigger.
 * 11) Stornierung nach Vermerk: Zeile bleibt, Buchung cancelled, Deckung paid.
 *
 * Nicht automatisch getestet: die 15-Minuten-Grenze (P4). payments_immutable
 * verbietet UPDATE von created_at, auch für service_role. Es gibt keinen
 * sauberen Weg, den Vermerk altern zu lassen, ohne den Schutz aufzuweichen.
 *
 * Zusatz: Owner mit Betrag 0 → INVALID_AMOUNT.
 *
 * Verwendung: node scripts/test/a3_payments.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const SLUG = 'a3paytest';
const NOTIZ = 'Rabatt Stammkundin';

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

async function login(url, anon, email, password) {
  const c = clientMitTenant(url, anon, SLUG);
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
    .select('id, user_id, status, coverage_status, price_cents_at_booking, is_waitlist')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .single();
  if (error) abbruch('registrations lesen: ' + error.message);
  return data;
}

async function zahlungen(admin, registrationId) {
  const { data, error } = await admin
    .from('payments')
    .select('id, amount_cents, method, status, provider, reverses_payment_id, recorded_by, note, registration_id')
    .eq('registration_id', registrationId);
  if (error) abbruch('payments lesen: ' + error.message);
  return data || [];
}

async function vermerk(client, registrationId, method, amount, note) {
  const args = { p_registration_id: registrationId, p_method: method };
  if (amount !== undefined) args.p_amount_cents = amount;
  if (note !== undefined) args.p_note = note;
  const { data, error } = await client.rpc('record_manual_payment', args);
  if (error) abbruch(`record_manual_payment: ${error.message}`);
  return data;
}

async function ruecknahme(client, paymentId, note) {
  const args = { p_payment_id: paymentId };
  if (note !== undefined) args.p_note = note;
  const { data, error } = await client.rpc('reverse_manual_payment', args);
  if (error) abbruch(`reverse_manual_payment: ${error.message}`);
  return data;
}

function fehler(data, code, name) {
  ok(
    name,
    data?.success === false && data?.error === code,
    `success=${data?.success} error=${data?.error} status=${data?.coverage_status ?? ''}`
  );
  return data;
}

function payloadOhneNotiz(payload, registrationId, cents, method, extra = {}) {
  if (!payload || typeof payload !== 'object') return false;
  const keys = Object.keys(payload);
  const basis = (
    payload.registration_id === registrationId
    && Number(payload.amount_cents) === cents
    && payload.currency === 'EUR'
    && payload.method === method
    && payload.provider === 'manual'
    && typeof payload.payment_id === 'string'
    && typeof payload.received_at === 'string'
    && !keys.includes('note')
    && !JSON.stringify(payload).includes(NOTIZ)
  );
  if (!basis) return false;
  for (const [key, value] of Object.entries(extra)) {
    if (payload[key] !== value) return false;
  }
  return true;
}

async function protokoll(admin, paymentId, typ) {
  const { data: events, error: eErr } = await admin
    .from('events')
    .select('id, type, subject_type, subject_id, payload, causation_id')
    .eq('subject_id', paymentId)
    .eq('type', typ);
  if (eErr) abbruch('events lesen: ' + eErr.message);
  const event = (events || [])[0];
  const { data: audit, error: aErr } = await admin
    .from('audit_log')
    .select('id, action, table_name, row_id, changed_fields, event_id')
    .eq('event_id', event?.id ?? '00000000-0000-0000-0000-000000000000');
  if (aErr) abbruch('audit_log lesen: ' + aErr.message);
  return { events: events || [], audit: audit || [] };
}

function gleicheMenge(a, b) {
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.length === bs.length && as.every((id, i) => id === bs[i]);
}

function dmlVerweigert(error, name) {
  const text = `${error?.code || ''} ${error?.message || ''}`;
  ok(name, Boolean(error) && /42501|permission|denied|nicht erlaubt|unveraenderlich|unveränderlich/i.test(text), text);
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
    .insert({ name: 'A3 Zahlungstest', slug: SLUG })
    .select('id')
    .single();
  if (tErr) abbruch('Studio anlegen: ' + tErr.message);

  const owner = await nutzerAnlegen(admin, {
    email: SLUG + '.owner@example.com', vorname: 'Olivia', nachname: 'Owner', rolle: 'owner', tenantId: tenant.id, password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: SLUG + '.teacher@example.com', vorname: 'Tom', nachname: 'Teacher', rolle: 'teacher', tenantId: tenant.id, password,
  });
  const p1 = await nutzerAnlegen(admin, {
    email: SLUG + '.teilnehmer1@example.com', vorname: 'Anna', nachname: 'Andersen', rolle: 'user', tenantId: tenant.id, password,
  });
  const p2 = await nutzerAnlegen(admin, {
    email: SLUG + '.teilnehmer2@example.com', vorname: 'Ben', nachname: 'Berger', rolle: 'user', tenantId: tenant.id, password,
  });

  const basisLehrer = {
    tenant_id: tenant.id,
    teacher_id: teacher.id,
    description: 'A3 Vermerk',
    date: tag(14),
    location: 'Test',
    status: 'active',
    frequency: 'one_time',
    max_participants: 10,
    price: 15,
  };

  const courseBar = await kursAnlegen(admin, {
    ...basisLehrer, title: 'A3_BAR', time: '10:00:00', end_time: '11:00:00',
  });
  const courseFremd = await kursAnlegen(admin, {
    ...basisLehrer,
    teacher_id: owner.id,
    title: 'A3_FREMD',
    time: '11:00:00',
    end_time: '12:00:00',
  });
  const courseP2 = await kursAnlegen(admin, {
    ...basisLehrer, title: 'A3_P2', time: '12:00:00', end_time: '13:00:00',
  });
  const courseStorno = await kursAnlegen(admin, {
    ...basisLehrer, title: 'A3_STORNO', time: '13:00:00', end_time: '14:00:00',
  });
  const courseWarte = await kursAnlegen(admin, {
    ...basisLehrer, title: 'A3_WARTE', time: '14:00:00', end_time: '15:00:00', max_participants: 1,
  });
  const courseErlass = await kursAnlegen(admin, {
    ...basisLehrer, title: 'A3_ERLASS', time: '15:00:00', end_time: '16:00:00',
  });

  const clientOwner = await login(url, anon, owner.email, password);
  const clientTeacher = await login(url, anon, teacher.email, password);
  const clientP1 = await login(url, anon, p1.email, password);
  const clientP2 = await login(url, anon, p2.email, password);

  await anmelden(clientP1, courseBar, 'P1 bar');
  await anmelden(clientP1, courseFremd, 'P1 fremd');
  await anmelden(clientP2, courseP2, 'P2 sichtbar');
  await anmelden(clientP2, courseStorno, 'P2 storno');
  await anmelden(clientP1, courseWarte, 'P1 platz');
  await anmelden(clientP2, courseWarte, 'P2 warte');
  await anmelden(clientP2, courseErlass, 'P2 erlass');

  const bar = await buchung(admin, courseBar, p1.id);
  const fremd = await buchung(admin, courseFremd, p1.id);
  const sichtbar = await buchung(admin, courseP2, p2.id);
  const storno = await buchung(admin, courseStorno, p2.id);
  const platz = await buchung(admin, courseWarte, p1.id);
  const warte = await buchung(admin, courseWarte, p2.id);
  const erlass = await buchung(admin, courseErlass, p2.id);

  ok('Ausgang bar offen, 1500', bar.coverage_status === 'open' && Number(bar.price_cents_at_booking) === 1500 && bar.status === 'registered');
  ok('Warteliste ist waitlist', warte.status === 'waitlist' && platz.status === 'registered', `warte=${warte.status} platz=${platz.status}`);

  const gesetzt = await vermerk(clientTeacher, bar.id, 'cash', 1);
  ok(
    'Fall 1 und 3 bar 1500 trotz amount 1',
    gesetzt?.success === true && gesetzt?.amount_cents === 1500 && gesetzt?.method === 'cash',
    `success=${gesetzt?.success} cent=${gesetzt?.amount_cents}`
  );
  const nachBar = await buchung(admin, courseBar, p1.id);
  const barZeilen = await zahlungen(admin, bar.id);
  ok(
    'Fall 1 paid, eine Zeile 1500 von der Lehrenden',
    nachBar.coverage_status === 'paid'
      && barZeilen.length === 1
      && barZeilen[0].amount_cents === 1500
      && barZeilen[0].method === 'cash'
      && barZeilen[0].status === 'succeeded'
      && barZeilen[0].provider === 'manual'
      && barZeilen[0].recorded_by === teacher.id
      && barZeilen[0].reverses_payment_id == null
      && barZeilen[0].id === gesetzt.payment_id
  );

  const erstes = await protokoll(admin, gesetzt.payment_id, 'payment.recorded');
  ok(
    'Fall 1 ein Event, Subjekt ist die Zahlung',
    erstes.events.length === 1
      && erstes.events[0].subject_type === 'payment'
      && erstes.events[0].subject_id === gesetzt.payment_id
      && typeof erstes.events[0].causation_id === 'string'
  );
  ok('Fall 1 Payload ohne Notiz', payloadOhneNotiz(erstes.events[0].payload, bar.id, 1500, 'cash'));
  ok(
    'Fall 1 Audit auf Zahlung und Deckung',
    erstes.audit.length === 2
      && erstes.audit.some((a) => a.table_name === 'payments' && a.row_id === gesetzt.payment_id && a.changed_fields.includes('note'))
      && erstes.audit.some((a) => a.table_name === 'registrations' && a.row_id === bar.id && a.changed_fields.includes('coverage_status'))
      && !JSON.stringify(erstes.audit).includes(NOTIZ)
  );

  const zweiter = fehler(await vermerk(clientTeacher, bar.id, 'cash'), 'NOT_OPEN', 'Fall 2 zweiter Tipp');
  ok('Fall 2 nennt paid', zweiter.coverage_status === 'paid');
  ok('Fall 2 keine zweite Zeile', (await zahlungen(admin, bar.id)).length === 1);

  fehler(await vermerk(clientTeacher, fremd.id, 'cash'), 'FORBIDDEN', 'Fall 3 Lehrende fremder Kurs');
  fehler(await vermerk(clientP1, fremd.id, 'cash'), 'FORBIDDEN', 'Fall 3 Teilnehmerin');
  ok('nach FORBIDDEN weiter open', (await buchung(admin, courseFremd, p1.id)).coverage_status === 'open');

  fehler(await vermerk(clientOwner, fremd.id, 'paypal_manual', 1200), 'NOTE_REQUIRED', 'Fall 6 ohne Notiz');
  fehler(await vermerk(clientOwner, fremd.id, 'paypal_manual', 0, NOTIZ), 'INVALID_AMOUNT', 'Zusatz Betrag 0');
  ok('nach Ablehnung weiter open', (await buchung(admin, courseFremd, p1.id)).coverage_status === 'open');

  const paypal = await vermerk(clientOwner, fremd.id, 'paypal_manual', 1200, NOTIZ);
  ok(
    'Fall 6 PayPal 1200',
    paypal?.success === true && paypal?.amount_cents === 1200 && paypal?.method === 'paypal_manual',
    `cent=${paypal?.amount_cents}`
  );
  const paypalZeile = (await zahlungen(admin, fremd.id))[0];
  ok(
    'Fall 6 Zeile mit Notiz, Deckung paid',
    paypalZeile?.amount_cents === 1200
      && paypalZeile?.note === NOTIZ
      && paypalZeile?.recorded_by === owner.id
      && (await buchung(admin, courseFremd, p1.id)).coverage_status === 'paid'
  );
  const paypalProtokoll = await protokoll(admin, paypal.payment_id, 'payment.recorded');
  ok(
    'Fall 6 Payload ohne Notiz',
    paypalProtokoll.events.length === 1
      && payloadOhneNotiz(paypalProtokoll.events[0].payload, fremd.id, 1200, 'paypal_manual')
  );
  ok(
    'Fall 6 Audit nennt die Spalte, nicht den Text',
    paypalProtokoll.audit.some((a) => a.table_name === 'payments' && a.changed_fields.includes('note'))
      && !JSON.stringify(paypalProtokoll.events).includes(NOTIZ)
      && !JSON.stringify(paypalProtokoll.audit).includes(NOTIZ)
  );

  fehler(await ruecknahme(clientTeacher, paypal.payment_id), 'FORBIDDEN', 'Fall 5 fremder Vermerk');
  ok('fremder Vermerk bleibt', (await zahlungen(admin, fremd.id)).length === 1);

  const zurueck = await ruecknahme(clientTeacher, gesetzt.payment_id);
  ok(
    'Fall 4 Rücknahme −1500',
    zurueck?.success === true && zurueck?.amount_cents === -1500 && zurueck?.method === 'cash',
    `cent=${zurueck?.amount_cents}`
  );
  const nachRueck = await zahlungen(admin, bar.id);
  const gegen = nachRueck.find((z) => z.amount_cents === -1500);
  const original = nachRueck.find((z) => z.amount_cents === 1500);
  ok(
    'Fall 4 beide Zeilen, Deckung open',
    nachRueck.length === 2
      && gegen?.reverses_payment_id === original?.id
      && gegen?.method === 'cash'
      && gegen?.recorded_by === teacher.id
      && (await buchung(admin, courseBar, p1.id)).coverage_status === 'open'
  );
  const rueckProtokoll = await protokoll(admin, zurueck.payment_id, 'payment.reversed');
  ok(
    'Fall 4 Event der Gegenzeile',
    rueckProtokoll.events.length === 1
      && rueckProtokoll.events[0].subject_id === zurueck.payment_id
      && rueckProtokoll.events[0].causation_id !== erstes.events[0].causation_id
      && payloadOhneNotiz(rueckProtokoll.events[0].payload, bar.id, -1500, 'cash', {
        reverses_payment_id: gesetzt.payment_id,
      })
  );

  fehler(await ruecknahme(clientTeacher, gesetzt.payment_id), 'ALREADY_REVERSED', 'Fall 7 zweite Rücknahme');
  ok('Fall 7 weiter zwei Zeilen', (await zahlungen(admin, bar.id)).length === 2);

  const p2Bar = await vermerk(clientTeacher, sichtbar.id, 'cash');
  ok('P2-Vermerk für die Sichtbarkeit', p2Bar?.success === true && p2Bar?.amount_cents === 1500);

  const stornoVermerk = await vermerk(clientTeacher, storno.id, 'cash');
  ok('Storno-Vermerk', stornoVermerk?.success === true);
  const { data: ab, error: abErr } = await clientTeacher.rpc('admin_unregister_user_from_course', {
    p_user_id: p2.id,
    p_course_id: courseStorno,
  });
  if (abErr) abbruch('Abmelden: ' + abErr.message);
  if (!ab?.success) abbruch('Abmelden: ' + (ab?.error || ab?.message || 'kein Erfolg'));
  const nachStorno = await admin
    .from('registrations')
    .select('id, status, coverage_status')
    .eq('id', storno.id)
    .single();
  if (nachStorno.error) abbruch('Storno lesen: ' + nachStorno.error.message);
  const stornoZeilen = await zahlungen(admin, storno.id);
  ok(
    'Fall 11 Vermerk überlebt, cancelled, paid',
    nachStorno.data.status === 'cancelled'
      && nachStorno.data.coverage_status === 'paid'
      && stornoZeilen.length === 1
      && stornoZeilen[0].amount_cents === 1500
  );
  fehler(await vermerk(clientTeacher, storno.id, 'cash'), 'CANCELLED', 'Fall 8 stornierte Buchung');

  fehler(await vermerk(clientTeacher, warte.id, 'cash'), 'NOT_REGISTERED', 'Fall 8 Warteliste');
  ok('Warteliste ohne Zahlung', (await zahlungen(admin, warte.id)).length === 0);

  const { data: erlassen, error: erlassErr } = await clientOwner.rpc('set_coverage_waived', {
    p_registration_id: erlass.id,
    p_reason: 'goodwill',
    p_note: 'Kulanz Probe',
  });
  if (erlassErr) abbruch('Erlass: ' + erlassErr.message);
  if (!erlassen?.success) abbruch('Erlass: ' + (erlassen?.error || 'kein Erfolg'));
  const erlassVersuch = fehler(await vermerk(clientTeacher, erlass.id, 'cash'), 'NOT_OPEN', 'Fall 8 erlassen');
  ok('Fall 8 nennt waived', erlassVersuch.coverage_status === 'waived');

  const { data: alle, error: alleErr } = await admin.from('payments').select('id, registration_id').eq('tenant_id', tenant.id);
  if (alleErr) abbruch('Alle Zahlungen: ' + alleErr.message);
  const { data: regs, error: regErr } = await admin.from('registrations').select('id, user_id').eq('tenant_id', tenant.id);
  if (regErr) abbruch('Buchungen: ' + regErr.message);
  const wem = new Map((regs || []).map((r) => [r.id, r.user_id]));
  const idsVon = (userId) => (alle || []).filter((p) => wem.get(p.registration_id) === userId).map((p) => p.id);

  async function sichtbareIds(client) {
    const { data, error } = await client.from('payments').select('id');
    if (error) abbruch('payments als Nutzer: ' + error.message);
    return (data || []).map((p) => p.id);
  }

  ok('Fall 9 Owner sieht alle', gleicheMenge(await sichtbareIds(clientOwner), (alle || []).map((p) => p.id)), `n=${(alle || []).length}`);
  ok('Fall 9 Lehrende sieht keine', (await sichtbareIds(clientTeacher)).length === 0);
  ok('Fall 9 Teilnehmerin 1 nur eigene', gleicheMenge(await sichtbareIds(clientP1), idsVon(p1.id)));
  ok('Fall 9 Teilnehmerin 2 nur eigene', gleicheMenge(await sichtbareIds(clientP2), idsVon(p2.id)));
  ok('Fall 9 die Mengen sind verschieden', idsVon(p1.id).length > 0 && idsVon(p2.id).length > 0);

  const ziel = gesetzt.payment_id;
  const { error: insErr } = await clientP1.from('payments').insert({
    tenant_id: tenant.id,
    subject_type: 'registration',
    subject_id: bar.id,
    registration_id: bar.id,
    provider: 'manual',
    method: 'cash',
    status: 'succeeded',
    amount_cents: 1500,
    received_at: new Date().toISOString(),
  });
  dmlVerweigert(insErr, 'Fall 10 INSERT authenticated');

  const { error: updErr } = await clientP1.from('payments').update({ note: 'heimlich' }).eq('id', ziel);
  dmlVerweigert(updErr, 'Fall 10 UPDATE authenticated');

  const { error: delErr } = await clientP1.from('payments').delete().eq('id', ziel);
  dmlVerweigert(delErr, 'Fall 10 DELETE authenticated');

  const { error: svcUpd } = await admin.from('payments').update({ note: 'heimlich' }).eq('id', paypal.payment_id);
  dmlVerweigert(svcUpd, 'Fall 10 UPDATE service_role trifft den Trigger');
  const { error: svcDel } = await admin.from('payments').delete().eq('id', paypal.payment_id);
  dmlVerweigert(svcDel, 'Fall 10 DELETE service_role trifft den Trigger');

  const paypalNachher = (await zahlungen(admin, fremd.id))[0];
  ok('Fall 10 Zeile unverändert', paypalNachher?.note === NOTIZ && paypalNachher?.id === paypal.payment_id);

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
      console.error('Reste: Studio a3paytest, Konten a3paytest.*@example.com');
      process.exitCode = 1;
    }
  });
