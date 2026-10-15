#!/usr/bin/env node
/**
 * UX-5 C3: Demodaten v2 für demoalpha (idempotent, nur DEV).
 *
 *   npm run dev:demo:seed -- demoalpha
 *
 * Legt 6 kommende Kurse, 2 Lehrende (falls nötig) und Vera/Karla/Olaf/Nina an.
 * Zugangsdaten nur in supabase/.env.dev (nie committen).
 */
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
const PASS = seedPasswort();

function ladeEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const zeile of readFileSync(path, 'utf8').split(/\r*\n/)) {
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

assertDevGuard();
const slugArg = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== '--');
if (slugArg && slugArg !== SLUG) fail(`Nur ${SLUG}`);

const env = { ...ladeEnv(join(root, '.env')), ...ladeEnv(join(root, 'supabase', '.env.dev')) };
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.includes(ERLAUBTE_DEV_REF) || !anon || !service) fail('DEV-Env unvollständig');

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: tenant, error: te } = await admin
  .from('tenants')
  .select('id')
  .eq('slug', SLUG)
  .single();
if (te || !tenant) fail('demoalpha fehlt');
const tenantId = tenant.id;

const { data: ownerRow } = await admin
  .from('users')
  .select('id, email')
  .eq('tenant_id', tenantId)
  .eq('role', 'owner')
  .is('archived_at', null)
  .limit(1)
  .single();
if (!ownerRow) fail('Owner fehlt');

async function ensureMember({ email, vorname, nachname, rolle }) {
  const { data: existing } = await admin
    .from('users')
    .select('id, email, role')
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
    password: PASS,
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

const kursDefs = [
  {
    key: 'hatha',
    title: 'Hatha am Morgen',
    date: berlinDate(2),
    time: '08:00:00',
    end_time: '09:00:00',
    price: 14,
    teacher: teacherA.id,
  },
  {
    key: 'vinyasa',
    title: 'Vinyasa Flow',
    date: berlinDate(3),
    time: '18:30:00',
    end_time: '19:30:00',
    price: 18,
    teacher: teacherA.id,
  },
  {
    key: 'yin',
    title: 'Yin Yoga',
    date: berlinDate(5),
    time: '20:00:00',
    end_time: '21:15:00',
    price: 16,
    teacher: teacherB.id,
  },
  {
    key: 'ruecken',
    title: 'Yoga für Rücken',
    date: berlinDate(7),
    time: '10:00:00',
    end_time: '11:00:00',
    price: 16,
    teacher: teacherB.id,
  },
  {
    key: 'atem',
    title: 'Workshop Atem & Entspannung',
    date: berlinDate(10),
    time: '14:00:00',
    end_time: '16:00:00',
    price: 35,
    teacher: teacherA.id,
    pass_eligible: false,
  },
  {
    key: 'pilates',
    title: 'Pilates',
    date: berlinDate(12),
    time: '17:00:00',
    end_time: '18:00:00',
    price: 15,
    teacher: teacherB.id,
  },
];

const createdCourses = [];
for (const def of kursDefs) {
  const { data: existing } = await admin
    .from('courses')
    .select('id, title')
    .eq('tenant_id', tenantId)
    .eq('title', def.title)
    .eq('date', def.date)
    .is('archived_at', null)
    .maybeSingle();
  if (existing) {
    createdCourses.push(existing);
    continue;
  }
  const kurs = await kursAnlegen(admin, tenantId, def.teacher, {
    title: def.title,
    date: def.date,
    time: def.time,
    end_time: def.end_time,
    price: def.price,
    pass_eligible: def.pass_eligible ?? true,
    description: `${def.title} — Demokurs für Klicktests.`,
  });
  createdCourses.push(kurs);
}

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

const asOwner = await login(url, anon, ownerRow.email, PASS, SLUG);

async function pastPaidOnsite(member, titleSuffix, dayOffset) {
  const title = `Vergangenheit ${titleSuffix}`;
  let { data: kurs } = await admin
    .from('courses')
    .select('id, date')
    .eq('tenant_id', tenantId)
    .eq('title', title)
    .maybeSingle();
  if (!kurs) {
    // Erst zukünftig anlegen (Trigger), nach Zahlung zurückdatieren.
    kurs = await kursAnlegen(admin, tenantId, teacherA.id, {
      title,
      date: berlinDate(1),
      time: '10:00:00',
      end_time: '11:00:00',
      price: 16,
    });
  }
  const { data: existingReg } = await admin
    .from('registrations')
    .select('id, coverage_status')
    .eq('course_id', kurs.id)
    .eq('user_id', member.id)
    .maybeSingle();
  if (existingReg?.coverage_status === 'paid') {
    await admin.from('courses').update({ date: berlinDate(dayOffset) }).eq('id', kurs.id);
    return;
  }
  // Trigger prevent_past_course_registration: kurz in die Zukunft stellen
  await admin.from('courses').update({ date: berlinDate(1) }).eq('id', kurs.id);
  let regId = existingReg?.id;
  if (!regId) {
    const { data: inserted, error } = await admin
      .from('registrations')
      .insert({
        tenant_id: tenantId,
        course_id: kurs.id,
        user_id: member.id,
        status: 'registered',
        is_waitlist: false,
        coverage_status: 'open',
      })
      .select('id')
      .single();
    if (error) fail('past reg: ' + error.message);
    regId = inserted.id;
  }
  const pay = await asOwner.rpc('record_manual_payment', {
    p_registration_id: regId,
    p_method: 'cash',
    p_amount_cents: 1600,
  });
  if (pay.error || !pay.data?.success) {
    console.warn('record_manual_payment', member.email, pay.error?.message || pay.data);
  }
  const { error: backdate } = await admin
    .from('courses')
    .update({ date: berlinDate(dayOffset) })
    .eq('id', kurs.id);
  if (backdate) console.warn('backdate', backdate.message);
}

// Vera: 3 vergangene vor Ort
await pastPaidOnsite(vera, 'Vera 1', -14);
await pastPaidOnsite(vera, 'Vera 2', -10);
await pastPaidOnsite(vera, 'Vera 3', -7);
// Z8: Vera sieht den Neu-Hinweis trotz Vor-Ort-Standard (last = onsite, hint_seen leer)
await admin
  .from('users')
  .update({ online_pay_hint_seen_at: null, last_booking_pay_method: 'onsite' })
  .eq('id', vera.id);

// Olaf: 2 vergangene (Zahlungen über Kasse; Online-Live separat)
await pastPaidOnsite(olaf, 'Olaf 1', -12);
await pastPaidOnsite(olaf, 'Olaf 2', -8);
await admin
  .from('users')
  .update({ last_booking_pay_method: 'online', online_pay_hint_seen_at: new Date().toISOString() })
  .eq('id', olaf.id);

// K1: 5er 65 € und 10er 120 € online kaufbar, 12 Monate (Karla behält ihre Karte)
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
  const upd = await asOwner.rpc('update_pass_product', {
    p_id: productId,
    p_name: name,
    p_units: units,
    p_price_cents: priceCents,
    p_validity_rule: 'months',
    p_validity_value: 12,
    p_description: null,
    p_online_purchasable: true,
  });
  if (upd.error || !upd.data?.success) {
    console.warn('pass product update warn:', JSON.stringify(upd.data || upd.error));
  }
  return productId;
}

