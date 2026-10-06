#!/usr/bin/env node
/**
 * UX-7 C — Demo-Studio demoalpha v3 (idempotent, nur DEV).
 * Ersetzt demo_ux6.mjs. Voraussetzung: Personen/Produkte aus Seed v2 oder diesem Lauf.
 *
 *   node scripts/dev/demo_v3.mjs
 */
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import {
  berlinDate,
  kursAnlegen,
  login,
  nutzerAnlegen,
  seedPasswort,
} from '../test/_helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SLUG = 'demoalpha';

const IMMEDIATE_TEXT =
  'Ich verlange ausdrücklich, dass ich die Karte sofort nutzen kann. Mir ist bekannt, dass ich bei einem Widerruf für bereits genutzte Termine anteilig Wertersatz leiste.';
const WITHDRAWAL_TEXT =
  'Du hast ein 14-tägiges Widerrufsrecht. Widerrufsbelehrung.';

function hashLegal(text) {
  const norm = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '')
    .concat('\n');
  return createHash('sha256').update(norm, 'utf8').digest('hex');
}

const HASH_IMMEDIATE = hashLegal(IMMEDIATE_TEXT);
const HASH_WITHDRAWAL = hashLegal(WITHDRAWAL_TEXT);

function ladeEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const zeile of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function upsertEnvLine(filePath, key, value) {
  let text = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  if (re.test(text)) text = text.replace(re, line);
  else {
    if (text.length > 0 && !text.endsWith('\n')) text += '\n';
    text += line + '\n';
  }
  writeFileSync(filePath, text, 'utf8');
}

function fail(msg) {
  console.error('\n  FEHLER: ' + msg + '\n');
  process.exit(1);
}

