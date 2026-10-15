#!/usr/bin/env node
/**
 * DEV: provider_jobs pause/resume mit Guard.
 * Usage: node scripts/dev/dev_jobs.mjs pause|resume
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard } from './dev_guard.mjs';
import { runNodeScript } from './_spawn.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
assertDevGuard();

const mode = (process.argv[2] || '').trim();
if (mode !== 'pause' && mode !== 'resume') {
  console.error('\n  FEHLER: pause oder resume nötig.\n');
  process.exit(1);
}

const flag = mode === 'pause' ? '--pause' : '--resume';
const r = runNodeScript(join(root, 'scripts/dev/provider_jobs_secret.mjs'), [flag]);
if (r.error) {
  console.error(`\n  FEHLER: ${r.error.message}\n`);
  process.exit(1);
}
process.exit(r.status ?? 1);
