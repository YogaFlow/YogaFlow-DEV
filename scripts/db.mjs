#!/usr/bin/env node
/**
 * Ein Eingang fuer alle Supabase-Operationen, mit dem Ziel IMMER explizit im Kommando.
 *
 * Warum es das gibt: `supabase db push` trifft die Datenbank, mit der zuletzt `link`
 * ausgefuehrt wurde. Dieser Zustand liegt unsichtbar in supabase/.temp/ — ein vergessenes
 * `link` reicht, um eine Migration auf der falschen Datenbank zu fahren. Hier steht das
 * Ziel im Kommando, und PROD verlangt zusaetzlich eine getippte Bestaetigung.
 *
 * Unter Windows hing `push prod` am 15.09. zweimal nach der PROD-Abfrage; `readline`
 * haelt die Konsoleneingabe, die per `stdio: 'inherit'` gestartete CLI kam nicht weiter
 * (`status` ohne Abfrage lief immer). Deshalb startet die CLI nach einer PROD-
 * Bestaetigung ohne Tastatureingabe.
 *
 * Verwendung:
 *   node scripts/db.mjs status dev          Migrationsstand anzeigen (nur lesen)
 *   node scripts/db.mjs push dev            ausstehende Migrationen anwenden
 *   node scripts/db.mjs functions dev       alle Edge Functions deployen
 *   node scripts/db.mjs secrets dev         Secrets aus supabase/.env.dev setzen
 *   ... jeweils auch mit `prod` (fragt nach)
 *   `push prod` zeigt zuerst die ausstehenden Migrationen.
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

function currentBranch() {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

if (envName === 'prod' && op !== 'status') {
  const branch = currentBranch();
  if (branch !== 'main') {
    fail(`PROD-Aenderungen nur von "main" aus. Aktueller Branch: "${branch}".\n` +
         `  Erst den PR nach main mergen, dann: git checkout main && git pull`);
  }
}

const cfg = loadEnvFile('.env.deploy');
const P = envName.toUpperCase();
const ref = cfg[`${P}_REF`];
const host = cfg[`${P}_DB_HOST`];
const password = cfg[`${P}_DB_PASSWORD`];

if (!ref) fail(`${P}_REF fehlt in .env.deploy. Vorlage: .env.deploy.example`);
if (['status', 'push'].includes(op) && (!host || !password)) {
  fail(`${P}_DB_HOST und ${P}_DB_PASSWORD werden fuer "${op}" gebraucht, fehlen aber in .env.deploy`);
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
  process.stdin.pause();
  if (answer.trim() !== 'PROD') fail('Abgebrochen — nichts wurde geaendert.');
  console.log('');
}

function dbUrl() {
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}.pooler.supabase.com:5432/postgres`;
}

/**
 * Fuehrt supabase aus und haelt Geheimnisse aus der Konsolenausgabe heraus.
 * Nach einer PROD-Bestaetigung: `stdin: 'ignore'` (Windows: readline haelt sonst die Eingabe).
 */
function run(args, { secret, stdin, input, exit = true } = {}) {
  const shown = args.map((a) => (secret && a === secret ? '<verborgen>' : a));
  console.log(`  > supabase ${shown.join(' ')}\n`);
  const stdio = [stdin ?? 'inherit', 'inherit', 'inherit'];
  const opts = { stdio, shell: true };
  if (input !== undefined) {
    stdio[0] = 'pipe';
    opts.input = input;
  }
  const r = spawnSync('npx', ['supabase', ...args], opts);
  if (!exit) return r;
  process.exit(r.status ?? 1);
}

const OPS = {
  status: () => { const u = dbUrl(); run(['migration', 'list', '--db-url', u], { secret: u }); },
  push: async () => {
    const u = dbUrl();
    if (envName === 'prod') {
      const listed = run(['migration', 'list', '--db-url', u], { secret: u, exit: false });
      if ((listed.status ?? 1) !== 0) fail('Ausstehende Migrationen konnten nicht gelesen werden.');
      await confirmProd();
      run(['db', 'push', '--db-url', u, '--yes'], { secret: u, stdin: 'ignore' });
      return;
    }
    run(['db', 'push', '--db-url', u], { secret: u });
  },
  functions: () => {
    const stdin = envName === 'prod' ? 'ignore' : undefined;
    run(['functions', 'deploy', '--project-ref', ref], { stdin });
  },
  secrets: () => {
    const file = `supabase/.env.${envName}`;
    if (!existsSync(file)) fail(`${file} fehlt. Vorlage: supabase/.env.example`);
    const stdin = envName === 'prod' ? 'ignore' : undefined;
    run(['secrets', 'set', '--project-ref', ref, '--env-file', file], { stdin });
  },
};

if (envName === 'prod' && op !== 'status' && op !== 'push') await confirmProd();
await OPS[op]();
