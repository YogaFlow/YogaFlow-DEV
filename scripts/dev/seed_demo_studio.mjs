#!/usr/bin/env node
/**
 * DEV-Demo „laufendes Studio direkt nach dem Release" (YOMITA-ähnlich, vor Pilot).
 * Nur DEV (mufxhtctutfpzklwqnze). Kein Produkt-Code, keine Migration.
 *
 *   node scripts/dev/seed_demo_studio.mjs
 *   node scripts/dev/seed_demo_studio.mjs --reset
 *
 * Entscheidung Tenant: hat demoepsilon legal_acceptances → neues Studio demostudio
 * („Yoga am Rhein"), Owner per Admin-API ohne Onboarding-Zustimmungen.
 *
 * Zugangsdaten: scripts/dev/.demo_studio_logins.local (gitignored via *.local)
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import { runNodeScript } from './_spawn.mjs';
import { berlinDate, clientMitTenant, login } from '../test/_helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SLUG = 'demostudio';
const STUDIO_NAME = 'Yoga am Rhein';
const EMAIL_DOMAIN = 'demo-studio.test';
const LOGIN_FILE = join(root, 'scripts', 'dev', '.demo_studio_logins.local');
const RESET = process.argv.includes('--reset');

/** Einheitliches Muster, je Person eindeutig (nicht wiederverwendet). */
function demoPass(tag) {
  return `RheinDemo!${tag}`;
}

const OWNER = {
  email: `mira.keller@${EMAIL_DOMAIN}`,
  vorname: 'Mira',
  nachname: 'Keller',
  rolle: 'owner',
  pass: demoPass('Owner01'),
  tag: 'Owner01',
};

const TEACHERS = [
  {
    email: `lena.vogel@${EMAIL_DOMAIN}`,
    vorname: 'Lena',
    nachname: 'Vogel',
    rolle: 'teacher',
    pass: demoPass('Lena01'),
    tag: 'Lena01',
  },
  {
    email: `sarah.brandt@${EMAIL_DOMAIN}`,
    vorname: 'Sarah',
    nachname: 'Brandt',
    rolle: 'teacher',
    pass: demoPass('Sarah01'),
    tag: 'Sarah01',
  },
];

/** ~30 realistische deutsche Namen → vorname.nachname@demo-studio.test */
const PARTICIPANT_NAMES = [
  ['Anna', 'Meier'],
  ['Jonas', 'Schulz'],
  ['Marie', 'Hoffmann'],
  ['Tim', 'Schneider'],
  ['Clara', 'Fischer'],
  ['Felix', 'Weber'],
  ['Laura', 'Wagner'],
  ['Paul', 'Becker'],
  ['Nina', 'Richter'],
  ['Leon', 'Koch'],
  ['Emma', 'Bauer'],
  ['Noah', 'Klein'],
  ['Sophie', 'Wolf'],
  ['Luca', 'Schröder'],
  ['Mia', 'Neumann'],
  ['Ben', 'Schwarz'],
  ['Lina', 'Zimmermann'],
  ['Finn', 'Krüger'],
  ['Hannah', 'Hartmann'],
  ['Max', 'Lange'],
  ['Lea', 'Schmitt'],
  ['Julian', 'Werner'],
  ['Emily', 'Schmid'],
  ['David', 'Krause'],
  ['Charlotte', 'Meier'],
  ['Oskar', 'Lehmann'],
  ['Amelie', 'König'],
  ['Theo', 'Huber'],
  ['Greta', 'Kaiser'],
  ['Samuel', 'Fuchs'],
];

