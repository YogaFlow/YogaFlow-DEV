#!/usr/bin/env node
/** B2: ops-monitor Rauchtest (collect + HTTP). Nur DEV. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertDevEnv, ladeEnv } from './_helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function ladeDatei(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const zeile of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

async function main() {
  const env = { ...ladeEnv(), ...ladeDatei(join(root, 'supabase', '.env.dev')) };
  const { url, service } = assertDevEnv(env);
  const secret = (env.OPS_MONITOR_SECRET || '').trim();
  if (!secret) {
    console.error('OPS_MONITOR_SECRET fehlt');
    process.exit(1);
  }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('ops_monitor_collect');
  if (error) {
    console.error('collect:', error.message);
    process.exit(1);
  }
  console.log('  OK  collect findings', Array.isArray(data) ? data.length : 0);

  const res = await fetch(`${url}/functions/v1/ops-monitor`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200) {
    console.error('ops-monitor HTTP', res.status, body);
    process.exit(1);
  }
  console.log('  OK  ops-monitor', body.code, 'mailed=', body.mailed, 'findings=', body.findings);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