await ensureOnlinePassProduct('5er-Karte', 5, 6500);

// Karla: 10er-Karte, noch 6
{
  const productId = await ensureOnlinePassProduct('10er-Karte', 10, 12000);

  const { data: karlaPasses } = await admin
    .from('passes')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('member_id', karla.id)
    .eq('status', 'active');
  let passId = karlaPasses?.[0]?.id;
  if (!passId) {
    const sell = await asOwner.rpc('sell_pass', {
      p_member_id: karla.id,
      p_product_id: productId,
      p_method: 'cash',
    });
    if (sell.error || !sell.data?.success) fail('sell_pass: ' + JSON.stringify(sell));
    passId = sell.data.pass_id ?? sell.data.id;
  }

  const { data: moves } = await admin.from('pass_movements').select('delta').eq('pass_id', passId);
  const sum = (moves ?? []).reduce((a, m) => a + (m.delta ?? 0), 0);
  const need = Math.max(0, sum - 6);
  for (let i = 0; i < need; i++) {
    const title = `Karla Einheit ${i + 1}`;
    let { data: kurs } = await admin
      .from('courses')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('title', title)
      .maybeSingle();
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
    const redeem = await asOwner.rpc('apply_pass_to_registration', {
      p_registration_id: regId,
    });
    if (redeem.error || redeem.data?.success === false) {
      console.warn('apply_pass', redeem.error?.message || redeem.data);
    }
    await admin.from('courses').update({ date: berlinDate(-(20 + i)) }).eq('id', kurs.id);
  }
}

const envDev = join(root, 'supabase', '.env.dev');
upsertEnvLine(envDev, 'DEMO_OWNER_EMAIL', ownerRow.email);
upsertEnvLine(envDev, 'DEMO_PASSWORT', PASS);
upsertEnvLine(envDev, 'DEMO_VERA_EMAIL', vera.email);
upsertEnvLine(envDev, 'DEMO_KARLA_EMAIL', karla.email);
upsertEnvLine(envDev, 'DEMO_OLAF_EMAIL', olaf.email);
upsertEnvLine(envDev, 'DEMO_NINA_EMAIL', nina.email);
upsertEnvLine(envDev, 'DEMO_TEACHER_A_EMAIL', teacherA.email ?? '');
upsertEnvLine(envDev, 'DEMO_TEACHER_B_EMAIL', teacherB.email ?? '');

console.log('\nSeed v2 fertig (demoalpha).');
console.log('Kurse:', createdCourses.map((c) => c.title || c.id).join(', '));
console.log('Personen: Vera Vorort, Karla Karte, Olaf Online, Nina Neu (Passwort in supabase/.env.dev)');
console.log('Lehrende:', teacherA.first_name || teacherA.email, '/', teacherB.first_name || teacherB.email);
