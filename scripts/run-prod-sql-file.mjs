#!/usr/bin/env node
/**
 * Execute a UTF-8 SQL file against PROD via Supabase Management API.
 * Requires: SUPABASE_PROD_ACCESS_TOKEN or `supabase login` session.
 * Usage: node scripts/run-prod-sql-file.mjs scripts/import-yomita-part1a.sql
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const PROD_REF = 'otnhxzomnjjthocovasu';
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/run-prod-sql-file.mjs <file.sql>');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');
const payload = JSON.stringify({ query: sql });

// Use Supabase CLI management API (linked session / access token)
const cmd = `supabase db query --project-ref ${PROD_REF} -f "${file.replace(/\\/g, '/')}" -o json`;
console.error('Running:', cmd);
try {
  const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 });
  console.log(out);
} catch (e) {
  console.error(e.stderr || e.message);
  process.exit(1);
}
