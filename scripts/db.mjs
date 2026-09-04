#!/usr/bin/env node
/**
 * Ein Eingang fuer alle Supabase-Operationen, mit dem Ziel IMMER explizit im Kommando.
 *
 * Warum es das gibt: `supabase db push` trifft die Datenbank, mit der zuletzt `link`
 * ausgefuehrt wurde. Dieser Zustand liegt unsichtbar in supabase/.temp/ — ein vergessenes
 * `link` reicht, um eine Migration auf der falschen Datenbank zu fahren. Hier steht das
 * Ziel im Kommando, und PROD verlangt zusaetzlich eine getippte Bestaetigung.
 *
 * Verwendung:
 *   node scripts/db.mjs status dev          Migrationsstand anzeigen (nur lesen)
 *   node scripts/db.mjs push dev            ausstehende Migrationen anwenden
 *   node scripts/db.mjs functions dev       alle Edge Functions deployen
 *   node scripts/db.mjs secrets dev         Secrets aus supabase/.env.dev setzen
 *   ... jeweils auch mit `prod` (fragt nach)
 *
 * Konfiguration: .env.deploy im Projektroot (nicht im Repo, siehe .env.deploy.example).
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const USAGE = 'Verwendung: node scripts/db.mjs <status|push|functions|secrets> <dev|prod>';

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function fail(msg) {
  console.error(`\n  FEHLER: ${msg}\n`);
  process.exit(1);
}

const [op, envName] = process.argv.slice(2);
if (!op || !envName) fail(USAGE);
if (!['status', 'push', 'functions', 'secrets'].includes(op)) fail(USAGE);
if (!['dev', 'prod'].includes(envName)) fail(USAGE);

const cfg = loadEnvFile('.env.deploy');
const P = envName.toUpperCase();
const ref = cfg[`${P}_REF`];
const host = cfg[`${P}_DB_HOST`];
const password = cfg[`${P}_DB_PASSWORD`];

if (!ref) fail(`${P}_REF fehlt in .env.deploy. Vorlage: .env.deploy.example`);
if (['status', 'push'].includes(op) && (!host || !password)) {
  fail(`${P}_DB_HOST und ${P}_DB_PASSWORD werden fuer "${op}" gebraucht, fehlen aber in .env.deploy`);
}

function currentBranch() {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

async function confirmProd() {
  const branch = currentBranch();
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │  ACHTUNG: Ziel ist die PRODUKTIONSUMGEBUNG          │');
  console.log('  └─────────────────────────────────────────────────────┘');
  console.log(`     Operation:  ${op}`);
  console.log(`     Projekt:    ${ref}`);
  console.log(`     Git-Branch: ${branch}`);
  console.log('');

  if (branch !== 'main') {
    fail(`PROD-Aenderungen nur von "main" aus. Aktueller Branch: "${branch}".\n` +
         `  Erst den PR nach main mergen, dann: git checkout main && git pull`);
  }

  if (!process.stdin.isTTY) {
    fail('PROD verlangt eine getippte Bestaetigung — dieses Kommando braucht ein echtes Terminal.');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => rl.question('     Zum Fortfahren PROD eingeben: ', res));
  rl.close();
  if (answer.trim() !== 'PROD') fail('Abgebrochen — nichts wurde geaendert.');
  console.log('');
}

function dbUrl() {
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}.pooler.supabase.com:5432/postgres`;
}

/** Fuehrt supabase aus und haelt Geheimnisse aus der Konsolenausgabe heraus. */
function run(args, { secret } = {}) {
  const shown = args.map((a) => (secret && a === secret ? '<verborgen>' : a));
  console.log(`  > supabase ${shown.join(' ')}\n`);
  const r = spawnSync('npx', ['supabase', ...args], { stdio: 'inherit', shell: true });
  process.exit(r.status ?? 1);
}

const OPS = {
  status: () => { const u = dbUrl(); run(['migration', 'list', '--db-url', u], { secret: u }); },
  push:   () => { const u = dbUrl(); run(['db', 'push', '--db-url', u], { secret: u }); },
  functions: () => run(['functions', 'deploy', '--project-ref', ref]),
  secrets: () => {
    const file = `supabase/.env.${envName}`;
    if (!existsSync(file)) fail(`${file} fehlt. Vorlage: supabase/.env.example`);
    run(['secrets', 'set', '--project-ref', ref, '--env-file', file]);
  },
};

if (envName === 'prod' && op !== 'status') await confirmProd();
OPS[op]();