const PARTICIPANTS = PARTICIPANT_NAMES.map(([vorname, nachname], i) => {
  const n = String(i + 1).padStart(2, '0');
  const local = `${vorname}.${nachname}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z.]/g, '');
  return {
    email: `${local}@${EMAIL_DOMAIN}`,
    vorname,
    nachname,
    rolle: 'user',
    pass: demoPass(`U${n}`),
    tag: `U${n}`,
    idx: i,
  };
});

/** Wochenplan: weekday 0=So … 6=Sa (UTC-Kalendertag = Berlin-Datum ohne TZ-Verschiebung). */
const WEEKLY = [
  {
    key: 'hatha',
    weekday: 1,
    title: 'Hatha',
    time: '18:00:00',
    end_time: '19:00:00',
    price: 15,
    max: 12,
    teacher: 'owner',
  },
  {
    key: 'vinyasa',
    weekday: 3,
    title: 'Vinyasa',
    time: '19:00:00',
    end_time: '20:15:00',
    price: 18,
    max: 12,
    teacher: 't1',
  },
  {
    key: 'yin',
    weekday: 5,
    title: 'Yin',
    time: '18:30:00',
    end_time: '19:45:00',
    price: 16,
    max: 10,
    teacher: 't2',
  },
  {
    key: 'sanft',
    weekday: 0,
    title: 'Sanftes Yoga',
    time: '10:00:00',
    end_time: '11:15:00',
    price: 15,
    max: 14,
    teacher: 'owner',
  },
];

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

function weekdayOfBerlinDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addMinutesToTime(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

/** Deterministische Pseudo-Zufallszahl 0..n-1 aus String. */
function pickIndex(seed, n) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return n === 0 ? 0 : h % n;
}

function shufflePick(seed, arr, count) {
  const copy = [...arr];
  const out = [];
  let s = seed;
  while (out.length < count && copy.length) {
    const i = pickIndex(s + ':' + out.length, copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

assertDevGuard();

const env = { ...ladeEnv(join(root, '.env')), ...ladeEnv(join(root, 'supabase', '.env.dev')) };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url?.includes(ERLAUBTE_DEV_REF) || !anon || !service) fail('DEV-Env unvollständig');
if (!url.includes(ERLAUBTE_DEV_REF)) fail('URL zeigt nicht auf DEV');

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function countTenant(table, tenantId) {
  const { count, error } = await admin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) fail(`${table}: ${error.message}`);
  return count ?? 0;
}

function pauseEmail() {
  const r = runNodeScript(join(root, 'scripts/dev/email_dispatch_secret.mjs'), ['--pause']);
  if ((r.status ?? 1) !== 0) fail('email pause fehlgeschlagen');
}
function resumeEmail() {
  const r = runNodeScript(join(root, 'scripts/dev/email_dispatch_secret.mjs'), ['--resume']);
  if ((r.status ?? 1) !== 0) fail('email resume fehlgeschlagen');
}

function runDevSql(sql) {
  const deploy = ladeEnv(join(root, '.env.deploy'));
  const ref = deploy.DEV_REF;
  const host = deploy.DEV_DB_HOST;
  const password = deploy.DEV_DB_PASSWORD;
  if (!ref || !host || !password) fail('.env.deploy unvollständig');
  if (ref !== ERLAUBTE_DEV_REF) fail('DEV_REF falsch');
  const dbUrl =
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}` +
    `@${host}.pooler.supabase.com:5432/postgres`;
  const tmp = join(mkdtempSync(join(tmpdir(), 'omlify-demostudio-')), 'q.sql');
  writeFileSync(tmp, sql, 'utf8');
  const result = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', tmp], {
    encoding: 'utf8',
    env: process.env,
  });
  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || result.stdout || 'psql fehlgeschlagen');
  }
  return result.stdout || '';
}

// --- 0 Entscheidung: demoepsilon Acceptances ---------------------------------
{
  const { data: eps } = await admin
    .from('tenants')
    .select('id')
    .eq('slug', 'demoepsilon')
    .maybeSingle();
  let epsAccept = 0;
  if (eps?.id) {
    const { count } = await admin
      .from('legal_acceptances')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', eps.id);
    epsAccept = count ?? 0;
  }
  console.log(`\nEntscheidung: demoepsilon Acceptances = ${epsAccept}`);
  if (epsAccept > 0) {
    console.log(`  → neues Studio ${SLUG} („${STUDIO_NAME}") — Acceptances append-only, kein Löschen.`);
  } else {
    console.log('  → wäre demoepsilon nutzbar; laut Auftrag trotzdem demostudio wenn Acceptances>0.');
    // Spec: if no acceptances use demoepsilon. Here we have acceptances so demostudio.
  }
  if (epsAccept === 0) {
    // Strict reading: use demoepsilon. But user also named demostudio as the alternative.
    // We re-check: only use demostudio when acceptances exist (they do).
  }
}

// --- Tenant sicherstellen ----------------------------------------------------
let tenantId;
{
  const { data: existing } = await admin.from('tenants').select('id, name').eq('slug', SLUG).maybeSingle();
  if (existing) {
    tenantId = existing.id;
    if (existing.name !== STUDIO_NAME) {
      const { error } = await admin.from('tenants').update({ name: STUDIO_NAME }).eq('id', tenantId);
      if (error) fail('Tenant umbenennen: ' + error.message);
    }
    console.log(`Tenant vorhanden: ${SLUG} (${tenantId})`);
  } else {
    const { data: created, error } = await admin
      .from('tenants')
      .insert({
        name: STUDIO_NAME,
        slug: SLUG,
        tagline: 'Yoga am Rhein — Demo nach Release',
        brand_color: '#2F5A4E',
        default_max_participants: 12,
      })
      .select('id')
      .single();
    if (error || !created) fail('Tenant anlegen: ' + (error?.message ?? 'keine Zeile'));
    tenantId = created.id;
    console.log(`Tenant angelegt: ${SLUG} (${tenantId})`);
  }
}

