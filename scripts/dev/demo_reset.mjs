#!/usr/bin/env node
/**
 * UX-5: demoalpha aufräumen ohne Folgeaktionen (keine cancel/remove RPCs).
 *
 *   npm run dev:demo:reset -- demoalpha --dry-run
 *   npm run dev:demo:reset -- demoalpha
 *
 * - Pausiert provider_jobs + E-Mail-Versand, danach Resume
 * - Löscht nur ohne Geldspur (service-role DELETE)
 * - Setzt archived_at auf Kurse/Mitglieder mit Geldspur
 * - Prüft 0 neue provider_jobs / email_deliveries / events / ledger
 */
import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import { runNodeScript } from './_spawn.mjs';
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

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

assertDevGuard();

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');
const slugArg = args.find((a) => !a.startsWith('--'));
if (slugArg && slugArg !== SLUG) fail(`Nur Studio "${SLUG}" erlaubt (got ${slugArg})`);

const env = { ...ladeEnv(join(root, '.env')), ...ladeEnv(join(root, 'supabase', '.env.dev')) };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) fail('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen');
if (!url.includes(ERLAUBTE_DEV_REF)) fail('Nicht DEV');

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function countTable(table, tenantId) {
  let q = admin.from(table).select('id', { count: 'exact', head: true });
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { count, error } = await q;
  if (error) fail(`${table}: ${error.message}`);
  return count ?? 0;
}

async function snapshotSideEffects(tenantId) {
  return {
    provider_jobs: await countTable('provider_jobs', tenantId),
    email_deliveries: await countTable('email_deliveries', tenantId),
    events: await countTable('events', tenantId),
    ledger_entries: await countTable('ledger_entries', tenantId),
  };
}

function pauseJobs() {
  const r = runNodeScript(join(root, 'scripts/dev/provider_jobs_secret.mjs'), ['--pause']);
  if ((r.status ?? 1) !== 0) fail('jobs pause fehlgeschlagen');
}

function resumeJobs() {
  const r = runNodeScript(join(root, 'scripts/dev/provider_jobs_secret.mjs'), ['--resume']);
  if ((r.status ?? 1) !== 0) fail('jobs resume fehlgeschlagen');
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
  const tmp = join(mkdtempSync(join(tmpdir(), 'omlify-reset-')), 'q.sql');
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
}

const { data: tenant, error: te } = await admin
  .from('tenants')
  .select('id')
  .eq('slug', SLUG)
  .single();
if (te || !tenant) fail(`Studio ${SLUG} fehlt`);
const tenantId = tenant.id;

const { data: regs, error: re } = await admin
  .from('registrations')
  .select('id, course_id, user_id')
  .eq('tenant_id', tenantId);
if (re) fail(re.message);

const regIds = (regs ?? []).map((r) => r.id);
const moneyRegIds = new Set();
const moneyCourseIds = new Set();
const moneyUserIds = new Set();

if (regIds.length) {
  const { data: pays } = await admin
    .from('payments')
    .select('registration_id')
    .eq('tenant_id', tenantId)
    .in('registration_id', regIds);
  for (const p of pays ?? []) {
    if (p.registration_id) moneyRegIds.add(p.registration_id);
  }
  const { data: moves } = await admin
    .from('pass_movements')
    .select('registration_id')
    .in('registration_id', regIds);
  for (const m of moves ?? []) {
    if (m.registration_id) moneyRegIds.add(m.registration_id);
  }
}

for (const r of regs ?? []) {
  if (moneyRegIds.has(r.id)) {
    moneyCourseIds.add(r.course_id);
    moneyUserIds.add(r.user_id);
  }
}

const { data: passes } = await admin
  .from('passes')
  .select('member_id')
  .eq('tenant_id', tenantId);
for (const p of passes ?? []) moneyUserIds.add(p.member_id);

const { data: paySubjects } = await admin
  .from('payments')
  .select('subject_type, subject_id')
  .eq('tenant_id', tenantId)
  .eq('subject_type', 'member');
for (const p of paySubjects ?? []) {
  if (p.subject_id) moneyUserIds.add(p.subject_id);
}

const { data: allCourses } = await admin
  .from('courses')
  .select('id, archived_at')
  .eq('tenant_id', tenantId);
const { data: allUsers } = await admin
  .from('users')
  .select('id, role, archived_at, auth_user_id, email')
  .eq('tenant_id', tenantId);

const deletableRegs = (regs ?? []).filter((r) => !moneyRegIds.has(r.id)).map((r) => r.id);
const deletableCourses = (allCourses ?? [])
  .filter((c) => !moneyCourseIds.has(c.id))
  .map((c) => c.id);
const deletableUsers = (allUsers ?? []).filter(
  (u) => u.role === 'user' && !moneyUserIds.has(u.id),
);
const archiveCourses = (allCourses ?? []).filter(
  (c) => moneyCourseIds.has(c.id) && !c.archived_at,
);
const archiveUsers = (allUsers ?? []).filter(
  (u) => u.role === 'user' && moneyUserIds.has(u.id) && !u.archived_at,
);

