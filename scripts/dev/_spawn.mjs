/**
 * Kindprozesse ohne Shell starten (DEP0190).
 * npm/npx über npm-cli.js neben process.execPath; supabase aus node_modules.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fail(msg) {
  console.error(`\n  FEHLER: ${msg}\n`);
  process.exit(1);
}

/** npm-cli.js der Node-Installation (oder lokal, falls vorhanden). */
export function npmCli() {
  const candidates = [
    join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  fail('npm-cli.js nicht gefunden. Bitte Node/npm prüfen.');
}

export function npxCli() {
  const candidates = [
    join(root, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  fail('npx-cli.js nicht gefunden. Bitte Node/npm prüfen.');
}

export function supabaseBin() {
  const bin = join(
    root,
    'node_modules',
    'supabase',
    'bin',
    process.platform === 'win32' ? 'supabase.exe' : 'supabase',
  );
  if (!existsSync(bin)) fail(`Supabase-CLI fehlt (${bin}). Bitte npm ci.`);
  return bin;
}

/** node <script> … ohne Shell */
export function runNodeScript(scriptPath, args = [], opts = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
    ...opts,
  });
}

/** npm <args> über npm-cli.js ohne Shell */
export function runNpm(args, opts = {}) {
  return spawnSync(process.execPath, [npmCli(), ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
    ...opts,
  });
}

/** npx <args> über npx-cli.js ohne Shell */
export function runNpx(args, opts = {}) {
  return spawnSync(process.execPath, [npxCli(), ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    stdio: 'inherit',
    ...opts,
  });
}

/** supabase <args> direkt ohne Shell */
export function runSupabase(args, opts = {}) {
  const stdio = opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit';
  return spawnSync(supabaseBin(), args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    stdio,
    ...opts,
  });
}
