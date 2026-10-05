#!/usr/bin/env node
/**
 * UX-6 / Nachtrag UX-6-2: Demodaten Zahlstatus (nur DEV, demoalpha).
 *
 *   node scripts/dev/demo_ux6.mjs
 *
 * Heutiger Kurs „Hatha am Nachmittag“ (~2 h): Vera vor Ort offen, Karla offen mit gültiger Karte,
 * Olaf online bezahlt (prepare/complete Testzahlung). Gestern: Nina offen → Überfällig.
 */
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import { berlinDate, kursAnlegen, login, seedPasswort } from '../test/_helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SLUG = 'demoalpha';
const TODAY_TITLE = 'Hatha am Nachmittag';
const TODAY_TITLE_LEGACY = 'UX6 Heute Zahlstatus';
const YESTERDAY_TITLE = 'UX6 Gestern Offen';

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

let { data: todayCourse } = await admin
  .from('courses')
  .select('id, title')
  .eq('tenant_id', tenant.id)
  .in('title', [TODAY_TITLE, TODAY_TITLE_LEGACY])
  .eq('date', start.date)
  .maybeSingle();

if (!todayCourse) {
  // Fallback: Legacy-Kurs an anderem Datum umbenennen
  const { data: legacy } = await admin
    .from('courses')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('title', TODAY_TITLE_LEGACY)
    .maybeSingle();
  if (legacy) {
    await admin
      .from('courses')
      .update({
        title: TODAY_TITLE,
        date: start.date,
        time: start.time,
        end_time: endTime,
        price: 18,
        pass_eligible: true,
      })
      .eq('id', legacy.id);
    todayCourse = { id: legacy.id, title: TODAY_TITLE };
  }
}

if (!todayCourse) {
  todayCourse = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: TODAY_TITLE,
    date: start.date,
    time: start.time,
    end_time: endTime,
    price: 18,
    pass_eligible: true,
    description: 'UX-6 Demo: Zahlt vor Ort / Bezahlt · online / Mit Karte',
  });
} else {
  await admin
    .from('courses')
    .update({
      title: TODAY_TITLE,
      time: start.time,
      end_time: endTime,
      price: 18,
      pass_eligible: true,
    })
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
      price_cents_at_booking: 1800,
      ...patch,
    })
    .select('id')
    .single();
  if (error) fail('reg: ' + error.message);
  return inserted.id;
}

/** Online-Testzahlung wie s3_1 (prepare/complete, Test-pi_). */
async function payOnline(userId, registrationId, amountCents) {
  const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
  if (on.error || !on.data?.success) {
    console.warn('online enable:', on.error?.message || on.data);
  }
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
  const pi = 'pi_test_ux6_' + randomUUID().replace(/-/g, '').slice(0, 16);
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
}

await ensureReg(vera.id, todayCourse.id, { coverage_status: 'open', price_cents_at_booking: 1800 });
const karlaReg = await ensureReg(karla.id, todayCourse.id, {
  coverage_status: 'open',
  price_cents_at_booking: 1800,
});
const olafReg = await ensureReg(olaf.id, todayCourse.id, { price_cents_at_booking: 1800 });

