#!/usr/bin/env node
/**
 * DEV: Secrets aus supabase/.env.dev setzen (wie secrets:dev), mit Guard.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDevGuard } from './dev_guard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
assertDevGuard();

const r = spawnSync('node', [join(root, 'scripts/db.mjs'), 'secrets', 'dev'], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
