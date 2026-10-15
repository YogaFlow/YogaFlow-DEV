#!/usr/bin/env node
/**
 * DEV: ausstehende Migrationen prüfen (allow-Kopf) und ohne Rückfrage pushen.
 *
 * 1. Guard
 * 2. migration list → lokale Versionen ohne Remote
 * 3. je Datei: Kopf `-- allow: a,b,…` Pflicht → check:migration --allow …
 * 4. db push --yes auf DEV
 * 5. db:status:dev
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import { runNodeScript, runSupabase } from './_spawn.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const deploy = ladeEnv(join(root, '.env.deploy'));
const ref = deploy.DEV_REF;
const host = deploy.DEV_DB_HOST;
const password = deploy.DEV_DB_PASSWORD;
if (!ref || !host || !password) fail('DEV_REF / DEV_DB_HOST / DEV_DB_PASSWORD fehlen in .env.deploy');
if (ref !== ERLAUBTE_DEV_REF) fail('DEV_REF falsch');

const dbUrl =
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}` +
  `@${host}.pooler.supabase.com:5432/postgres`;

const listed = runSupabase(['migration', 'list', '--db-url', dbUrl], { capture: true });
if (listed.error) fail(`Supabase-CLI: ${listed.error.message}`);
if ((listed.status ?? 1) !== 0) {
  process.stderr.write(listed.stderr || listed.stdout || '');
  fail('migration list fehlgeschlagen');
}
const listOut = `${listed.stdout || ''}\n${listed.stderr || ''}`;
process.stdout.write(listed.stdout || '');

const remote = new Set();
for (const line of listOut.split(/\r?\n/)) {
  const m = line.match(/(\d{14})\s*\|\s*(\d{14})/);
  if (m) remote.add(m[2]);
}

const migDir = join(root, 'supabase', 'migrations');
const pending = readdirSync(migDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => {
    const m = f.match(/^(\d{14})_/);
    return m ? { version: m[1], file: f } : null;
  })
  .filter(Boolean)
  .filter((m) => !remote.has(m.version))
  .sort((a, b) => a.version.localeCompare(b.version));

if (pending.length === 0) {
  console.log('\n  Keine ausstehenden Migrationen auf DEV.\n');
} else {
  console.log(`\n  ${pending.length} ausstehende Migration(en):\n`);
  for (const m of pending) {
    console.log(`    ${m.file}`);
    const path = join(migDir, m.file);
    const text = readFileSync(path, 'utf8');
    const head = text.split(/\r?\n/).slice(0, 40).join('\n');
    const allowMatch = head.match(/^--\s*allow:\s*(.+)$/m);
    if (!allowMatch) {
      fail(`${m.file}: Kopfkommentar "-- allow: …" fehlt`);
    }
    const allow = allowMatch[1].trim();
    if (!allow) fail(`${m.file}: "-- allow:" ist leer`);

    const check = runNodeScript(
      join(root, 'scripts/dev/check_migration_statements.mjs'),
      [path, '--allow', allow],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    process.stdout.write(check.stdout || '');
    if (check.stderr) process.stderr.write(check.stderr);
    if (check.error) fail(`check:migration: ${check.error.message}`);
    if ((check.status ?? 1) !== 0) {
      fail(`check:migration fehlgeschlagen für ${m.file}`);
    }
  }

  console.log('\n  db push --yes (DEV) …\n');
  const push = runSupabase(['db', 'push', '--db-url', dbUrl, '--yes']);
  if (push.error) fail(`db push: ${push.error.message}`);
  if ((push.status ?? 1) !== 0) fail('db push fehlgeschlagen');
}

console.log('\n  db:status:dev …\n');
const status = runSupabase(['migration', 'list', '--db-url', dbUrl], { capture: true });
process.stdout.write(status.stdout || '');
if (status.stderr) process.stderr.write(status.stderr);
if (status.error) fail(`db:status: ${status.error.message}`);
if ((status.status ?? 1) !== 0) fail('db:status fehlgeschlagen');
console.log('\n  OK  dev:apply\n');
