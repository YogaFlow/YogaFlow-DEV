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
 *   node scripts/db.mjs push prod --include-all
 *       wie push, plus Flag fuer Migrationen mit Version vor der letzten Remote-Version
 *   node scripts/db.mjs functions dev       alle Edge Functions deployen
 *   node scripts/db.mjs secrets dev         Secrets aus supabase/.env.dev setzen
 *   ... jeweils auch mit `prod` (fragt nach)
 *   `push prod` zeigt zuerst die ausstehenden Migrationen.
 *
 * Konfiguration: .env.deploy im Projektroot (nicht im Repo, siehe .env.deploy.example).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE =
  'Verwendung: node scripts/db.mjs <status|push|functions|secrets> <dev|prod> [--include-all]\n' +
  '  --include-all nur bei push: wendet auch Migrationen an, deren Version vor der letzten Remote-Version liegt.';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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

const argv = process.argv.slice(2);
const includeAll = argv.includes('--include-all');
const positional = argv.filter((a) => a !== '--include-all');
const [op, envName] = positional;
if (!op || !envName || positional.length !== 2) fail(USAGE);
if (!['status', 'push', 'functions', 'secrets'].includes(op)) fail(USAGE);
if (!['dev', 'prod'].includes(envName)) fail(USAGE);
if (includeAll && op !== 'push') fail('--include-all ist nur fuer push erlaubt.\n' + USAGE);

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

async function askTyped(prompt, expected) {
  if (!process.stdin.isTTY) {
    fail('Diese Bestaetigung braucht ein echtes Terminal (getippte Eingabe).');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => rl.question(prompt, res));
  rl.close();
  process.stdin.pause();
  if (answer.trim() !== expected) fail('Abgebrochen — nichts wurde geaendert.');
  console.log('');
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

  await askTyped('     Zum Fortfahren PROD eingeben: ', 'PROD');
}

