#!/usr/bin/env node
/**
 * DEV only: Vault-Einträge für yogaflow_dispatch_emails + EMAIL_DISPATCH_SECRET
 * in supabase/.env.dev schreiben. Das Secret wird nie ausgegeben.
 *
 * DB-Zugang wie scripts/db.mjs: .env.deploy DEV_REF / DEV_DB_HOST / DEV_DB_PASSWORD.
 *
 * Verwendung:
 *   node scripts/dev/email_dispatch_secret.mjs           # URL + Secret setzen
 *   node scripts/dev/email_dispatch_secret.mjs --pause   # URL leeren (Cron loggt nur)
 *   node scripts/dev/email_dispatch_secret.mjs --resume  # URL wieder setzen
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const mode = (() => {
  if (process.argv.includes('--pause')) return 'pause';
  if (process.argv.includes('--resume')) return 'resume';
  return 'set';
})();

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

const functionUrl = `https://${ref}.supabase.co/functions/v1/dispatch-emails`;
const envDevPath = join(root, 'supabase', '.env.dev');
const existing = (ladeEnv(envDevPath).EMAIL_DISPATCH_SECRET || '').trim();
const reused = existing.length > 0;
const secret = reused ? existing : randomBytes(32).toString('base64url');

const dbUrl =
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}` +
  `@${host}.pooler.supabase.com:5432/postgres`;

const pauseSql = `
DO $vault$
DECLARE
  v_url_id uuid;
BEGIN
  SELECT id INTO v_url_id FROM vault.secrets WHERE name = 'email_dispatch_url';
  IF v_url_id IS NULL THEN
    PERFORM vault.create_secret('', 'email_dispatch_url', 'B2 dispatch-emails URL (paused)');
  ELSE
    PERFORM vault.update_secret(v_url_id, '');
  END IF;
END;
$vault$;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM vault.decrypted_secrets
      WHERE name = 'email_dispatch_url' AND btrim(COALESCE(decrypted_secret, '')) = ''
    ) THEN 1 ELSE 0
  END AS url_paused,
  (SELECT count(*)::int FROM vault.secrets WHERE name = 'email_dispatch_secret') AS secret_ok;
`;

const setSql = `
DO $vault$
DECLARE
  v_url_id uuid;
  v_secret_id uuid;
  v_url text := $u$${functionUrl}$u$;
  v_secret text := $s$${secret}$s$;
BEGIN
  SELECT id INTO v_url_id FROM vault.secrets WHERE name = 'email_dispatch_url';
  IF v_url_id IS NULL THEN
    PERFORM vault.create_secret(v_url, 'email_dispatch_url', 'B2 dispatch-emails URL');
  ELSE
    PERFORM vault.update_secret(v_url_id, v_url);
  END IF;

  SELECT id INTO v_secret_id FROM vault.secrets WHERE name = 'email_dispatch_secret';
  IF v_secret_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'email_dispatch_secret', 'B2 EMAIL_DISPATCH_SECRET');
  ELSE
    PERFORM vault.update_secret(v_secret_id, v_secret);
  END IF;
END;
$vault$;

SELECT
  (SELECT count(*)::int FROM vault.secrets WHERE name = 'email_dispatch_url') AS url_ok,
  (SELECT count(*)::int FROM vault.secrets WHERE name = 'email_dispatch_secret') AS secret_ok;
`;

const runSql = mode === 'pause' ? pauseSql : setSql;

const tmpDir = mkdtempSync(join(tmpdir(), 'omlify-vault-'));
const tmpSql = join(tmpDir, 'vault.sql');
writeFileSync(tmpSql, runSql, 'utf8');

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

if (mode === 'pause') {
  if (!/^1\|/m.test(out) && !/1\|/.test(out)) {
    fail('Pause nicht bestätigt (url_paused)');
  }
  console.log('  Pause: email_dispatch_url geleert (DEV). Cron ruft dispatch-emails nicht auf.');
  console.log('  Secret unverändert. Resume: node scripts/dev/email_dispatch_secret.mjs --resume');
  process.exit(0);
}

if (!/^1\|1\b/m.test(out) && !/1\|1/.test(out)) {
  fail('Vault-Einträge nicht bestätigt (url_ok/secret_ok)');
}

upsertEnvLine(envDevPath, 'EMAIL_DISPATCH_SECRET', secret);

if (mode === 'resume') {
  console.log('  Resume: email_dispatch_url wieder gesetzt (DEV).');
} else {
  console.log('  Vault-Einträge email_dispatch_url / email_dispatch_secret gesetzt (DEV).');
  console.log('  EMAIL_DISPATCH_SECRET in supabase/.env.dev geschrieben.');
  console.log('  Als Nächstes: npm run secrets:dev');
}
if (reused) {
  console.log('  Bestehendes EMAIL_DISPATCH_SECRET aus supabase/.env.dev für Vault verwendet.');
} else {
  console.log('  EMAIL_DISPATCH_SECRET neu erzeugt und in supabase/.env.dev geschrieben.');
}
console.log('  Secret wird nicht ausgegeben.');