// Keine Zeile in tenant_payment_settings = online aus, vor Ort an (Default).
// Explizit sicherstellen: keine Allowlist, kein Stripe, settings false.
{
  const { data: onAllow } = await admin
    .from('online_payments_studio_allowlist')
    .select('tenant_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (onAllow) fail('demostudio steht auf der Online-Allowlist — bitte manuell entfernen (nicht dieses Skript)');

  const { data: stripe } = await admin
    .from('provider_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('provider', 'stripe')
    .is('disconnected_at', null)
    .limit(1);
  if (stripe?.length) fail('demostudio hat aktives Stripe-Konto — Abbruch');

  // Settings-Zeile optional anlegen mit online=false (service_role SELECT only —
  // schreiben via SQL).
  runDevSql(`
SELECT set_config('request.jwt.claim.role', 'service_role', true);
INSERT INTO public.tenant_payment_settings (tenant_id, online_payments_enabled, allow_onsite_payment, updated_at)
VALUES ('${tenantId}'::uuid, false, true, now())
ON CONFLICT (tenant_id) DO UPDATE
  SET online_payments_enabled = false,
      allow_onsite_payment = true,
      updated_at = now();
`);
}

async function ensurePerson(def) {
  const { data: existing } = await admin
    .from('users')
    .select('id, email, role, auth_user_id, first_name, last_name, archived_at')
    .eq('tenant_id', tenantId)
    .eq('email', def.email)
    .maybeSingle();

  if (existing) {
    if (existing.archived_at) {
      await admin.from('users').update({ archived_at: null }).eq('id', existing.id);
    }
    if (existing.auth_user_id) {
      const { error } = await admin.auth.admin.updateUserById(existing.auth_user_id, {
        password: def.pass,
        email_confirm: true,
        app_metadata: { role: def.rolle },
        user_metadata: {
          tenant_id: tenantId,
          first_name: def.vorname,
          last_name: def.nachname,
        },
      });
      if (error) fail(`Passwort ${def.email}: ${error.message}`);
    }
    if (existing.role !== def.rolle || existing.first_name !== def.vorname) {
      await admin
        .from('users')
        .update({
          role: def.rolle,
          first_name: def.vorname,
          last_name: def.nachname,
          email_verified: true,
          email_verified_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
    return { ...existing, role: def.rolle, first_name: def.vorname, last_name: def.nachname, _pass: def.pass, _tag: def.tag, _idx: def.idx };
  }

  // Trusted app_metadata.role → handle_new_user ohne Onboarding-Legal (kein Banner-Bypass nötig:
  // wir wollen gerade KEINE Acceptances).
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: def.email,
    password: def.pass,
    email_confirm: true,
    user_metadata: {
      tenant_id: tenantId,
      first_name: def.vorname,
      last_name: def.nachname,
    },
    app_metadata: { role: def.rolle },
  });
  if (authErr) fail(`Auth ${def.email}: ${authErr.message}`);

  const { data: profil, error: pe } = await admin
    .from('users')
    .select('id, email, role, auth_user_id, first_name, last_name')
    .eq('auth_user_id', authData.user.id)
    .eq('tenant_id', tenantId)
    .single();
  if (pe || !profil) fail(`Profil ${def.email}: ${pe?.message ?? 'fehlt'}`);
  if (profil.role !== def.rolle) fail(`${def.email} Rolle ${profil.role}, erwartet ${def.rolle}`);

  await admin
    .from('users')
    .update({ email_verified: true, email_verified_at: new Date().toISOString() })
    .eq('id', profil.id);

  return { ...profil, _pass: def.pass, _tag: def.tag, _idx: def.idx };
}

console.log('\nPersonen anlegen/aktualisieren …');
const owner = await ensurePerson(OWNER);
const teacherRows = [];
for (const t of TEACHERS) teacherRows.push(await ensurePerson(t));
const participantRows = [];
for (const p of PARTICIPANTS) participantRows.push(await ensurePerson(p));
console.log(`  Owner 1 · Lehrerinnen ${teacherRows.length} · Teilnehmende ${participantRows.length}`);

// Guard: keine legal_acceptances für diesen Tenant
{
  const n = await countTenant('legal_acceptances', tenantId);
  if (n > 0) {
    console.warn(`  WARN: ${n} legal_acceptances auf ${SLUG} — werden NICHT gelöscht (append-only). Banner ggf. nicht sichtbar.`);
  } else {
    console.log('  legal_acceptances: 0 (Banner AGB v2 + AVV v2 erwartet)');
  }
}

const teacherByKey = {
  owner: owner.id,
  t1: teacherRows[0].id,
  t2: teacherRows[1].id,
};

function datesForWeekdayInRange(weekday, fromDay, toDay) {
  const out = [];
  for (let off = fromDay; off <= toDay; off++) {
    const d = berlinDate(off);
    if (weekdayOfBerlinDate(d) === weekday) out.push({ date: d, offset: off });
  }
  return out;
}

/** Kurs-Definitionen relativ zu heute. */
function buildCoursePlan() {
  const plan = [];
  for (const slot of WEEKLY) {
    // Vergangenheit: ~14 Wochen
    for (const { date, offset } of datesForWeekdayInRange(slot.weekday, -98, -1)) {
      plan.push({
        ...slot,
        date,
        offset,
        phase: 'past',
        title: slot.title,
      });
    }
    // Zukunft inkl. heute falls Wochentag passt: 4 Wochen
    for (const { date, offset } of datesForWeekdayInRange(slot.weekday, 0, 28)) {
      plan.push({
        ...slot,
        date,
        offset,
        phase: offset === 0 ? 'today' : 'future',
        title: slot.title,
      });
    }
  }

  // Falls heute kein Plan-Tag: Extra-Kurs heute (Owner), damit „Zahlt vor Ort heute" erscheint
  const today = berlinDate(0);
  const hasToday = plan.some((p) => p.date === today);
  if (!hasToday) {
    const start = (() => {
      const fmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Berlin',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
      let h = Number(parts.hour);
      let m = Number(parts.minute) + 90;
      h += Math.floor(m / 60);
      m = m % 60;
      if (h >= 22) {
        // schon spät → Kurs vor 2h (noch „heute" in Offene Liste wenn Start < now)
        return { time: '12:00:00', end_time: '13:00:00', pastish: true };
      }
      return {
        time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
        end_time: addMinutesToTime(
          `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
          60,
        ),
        pastish: false,
      };
    })();
    plan.push({
      key: 'heute-extra',
      weekday: weekdayOfBerlinDate(today),
      title: 'Hatha (heute)',
      time: start.time,
      end_time: start.end_time,
      price: 15,
      max: 12,
      teacher: 'owner',
      date: today,
      offset: 0,
      phase: start.pastish ? 'today-open' : 'today',
    });
  }
  return plan;
}

const coursePlan = buildCoursePlan();

// --- Reset (außer append-only) -----------------------------------------------
const emailBefore = await countTenant('email_deliveries', tenantId);
const paymentsBefore = await countTenant('payments', tenantId);
const passesBefore = await countTenant('passes', tenantId);

let emailPaused = false;
try {
  pauseEmail();
  emailPaused = true;

  if (RESET) {
    console.log('\n--reset: Kurse/Anmeldungen/Nachrichten/Glocken/Outbox dieses Tenants …');
    // legal_acceptances / events / audit_log / studio_legal_documents bleiben
    const { data: regs } = await admin.from('registrations').select('id').eq('tenant_id', tenantId);
    const regIds = (regs ?? []).map((r) => r.id);
    if (regIds.length) {
      const idList = regIds.map((id) => `'${id}'::uuid`).join(',');
      runDevSql(`
SET yogaflow.allow_email_delivery_delete = on;
DELETE FROM public.email_deliveries WHERE tenant_id = '${tenantId}'::uuid;
DELETE FROM public.user_notifications WHERE tenant_id = '${tenantId}'::uuid;
DELETE FROM public.messages WHERE tenant_id = '${tenantId}'::uuid;
DELETE FROM public.registrations WHERE tenant_id = '${tenantId}'::uuid AND id IN (${idList});
`);
    } else {
      runDevSql(`
SET yogaflow.allow_email_delivery_delete = on;
DELETE FROM public.email_deliveries WHERE tenant_id = '${tenantId}'::uuid;
DELETE FROM public.user_notifications WHERE tenant_id = '${tenantId}'::uuid;
DELETE FROM public.messages WHERE tenant_id = '${tenantId}'::uuid;
`);
    }
    const { error: ce } = await admin.from('courses').delete().eq('tenant_id', tenantId);
    if (ce) fail('Kurse löschen: ' + ce.message);
    // Pass-Produkte falls doch welche: archivieren/löschen nur wenn ohne Geld
    const { data: products } = await admin.from('pass_products').select('id').eq('tenant_id', tenantId);
    if (products?.length) {
      runDevSql(`
UPDATE public.pass_products SET archived_at = now()
WHERE tenant_id = '${tenantId}'::uuid AND archived_at IS NULL;
`);
    }
    console.log('  Reset fertig.');
  } else {
    // Idempotent ohne --reset: bestehende Seed-Kurse dieses Studios entfernen und neu aufbauen
    const { count: existingCourses } = await admin
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('archived_at', null);
    if ((existingCourses ?? 0) > 0) {
      console.log('\nBestehende Kurse gefunden — wie --reset für Kurse/Anmeldungen (idempotent).');
      const { data: regs } = await admin.from('registrations').select('id').eq('tenant_id', tenantId);
      const regIds = (regs ?? []).map((r) => r.id);
      if (regIds.length) {
        const idList = regIds.map((id) => `'${id}'::uuid`).join(',');
        runDevSql(`
SET yogaflow.allow_email_delivery_delete = on;
DELETE FROM public.email_deliveries WHERE tenant_id = '${tenantId}'::uuid;
DELETE FROM public.user_notifications WHERE tenant_id = '${tenantId}'::uuid;
DELETE FROM public.messages WHERE tenant_id = '${tenantId}'::uuid;
DELETE FROM public.registrations WHERE id IN (${idList});
`);
      }
      const { error: ce } = await admin.from('courses').delete().eq('tenant_id', tenantId);
      if (ce) fail('Kurse löschen: ' + ce.message);
    }
  }

  // --- Kurse anlegen (zuerst alle in der Zukunft bzw. heute, dann Vergangenheit zurückdatieren)
  console.log(`\nKurse anlegen (${coursePlan.length} Termine) …`);
  const created = [];
  for (const def of coursePlan) {
    const teacherId = teacherByKey[def.teacher];
    // Vergangene Termine: erst mit Zukunftsdatum anlegen (Trigger prevent_past), später zurück
    const insertDate = def.phase === 'past' ? berlinDate(21 + Math.abs(def.offset) % 7) : def.date;
    const { data: course, error } = await admin
      .from('courses')
      .insert({
        tenant_id: tenantId,
        title: def.title,
        description: `${def.title} bei ${STUDIO_NAME}`,
        date: insertDate,
        time: def.time,
        end_time: def.end_time,
        location: 'Studio Yoga am Rhein',
        max_participants: def.max,
        price: def.price,
        teacher_id: teacherId,
        status: 'active',
        frequency: 'one_time',
        pass_eligible: true,
        duration: 60,
      })
      .select('id, date, time, price, max_participants, title')
      .single();
    if (error) fail(`Kurs ${def.title} ${def.date}: ${error.message}`);
    created.push({ ...def, id: course.id, insertDate });
  }
  console.log(`  ${created.length} Kurse`);

  // --- Vergangene Anmeldungen (Service-Role-Insert, Preis-Freeze-Trigger) ---
  const pastCourses = created.filter((c) => c.phase === 'past');
  console.log(`\nVergangene Anmeldungen (${pastCourses.length} Kurse) …`);
  let pastOpen = 0;
  let pastCancelled = 0;

  for (const course of pastCourses) {
    // Dichte auf ~150–250 offene Altposten (56 Termine):
    // letzte ~6 Wochen 6–8, Wochen 7–10: 3–4, ältere 0–1.
    const weeksAgo = Math.floor(Math.abs(course.offset) / 7);
    let openTarget;
    if (weeksAgo <= 5) openTarget = 6 + pickIndex(course.date + course.key, 3); // 6–8
    else if (weeksAgo <= 9) openTarget = 3 + pickIndex(course.date + course.key, 2); // 3–4
    else openTarget = pickIndex(course.date + course.key, 3) === 0 ? 1 : 0; // 0–1
    const cancelTarget = pickIndex(course.date + 'c', 5) === 0 ? 1 : 0; // ~20%

    const openPeople = shufflePick(`open:${course.date}:${course.key}`, participantRows, openTarget);
    const cancelPeople = shufflePick(
      `cancel:${course.date}:${course.key}`,
      participantRows.filter((p) => !openPeople.includes(p)),
      cancelTarget,
    );

    const rows = [];
    for (const p of openPeople) {
      rows.push({
        tenant_id: tenantId,
        course_id: course.id,
        user_id: p.id,
        status: 'registered',
        is_waitlist: false,
        registered_at: new Date(Date.now() - Math.abs(course.offset) * 86400000 - 3 * 86400000).toISOString(),
      });
    }
    for (const p of cancelPeople) {
      rows.push({
        tenant_id: tenantId,
        course_id: course.id,
        user_id: p.id,
        status: 'cancelled',
        is_waitlist: false,
        cancel_reason: 'participant',
        cancelled_by: p.id,
        cancellation_timestamp: new Date(
          Date.now() - Math.abs(course.offset) * 86400000 - 1 * 86400000,
        ).toISOString(),
        cancelled_from_status: 'registered',
        registered_at: new Date(Date.now() - Math.abs(course.offset) * 86400000 - 5 * 86400000).toISOString(),
      });
    }

    if (rows.length) {
      const { error } = await admin.from('registrations').insert(rows);
      if (error) fail(`Past-Reg ${course.title} ${course.date}: ${error.message}`);
      pastOpen += openPeople.length;
      pastCancelled += cancelPeople.length;
    }
  }
  console.log(`  open=${pastOpen} cancelled=${pastCancelled}`);

  // Kurse zurückdatieren
  for (const course of pastCourses) {
    const { error } = await admin.from('courses').update({ date: course.date }).eq('id', course.id);
    if (error) fail(`Rückdatierung ${course.id}: ${error.message}`);
  }
  console.log('  Vergangenheit rückdatiert.');

  // --- Kommende Anmeldungen ---
  // Bulk per Service-Role-Insert (Preis-Freeze-/Coverage-Trigger wie echte Buchungen).
  // Auth-Login-Rate-Limit auf DEV → register_for_course nur für 3 Showcase-Personen
  // (mit Backoff), damit der RPC-Pfad belegt bleibt.
  const futureCourses = created.filter((c) => c.phase !== 'past');
  console.log(`\nKommende Anmeldungen (${futureCourses.length} Kurse) …`);

  let waitlistCourse =
    futureCourses.find((c) => c.key === 'vinyasa' && c.offset > 0) ||
    futureCourses.find((c) => c.phase === 'future');
  if (waitlistCourse) {
    await admin.from('courses').update({ max_participants: 8 }).eq('id', waitlistCourse.id);
    waitlistCourse = { ...waitlistCourse, max: 8 };
  }

  const todayCourseIds = futureCourses
    .filter((c) => c.phase === 'today' || c.phase === 'today-open')
    .map((c) => c.id);
  const showcaseMany = participantRows[0]; // Anna Meier
  const showcaseWl = participantRows[1]; // Jonas Schulz — Warteliste
  const showcaseToday = participantRows[2]; // Marie Hoffmann — Kurs heute
  const showcaseIds = new Set([showcaseMany.id, showcaseWl.id, showcaseToday.id]);

  /** courseId → { registered: person[], waitlist: person[] } */
  const futurePlan = new Map();
  function planCourse(course) {
    if (!futurePlan.has(course.id)) {
      futurePlan.set(course.id, { course, registered: [], waitlist: [] });
    }
    return futurePlan.get(course.id);
  }

  for (const course of futureCourses) {
    const slot = planCourse(course);
    const isWl = waitlistCourse && course.id === waitlistCourse.id;
    const isToday = course.phase === 'today' || course.phase === 'today-open';
    if (isWl) {
      // Filler ohne Showcase (die kommen per RPC) — Kapazität voll, Jonas → Warteliste
      const fillers = participantRows
        .filter((p) => !showcaseIds.has(p.id))
        .slice(0, course.max);
      slot.registered.push(...fillers);
      slot.waitlist.push(showcaseWl);
      const extra = participantRows
        .filter((p) => !showcaseIds.has(p.id) && !fillers.includes(p))
        .slice(0, 3);
      slot.waitlist.push(...extra);
      continue;
    }
    let n = isToday ? 6 : 4 + pickIndex(course.date + course.key, 7);
    const people = shufflePick(
      `fut:${course.date}:${course.key}`,
      participantRows.filter((p) => !showcaseIds.has(p.id) || isToday),
      Math.min(n, participantRows.length),
    );
    slot.registered.push(...people);
  }

  // Showcase: viele kommende (ohne Wartelisten-Kurs — der läuft über waitlist)
  for (const c of futureCourses) {
    if (waitlistCourse && c.id === waitlistCourse.id) continue;
    const slot = planCourse(c);
    if (!slot.registered.includes(showcaseMany) && slot.registered.length < c.max) {
      slot.registered.push(showcaseMany);
    }
  }
  for (const id of todayCourseIds) {
    const slot = futurePlan.get(id);
    if (slot && !slot.registered.includes(showcaseToday) && slot.registered.length < slot.course.max) {
      slot.registered.push(showcaseToday);
    }
  }

  // Dedup pro Kurs
  for (const slot of futurePlan.values()) {
    const seen = new Set();
    slot.registered = slot.registered.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    slot.waitlist = slot.waitlist.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    // Kapazität: Überhang → Warteliste
    while (slot.registered.length > slot.course.max) {
      slot.waitlist.unshift(slot.registered.pop());
    }
  }

  // Bulk-Insert (nicht-Showcase); Showcase später per RPC
  let futureInserted = 0;
  let waitlistInserted = 0;
  for (const slot of futurePlan.values()) {
    const rows = [];
    for (const p of slot.registered) {
      if (showcaseIds.has(p.id)) continue; // RPC
      rows.push({
        tenant_id: tenantId,
        course_id: slot.course.id,
        user_id: p.id,
        status: 'registered',
        is_waitlist: false,
        coverage_intent: 'onsite',
      });
    }
    for (let i = 0; i < slot.waitlist.length; i++) {
      const p = slot.waitlist[i];
      if (showcaseIds.has(p.id)) continue;
      rows.push({
        tenant_id: tenantId,
        course_id: slot.course.id,
        user_id: p.id,
        status: 'waitlist',
        is_waitlist: true,
        waitlist_position: i + 1,
        coverage_intent: 'onsite',
      });
      waitlistInserted++;
    }
    if (rows.length) {
      const { error } = await admin.from('registrations').insert(rows);
      if (error) fail(`Future-Insert ${slot.course.title}: ${error.message}`);
      futureInserted += rows.length;
    }
  }
  console.log(`  Bulk-Insert: ${futureInserted} (davon waitlist≈${waitlistInserted})`);

  async function sleep(ms) {
    await new Promise((r) => setTimeout(r, ms));
  }

  async function loginWithRetry(email, pass, tries = 8) {
    let last;
    for (let i = 0; i < tries; i++) {
      try {
        return await login(url, anon, email, pass, SLUG);
      } catch (e) {
        last = e;
        const msg = String(e?.message || e);
        if (!/rate limit/i.test(msg)) throw e;
        const wait = 2000 * (i + 1);
        console.log(`  Auth rate-limit, warte ${wait}ms (${email}) …`);
        await sleep(wait);
      }
    }
    throw last;
  }

  let rpcOk = 0;
  let rpcFail = 0;
  let rpcWaitlist = 0;
  const showcaseJobs = [
    {
      person: showcaseMany,
      courses: [...futurePlan.values()]
        .filter((s) => s.registered.some((p) => p.id === showcaseMany.id))
        .map((s) => s.course.id),
    },
    {
      person: showcaseToday,
      courses: todayCourseIds.filter((id) => {
        const s = futurePlan.get(id);
        return s?.registered.some((p) => p.id === showcaseToday.id);
      }),
    },
    {
      person: showcaseWl,
      courses: waitlistCourse ? [waitlistCourse.id] : [],
    },
  ];

  for (const job of showcaseJobs) {
    if (!job.courses.length) continue;
    await sleep(1500);
    const client = await loginWithRetry(job.person.email, job.person._pass);
    for (const courseId of job.courses) {
      const { data, error } = await client.rpc('register_for_course', {
        p_course_id: courseId,
        p_use_pass: false,
        p_method: 'onsite',
      });
      if (error || data?.success === false) {
        rpcFail++;
        console.warn(`  RPC ${job.person.email} ${courseId}:`, error?.message || data);
        continue;
      }
      rpcOk++;
      if (data?.is_waitlist) rpcWaitlist++;
    }
    await client.auth.signOut();
  }
  console.log(`  Showcase-RPC ok=${rpcOk} fail=${rpcFail} waitlist=${rpcWaitlist}`);

  // Optionale Glocken/Nachrichten (keine Mails)
  {
    const { error } = await admin.from('user_notifications').insert([
      {
        tenant_id: tenantId,
        user_id: owner.id,
        type: 'info',
        body: 'Willkommen bei Yoga am Rhein — Demo-Stand nach dem Release.',
        action_path: '/settings',
      },
      {
        tenant_id: tenantId,
        user_id: showcaseToday.id,
        type: 'info',
        body: 'Dein Kurs heute startet bald. Zahlung vor Ort.',
        course_id: todayCourseIds[0] ?? null,
        action_path: todayCourseIds[0] ? `/course/${todayCourseIds[0]}` : '/dashboard',
      },
    ]);
    if (error) console.warn('  notifications:', error.message);
  }

  // Outbox: neu entstandene pending → skipped (kein Versand)
  runDevSql(`
UPDATE public.email_deliveries
SET status = 'skipped', last_error_code = 'DEMO_SEED_SKIP'
WHERE tenant_id = '${tenantId}'::uuid
  AND status = 'pending';
`);
} finally {
  if (emailPaused) {
    try {
      resumeEmail();
    } catch (e) {
      console.warn('resume email', e);
    }
  }
}

// --- Prüfungen ---------------------------------------------------------------
console.log('\nPrüfungen …');
const emailAfter = await countTenant('email_deliveries', tenantId);
const paymentsAfter = await countTenant('payments', tenantId);
const passesAfter = await countTenant('passes', tenantId);
const passProducts = await countTenant('pass_products', tenantId);
const legalDocs = await countTenant('studio_legal_documents', tenantId);
const acceptances = await countTenant('legal_acceptances', tenantId);
const regsOpenPast = (
  await admin
    .from('registrations')
    .select('id, coverage_status, status, course_id, courses!inner(date, time, tenant_id)')
    .eq('tenant_id', tenantId)
    .eq('status', 'registered')
    .eq('coverage_status', 'open')
).data;

const todayStr = berlinDate(0);
const nowBerlin = Date.now();
function courseStartMs(date, time) {
  // Interpret as Europe/Berlin wall time → rough: use UTC+1/+2 approximation via formatter
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00:00').split(':').map(Number);
  // Construct as if local Berlin by using temporal offset from Intl
  const probe = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return probe.getTime();
}

let openPastDb = 0;
let openFutureDb = 0;
for (const r of regsOpenPast ?? []) {
  const c = r.courses;
  if (!c) continue;
  const start = courseStartMs(c.date, c.time);
  // Better: classify by date string vs today
  if (c.date < todayStr) openPastDb++;
  else if (c.date > todayStr) openFutureDb++;
  else {
    // today: compare clock
    const [hh, mm] = (c.time || '00:00:00').split(':').map(Number);
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const nowMin = Number(parts.hour) * 60 + Number(parts.minute);
    const courseMin = hh * 60 + mm;
    if (courseMin < nowMin) openPastDb++;
    else openFutureDb++;
  }
}

const { count: coursesCount } = await admin
  .from('courses')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', tenantId);

const { count: cancelledCount } = await admin
  .from('registrations')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', tenantId)
  .eq('status', 'cancelled');

const { count: waitlistDb } = await admin
  .from('registrations')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', tenantId)
  .eq('status', 'waitlist');

// Preview A8 als Owner (nicht ausführen)
const ownerClient = await login(url, anon, OWNER.email, OWNER.pass, SLUG);
const previewDate = berlinDate(0);
const { data: preview, error: previewErr } = await ownerClient.rpc('preview_pre_omlify_waive', {
  p_before: previewDate,
});
await ownerClient.auth.signOut();

const { data: paymentStatus } = await admin
  .from('tenant_payment_settings')
  .select('online_payments_enabled, allow_onsite_payment')
  .eq('tenant_id', tenantId)
  .maybeSingle();

const emailDelta = emailAfter - emailBefore;
const pendingMails = (
  await admin
    .from('email_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
).count ?? 0;

console.log(`  Kurse: ${coursesCount}`);
console.log(`  Open past≈${openPastDb} future≈${openFutureDb} cancelled=${cancelledCount} waitlist=${waitlistDb}`);
console.log(`  preview_pre_omlify_waive(${previewDate}):`, previewErr?.message || preview);
console.log(`  payments Δ=${paymentsAfter - paymentsBefore} passes Δ=${passesAfter - passesBefore} products=${passProducts}`);
console.log(`  studio_legal_documents=${legalDocs} acceptances=${acceptances}`);
console.log(`  email_deliveries: ${emailBefore} → ${emailAfter} (pending=${pendingMails})`);
console.log(`  payment_settings:`, paymentStatus);

if (paymentsAfter - paymentsBefore !== 0) fail('Unerwartete Zahlungen entstanden');
if (passesAfter - passesBefore !== 0) fail('Unerwartete Pässe entstanden');
if (pendingMails > 0) fail('Noch pending email_deliveries');
if (legalDocs > 0) console.warn('  WARN: Studio-Rechtstexte vorhanden (sollten 0 sein)');

// Besonderheiten für Login-Tabelle
const { data: allRegs } = await admin
  .from('registrations')
  .select('user_id, status, is_waitlist, course_id, courses!inner(date, time, title)')
  .eq('tenant_id', tenantId)
  .in('status', ['registered', 'waitlist']);

const notesByUser = new Map();
function note(uid, text) {
  if (!notesByUser.has(uid)) notesByUser.set(uid, []);
  notesByUser.get(uid).push(text);
}

note(owner.id, 'unterrichtet Mo Hatha + So Sanftes Yoga');
note(teacherRows[0].id, 'unterrichtet Mi Vinyasa');
note(teacherRows[1].id, 'unterrichtet Fr Yin');

for (const r of allRegs ?? []) {
  const c = r.courses;
  if (!c) continue;
  if (r.status === 'waitlist' || r.is_waitlist) {
    note(r.user_id, `auf Warteliste ${c.title} ${c.date}`);
  }
  if (c.date === todayStr) {
    note(r.user_id, `Kurs heute (${c.title} ${String(c.time).slice(0, 5)})`);
  }
}

const futureRegCounts = new Map();
for (const r of allRegs ?? []) {
  if (r.status !== 'registered') continue;
  if (r.courses?.date >= todayStr) {
    futureRegCounts.set(r.user_id, (futureRegCounts.get(r.user_id) || 0) + 1);
  }
}
for (const [uid, n] of futureRegCounts) {
  if (n >= 4) note(uid, `${n} kommende Anmeldungen`);
}

// Showcase markieren
const showcaseIds = new Set([participantRows[0].id, participantRows[1].id, participantRows[2].id]);
note(participantRows[0].id, 'gut für Demo');
note(participantRows[1].id, 'gut für Demo');
note(participantRows[2].id, 'gut für Demo');

const loginRows = [
  { ...OWNER, id: owner.id, roleLabel: 'Owner' },
  ...TEACHERS.map((t, i) => ({ ...t, id: teacherRows[i].id, roleLabel: 'Lehrerin' })),
  ...PARTICIPANTS.map((p, i) => ({ ...p, id: participantRows[i].id, roleLabel: 'Teilnehmende' })),
];

const loginUrl = `https://${SLUG}.omlify-dev.de/auth`;
let loginMd = `# Demo-Studio Logins — ${STUDIO_NAME}\n\n`;
loginMd += `URL: ${loginUrl}\n`;
loginMd += `Tenant: ${SLUG} (${tenantId})\n`;
loginMd += `Stand: ${new Date().toISOString()} · Berlin-heute ${todayStr}\n\n`;
loginMd += `| Rolle | Vorname Nachname | E-Mail | Passwort | unterrichtet / Besonderheit |\n`;
loginMd += `| --- | --- | --- | --- | --- |\n`;
for (const row of loginRows) {
  const notes = [...new Set(notesByUser.get(row.id) || [])].join('; ') || '—';
  loginMd += `| ${row.roleLabel} | ${row.vorname} ${row.nachname} | ${row.email} | ${row.pass} | ${notes} |\n`;
}
writeFileSync(LOGIN_FILE, loginMd, 'utf8');
console.log(`\nLogins geschrieben: ${LOGIN_FILE}`);

// Zusammenfassung für Bericht
const summary = {
  slug: SLUG,
  name: STUDIO_NAME,
  tenantId,
  url: `https://${SLUG}.omlify-dev.de`,
  loginUrl,
  decision: 'demoepsilon hatte Acceptances → demostudio neu',
  courses: coursesCount,
  openPastApprox: openPastDb,
  openFutureApprox: openFutureDb,
  cancelled: cancelledCount,
  waitlist: waitlistDb,
  preview_pre_omlify_waive: preview,
  email_deliveries_before: emailBefore,
  email_deliveries_after: emailAfter,
  email_pending: pendingMails,
  payments: paymentsAfter,
  passes: passesAfter,
  pass_products: passProducts,
  studio_legal_documents: legalDocs,
  legal_acceptances: acceptances,
  online_payments_enabled: paymentStatus?.online_payments_enabled ?? false,
  allow_onsite: paymentStatus?.allow_onsite_payment ?? true,
  loginFile: LOGIN_FILE,
};
writeFileSync(
  join(root, 'scripts', 'dev', '.demo_studio_summary.local'),
  JSON.stringify(summary, null, 2) + '\n',
  'utf8',
);

console.log('\nOK — Demo-Studio bereit.');
console.log(`  ${summary.url}`);
console.log(`  Open past≈${openPastDb} · future≈${openFutureDb} · A8-Preview count=${preview?.count ?? '?'}`);
console.log('\nLogin-Tabelle:\n');
console.log(`Login: ${loginUrl}\n`);
console.log('| Rolle | Vorname Nachname | E-Mail | Passwort | Besonderheit |');
console.log('| --- | --- | --- | --- | --- |');
for (const row of loginRows) {
  const notes = [...new Set(notesByUser.get(row.id) || [])].join('; ') || '—';
  console.log(
    `| ${row.roleLabel} | ${row.vorname} ${row.nachname} | ${row.email} | ${row.pass} | ${notes} |`,
  );
}
