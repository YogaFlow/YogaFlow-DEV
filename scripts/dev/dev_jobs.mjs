#!/usr/bin/env node
/**
 * DEV: provider_jobs pause/resume mit Guard.
 * Usage: node scripts/dev/dev_jobs.mjs pause|resume
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard } from './dev_guard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
assertDevGuard();

const mode = (process.argv[2] || '').trim();
if (mode !== 'pause' && mode !== 'resume') {
  console.error('\n  FEHLER: pause oder resume nötig.\n');
  process.exit(1);
}

const flag = mode === 'pause' ? '--pause' : '--resume';
const r = spawnSync('node', [join(root, 'scripts/dev/provider_jobs_secret.mjs'), flag], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
