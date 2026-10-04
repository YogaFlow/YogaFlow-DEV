#!/usr/bin/env node
/**
 * DEV: ungeprüfte provider_events_raw-Fehler vor einem Zeitpunkt als reviewed markieren.
 *
 *   npm run dev:ops:review -- <ISO-Zeitpunkt>
 *   node scripts/dev/ops_mark_reviewed.mjs 2026-10-01T00:00:00.000Z
 *
 * Nur DEV (dev_guard). Ruft ops_mark_provider_errors_reviewed auf.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertDevGuard } from './dev_guard.mjs';

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

function fail(msg) {
  console.error('\n  FEHLER: ' + msg + '\n');
  process.exit(1);
}

assertDevGuard();

const raw = (process.argv[2] || '').trim();
if (!raw) {
  fail('Aufruf: npm run dev:ops:review -- <ISO-Zeitpunkt>');
}
const before = new Date(raw);
if (Number.isNaN(before.getTime())) {
  fail('Ungültiger ISO-Zeitpunkt: ' + raw);
}

const env = { ...ladeEnv(join(root, '.env')), ...ladeEnv(join(root, 'supabase/.env.dev')) };
const url = (env.VITE_SUPABASE_URL || '').trim();
const service = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !service) fail('.env unvollständig (URL/SERVICE_ROLE)');

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.rpc('ops_mark_provider_errors_reviewed', {
  p_before: before.toISOString(),
});
if (error) fail(error.message);

console.log(`  OK  marked ${data ?? 0} (received_at < ${before.toISOString()})`);
