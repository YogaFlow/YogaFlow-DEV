#!/usr/bin/env node
/**
 * S1 1.4 — Rauchtest payments-webhook gegen die auf DEV deployte Function.
 *
 * Nicht ausführen, bevor 20260928224500_s1_4_webhook_rpcs.sql auf DEV liegt,
 * die Secrets gesetzt sind (npm run secrets:dev) und payments-webhook deployed ist.
 * Gegen PROD nie.
 *
 * Signiert selbst wie Stripe: Header `t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`.
 * STRIPE_WEBHOOK_SECRET kommt aus supabase/.env.dev und wird nie ausgegeben.
 *
 * Aufräumen ist nicht möglich: Rohzeilen ohne Studio lassen sich nicht löschen
 * (Lösch-Trigger, Absicht). Deshalb nur Event-IDs mit Präfix evt_smoke_; sie
 * werden am Ende ausgegeben (OFFENE_PUNKTE: evt_smoke_-Zeilen auf DEV).
 *
 * Verwendung: node scripts/test/s1_4_webhook_smoke.mjs
 */
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ERLAUBTE_REF = 'mufxhtctutfpzklwqnze';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const benutzteIds = [];

function ladeEnv(datei) {
  const out = {};
  for (const zeile of readFileSync(join(root, datei), 'utf8').split(/\r?\n/)) {
    const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function abbruch(text) {
  const fehler = new Error(text);
  fehler.abbruch = true;
  throw fehler;
}

function refAusKey(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString()).ref;
  } catch {
    return null;
  }
}

function ok(name, cond, detail = '') {
  if (!cond) abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
}

function zufall() {
  return randomBytes(6).toString('hex');
}

function signieren(body, secret) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
}

function eventBody(type, account, object) {
  const id = `evt_smoke_${zufall()}`;
  benutzteIds.push(id);
  return {
    id,
    body: JSON.stringify({
      id,
      object: 'event',
      api_version: '2026-08-26.dahlia',
      created: Math.floor(Date.now() / 1000),
      type,
      account,
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: { object },
    }),
  };
}

async function senden(url, body, signatur) {
  const headers = { 'Content-Type': 'application/json' };
  if (signatur) headers['stripe-signature'] = signatur;
  const res = await fetch(`${url}/functions/v1/payments-webhook`, { method: 'POST', headers, body });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

async function zeilen(admin, eventId) {
  const { data, error } = await admin
    .from('provider_events_raw')
    .select('id, event_type, tenant_id, livemode, processed_at, processing_error, attempts')
    .eq('provider', 'stripe')
    .eq('event_id', eventId);
  if (error) abbruch('Rohzeile lesen: ' + error.message);
  return data;
}

async function main() {
  const env = ladeEnv('.env');
  const fnEnv = ladeEnv('supabase/.env.dev');
  const url = env.VITE_SUPABASE_URL;
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = fnEnv.STRIPE_WEBHOOK_SECRET;
  if (!url || !service) abbruch('.env unvollständig (URL/SERVICE_ROLE)');
  if (!url.includes(ERLAUBTE_REF)) abbruch('URL zeigt nicht auf DEV (' + ERLAUBTE_REF + ')');
  if (refAusKey(service) !== ERLAUBTE_REF) abbruch('Service-Role-Key gehört nicht zu DEV');
  if (!secret || !secret.startsWith('whsec_')) abbruch('STRIPE_WEBHOOK_SECRET in supabase/.env.dev fehlt oder hat nicht das Format whsec_…');
  if (fnEnv.PAYMENTS_MODE !== 'test') abbruch('PAYMENTS_MODE in supabase/.env.dev ist nicht test');

  const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

  console.log('ohne Signatur');
  const ohne = eventBody('customer.created', `acct_smoke_${zufall()}`, { id: `cus_smoke_${zufall()}`, object: 'customer' });
  const r1 = await senden(url, ohne.body, null);
  ok('400', r1.status === 400, `status=${r1.status} code=${r1.body?.code}`);
  ok('keine Rohzeile', (await zeilen(admin, ohne.id)).length === 0);

  console.log('falsches Secret');
  const falsch = eventBody('customer.created', `acct_smoke_${zufall()}`, { id: `cus_smoke_${zufall()}`, object: 'customer' });
  const r2 = await senden(url, falsch.body, signieren(falsch.body, `whsec_smoke_falsch_${zufall()}`));
  ok('400 INVALID_SIGNATURE', r2.status === 400 && r2.body?.code === 'INVALID_SIGNATURE', `status=${r2.status} code=${r2.body?.code}`);
  ok('keine Rohzeile', (await zeilen(admin, falsch.id)).length === 0);

  console.log('gültig, customer.created, unbekanntes Konto');
  const kunde = eventBody('customer.created', `acct_smoke_${zufall()}`, { id: `cus_smoke_${zufall()}`, object: 'customer' });
  const r3 = await senden(url, kunde.body, signieren(kunde.body, secret));
  ok('200 received', r3.status === 200 && r3.body?.received === true, `status=${r3.status}`);
  let z = await zeilen(admin, kunde.id);
  ok('genau eine Rohzeile', z.length === 1, `anzahl=${z.length}`);
  ok(
    'tenant_id NULL, verarbeitet ohne Fehler',
    z[0].tenant_id === null && z[0].processed_at !== null && z[0].processing_error === null && z[0].attempts === 1,
    `processing_error=${z[0].processing_error} attempts=${z[0].attempts}`
  );

  console.log('dasselbe Event erneut');
  const r4 = await senden(url, kunde.body, signieren(kunde.body, secret));
  ok('200 received', r4.status === 200 && r4.body?.received === true, `status=${r4.status}`);
  z = await zeilen(admin, kunde.id);
  ok('weiter genau eine Zeile', z.length === 1, `anzahl=${z.length}`);
  ok('attempts unverändert', z[0].attempts === 1, `attempts=${z[0].attempts}`);

  console.log('gültig, account.updated, unbekanntes Konto');
  const acct = `acct_smoke_${zufall()}`;
  const konto = eventBody('account.updated', acct, {
    id: acct,
    object: 'account',
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    capabilities: {},
    requirements: { currently_due: [], past_due: [], eventually_due: [], current_deadline: null },
  });
  const r5 = await senden(url, konto.body, signieren(konto.body, secret));
  ok('200 received', r5.status === 200 && r5.body?.received === true, `status=${r5.status}`);
  z = await zeilen(admin, konto.id);
  ok('genau eine Rohzeile', z.length === 1, `anzahl=${z.length}`);
  ok(
    'TENANT_NOT_RESOLVED',
    z[0].tenant_id === null && z[0].processed_at !== null && z[0].processing_error === 'TENANT_NOT_RESOLVED',
    `processing_error=${z[0].processing_error}`
  );

  console.log('grün');
}

main()
  .catch((e) => {
    console.error(e.abbruch ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => {
    if (benutzteIds.length > 0) {
      console.log('\nBenutzte Event-IDs (Rohzeilen bleiben auf DEV, nur die gesendeten gültigen):');
      for (const id of benutzteIds) console.log('  ' + id);
    }
  });
