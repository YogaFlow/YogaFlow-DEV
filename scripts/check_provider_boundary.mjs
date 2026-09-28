#!/usr/bin/env node
/**
 * Grenz-Prüfung I8 / U8: Stripe-SDK und Stripe-Typen nur im Adapter;
 * Connect.js nur in einer Frontend-Ausnahmedatei.
 *
 * Schlägt fehl, wenn `npm:stripe`, ein Import aus 'stripe' oder `Stripe.` in einer
 * Code-Datei außerhalb von supabase/functions/_shared/payments/stripe/ vorkommt.
 *
 * Ausnahme (1.3b / U8): genau eine Datei darf @stripe/connect-js und
 * @stripe/react-connect-js importieren:
 *   src/features/payments/StripeAccountOnboarding.tsx
 *
 * Geprüft werden src/, supabase/ und scripts/.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_DIRS = ['src', 'supabase', 'scripts'];
const ALLOWED_PREFIX = 'supabase/functions/_shared/payments/stripe/';
const CONNECT_ALLOWED = 'src/features/payments/StripeAccountOnboarding.tsx';
const SELF = 'scripts/check_provider_boundary.mjs';
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.temp', '.branches']);

const SDK_PATTERNS = [
  { name: 'npm:stripe', re: /npm:stripe\b/ },
  { name: "from 'stripe'", re: /from\s+['"]stripe['"]/ },
  { name: "require('stripe')", re: /require\(\s*['"]stripe['"]\s*\)/ },
  { name: 'Stripe.', re: /\bStripe\.[A-Za-z]/ },
];

const CONNECT_PATTERN = {
  name: '@stripe/connect-js|react-connect-js',
  re: /from\s+['"]@stripe\/(connect-js|react-connect-js)['"]|require\(\s*['"]@stripe\/(connect-js|react-connect-js)['"]\s*\)/,
};

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

/** @returns {{ sdk: string[], connectForbidden: boolean, connectAllowed: boolean }} */
function classifyLine(rel, line) {
  const sdk = [];
  const inAdapter = rel.startsWith(ALLOWED_PREFIX);
  for (const p of SDK_PATTERNS) {
    if (p.re.test(line) && !inAdapter) sdk.push(p.name);
  }
  const hasConnect = CONNECT_PATTERN.re.test(line);
  return {
    sdk,
    connectForbidden: hasConnect && rel !== CONNECT_ALLOWED,
    connectAllowed: hasConnect && rel === CONNECT_ALLOWED,
  };
}

const files = [];
for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

const violations = [];
let adapterFilesWithSdk = 0;
let connectAllowedHits = 0;

for (const full of files) {
  const rel = relative(ROOT, full).split(sep).join('/');
  if (rel === SELF) continue;
  const lines = readFileSync(full, 'utf8').split(/\r?\n/);
  const inAdapter = rel.startsWith(ALLOWED_PREFIX);
  lines.forEach((line, i) => {
    const c = classifyLine(rel, line);
    if (c.connectAllowed) connectAllowedHits += 1;
    for (const name of c.sdk) {
      violations.push(`${rel}:${i + 1}  [${name}]  ${line.trim()}`);
    }
    if (c.connectForbidden) {
      violations.push(`${rel}:${i + 1}  [${CONNECT_PATTERN.name}]  ${line.trim()}`);
    }
  });
  if (inAdapter) {
    for (const line of lines) {
      if (SDK_PATTERNS.some((p) => p.re.test(line))) {
        adapterFilesWithSdk += 1;
        break;
      }
    }
  }
}

console.log(`Grenz-Prüfung: ${files.length} Dateien in ${SCAN_DIRS.join(', ')} geprüft.`);
console.log(`Stripe-Bezüge im Adapter (${ALLOWED_PREFIX}): ${adapterFilesWithSdk} Dateien, erlaubt.`);
console.log(`Connect.js-Ausnahme (${CONNECT_ALLOWED}): ${connectAllowedHits} Treffer, erlaubt.`);

if (violations.length > 0) {
  console.error(`\nStripe außerhalb der erlaubten Orte (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  console.error('\nSDK nur unter ' + ALLOWED_PREFIX + '; Connect.js nur in ' + CONNECT_ALLOWED + ' (I8/U8).');
  process.exit(1);
}

if (connectAllowedHits === 0) {
  console.error(`\nErwartet mindestens einen Connect.js-Import in ${CONNECT_ALLOWED}.`);
  process.exit(1);
}

// Gegenprobe: Import außerhalb der Ausnahme muss erkannt werden; Ausnahme greift.
const probeOut = classifyLine(
  'src/pages/Settings.tsx',
  "import { loadConnectAndInitialize } from '@stripe/connect-js';",
);
if (!probeOut.connectForbidden) {
  console.error('Gegenprobe fehlgeschlagen: Connect-Import außerhalb der Ausnahme wurde nicht erkannt.');
  process.exit(1);
}
const probeIn = classifyLine(
  CONNECT_ALLOWED,
  "import { loadConnectAndInitialize } from '@stripe/connect-js';",
);
if (probeIn.connectForbidden || !probeIn.connectAllowed) {
  console.error('Gegenprobe fehlgeschlagen: Ausnahme-Datei wird fälschlich beanstandet.');
  process.exit(1);
}
console.log('Gegenprobe: Connect-Import außerhalb der Ausnahme wird erkannt; Ausnahme greift.');

console.log('Keine Stripe-Bezüge außerhalb der erlaubten Orte.');
