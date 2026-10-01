#!/usr/bin/env node
/**
 * DEV only: Vault-Einträge für yogaflow_process_provider_jobs + PROVIDER_JOBS_SECRET
 * in supabase/.env.dev schreiben. Das Secret wird nie ausgegeben.
 *
 * Wenn PROVIDER_JOBS_SECRET bereits in supabase/.env.dev steht (4c / D2), wird
 * genau dieser Wert in den Vault geschrieben — sonst neu erzeugt.
 *
 * DB-Zugang wie scripts/db.mjs: .env.deploy DEV_REF / DEV_DB_HOST / DEV_DB_PASSWORD.
 *
 * Verwendung (4c, Vault zuletzt): node scripts/dev/provider_jobs_secret.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
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

const deploy = ladeEnv(join(root, '.env.deploy'));
const ref = deploy.DEV_REF;
const host = deploy.DEV_DB_HOST;
const password = deploy.DEV_DB_PASSWORD;

if (!ref || !host || !password) {
  fail('DEV_REF / DEV_DB_HOST / DEV_DB_PASSWORD fehlen in .env.deploy');
}
if (ref !== ERLAUBTE_REF) {
  fail('DEV_REF ist nicht die erlaubte DEV-Ref (devOk)');
}

const functionUrl = `https://${ref}.supabase.co/functions/v1/payments-jobs`;
// D2 / 4c: vorhandenen Wert aus .env.dev wiederverwenden (Edge-Secret und Vault gleich).
const envDevPath = join(root, 'supabase', '.env.dev');
const existing = (ladeEnv(envDevPath).PROVIDER_JOBS_SECRET || '').trim();
const reused = existing.length > 0;
const secret = reused ? existing : randomBytes(32).toString('base64url');

const dbUrl =
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}` +
  `@${host}.pooler.supabase.com:5432/postgres`;

const sql = `
DO $vault$
DECLARE
  v_url_id uuid;
  v_secret_id uuid;
  v_url text := $u$${functionUrl}$u$;
  v_secret text := $s$${secret}$s$;
BEGIN
  SELECT id INTO v_url_id FROM vault.secrets WHERE name = 'provider_jobs_url';
  IF v_url_id IS NULL THEN
    PERFORM vault.create_secret(v_url, 'provider_jobs_url', '2.2a-4a payments-jobs URL');
  ELSE
    PERFORM vault.update_secret(v_url_id, v_url);
  END IF;

  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = 'provider_jobs_secret';
  IF v_secret_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'provider_jobs_secret', '2.2a-4a PROVIDER_JOBS_SECRET');
  ELSE
    PERFORM vault.update_secret(v_secret_id, v_secret);
  END IF;
END;
$vault$;

SELECT
  (SELECT count(*)::int FROM vault.secrets WHERE name = 'provider_jobs_url') AS url_ok,
  (SELECT count(*)::int FROM vault.secrets WHERE name = 'provider_jobs_secret') AS secret_ok;
`;

const tmpDir = mkdtempSync(join(tmpdir(), 'omlify-vault-'));
const tmpSql = join(tmpDir, 'vault.sql');
writeFileSync(tmpSql, sql, 'utf8');

const result = spawnSync(
  'psql',
  [dbUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-f', tmpSql],
  { encoding: 'utf8', env: process.env },
);

try {
  unlinkSync(tmpSql);
} catch {
  /* ignore */
}

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'psql fehlgeschlagen');
  fail('Vault-Einträge konnten nicht geschrieben werden');
}

const out = (result.stdout || '').trim();
if (!/^1\|1\b/m.test(out) && !/1\|1/.test(out)) {
  fail('Vault-Einträge nicht bestätigt (url_ok/secret_ok)');
}

upsertEnvLine(envDevPath, 'PROVIDER_JOBS_SECRET', secret);

console.log('  Vault-Einträge provider_jobs_url / provider_jobs_secret gesetzt (DEV).');
if (reused) {
  console.log('  Bestehendes PROVIDER_JOBS_SECRET aus supabase/.env.dev für Vault verwendet.');
} else {
  console.log('  PROVIDER_JOBS_SECRET neu erzeugt und in supabase/.env.dev geschrieben.');
}
console.log('  Reihenfolge 4c: Secret in .env.dev → npm run secrets:dev → Functions deployen → dieses Skript (Vault zuletzt).');
console.log('  Secret wird nicht ausgegeben.');
