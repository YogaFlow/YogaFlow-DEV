#!/usr/bin/env node
/**
 * DEV-Helfer: Payment-Method-Domain für ein Studio-Konto bei Stripe registrieren (C11/F7).
 *
 * Nur gegen die lokale .env (DEV). Nie PROD.
 * Konto-Suche wie payments-onboarding (get_owner_payment_context):
 *   provider_accounts WHERE tenant_id = … AND provider = 'stripe'
 *   und onboarding_status = 'active', disconnected_at IS NULL.
 *
 * Verwendung:
 *   node scripts/dev/register_payment_domain.mjs <slug>
 *   node scripts/dev/register_payment_domain.mjs demoalpha
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { abbruch, assertDevEnv, ladeEnv } from '../test/_helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function ladeEnvDatei(datei) {
  const out = {};
  try {
    for (const zeile of readFileSync(join(root, datei), 'utf8').split(/\r?\n/)) {
      const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // optional
  }
  return out;
}

const slug = (process.argv[2] ?? '').trim().toLowerCase();
if (!/^[a-z0-9]{3,30}$/.test(slug)) {
  console.error('Aufruf: node scripts/dev/register_payment_domain.mjs <slug>');
  process.exit(1);
}

async function main() {
  const env = { ...ladeEnv(), ...ladeEnvDatei('supabase/.env.dev') };
  const { url, service } = assertDevEnv(env);
  const stripeKey = env.STRIPE_SECRET_KEY;
  const mode = (env.PAYMENTS_MODE ?? '').trim();
  const baseDomain = (env.APP_BASE_DOMAIN ?? 'omlify-dev.de').trim().toLowerCase();

  if (!stripeKey) abbruch('STRIPE_SECRET_KEY fehlt (supabase/.env.dev)');
  if (mode !== 'test') abbruch('Nur bei PAYMENTS_MODE=test');
  if (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('rk_test_')) {
    abbruch('Stripe-Key muss sk_test_/rk_test_ sein');
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: studios, error: tErr } = await admin
    .from('tenants')
    .select('id, slug')
    .eq('slug', slug);
  if (tErr) abbruch('Studio lesen: ' + tErr.message);
  const studioCount = studios?.length ?? 0;
  if (studioCount !== 1) {
    abbruch(`Kein aktives Stripe-Konto für ${slug} — Studios mit diesem Slug: ${studioCount}`);
  }
  const tenant = studios[0];

  // Gleicher Kern wie get_owner_payment_context: tenant_id + provider = stripe.
  // Aktiv: onboarding_status = 'active', nicht getrennt (disconnected_at).
  const { data: accounts, error: aErr } = await admin
    .from('provider_accounts')
    .select('onboarding_status, disconnected_at, charges_enabled, livemode')
    .eq('tenant_id', tenant.id)
    .eq('provider', 'stripe');
  if (aErr) abbruch('provider_accounts lesen: ' + aErr.message);

  const accountCount = accounts?.length ?? 0;
  const active = (accounts ?? []).find(
    (a) => a.onboarding_status === 'active' && a.disconnected_at == null,
  );

  if (!active) {
    const statusList = (accounts ?? [])
      .map((a) => {
        const disc = a.disconnected_at != null ? ',getrennt' : '';
        return `${a.onboarding_status ?? '?'}${disc}`;
      })
      .join('; ') || '(keine)';
    abbruch(
      `Kein aktives Stripe-Konto für ${slug} — Studios: ${studioCount}, Konten: ${accountCount}, Status: ${statusList}`,
    );
  }

  // provider_ref erst holen, wenn klar aktiv — nie in Fehlermeldungen ausgeben.
  const { data: accountRow, error: refErr } = await admin
    .from('provider_accounts')
    .select('provider_ref')
    .eq('tenant_id', tenant.id)
    .eq('provider', 'stripe')
    .eq('onboarding_status', 'active')
    .is('disconnected_at', null)
    .maybeSingle();
  if (refErr || !accountRow?.provider_ref) {
    abbruch(
      `Kein aktives Stripe-Konto für ${slug} — Studios: ${studioCount}, Konten: ${accountCount}, Status: active (ohne Ref)`,
    );
  }

  const domain = `${slug}.${baseDomain}`;
  const body = new URLSearchParams({ domain_name: domain });
  const res = await fetch('https://api.stripe.com/v1/payment_method_domains', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': accountRow.provider_ref,
    },
    body,
  });
  const json = await res.json();
  if (res.ok) {
    console.log(`Domain registriert: ${domain} (${json.id ?? 'ok'})`);
    return;
  }

  const msg = String(json?.error?.message ?? json?.error?.code ?? res.status);
  if (/already/i.test(msg) || json?.error?.code === 'resource_already_exists') {
    console.log(`Domain bereits registriert: ${domain}`);
    return;
  }

  abbruch(`Stripe-Fehler: ${msg}`);
}

main().catch((err) => {
  console.error(err?.abbruch ? err.message : err);
  process.exit(1);
});
