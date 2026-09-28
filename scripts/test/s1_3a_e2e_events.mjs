#!/usr/bin/env node
/**
 * S1 1.3a — Hilfe nach echtem Onboarding im Browser (V4).
 *
 * Nur DEV, nur lesen. Nicht ausführen, bevor Migration und Functions auf DEV liegen.
 * Gegen PROD nie.
 *
 * Zeigt für ein Studio (Slug als Argument) die Rohzeilen in provider_events_raw
 * der letzten 60 Minuten (Typ, Zeitpunkt, processing_error) und den aktuellen
 * Stand aus provider_accounts / provider_capabilities / tenant_payment_settings
 * (service_role, ohne Nutzer-Login). Keine acct_…-Ausgabe.
 *
 * Verwendung: node scripts/test/s1_3a_e2e_events.mjs <tenant-slug>
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function ladeEnv(datei) {
  const out = {};
  for (const zeile of readFileSync(join(root, datei), 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

function abbruch(text) {
  console.error(text);
  process.exit(1);
}

const slug = (process.argv[2] || '').trim().toLowerCase();
if (!/^[a-z0-9]{3,30}$/.test(slug)) {
  abbruch('Usage: node scripts/test/s1_3a_e2e_events.mjs <tenant-slug>');
}

const env = ladeEnv('.env');
const url = env.VITE_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) abbruch('.env unvollständig (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV');
if (refAusKey(service) !== ERLAUBTE_REF) abbruch('Service-Role-Key gehört nicht zu DEV');

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('x-omlify-tenant', slug);
      return fetch(input, { ...init, headers });
    },
  },
});

const { data: tenant, error: tErr } = await admin
  .from('tenants')
  .select('id, slug, name')
  .eq('slug', slug)
  .maybeSingle();
if (tErr) abbruch('Studio lesen: ' + tErr.message);
if (!tenant) abbruch(`Studio „${slug}“ nicht gefunden`);

const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const { data: accountRow, error: aErr } = await admin
  .from('provider_accounts')
  .select(
    'id, onboarding_status, charges_enabled, payouts_enabled, details_submitted, requirements_pending, requirements_due_at, disconnected_at, livemode, provider_ref',
  )
  .eq('tenant_id', tenant.id)
  .maybeSingle();
if (aErr) abbruch('provider_accounts: ' + aErr.message);

const { data: events, error: eErr } = await admin
  .from('provider_events_raw')
  .select('event_id, event_type, received_at, processed_at, processing_error, livemode')
  .eq('tenant_id', tenant.id)
  .gte('received_at', since)
  .order('received_at', { ascending: false });
if (eErr) {
  console.warn('Hinweis tenant_id-Filter:', eErr.message);
}

let byAccount = [];
if (accountRow?.provider_ref) {
  const { data, error } = await admin
    .from('provider_events_raw')
    .select('event_id, event_type, received_at, processed_at, processing_error, livemode, tenant_id')
    .eq('account_ref', accountRow.provider_ref)
    .gte('received_at', since)
    .order('received_at', { ascending: false });
  if (error) abbruch('Events lesen: ' + error.message);
  byAccount = data || [];
}

const merged = new Map();
for (const row of [...(events || []), ...byAccount]) {
  merged.set(row.event_id, row);
}
const rows = [...merged.values()].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));

console.log(`Studio: ${tenant.name} (${tenant.slug})`);
console.log(`Fenster: seit ${since} (60 Min)`);
console.log(`provider_events_raw: ${rows.length} Zeile(n)\n`);

if (rows.length === 0) {
  console.log('(keine Rohzeilen in diesem Fenster)');
} else {
  for (const r of rows) {
    console.log(
      [
        r.received_at,
        r.event_type,
        r.processing_error ?? 'ok',
        r.processed_at ? 'processed' : 'open',
        r.livemode ? 'live' : 'test',
      ].join(' | '),
    );
  }
}

const { data: caps, error: cErr } = await admin
  .from('provider_capabilities')
  .select('method, status')
  .eq('tenant_id', tenant.id);
if (cErr) abbruch('provider_capabilities: ' + cErr.message);

const { data: settings, error: setErr } = await admin
  .from('tenant_payment_settings')
  .select('online_payments_enabled, allow_onsite_payment')
  .eq('tenant_id', tenant.id)
  .maybeSingle();
if (setErr) abbruch('tenant_payment_settings: ' + setErr.message);

const accountSafe = accountRow
  ? {
      onboarding_status: accountRow.onboarding_status,
      charges_enabled: accountRow.charges_enabled,
      payouts_enabled: accountRow.payouts_enabled,
      details_submitted: accountRow.details_submitted,
      requirements_pending: accountRow.requirements_pending,
      requirements_due_at: accountRow.requirements_due_at,
      disconnected_at: accountRow.disconnected_at,
      livemode: accountRow.livemode,
    }
  : { onboarding_status: 'not_started' };

console.log('\nStand (service_role, ohne acct_…):');
console.log(
  JSON.stringify(
    {
      provider_accounts: accountSafe,
      provider_capabilities: caps ?? [],
      tenant_payment_settings: settings ?? {
        online_payments_enabled: false,
        allow_onsite_payment: true,
      },
    },
    null,
    2,
  ),
);
