#!/usr/bin/env node
/**
 * DEV: Secrets aus supabase/.env.dev setzen (wie secrets:dev), mit Guard.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard } from './dev_guard.mjs';
import { runNodeScript } from './_spawn.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
assertDevGuard();

const r = runNodeScript(join(root, 'scripts/db.mjs'), ['secrets', 'dev']);
if (r.error) {
  console.error(`\n  FEHLER: ${r.error.message}\n`);
  process.exit(1);
}
process.exit(r.status ?? 1);
