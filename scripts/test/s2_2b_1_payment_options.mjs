#!/usr/bin/env node
/**
 * 2.2b-1 Z13 — booking_payment_options (nur DEV).
 *
 * Voraussetzung: Migration 20261001120000_booking_payment_options.sql auf DEV.
 * Studios s22b1opt / s22b1optx, Plattform-Schalter sichern/wiederherstellen.
 *
 * Verwendung: node scripts/test/s2_2b_1_payment_options.mjs
 */
import { randomUUID } from 'node:crypto';
import {
  abbruch,
  assertDevEnv,
  berlinDate,
  clientMitTenant,
  ladeEnv,
  login,
  nutzerAnlegen,
  ok,
  legalProfileSetzen,
  plattform,
  plattformStand,
  resteEntfernen,
  seedPasswort,
} from './_helpers.mjs';

const SLUG = 's22b1opt';
const SLUG2 = 's22b1optx';
const EMAIL_PREFIX = 's22b1opt';

function upsertArgs(tenantId, ref) {
  return {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_ref: ref,
    p_status: 'active',
    p_charges: true,
    p_payouts: true,
    p_details: true,
    p_livemode: false,
    p_capabilities: { card: 'active' },
  };
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    console.log('2.2b-1 booking_payment_options');

    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'S22b-1 Opt', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const { data: tenant2, error: te2 } = await admin
      .from('tenants')
      .insert({ name: 'S22b-1 OptX', slug: SLUG2 })
      .select('id')
      .single();
    if (te2) abbruch('Studio2: ' + te2.message);

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Opt',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });
    const member = await nutzerAnlegen(admin, {
      email: SLUG + '.user@example.com',
      vorname: 'User',
      nachname: 'Opt',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    await nutzerAnlegen(admin, {
      email: SLUG2 + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Fremd',
      rolle: 'owner',
      tenantId: tenant2.id,
      password,
    });
    const foreign = await nutzerAnlegen(admin, {
      email: SLUG2 + '.user@example.com',
      vorname: 'Fremd',
      nachname: 'User',
      rolle: 'user',
      tenantId: tenant2.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asMember = await login(url, anon, member.email, password, SLUG);
    const asForeignOnSlug = await login(url, anon, foreign.email, password, SLUG);

    // Ohne Online-Setup → false
    const off = await asMember.rpc('booking_payment_options');
    if (off.error) abbruch('options off: ' + off.error.message);
    ok('ohne Pflicht false', off.data?.online_required === false, JSON.stringify(off.data));
    ok('ohne Pflicht reason LEGAL oder null', 'reason' in (off.data ?? {}));

    // Online-Pflicht an
    const acctRef = 'acct_s22b1_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const up = await admin.rpc('upsert_provider_account', upsertArgs(tenant.id, acctRef));
    if (up.error || !up.data?.success) abbruch('upsert: ' + JSON.stringify(up));
    const tax = await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    if (tax.error || !tax.data?.success) abbruch('tax: ' + JSON.stringify(tax));
    await legalProfileSetzen(asOwner);
    const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    if (on.error || !on.data?.success) abbruch('online: ' + JSON.stringify(on));
    const onsite = await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
    if (onsite.error || !onsite.data?.success) abbruch('onsite: ' + JSON.stringify(onsite));

    const required = await asMember.rpc('booking_payment_options');
    if (required.error) abbruch('options on: ' + required.error.message);
    ok('mit Pflicht true', required.data?.online_required === true, JSON.stringify(required.data));
    ok('mit Pflicht reason null', required.data?.reason == null, JSON.stringify(required.data));

    // Mitglied anderes Studio mit Header dieses Studios → FORBIDDEN
    const fremd = await asForeignOnSlug.rpc('booking_payment_options');
    ok(
      'fremd FORBIDDEN',
      Boolean(fremd.error) && /FORBIDDEN/i.test(fremd.error?.message ?? ''),
      fremd.error?.message || JSON.stringify(fremd.data),
    );

    // anon
    const anonClient = clientMitTenant(url, anon, SLUG);
    const anonRes = await anonClient.rpc('booking_payment_options');
    ok(
      'anon verweigert',
      Boolean(anonRes.error),
      anonRes.error?.message || JSON.stringify(anonRes.data),
    );

    console.log('\nFertig.');
  } finally {
    try {
      await plattform(admin, platformWas);
    } catch (e) {
      console.error('Plattform wiederherstellen:', e);
    }
    try {
      await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    } catch (e) {
      console.error('Reste:', e);
    }
  }
}

main().catch((e) => {
  console.error(e.abbruch ? e.message : e);
  process.exit(1);
});