// Karla: gültige Karte behalten, Buchung bleibt offen (zeigt „Mit Karte“)
{
  const { data: passes } = await admin
    .from('passes')
    .select('id, remaining, name')
    .eq('member_id', karla.id)
    .eq('tenant_id', tenant.id)
    .gt('remaining', 0)
    .limit(1);
  if (!passes?.[0]) {
    const { data: products } = await admin
      .from('pass_products')
      .select('id')
      .eq('tenant_id', tenant.id)
      .eq('name', '10er-Karte')
      .limit(1);
    let productId = products?.[0]?.id;
    if (!productId) {
      const created = await asOwner.rpc('create_pass_product', {
        p_name: '10er-Karte',
        p_units: 10,
        p_price_cents: 12000,
        p_validity_rule: 'months',
        p_validity_value: 12,
        p_description: null,
        p_online_purchasable: true,
      });
      if (created.error || !created.data?.success) {
        fail('create_pass_product: ' + JSON.stringify(created.data ?? created.error));
      }
      productId = created.data.id;
    }
    const sell = await asOwner.rpc('sell_pass', {
      p_member_id: karla.id,
      p_product_id: productId,
      p_method: 'cash',
    });
    if (sell.error || !sell.data?.success) fail('sell_pass Karla: ' + JSON.stringify(sell.data ?? sell.error));
  }
  // Falls früher eingelöst: zurücksetzen auf open
  const { data: karlaRow } = await admin
    .from('registrations')
    .select('coverage_status, pass_id')
    .eq('id', karlaReg)
    .single();
  if (karlaRow?.coverage_status === 'pass') {
    const undo = await asOwner.rpc('undo_pass_redemption', { p_registration_id: karlaReg });
    if (undo.error || !undo.data?.success) {
      console.warn('Karla Pass zurücknehmen:', undo.error?.message || undo.data);
      await admin
        .from('registrations')
        .update({ coverage_status: 'open', pass_id: null })
        .eq('id', karlaReg);
    }
  } else if (karlaRow?.coverage_status !== 'open') {
    await admin.from('registrations').update({ coverage_status: 'open' }).eq('id', karlaReg);
  }
}

// Olaf: online bezahlt (prepare/complete — Testzahlung wie s3_1)
{
  const { data: reg } = await admin
    .from('registrations')
    .select('id, coverage_status')
    .eq('id', olafReg)
    .single();
  if (reg?.coverage_status !== 'paid') {
    if (reg?.coverage_status === 'pass') {
      await asOwner.rpc('undo_pass_redemption', { p_registration_id: olafReg });
    }
    const { data: oldPays } = await admin
      .from('payments')
      .select('id')
      .eq('registration_id', olafReg);
    for (const pay of oldPays ?? []) {
      await admin.from('payments').delete().eq('id', pay.id);
    }
    await admin
      .from('registrations')
      .update({ coverage_status: 'open', pass_id: null })
      .eq('id', olafReg);
    await payOnline(olaf.id, olafReg, 1800);
  } else {
    // Sicherstellen, dass Methode card/online ist (nicht bar aus altem Demo)
    const { data: payment } = await admin
      .from('payments')
      .select('id, method')
      .eq('registration_id', olafReg)
      .is('reverses_payment_id', null)
      .gt('amount_cents', 0)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (payment && payment.method !== 'card') {
      for (const pay of (
        await admin.from('payments').select('id').eq('registration_id', olafReg)
      ).data ?? []) {
        await admin.from('payments').delete().eq('id', pay.id);
      }
      await admin
        .from('registrations')
        .update({ coverage_status: 'open', pass_id: null })
        .eq('id', olafReg);
      await payOnline(olaf.id, olafReg, 1800);
    }
  }
}

// Gestern: Nina offen
const yesterday = berlinDate(-1);
let { data: pastCourse } = await admin
  .from('courses')
  .select('id')
  .eq('tenant_id', tenant.id)
  .eq('title', YESTERDAY_TITLE)
  .maybeSingle();

if (!pastCourse) {
  pastCourse = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: YESTERDAY_TITLE,
    date: berlinDate(1),
    time: '10:00:00',
    end_time: '11:00:00',
    price: 16,
  });
  await ensureReg(nina.id, pastCourse.id, { coverage_status: 'open', price_cents_at_booking: 1600 });
  await admin.from('courses').update({ date: yesterday }).eq('id', pastCourse.id);
} else {
  await admin.from('courses').update({ date: berlinDate(1) }).eq('id', pastCourse.id);
  await ensureReg(nina.id, pastCourse.id, { coverage_status: 'open', price_cents_at_booking: 1600 });
  await admin.from('courses').update({ date: yesterday }).eq('id', pastCourse.id);
}

console.log('\nUX-6 Demo fertig (demoalpha).');
console.log(`Heute: ${TODAY_TITLE} ${start.date} ${start.time}`);
console.log('  Vera: Zahlt vor Ort · Karla: Zahlt vor Ort + Mit Karte · Olaf: Bezahlt · online');
console.log(`Gestern: ${YESTERDAY_TITLE} — Nina offen`);
console.log('Konten: Julius Owner / Vera / Karla / Olaf / Nina (Passwort in supabase/.env.dev)');