/** Lokale Migrationsversionen (14-stelliger Zeitstempel-Praefix). */
function localMigrationVersions() {
  const dir = join(root, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => {
      const m = f.match(/^(\d{14})_/);
      return m ? { version: m[1], file: f } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * Remote-Versionen aus `supabase migration list`.
 * Zeilen mit zwei 14-stelligen Zahlen oder „local | remote“.
 */
function parseRemoteVersions(listOutput) {
  const remote = new Set();
  for (const line of String(listOutput || '').split(/\r?\n/)) {
    const versions = line.match(/\b(\d{14})\b/g) || [];
    if (versions.length === 0) continue;
    // Typisch: Local | Remote — wenn zwei Spalten, ist die letzte Remote.
    if (versions.length >= 2) remote.add(versions[versions.length - 1]);
    else if (/\bRemote\b/i.test(line) === false && line.includes('|')) {
      // eine Zahl in Local-Spalte ohne Remote → nicht remote
    } else if (versions.length === 1 && !line.trim().startsWith(versions[0])) {
      remote.add(versions[0]);
    }
  }
  // Robust: jede Zeile „VERSION | VERSION“ → Remote; „VERSION |“ → nur lokal
  const remoteStrict = new Set();
  for (const line of String(listOutput || '').split(/\r?\n/)) {
    const m = line.match(/(\d{14})\s*\|\s*(\d{14})/);
    if (m) remoteStrict.add(m[2]);
    const onlyRemote = line.match(/^\s*\|\s*(\d{14})\s*$/);
    if (onlyRemote) remoteStrict.add(onlyRemote[1]);
  }
  return remoteStrict.size > 0 ? remoteStrict : remote;
}

/** Migrationen, die ohne --include-all liegen bleiben (Version < max Remote, nicht remote). */
function outOfOrderLocal(remoteVersions) {
  if (remoteVersions.size === 0) return [];
  const maxRemote = [...remoteVersions].sort().at(-1);
  return localMigrationVersions().filter(
    (m) => !remoteVersions.has(m.version) && m.version < maxRemote
  );
}

function printOutOfOrder(rows) {
  console.log('');
  console.log('  Migrationen, die durch --include-all außer der Reihe angewendet werden:');
  if (rows.length === 0) {
    console.log('    (keine — alle ausstehenden Versionen liegen nach der letzten Remote-Version)');
  } else {
    for (const m of rows) {
      console.log(`    ${m.version}  ${m.file}`);
    }
  }
  console.log('');
}

async function confirmIncludeAll(rows) {
  printOutOfOrder(rows);
  if (envName !== 'prod') return;
  await askTyped('     Zum Fortfahren mit außer-Reihe INCLUDE-ALL eingeben: ', 'INCLUDE-ALL');
}

function dbUrl() {
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}.pooler.supabase.com:5432/postgres`;
}

/**
 * Fuehrt supabase aus und haelt Geheimnisse aus der Konsolenausgabe heraus.
 * Nach einer PROD-Bestaetigung: `stdin: 'ignore'` (Windows: readline haelt sonst die Eingabe).
 */
function run(args, { secret, stdin, input, exit = true, capture = false } = {}) {
  const shown = args.map((a) => (secret && a === secret ? '<verborgen>' : a));
  console.log(`  > supabase ${shown.join(' ')}\n`);
  const stdio = capture
    ? ['ignore', 'pipe', 'pipe']
    : [stdin ?? 'inherit', 'inherit', 'inherit'];
  const opts = { stdio, shell: true, encoding: capture ? 'utf8' : undefined };
  if (input !== undefined) {
    stdio[0] = 'pipe';
    opts.input = input;
  }
  const r = spawnSync('npx', ['supabase', ...args], opts);
  if (capture) {
    return {
      status: r.status ?? 1,
      stdout: r.stdout || '',
      stderr: r.stderr || '',
    };
  }
  if (!exit) return r;
  process.exit(r.status ?? 1);
}

const OPS = {
  status: () => { const u = dbUrl(); run(['migration', 'list', '--db-url', u], { secret: u }); },
  push: async () => {
    const u = dbUrl();
    if (envName === 'prod') {
      const listed = run(['migration', 'list', '--db-url', u], { secret: u, exit: false, capture: true });
      if ((listed.status ?? 1) !== 0) {
        process.stderr.write(listed.stderr || listed.stdout || '');
        fail('Ausstehende Migrationen konnten nicht gelesen werden.');
      }
      process.stdout.write(listed.stdout);
      if (listed.stderr) process.stderr.write(listed.stderr);

      const remoteVersions = parseRemoteVersions(listed.stdout + '\n' + listed.stderr);
      const ooo = outOfOrderLocal(remoteVersions);

      if (ooo.length > 0 && !includeAll) {
        printOutOfOrder(ooo);
        fail(
          'Es gibt Migrationen mit Version vor der letzten Remote-Version.\n' +
            '  Push mit: node scripts/db.mjs push prod --include-all\n' +
            '  (zusaetzliche Bestaetigung INCLUDE-ALL)'
        );
      }

      if (includeAll) {
        await confirmIncludeAll(ooo);
      }

      await confirmProd();
      const pushArgs = ['db', 'push', '--db-url', u, '--yes'];
      if (includeAll) pushArgs.push('--include-all');
      run(pushArgs, { secret: u, stdin: 'ignore' });
      return;
    }

    // DEV
    if (includeAll) {
      const listed = run(['migration', 'list', '--db-url', u], { secret: u, exit: false, capture: true });
      if ((listed.status ?? 1) === 0) {
        const remoteVersions = parseRemoteVersions(listed.stdout + '\n' + listed.stderr);
        printOutOfOrder(outOfOrderLocal(remoteVersions));
      } else {
        console.log('  (Migration list fuer Vorab-Anzeige fehlgeschlagen — push folgt trotzdem)\n');
      }
    }
    const pushArgs = ['db', 'push', '--db-url', u];
    if (includeAll) pushArgs.push('--include-all');
    run(pushArgs, { secret: u });
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
