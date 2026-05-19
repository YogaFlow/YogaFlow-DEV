#!/usr/bin/env node
/**
 * Executes import SQL batches via Supabase Management API (requires logged-in CLI).
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const PROD_REF = 'otnhxzomnjjthocovasu';
const parts = ['part1a', 'part1b', 'part2', 'part3'];

for (const part of parts) {
  const file = `scripts/import-yomita-${part}.sql`;
  const sql = readFileSync(file, 'utf8');
  console.error(`\n=== Executing ${part} (${(Buffer.byteLength(sql) / 1024).toFixed(1)} KB) ===`);
  // Pipe SQL via stdin to psql through supabase — use db query with linked after link prod
  const escaped = sql.replace(/'/g, "''");
  try {
    const out = execSync(
      `supabase db query --linked --yes -o json`,
      {
        input: sql,
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        cwd: process.cwd(),
        env: { ...process.env },
      },
    );
    console.log(out.slice(0, 500));
  } catch (e) {
    console.error('FAILED', part);
    console.error(e.stderr?.slice(0, 2000) || e.message);
    process.exit(1);
  }
}
console.error('\nAll parts completed.');
