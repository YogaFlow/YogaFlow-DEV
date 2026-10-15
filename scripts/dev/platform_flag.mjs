#!/usr/bin/env node
/**
 * DEV-Helfer: Plattform-Schalter online_payments ein- oder ausschalten (U7).
 *
 * Nur gegen die lokale .env (DEV). Nie PROD.
 *
 * Verwendung:
 *   node scripts/dev/platform_flag.mjs on
 *   node scripts/dev/platform_flag.mjs off
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const KEY = 'online_payments';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function ladeEnv(datei) {
  const out = {};
  for (const zeile of readFileSync(join(root, datei), 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function abbruch(text) {
  console.error(text);
  process.exit(1);
}

function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

const arg = (process.argv[2] ?? '').toLowerCase();
if (arg !== 'on' && arg !== 'off') {
  abbruch('Aufruf: node scripts/dev/platform_flag.mjs on|off');
}
const enabled = arg === 'on';

const env = ladeEnv('.env');
const url = env.VITE_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) abbruch('.env unvollständig (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');

const ref = refAusKey(service);
if (ref !== ERLAUBTE_REF) {
  abbruch(`Abbruch: Service-Role gehört nicht zu DEV (erwartet ${ERLAUBTE_REF}).`);
}

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.rpc('set_platform_flag', {
  p_key: KEY,
  p_enabled: enabled,
});

if (error || !data?.success) {
  abbruch(`set_platform_flag fehlgeschlagen: ${error?.message || JSON.stringify(data)}`);
}

console.log(`Plattform-Schalter ${KEY}: ${enabled ? 'an' : 'aus'}`);