const plan = {
  delete_registrations: deletableRegs.length,
  delete_courses: deletableCourses.length,
  delete_users: deletableUsers.length,
  archive_courses: archiveCourses.length,
  archive_users: archiveUsers.length,
  delete_messages: 'all tenant',
  delete_notifications: 'all tenant',
};

console.log('\nUX-5 demo:reset', SLUG, dryRun ? '(dry-run)' : '(apply)');
console.log(JSON.stringify(plan, null, 2));

if (dryRun) {
  console.log('\nTrockenlauf — keine Änderungen.');
  process.exit(0);
}

const before = await snapshotSideEffects(tenantId);
console.log('Side-effects vorher:', before);

let paused = false;
try {
  pauseJobs();
  pauseEmail();
  paused = true;

  // Nachrichten + Glocken (kein Geld)
  {
    const { error } = await admin.from('messages').delete().eq('tenant_id', tenantId);
    if (error) throw new Error('messages: ' + error.message);
  }
  {
    const { error } = await admin.from('user_notifications').delete().eq('tenant_id', tenantId);
    if (error) throw new Error('user_notifications: ' + error.message);
  }

  // FK-Kinder ohne Geldspur vor Anmeldungs-DELETE (append-only Guard per Session-Flag)
  if (deletableRegs.length) {
    const idList = deletableRegs.map((id) => `'${id}'::uuid`).join(',');
    runDevSql(`
SET yogaflow.allow_email_delivery_delete = on;
SET yogaflow.allow_payment_delete = on;
DELETE FROM public.email_deliveries WHERE registration_id IN (${idList});
DELETE FROM public.payment_attempts WHERE registration_id IN (${idList});
`);
  }

  // Anmeldungen ohne Geldspur — direktes DELETE, keine unregister-RPC
  for (let i = 0; i < deletableRegs.length; i += 100) {
    const chunk = deletableRegs.slice(i, i + 100);
    const { error } = await admin.from('registrations').delete().in('id', chunk);
    if (error) throw new Error('registrations: ' + error.message);
  }

  // Kurse ohne Geldspur
  for (let i = 0; i < deletableCourses.length; i += 50) {
    const chunk = deletableCourses.slice(i, i + 50);
    const { error } = await admin.from('courses').delete().in('id', chunk);
    if (error) throw new Error('courses: ' + error.message);
  }

  // Teilnehmende ohne Geldspur: Auth löschen (Cascade public.users)
  for (const u of deletableUsers) {
    if (u.auth_user_id) {
      const { error } = await admin.auth.admin.deleteUser(u.auth_user_id);
      if (error) {
        console.warn('auth delete', u.email, error.message);
        const { error: de } = await admin.from('users').delete().eq('id', u.id);
        if (de) throw new Error('users delete: ' + de.message);
      }
    } else {
      const { error } = await admin.from('users').delete().eq('id', u.id);
      if (error) throw new Error('users delete: ' + error.message);
    }
  }

  const now = new Date().toISOString();
  if (archiveCourses.length) {
    const ids = archiveCourses.map((c) => `'${c.id}'::uuid`).join(',');
    runDevSql(`UPDATE public.courses SET archived_at = '${now}'::timestamptz WHERE id IN (${ids}) AND archived_at IS NULL;`);
  }
  // users_identity_guard: anonymisierte Zeilen brauchen allow_member_removal
  if (archiveUsers.length) {
    const ids = archiveUsers.map((u) => `'${u.id}'::uuid`).join(',');
    runDevSql(`
SET yogaflow.allow_member_removal = on;
UPDATE public.users
SET archived_at = '${now}'::timestamptz
WHERE id IN (${ids}) AND archived_at IS NULL;
`);
  }

  const after = await snapshotSideEffects(tenantId);
  console.log('Side-effects nachher:', after);
  for (const key of Object.keys(before)) {
    const delta = after[key] - before[key];
    // Löschen von Alt-Outbox ist ok; neu entstanden darf nichts.
    if (delta > 0) throw new Error(`Unerwartet neue ${key}: +${delta}`);
    console.log(`  ${key}: ${before[key]} → ${after[key]} (Δ ${delta})`);
  }
  console.log('OK: 0 neue provider_jobs / email_deliveries / events / ledger');
} catch (e) {
  console.error('\n  FEHLER:', e.message || e, '\n');
  process.exitCode = 1;
} finally {
  if (paused) {
    try {
      resumeJobs();
    } catch (e) {
      console.warn('resume jobs', e);
    }
    try {
      resumeEmail();
    } catch (e) {
      console.warn('resume email', e);
    }
  }
}

if (process.exitCode) process.exit(process.exitCode);

console.log('\nReset fertig.');
