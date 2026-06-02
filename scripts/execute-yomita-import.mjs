#!/usr/bin/env node
/**
 * Wipe + re-import Yomita tenant on linked Supabase (DEV by default).
 *
 * Usage:
 *   node scripts/execute-yomita-import.mjs
 *   node scripts/execute-yomita-import.mjs --skip-wipe   # import only (tenant already empty)
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const skipWipe = process.argv.includes('--skip-wipe');
const files = skipWipe
  ? ['import-yomita-part1a', 'import-yomita-part1b', 'import-yomita-part2', 'import-yomita-part3']
  : ['wipe-yomita-tenant', 'import-yomita-part1a', 'import-yomita-part1b', 'import-yomita-part2', 'import-yomita-part3'];

function runSqlFile(name) {
  const file = `scripts/${name}.sql`;
  const sql = readFileSync(file, 'utf8');
  console.error(`\n=== ${name} (${(Buffer.byteLength(sql) / 1024).toFixed(1)} KB) ===`);
  try {
    const out = execSync('supabase db query --linked --yes -o json', {
      input: sql,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      cwd: process.cwd(),
    });
    console.log(out.slice(0, 800));
  } catch (e) {
    console.error('FAILED', name);
    console.error(e.stderr?.slice(0, 3000) || e.message);
    process.exit(1);
  }
}

for (const name of files) {
  runSqlFile(name);
}

console.error('\nYomita import completed on linked project.');