function berlinParts(offsetMs = 0) {
  const d = new Date(Date.now() + offsetMs);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:00`,
  };
}

function addMinutesToTime(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

assertDevGuard();
const env = { ...ladeEnv(join(root, '.env')), ...ladeEnv(join(root, 'supabase', '.env.dev')) };
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.includes(ERLAUBTE_DEV_REF) || !anon || !service) fail('DEV-Env unvollständig');

const password = env.DEMO_PASSWORT || seedPasswort();
const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: tenant, error: te } = await admin
  .from('tenants')
  .select('id, pass_hint_enabled')
  .eq('slug', SLUG)
  .single();
if (te || !tenant) fail('demoalpha fehlt');
const tenantId = tenant.id;

// Kartenhinweis Standard aus
await admin
  .from('tenants')
  .update({ pass_hint_enabled: false, pass_hint_template: null })
  .eq('id', tenantId);

const { data: ownerRow } = await admin
  .from('users')
  .select('id, email, first_name, last_name, role')
  .eq('tenant_id', tenantId)
  .eq('role', 'owner')
  .is('archived_at', null)
  .limit(1)
  .single();
if (!ownerRow?.email) fail('Owner fehlt');

async function ensureMember({ email, vorname, nachname, rolle }) {
  const { data: existing } = await admin
    .from('users')
    .select('id, email, role, archived_at, first_name, last_name')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    if (existing.archived_at) {
      await admin.from('users').update({ archived_at: null }).eq('id', existing.id);
    }
    return existing;
  }
  return nutzerAnlegen(admin, {
    email,
    vorname,
    nachname,
    rolle,
    tenantId,
    password,
  });
}

let teachers = (
  await admin
    .from('users')
    .select('id, first_name, last_name, email, role')
    .eq('tenant_id', tenantId)
    .in('role', ['teacher', 'owner'])
    .is('archived_at', null)
).data ?? [];

if (teachers.filter((t) => t.role === 'teacher').length < 2) {
  const t1 = await ensureMember({
    email: 'juliusbne+lena@gmail.com',
    vorname: 'Lena',
    nachname: 'Lehrerin',
    rolle: 'teacher',
  });
  const t2 = await ensureMember({
    email: 'juliusbne+ben@gmail.com',
    vorname: 'Ben',
    nachname: 'Lehrer',
    rolle: 'teacher',
  });
  teachers = [t1, t2, ownerRow];
}

const teacherA = teachers.find((t) => t.role === 'teacher') ?? teachers[0];
const teacherB =
  teachers.find((t) => t.role === 'teacher' && t.id !== teacherA.id) ?? teacherA;

const vera = await ensureMember({
  email: 'juliusbne+vera@gmail.com',
  vorname: 'Vera',
  nachname: 'Vorort',
  rolle: 'user',
});
const karla = await ensureMember({
  email: 'juliusbne+karla@gmail.com',
  vorname: 'Karla',
  nachname: 'Karte',
  rolle: 'user',
});
const olaf = await ensureMember({
  email: 'juliusbne+olaf@gmail.com',
  vorname: 'Olaf',
  nachname: 'Online',
  rolle: 'user',
});
const nina = await ensureMember({
  email: 'juliusbne+nina@gmail.com',
  vorname: 'Nina',
  nachname: 'Neu',
  rolle: 'user',
});
const wiebke = await ensureMember({
  email: 'juliusbne+wiebke@gmail.com',
  vorname: 'Wiebke',
  nachname: 'Widerruf',
  rolle: 'user',
});

const fillers = [];
for (let i = 1; i <= 6; i++) {
  fillers.push(
    await ensureMember({
      email: `juliusbne+filler${i}@gmail.com`,
      vorname: `Filler${i}`,
      nachname: 'Demo',
      rolle: 'user',
    }),
  );
}

const asOwner = await login(url, anon, ownerRow.email, password, SLUG);

async function ensureOnlinePassProduct(name, units, priceCents) {
  const { data: rows } = await admin
    .from('pass_products')
    .select('id, name, archived_at')
    .eq('tenant_id', tenantId)
    .eq('name', name)
    .is('archived_at', null)
    .limit(1);
  let productId = rows?.[0]?.id;
  if (!productId) {
    const prod = await asOwner.rpc('create_pass_product', {
      p_name: name,
      p_units: units,
      p_price_cents: priceCents,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: null,
      p_online_purchasable: true,
    });
    if (prod.error || !prod.data?.success) fail('pass product: ' + JSON.stringify(prod));
    return prod.data.id;
  }
  await asOwner.rpc('update_pass_product', {
    p_id: productId,
    p_name: name,
    p_units: units,
    p_price_cents: priceCents,
    p_validity_rule: 'months',
    p_validity_value: 12,
    p_description: null,
    p_online_purchasable: true,
  });
  return productId;
}

const product5 = await ensureOnlinePassProduct('5er-Karte', 5, 6500);
const product10 = await ensureOnlinePassProduct('10er-Karte', 10, 12000);

async function ensureCourse(def) {
  const { data: existing } = await admin
    .from('courses')
    .select('id, title, date, status')
    .eq('tenant_id', tenantId)
    .eq('title', def.title)
    .is('archived_at', null)
    .maybeSingle();
  if (existing) {
    await admin
      .from('courses')
      .update({
        date: def.date,
        time: def.time,
        end_time: def.end_time,
        price: def.price,
        max_participants: def.max_participants ?? 12,
        pass_eligible: def.pass_eligible ?? true,
        teacher_id: def.teacher,
        status: def.status ?? 'active',
        description: def.description ?? `${def.title} — Demo v3`,
      })
      .eq('id', existing.id);
    return { id: existing.id, title: def.title };
  }
  return kursAnlegen(admin, tenantId, def.teacher, {
    title: def.title,
    date: def.date,
    time: def.time,
    end_time: def.end_time,
    price: def.price,
    max_participants: def.max_participants ?? 12,
    pass_eligible: def.pass_eligible ?? true,
    description: def.description ?? `${def.title} — Demo v3`,
  });
}

async function ensureReg(userId, courseId, patch = {}) {
  const { data: existing } = await admin
    .from('registrations')
    .select('id, coverage_status, status')
    .eq('course_id', courseId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) {
    if (Object.keys(patch).length > 0) {
      await admin.from('registrations').update(patch).eq('id', existing.id);
    }
    return existing.id;
  }
  const { data: inserted, error } = await admin
    .from('registrations')
    .insert({
      tenant_id: tenantId,
      course_id: courseId,
      user_id: userId,
      status: 'registered',
      is_waitlist: false,
      coverage_status: 'open',
      ...patch,
    })
    .select('id')
    .single();
  if (error) fail('reg: ' + error.message);
  return inserted.id;
}

async function payOnline(userId, registrationId, amountCents, tag) {
  await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
  await admin
    .from('registrations')
    .update({
      status: 'pending_payment',
      coverage_status: 'open',
      pass_id: null,
      hold_reason: 'checkout',
      hold_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    })
    .eq('id', registrationId);

  const prep = await admin.rpc('prepare_online_payment', {
    p_registration_id: registrationId,
    p_user_id: userId,
  });
  if (prep.error || !prep.data?.success) {
    fail('prepare_online_payment: ' + JSON.stringify(prep.data ?? prep.error));
  }
  const pi = `pi_test_v3_${tag}_` + randomUUID().replace(/-/g, '').slice(0, 12);
  const attach = await admin.rpc('attach_payment_ref', {
    p_attempt_id: prep.data.attempt_id,
    p_provider_ref: pi,
  });
  if (attach.error) fail('attach_payment_ref: ' + attach.error.message);
  const done = await admin.rpc('complete_online_payment', {
    p_provider_ref: pi,
    p_amount_cents: amountCents,
    p_currency: 'EUR',
    p_received_at: new Date().toISOString(),
    p_livemode: false,
  });
  if (done.error || !done.data?.success) {
    fail('complete_online_payment: ' + JSON.stringify(done.data ?? done.error));
  }
  return done.data;
}

// --- Heute: Hatha am Nachmittag (~2 h) ---
const start = berlinParts(2 * 60 * 60 * 1000);
const hatha = await ensureCourse({
  title: 'Hatha am Nachmittag',
  date: start.date,
  time: start.time,
  end_time: addMinutesToTime(start.time, 60),
  price: 18,
  teacher: teacherA.id,
  pass_eligible: true,
});
await ensureReg(vera.id, hatha.id, {
  coverage_status: 'open',
  price_cents_at_booking: 1800,
  status: 'registered',
  is_waitlist: false,
});
const karlaToday = await ensureReg(karla.id, hatha.id, {
  coverage_status: 'open',
  price_cents_at_booking: 1800,
  status: 'registered',
  is_waitlist: false,
});
const olafToday = await ensureReg(olaf.id, hatha.id, { price_cents_at_booking: 1800 });

// Karla: 10er noch 6 + Verlauf Verlängerung
{
  const { data: karlaPasses } = await admin
    .from('passes')
    .select('id, remaining, status')
    .eq('tenant_id', tenantId)
    .eq('member_id', karla.id)
    .eq('status', 'active');
  let passId = karlaPasses?.[0]?.id;
  if (!passId) {
    const sell = await asOwner.rpc('sell_pass', {
      p_member_id: karla.id,
      p_product_id: product10,
      p_method: 'cash',
    });
    if (sell.error || !sell.data?.success) fail('sell_pass Karla: ' + JSON.stringify(sell));
    passId = sell.data.pass_id ?? sell.data.id;
  }
  const { data: moves } = await admin.from('pass_movements').select('delta').eq('pass_id', passId);
  const sum = (moves ?? []).reduce((a, m) => a + (m.delta ?? 0), 0);
  const need = Math.max(0, sum - 6);
  for (let i = 0; i < need; i++) {
    const title = `Karla Einheit ${i + 1}`;
    let kurs = (
      await admin
        .from('courses')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('title', title)
        .maybeSingle()
    ).data;
    if (!kurs) {
      kurs = await kursAnlegen(admin, tenantId, teacherA.id, {
        title,
        date: berlinDate(1),
        time: '09:00:00',
        end_time: '10:00:00',
        price: 16,
      });
    }
    const { data: regExists } = await admin
      .from('registrations')
      .select('id, coverage_status')
      .eq('course_id', kurs.id)
      .eq('user_id', karla.id)
      .maybeSingle();
    if (regExists?.coverage_status === 'pass') {
      await admin.from('courses').update({ date: berlinDate(-(20 + i)) }).eq('id', kurs.id);
      continue;
    }
    await admin.from('courses').update({ date: berlinDate(1) }).eq('id', kurs.id);
    let regId = regExists?.id;
    if (!regId) {
      const { data: inserted, error } = await admin
        .from('registrations')
        .insert({
          tenant_id: tenantId,
          course_id: kurs.id,
          user_id: karla.id,
          status: 'registered',
          is_waitlist: false,
          coverage_status: 'open',
        })
        .select('id')
        .single();
      if (error) {
        console.warn('karla reg', error.message);
        continue;
      }
      regId = inserted.id;
    }
    await asOwner.rpc('apply_pass_to_registration', { p_registration_id: regId });
    await admin.from('courses').update({ date: berlinDate(-(20 + i)) }).eq('id', kurs.id);
  }
  // Verlängerung einmal
  const { data: passRow } = await admin
    .from('passes')
    .select('id, valid_until')
    .eq('id', passId)
    .single();
  if (passRow?.valid_until) {
    const until = new Date(passRow.valid_until + 'T12:00:00');
    until.setMonth(until.getMonth() + 3);
    const newUntil = until.toISOString().slice(0, 10);
    const { data: changes } = await admin
      .from('pass_validity_changes')
      .select('id')
      .eq('pass_id', passId)
      .limit(1);
    if (!changes?.length) {
      const ext = await asOwner.rpc('extend_pass', {
        p_pass_id: passId,
        p_new_valid_until: newUntil,
        p_note: 'Demo: verlängert für Klicktest',
      });
      if (ext.error || !ext.data?.success) {
        console.warn('extend_pass', JSON.stringify(ext.data || ext.error));
      }
    }
  }
  // Heute offen mit Karte (nicht eingelöst)
  const { data: karlaRow } = await admin
    .from('registrations')
    .select('coverage_status')
    .eq('id', karlaToday)
    .single();
  if (karlaRow?.coverage_status === 'pass') {
    await asOwner.rpc('undo_pass_redemption', { p_registration_id: karlaToday });
  }
  await admin
    .from('registrations')
    .update({ coverage_status: 'open', pass_id: null })
    .eq('id', karlaToday);
}

// Olaf heute online
{
  const { data: reg } = await admin
    .from('registrations')
    .select('id, coverage_status')
    .eq('id', olafToday)
    .single();
  if (reg?.coverage_status !== 'paid') {
    if (reg?.coverage_status === 'pass') {
      await asOwner.rpc('undo_pass_redemption', { p_registration_id: olafToday });
    }
    const { data: oldPays } = await admin.from('payments').select('id').eq('registration_id', olafToday);
    for (const pay of oldPays ?? []) {
      await admin.from('payments').delete().eq('id', pay.id);
    }
    await admin
      .from('registrations')
      .update({ coverage_status: 'open', pass_id: null })
      .eq('id', olafToday);
    await payOnline(olaf.id, olafToday, 1800, 'hatha');
  }
}

// --- Gestern: Yin Yoga ---
const yesterday = berlinDate(-1);
const yin = await ensureCourse({
  title: 'Yin Yoga',
  date: berlinDate(1),
  time: '10:00:00',
  end_time: '11:15:00',
  price: 16,
  teacher: teacherB.id,
});
const ninaYin = await ensureReg(nina.id, yin.id, {
  coverage_status: 'open',
  price_cents_at_booking: 1600,
});
const olafYin = await ensureReg(olaf.id, yin.id, { price_cents_at_booking: 1600 });
const fillerWaive = await ensureReg(fillers[0].id, yin.id, {
  coverage_status: 'open',
  price_cents_at_booking: 1600,
});
{
  const { data: olafPaid } = await admin
    .from('registrations')
    .select('coverage_status')
    .eq('id', olafYin)
    .single();
  if (olafPaid?.coverage_status !== 'paid') {
    await asOwner.rpc('record_manual_payment', {
      p_registration_id: olafYin,
      p_method: 'cash',
      p_amount_cents: 1600,
    });
  }
  const { data: waiveRow } = await admin
    .from('registrations')
    .select('coverage_status')
    .eq('id', fillerWaive)
    .single();
  if (waiveRow?.coverage_status !== 'waived') {
    const waive = await asOwner.rpc('set_coverage_waived', {
      p_registration_id: fillerWaive,
      p_reason: 'goodwill',
      p_note: 'Demo erlassen',
    });
    if (waive.error || waive.data?.success === false) {
      console.warn('waive', JSON.stringify(waive.data || waive.error));
    }
  }
}
await admin.from('courses').update({ date: yesterday }).eq('id', yin.id);
void ninaYin;

// --- Morgen: Vinyasa Flow voll + Warteliste ---
const vinyasa = await ensureCourse({
  title: 'Vinyasa Flow',
  date: berlinDate(1),
  time: '18:30:00',
  end_time: '19:30:00',
  price: 18,
  max_participants: 8,
  teacher: teacherA.id,
});
const seatPeople = [vera, karla, olaf, ...fillers.slice(0, 5)];
for (const p of seatPeople) {
  await ensureReg(p.id, vinyasa.id, {
    status: 'registered',
    is_waitlist: false,
    coverage_status: 'open',
    price_cents_at_booking: 1800,
    waitlist_position: null,
  });
}
const wl1 = await ensureReg(nina.id, vinyasa.id, {
  status: 'waitlist',
  is_waitlist: true,
  coverage_status: 'open',
  price_cents_at_booking: 1800,
  waitlist_position: 1,
});
const wl2 = await ensureReg(wiebke.id, vinyasa.id, {
  status: 'waitlist',
  is_waitlist: true,
  coverage_status: 'open',
  price_cents_at_booking: 1800,
  waitlist_position: 2,
});
// Eine Person nachgerückt → pending_payment (Online-Frist)
await admin
  .from('registrations')
  .update({
    status: 'pending_payment',
    is_waitlist: false,
    waitlist_position: null,
    coverage_status: 'open',
    hold_reason: 'promotion',
    hold_expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  })
  .eq('id', wl1);
void wl2;

// --- Nächste Woche: Kurse ohne Buchung ---
await ensureCourse({
  title: 'Yoga für den Rücken',
  date: berlinDate(7),
  time: '10:00:00',
  end_time: '11:00:00',
  price: 16,
  teacher: teacherB.id,
  pass_eligible: true,
});
await ensureCourse({
  title: 'Workshop Atem & Entspannung',
  date: berlinDate(8),
  time: '14:00:00',
  end_time: '16:00:00',
  price: 35,
  teacher: teacherA.id,
  pass_eligible: false,
});
await ensureCourse({
  title: 'Pilates',
  date: berlinDate(9),
  time: '17:00:00',
  end_time: '18:00:00',
  price: 15,
  teacher: teacherB.id,
  pass_eligible: true,
});

// --- Abgesagt mit Online-Zahlung → Erstattung ---
const cancelCourse = await ensureCourse({
  title: 'Abgesagt mit Erstattung',
  date: berlinDate(4),
  time: '09:00:00',
  end_time: '10:00:00',
  price: 18,
  teacher: teacherA.id,
});
{
  const { data: courseRow } = await admin
    .from('courses')
    .select('status')
    .eq('id', cancelCourse.id)
    .single();
  if (courseRow?.status !== 'canceled') {
    const regId = await ensureReg(olaf.id, cancelCourse.id, { price_cents_at_booking: 1800 });
    const { data: reg } = await admin
      .from('registrations')
      .select('coverage_status')
      .eq('id', regId)
      .single();
    if (reg?.coverage_status !== 'paid') {
      await payOnline(olaf.id, regId, 1800, 'cancel');
    }
    const cancel = await asOwner.rpc('cancel_course', {
      p_course_id: cancelCourse.id,
      p_scope: 'single',
      p_note: 'Demo Absage',
    });
    if (cancel.error || !cancel.data?.success) {
      console.warn('cancel_course', JSON.stringify(cancel.data || cancel.error));
    }
  }
}

// --- Wiebke: 5er online heute (Widerruf sichtbar) ---
{
  const { data: existing } = await admin
    .from('passes')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('member_id', wiebke.id)
    .eq('status', 'active')
    .limit(1);
  if (!existing?.length) {
    const prep = await admin.rpc('prepare_pass_online_payment', {
      p_product_id: product5,
      p_user_id: wiebke.id,
      p_immediate_use_hash: HASH_IMMEDIATE,
      p_withdrawal_info_hash: HASH_WITHDRAWAL,
    });
    if (prep.error || !prep.data?.success) {
      fail('prepare_pass Wiebke: ' + JSON.stringify(prep.data ?? prep.error));
    }
    const pi = 'pi_test_v3_wiebke_' + randomUUID().replace(/-/g, '').slice(0, 12);
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prep.data.attempt_id,
      p_provider_ref: pi,
    });
    const done = await admin.rpc('complete_online_payment', {
      p_provider_ref: pi,
      p_amount_cents: prep.data.amount_cents,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    if (done.error || !done.data?.success) {
      fail('complete pass Wiebke: ' + JSON.stringify(done.data ?? done.error));
    }
  }
}

// --- Olaf Teilerstattung 5 € von 18 € (eigener bezahlter Kurs) ---
{
  const title = 'Olaf Teilerstattung Demo';
  const kurs = await ensureCourse({
    title,
    date: berlinDate(5),
    time: '11:00:00',
    end_time: '12:00:00',
    price: 18,
    teacher: teacherA.id,
  });
  const regId = await ensureReg(olaf.id, kurs.id, { price_cents_at_booking: 1800 });
  const { data: reg } = await admin
    .from('registrations')
    .select('coverage_status')
    .eq('id', regId)
    .single();
  if (reg?.coverage_status !== 'paid') {
    await payOnline(olaf.id, regId, 1800, 'teil');
  }
  const { data: payment } = await admin
    .from('payments')
    .select('id')
    .eq('registration_id', regId)
    .is('reverses_payment_id', null)
    .gt('amount_cents', 0)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (payment) {
    const { data: existingRefunds } = await admin
      .from('payment_refunds')
      .select('id, amount_cents, status')
      .eq('payment_id', payment.id);
    const hasPartial = (existingRefunds ?? []).some((r) => r.amount_cents === 500);
    if (!hasPartial) {
      const req = await asOwner.rpc('request_payment_refund', {
        p_payment_id: payment.id,
        p_amount_cents: 500,
        p_note: 'Demo Teilerstattung',
      });
      if (req.error || req.data?.success === false) {
        console.warn('request_payment_refund', JSON.stringify(req.data || req.error));
      } else if (req.data.refund_id) {
        const rec = await admin.rpc('record_online_refund', {
          p_payment_id: payment.id,
          p_refund_ref: 're_test_v3_' + randomUUID().replace(/-/g, '').slice(0, 10),
          p_amount_cents: 500,
          p_received_at: new Date().toISOString(),
          p_refund_id: req.data.refund_id,
        });
        if (rec.error || (rec.data?.code && rec.data.code !== 'REFUNDED')) {
          console.warn('record_online_refund', JSON.stringify(rec.data || rec.error));
        }
      }
    }
  }
}

// --- Vera spät abgemeldet (L12) ---
{
  const title = 'Vera spät abgemeldet';
  const kurs = await ensureCourse({
    title,
    date: berlinDate(2),
    time: '16:00:00',
    end_time: '17:00:00',
    price: 18,
    teacher: teacherA.id,
  });
  const { data: existing } = await admin
    .from('registrations')
    .select('id, status, cancellation_timestamp')
    .eq('course_id', kurs.id)
    .eq('user_id', vera.id)
    .maybeSingle();
  if (!existing || existing.status !== 'cancelled') {
    let regId = existing?.id;
    if (!regId) {
      regId = await ensureReg(vera.id, kurs.id, {
        coverage_status: 'open',
        price_cents_at_booking: 1800,
      });
    }
    await admin
      .from('registrations')
      .update({
        cancellation_deadline: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', regId);
    const asVera = await login(url, anon, vera.email, password, SLUG);
    const un = await asVera.rpc('unregister_from_course', { p_course_id: kurs.id });
    if (un.error || !un.data?.success) {
      console.warn('vera late cancel', JSON.stringify(un.data || un.error));
      await admin
        .from('registrations')
        .update({
          status: 'cancelled',
          cancellation_timestamp: new Date().toISOString(),
          cancel_reason: 'self',
        })
        .eq('id', regId);
    }
  }
}

// Nina: nie online bezahlt → Neu-Hinweis
await admin
  .from('users')
  .update({ online_pay_hint_seen_at: null, last_booking_pay_method: null })
  .eq('id', nina.id);

const envDev = join(root, 'supabase', '.env.dev');
upsertEnvLine(envDev, 'DEMO_OWNER_EMAIL', ownerRow.email);
upsertEnvLine(envDev, 'DEMO_PASSWORT', password);
upsertEnvLine(envDev, 'DEMO_VERA_EMAIL', vera.email);
upsertEnvLine(envDev, 'DEMO_KARLA_EMAIL', karla.email);
upsertEnvLine(envDev, 'DEMO_OLAF_EMAIL', olaf.email);
upsertEnvLine(envDev, 'DEMO_NINA_EMAIL', nina.email);
upsertEnvLine(envDev, 'DEMO_WIEBKE_EMAIL', wiebke.email);
upsertEnvLine(envDev, 'DEMO_TEACHER_A_EMAIL', teacherA.email ?? '');
upsertEnvLine(envDev, 'DEMO_TEACHER_B_EMAIL', teacherB.email ?? '');

console.log('\nDemo v3 fertig (demoalpha).');
console.log(`Heute: Hatha am Nachmittag ${start.date} ${start.time}`);
console.log('  Vera vor Ort · Karla Mit Karte · Olaf online');
console.log('Gestern: Yin Yoga — Nina offen, Olaf bar, eine Person erlassen');
console.log('Morgen: Vinyasa Flow 8/8 + Warteliste (Nina pending_payment)');
console.log('Woche: Yoga für den Rücken / Workshop Atem / Pilates');
console.log('Absage: Abgesagt mit Erstattung · Wiebke 5er Widerruf · Olaf Teilerstattung');
console.log('Kartenhinweis: aus (Standard)');
console.log('Konten: Owner / Lena|Ben / Vera / Karla / Olaf / Nina / Wiebke (Passwort in supabase/.env.dev)');
