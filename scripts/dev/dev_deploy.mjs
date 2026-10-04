#!/usr/bin/env node
/**
 * DEV: eine Edge Function deployen.
 * Usage: node scripts/dev/dev_deploy.mjs <function-name>
 *   oder: npm run dev:deploy -- <function-name>
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard, ERLAUBTE_DEV_REF } from './dev_guard.mjs';
import { runSupabase } from './_spawn.mjs';

assertDevGuard();

const name = (process.argv[2] || '').trim();
if (!name || name.includes('/') || name.includes(' ')) {
  console.error('\n  FEHLER: Genau ein Function-Name nötig. Beispiel: npm run dev:deploy -- payments-jobs\n');
  process.exit(1);
}
if (name === '--all' || name === 'all') {
  console.error('\n  FEHLER: Kein Massen-Deploy. Nur ein Name.\n');
  process.exit(1);
}

console.log(`  Deploy ${name} → ${ERLAUBTE_DEV_REF}\n`);
const r = runSupabase(['functions', 'deploy', name, '--project-ref', ERLAUBTE_DEV_REF]);
if (r.error) {
  console.error(`\n  FEHLER: ${r.error.message}\n`);
  process.exit(1);
}
process.exit(r.status ?? 1);
