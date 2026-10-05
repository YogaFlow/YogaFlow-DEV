#!/usr/bin/env node
/**
 * UX-6 D: Demodaten Zahlstatus (nur DEV, demoalpha).
 *
 *   node scripts/dev/demo_ux6.mjs
 *
 * Heutiger Kurs (~2 h): Vera vor Ort offen, Karla Karte, Olaf online bezahlt.
 * Gestriger Kurs: Nina offen → Überfällig.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import { berlinDate, kursAnlegen, login, seedPasswort } from '../test/_helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SLUG = 'demoalpha';

function ladeEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const zeile of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
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
  .select('id')
  .eq('slug', SLUG)
  .single();
if (te || !tenant) fail('demoalpha fehlt — zuerst Seed laufen lassen');

const { data: ownerRow } = await admin
  .from('users')
  .select('id, email')
  .eq('tenant_id', tenant.id)
  .eq('role', 'owner')
  .is('archived_at', null)
  .limit(1)
  .single();
if (!ownerRow?.email) fail('Owner fehlt');

const { data: teacher } = await admin
  .from('users')
  .select('id')
  .eq('tenant_id', tenant.id)
  .in('role', ['teacher', 'owner', 'admin'])
  .is('archived_at', null)
  .limit(1)
  .single();
if (!teacher) fail('Lehrer fehlt');

async function memberByEmail(email) {
  const { data, error } = await admin
    .from('users')
    .select('id, email, first_name, last_name')
    .eq('tenant_id', tenant.id)
    .eq('email', email)
    .maybeSingle();
  if (error || !data) fail(`Person ${email} fehlt`);
  return data;
}

const vera = await memberByEmail('juliusbne+vera@gmail.com');
const karla = await memberByEmail('juliusbne+karla@gmail.com');
const olaf = await memberByEmail('juliusbne+olaf@gmail.com');
const nina = await memberByEmail('juliusbne+nina@gmail.com');

const asOwner = await login(url, anon, ownerRow.email, password, SLUG);

const start = berlinParts(2 * 60 * 60 * 1000);
const endTime = addMinutesToTime(start.time, 60);
const todayTitle = 'UX6 Heute Zahlstatus';

let { data: todayCourse } = await admin
  .from('courses')
  .select('id')
  .eq('tenant_id', tenant.id)
  .eq('title', todayTitle)
  .eq('date', start.date)
  .maybeSingle();

if (!todayCourse) {
  todayCourse = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: todayTitle,
    date: start.date,
    time: start.time,
    end_time: endTime,
    price: 18,
    pass_eligible: true,
    description: 'UX-6 Demo: Zahlt vor Ort / Bezahlt / Karte',
  });
} else {
  await admin
    .from('courses')
    .update({ time: start.time, end_time: endTime })
    .eq('id', todayCourse.id);
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
      tenant_id: tenant.id,
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

const veraReg = await ensureReg(vera.id, todayCourse.id, { coverage_status: 'open' });
await ensureReg(karla.id, todayCourse.id); // pass below
const olafReg = await ensureReg(olaf.id, todayCourse.id);

// Karla: Karte — vorhandene Pass-Einlösung oder open lassen wenn keine Karte
{
  const { data: passes } = await admin
    .from('passes')
    .select('id, remaining')
    .eq('user_id', karla.id)
    .eq('tenant_id', tenant.id)
    .gt('remaining', 0)
    .limit(1);
  if (passes?.[0]) {
    const apply = await asOwner.rpc('apply_pass_to_registration', {
      p_registration_id: await ensureReg(karla.id, todayCourse.id),
    });
    if (apply.error) {
      console.warn('Karla Pass:', apply.error.message);
    }
  } else {
    console.warn('Karla hat keine Karte — bleibt offen (Seed v2 für Pass nutzen)');
  }
}

// Olaf: online bezahlt vermerken (manuell card, falls noch open)
{
  const { data: reg } = await admin
    .from('registrations')
    .select('id, coverage_status')
    .eq('id', olafReg)
    .single();
  if (reg?.coverage_status === 'open') {
    const pay = await asOwner.rpc('record_manual_payment', {
      p_registration_id: olafReg,
      p_method: 'cash',
      p_amount_cents: 1800,
    });
    // Demo: Methode online simulieren — card geht nicht über record_manual; cash dann UI „bar“.
    // Für „Bezahlt · online“ braucht es Stripe-Payment. Stattdessen: Coverage paid via card payment insert? Skip — set method visually via paid cash then note.
    if (pay.error || !pay.data?.success) {
      console.warn('Olaf Zahlung:', pay.error?.message || pay.data);
    } else {
      // Update payment method to card for display (service role)
      const { data: payment } = await admin
        .from('payments')
        .select('id')
        .eq('registration_id', olafReg)
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (payment) {
        await admin.from('payments').update({ method: 'card' }).eq('id', payment.id);
      }
    }
  }
}

void veraReg;

// Gestern: Nina offen
const yesterdayTitle = 'UX6 Gestern Offen';
const yesterday = berlinDate(-1);
let { data: pastCourse } = await admin
  .from('courses')
  .select('id')
  .eq('tenant_id', tenant.id)
  .eq('title', yesterdayTitle)
  .maybeSingle();

if (!pastCourse) {
  pastCourse = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: yesterdayTitle,
    date: berlinDate(1),
    time: '10:00:00',
    end_time: '11:00:00',
    price: 16,
  });
  await ensureReg(nina.id, pastCourse.id, { coverage_status: 'open' });
  await admin.from('courses').update({ date: yesterday }).eq('id', pastCourse.id);
} else {
  await admin.from('courses').update({ date: berlinDate(1) }).eq('id', pastCourse.id);
  await ensureReg(nina.id, pastCourse.id, { coverage_status: 'open' });
  await admin.from('courses').update({ date: yesterday }).eq('id', pastCourse.id);
}

console.log('\nUX-6 Demo fertig (demoalpha).');
console.log(`Heute: ${todayTitle} ${start.date} ${start.time} — Vera offen, Karla Karte?, Olaf bezahlt`);
console.log(`Gestern: ${yesterdayTitle} — Nina offen`);
console.log('Konten: Julius Owner / Vera / Karla / Olaf / Nina (Passwort in supabase/.env.dev)');
