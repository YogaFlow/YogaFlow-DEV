/**
 * Read-only: dump PROD public/yogaflow_private schema (no data) for local probe.
 * Credentials from .env.deploy — never logs password/URL secrets.
 */
import { readFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';

function loadEnv(p) {
  const o = {};
  if (!existsSync(p)) return o;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) o[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return o;
}

const cfg = loadEnv('.env.deploy');
const ref = cfg.PROD_REF;
const host = cfg.PROD_DB_HOST;
const pass = cfg.PROD_DB_PASSWORD;
if (!ref || !host || !pass) {
  console.error('PROD_REF / PROD_DB_HOST / PROD_DB_PASSWORD fehlen in .env.deploy');
  process.exit(1);
}

const dbUrl =
  `postgresql://postgres.${ref}:${encodeURIComponent(pass)}` +
  `@${host}.pooler.supabase.com:5432/postgres`;

mkdirSync('tmp', { recursive: true });
const out = 'tmp/prod_schema.sql';
console.log('Dumping PROD schema-only (public, yogaflow_private) …');
const r = spawnSync(
  'npx',
  [
    'supabase',
    'db',
    'dump',
    '--db-url',
    dbUrl,
    '-f',
    out,
    '--schema',
    'public',
    '--schema',
    'yogaflow_private',
  ],
  { encoding: 'utf8', shell: true, timeout: 180000 },
);
console.log('exit', r.status);
if (r.stderr) console.error(r.stderr.split(/\r?\n/).slice(-20).join('\n'));
if (r.stdout) console.log(r.stdout.split(/\r?\n/).slice(-10).join('\n'));
try {
  console.log('dump bytes', statSync(out).size);
} catch {
  console.error('no dump file');
  process.exit(1);
}
