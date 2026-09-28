#!/usr/bin/env node
/**
 * Grenz-Prüfung I8: Stripe-SDK und Stripe-Typen nur im Adapter.
 *
 * Schlägt fehl, wenn `npm:stripe`, ein Import aus 'stripe' oder `Stripe.` in einer
 * Code-Datei außerhalb von supabase/functions/_shared/payments/stripe/ vorkommt.
 * Geprüft werden src/, supabase/ und scripts/.
 *
 * Ausnahme ab 1.3: @stripe/stripe-js bzw. @stripe/connect-js in src/ (noch nicht nötig,
 * die Muster treffen die Paketnamen nicht; `Stripe.` in src/ bleibt verboten).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_DIRS = ['src', 'supabase', 'scripts'];
const ALLOWED_PREFIX = 'supabase/functions/_shared/payments/stripe/';
const SELF = 'scripts/check_provider_boundary.mjs';
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.temp', '.branches']);

const PATTERNS = [
  { name: 'npm:stripe', re: /npm:stripe\b/ },
  { name: "from 'stripe'", re: /from\s+['"]stripe['"]/ },
  { name: "require('stripe')", re: /require\(\s*['"]stripe['"]\s*\)/ },
  { name: 'Stripe.', re: /\bStripe\./ },
];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (CODE_EXT.test(name)) out.push(full);
  }
}

const files = [];
for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

const violations = [];
let adapterFilesWithSdk = 0;

for (const full of files) {
  const rel = relative(ROOT, full).split(sep).join('/');
  if (rel === SELF) continue;
  const lines = readFileSync(full, 'utf8').split(/\r?\n/);
  const inAdapter = rel.startsWith(ALLOWED_PREFIX);
  let hit = false;
  lines.forEach((line, i) => {
    for (const p of PATTERNS) {
      if (!p.re.test(line)) continue;
      hit = true;
      if (!inAdapter) violations.push(`${rel}:${i + 1}  [${p.name}]  ${line.trim()}`);
    }
  });
  if (inAdapter && hit) adapterFilesWithSdk += 1;
}

console.log(`Grenz-Prüfung: ${files.length} Dateien in ${SCAN_DIRS.join(', ')} geprüft.`);
console.log(`Stripe-Bezüge im Adapter (${ALLOWED_PREFIX}): ${adapterFilesWithSdk} Dateien, erlaubt.`);

if (violations.length > 0) {
  console.error(`\nStripe außerhalb des Adapters (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nStripe-SDK und Stripe-Typen nur unter ' + ALLOWED_PREFIX + ' (I8).');
  process.exit(1);
}

console.log('Keine Stripe-Bezüge außerhalb des Adapters.');
