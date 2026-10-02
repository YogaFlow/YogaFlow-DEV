#!/usr/bin/env node
/**
 * DEV-Guard: bricht ab, wenn die Umgebung nicht die erlaubte DEV-Ref ist.
 *
 * Prüft supabase/.env.dev (Kommentar / implizit) und .env.deploy DEV_REF
 * sowie optional VITE_SUPABASE_URL aus .env gegen mufxhtctutfpzklwqnze.
 *
 * Verwendung: importiert oder als CLI: node scripts/dev/dev_guard.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ERLAUBTE_DEV_REF = 'mufxhtctutfpzklwqnze';

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

function refAusJwt(key) {
  try {
    return JSON.parse(Buffer.from(String(key).split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

/**
 * @returns {typeof ERLAUBTE_DEV_REF}
 */
export function assertDevGuard() {
  const deploy = ladeEnv(join(root, '.env.deploy'));
  const envDev = ladeEnv(join(root, 'supabase', '.env.dev'));
  const rootEnv = ladeEnv(join(root, '.env'));

  if (!existsSync(join(root, 'supabase', '.env.dev'))) {
    console.error('\n  FEHLER: supabase/.env.dev fehlt.\n');
    process.exit(1);
  }

  const deployRef = (deploy.DEV_REF || '').trim();
  if (deployRef !== ERLAUBTE_DEV_REF) {
    console.error(
      `\n  FEHLER: DEV_REF in .env.deploy ist nicht ${ERLAUBTE_DEV_REF} (ist: ${deployRef || 'leer'}).\n`,
    );
    process.exit(1);
  }

  const url = (rootEnv.VITE_SUPABASE_URL || '').trim();
  if (url && !url.includes(ERLAUBTE_DEV_REF)) {
    console.error('\n  FEHLER: VITE_SUPABASE_URL zeigt nicht auf DEV.\n');
    process.exit(1);
  }

  const anon = rootEnv.VITE_SUPABASE_ANON_KEY;
  if (anon) {
    const r = refAusJwt(anon);
    if (r && r !== ERLAUBTE_DEV_REF) {
      console.error('\n  FEHLER: Anon-Key gehört nicht zu DEV.\n');
      process.exit(1);
    }
  }

  // .env.dev muss existieren; Stripe-Keys nur test erlauben, wenn gesetzt
  const sk = (envDev.STRIPE_SECRET_KEY || '').trim();
  if (sk && !sk.startsWith('sk_test_') && !sk.startsWith('rk_test_')) {
    console.error('\n  FEHLER: STRIPE_SECRET_KEY in supabase/.env.dev ist kein Test-Key.\n');
    process.exit(1);
  }

  return ERLAUBTE_DEV_REF;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  assertDevGuard();
  console.log(`  OK  DEV-Guard: ${ERLAUBTE_DEV_REF}`);
}
