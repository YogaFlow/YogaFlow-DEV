#!/usr/bin/env node
/**
 * DEV: ein provider_events_raw-Ereignis erneut verarbeiten.
 *
 * Stripe-Webhook setzt bei Verarbeitungsfehlern processed_at → erneute
 * Zustellung wird als ALREADY_PROCESSED verworfen. Signiertes Re-POST des
 * gespeicherten JSON scheitert oft (Payload ist geparst, Bytes ≠ Original).
 *
 * Ablauf: processed_at zurücksetzen → bei Disputes Stripe nachlesen →
 * record_payment_dispute → mark_provider_event_processed.
 *
 * Verwendung:
 *   node scripts/dev/replay_provider_event.mjs <event_uuid>
 *
 * Nur DEV. Keine Secrets/echten IDs in der Ausgabe.
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

const eventId = (process.argv[2] || '').trim();
if (!/^[0-9a-f-]{36}$/i.test(eventId)) {
  fail('Aufruf: node scripts/dev/replay_provider_event.mjs <event_uuid>');
}

const env = { ...ladeEnv(join(root, '.env')), ...ladeEnv(join(root, 'supabase/.env.dev')) };
const url = (env.VITE_SUPABASE_URL || '').trim();
const service = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const stripeKey = (env.STRIPE_SECRET_KEY || '').trim();
const mode = (env.PAYMENTS_MODE || '').trim();

if (!url || !service) fail('.env unvollständig (URL/SERVICE_ROLE)');
if (mode !== 'test') fail('Nur PAYMENTS_MODE=test');
if (!stripeKey || (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('rk_test_'))) {
  fail('STRIPE_SECRET_KEY (test) fehlt');
}

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: row, error: readErr } = await admin
  .from('provider_events_raw')
  .select('id, event_type, processed_at, processing_error, payload, livemode, account_ref')
  .eq('id', eventId)
  .maybeSingle();

if (readErr) fail('lesen: ' + readErr.message);
if (!row) fail('Ereignis nicht gefunden');
if (row.livemode === true) fail('Live-Ereignis — Replay nur für Testmodus');

const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
const eventType = row.event_type;

if (!String(eventType).startsWith('charge.dispute.')) {
  fail(
    `Replay für Typ ${eventType} noch nicht implementiert (nur charge.dispute.*). ` +
      'Signiertes Webhook-Re-POST scheitert am geparsten Payload.',
  );
}

const obj = payload?.data?.object;
const disputeRef = typeof obj?.id === 'string' ? obj.id : null;
const accountRef =
  (typeof row.account_ref === 'string' && row.account_ref) ||
  (typeof payload?.account === 'string' ? payload.account : null);

if (!disputeRef || !(disputeRef.startsWith('du_') || disputeRef.startsWith('dp_'))) {
  fail('Dispute-Ref im Payload fehlt oder Prefix unbekannt');
}
if (!accountRef || !accountRef.startsWith('acct_')) {
  fail('account_ref fehlt');
}

const { error: resetErr } = await admin
  .from('provider_events_raw')
  .update({ processed_at: null, processing_error: null })
  .eq('id', eventId);
if (resetErr) fail('Reset processed_at: ' + resetErr.message);

console.log(`  Replay ${eventType} (vorher error=${row.processing_error ?? 'null'})…`);

const stripeRes = await fetch(
  `https://api.stripe.com/v1/disputes/${encodeURIComponent(disputeRef)}`,
  {
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Stripe-Account': accountRef,
    },
  },
);
const dispute = await stripeRes.json().catch(() => ({}));
if (!stripeRes.ok) {
  fail('Stripe retrieveDispute: ' + (dispute?.error?.message || stripeRes.status));
}

const paymentRef =
  typeof dispute.payment_intent === 'string'
    ? dispute.payment_intent
    : typeof dispute.payment_intent?.id === 'string'
      ? dispute.payment_intent.id
      : null;
if (!paymentRef || !paymentRef.startsWith('pi_')) {
  fail('payment_intent am Dispute fehlt');
}

const { data: pay, error: payErr } = await admin
  .from('payments')
  .select('id')
  .eq('provider', 'stripe')
  .eq('provider_ref', paymentRef)
  .maybeSingle();
if (payErr) fail('payment lookup: ' + payErr.message);
if (!pay?.id) fail('Zahlung zur pi_… nicht gefunden (orphan)');

const amountCents = Number(dispute.amount);
const status = typeof dispute.status === 'string' ? dispute.status : 'needs_response';
if (!Number.isFinite(amountCents) || amountCents <= 0) fail('amount ungültig');

const { data: rec, error: recErr } = await admin.rpc('record_payment_dispute', {
  p_payment_id: pay.id,
  p_provider_ref: disputeRef,
  p_amount_cents: amountCents,
  p_status: status,
});
if (recErr) fail('record_payment_dispute: ' + recErr.message);
if (!rec?.success) fail('record_payment_dispute: ' + JSON.stringify(rec));

const { error: markErr } = await admin.rpc('mark_provider_event_processed', {
  p_id: eventId,
  p_error: null,
});
if (markErr) fail('mark_provider_event_processed: ' + markErr.message);

const { data: after } = await admin
  .from('provider_events_raw')
  .select('processed_at, processing_error')
  .eq('id', eventId)
  .maybeSingle();

const { count: dispN } = await admin
  .from('payment_disputes')
  .select('id', { count: 'exact', head: true })
  .eq('provider_ref', disputeRef);

console.log(`  record_payment_dispute ok is_new=${rec.is_new === true}`);
console.log(
  `  Danach: processed=${after?.processed_at ? 'ja' : 'nein'} error=${after?.processing_error ?? 'null'} disputes=${dispN ?? 0}`,
);

if (!after?.processed_at || after?.processing_error || (dispN ?? 0) < 1) process.exit(1);
console.log('  OK');
