#!/usr/bin/env node
/**
 * DEV-Qualitätstor: boundary, tsc, lint, build, deno, dist-Scan.
 * (Kein separates Client-Unit-Test-Framework im Repo — Hinweis im Log.)
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard } from './dev_guard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
assertDevGuard();

function run(label, cmd, args) {
  console.log(`\n== ${label} ==\n`);
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: true, stdio: 'inherit' });
  if ((r.status ?? 1) !== 0) {
    console.error(`\n  FEHLER: ${label} fehlgeschlagen\n`);
    process.exit(r.status ?? 1);
  }
}

run('check:provider-boundary', 'npm', ['run', 'check:provider-boundary']);
run('tsc', 'npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit']);
run('lint', 'npm', ['run', 'lint']);
run('build', 'npm', ['run', 'build']);
run('test:deno', 'npm', ['run', 'test:deno']);

console.log('\n== Unit-Tests Client ==\n');
console.log('  (kein vitest/jest im Repo — übersprungen)\n');

console.log('== dist-Scan ==\n');
const dist = join(root, 'dist');
if (!existsSync(dist)) {
  console.error('  FEHLER: dist/ fehlt nach Build\n');
  process.exit(1);
}

const FORBIDDEN = [
  { re: /\bsk_(?:live|test)_[A-Za-z0-9]+/g, name: 'stripe_secret_in_dist' },
  { re: /\bacct_[A-Za-z0-9]+/g, name: 'acct_in_dist' },
  { re: /\bpk_live_[A-Za-z0-9]+/g, name: 'pk_live_in_dist' },
];

/** Erlaubte Treffer: nur als Vergleichstext / Dev-Namen in gebündeltem Code. */
const ALLOW_SUBSTRINGS = [
  'pk_live_', // Präfix-Vergleich in Validierung
  'sk_test_', // Modus-Vergleich
  'acct_', // Maskierer / Log-Redaction Muster
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(js|mjs|css|html|map)$/.test(name)) files.push(p);
  }
  return files;
}

let bad = 0;
for (const file of walk(dist)) {
  const text = readFileSync(file, 'utf8');
  for (const { re, name } of FORBIDDEN) {
    re.lastIndex = 0;
    const matches = text.match(re) || [];
    for (const m of matches) {
      // pk_live_ nur als Vergleichstext: Treffer ohne lange Key-Zeichen danach ok-ish;
      // echte Keys haben typisch >20 Zeichen Payload.
      const payload = m.replace(/^(sk_(?:live|test)_|acct_|pk_live_)/, '');
      if (payload.length < 8) continue; // nur Präfix / Kurzform
      // Maskierer-Beispiele und Test-Fixtures oft mit "fake" / "stub"
      if (/fake|stub|example|redacted|omlify/i.test(m)) continue;
      console.error(`  Treffer ${name} in ${file}: ${m.slice(0, 12)}…`);
      bad += 1;
    }
  }
}
void ALLOW_SUBSTRINGS;

if (bad > 0) {
  console.error(`\n  FEHLER: ${bad} verdächtige Treffer in dist/\n`);
  process.exit(1);
}
console.log('  OK  dist ohne echte sk_/acct_/pk_live_-Secrets\n');
console.log('  OK  dev:check\n');
