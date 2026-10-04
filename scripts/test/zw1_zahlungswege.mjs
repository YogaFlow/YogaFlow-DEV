#!/usr/bin/env node
/**
 * ZW-1 — booking_payment_options Matrix + LAST_METHOD (nur DEV).
 * Studio zw1pay. 3 Studio-Kombis × mit/ohne Karte × Online bereit/nicht.
 */
import { randomUUID } from 'node:crypto';
import {
  abbruch,
  assertDevEnv,
  avvAkzeptieren,
  berlinDate,
  clientMitTenant,
  kursAnlegen,
  ladeEnv,
  legalProfileSetzen,
  login,
  nutzerAnlegen,
  ok,
  plattform,
  plattformStand,
  resteEntfernen,
  seedPasswort,
} from './_helpers.mjs';

const SLUG = 'zw1pay';
const EMAIL_PREFIX = 'zw1pay';

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

function methodsOf(data) {
  return (data?.methods ?? []).map((m) => m.method);
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    console.log('ZW-1 Zahlungswege');

    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'ZW1 Pay', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Zw1',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });
    const member = await nutzerAnlegen(admin, {
      email: SLUG + '.user@example.com',
      vorname: 'User',
      nachname: 'Zw1',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Teacher',
      nachname: 'Zw1',
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asMember = await login(url, anon, member.email, password, SLUG);

    const acctRef = 'acct_zw1_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const up = await admin.rpc('upsert_provider_account', upsertArgs(tenant.id, acctRef));
    if (up.error || !up.data?.success) abbruch('upsert: ' + JSON.stringify(up));
    const tax = await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    if (tax.error || !tax.data?.success) abbruch('tax: ' + JSON.stringify(tax));
    await legalProfileSetzen(asOwner);
    await avvAkzeptieren(asOwner);

    const kurs = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'ZW1 Kurs',
      price: 16,
      max_participants: 8,
    });

    // --- nur Vor Ort (Online aus) ---
    await asOwner.rpc('set_online_payments_enabled', { p_enabled: false });
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
    const onlyOnsite = await asMember.rpc('booking_payment_options', { p_course_id: kurs.id });
    if (onlyOnsite.error) abbruch('onlyOnsite: ' + onlyOnsite.error.message);
    ok('nur Vor Ort methods', methodsOf(onlyOnsite.data).join() === 'onsite', JSON.stringify(onlyOnsite.data));
    ok('nur Vor Ort default', onlyOnsite.data?.default === 'onsite');
    ok('nur Vor Ort online_required false', onlyOnsite.data?.online_required === false);

    const lastOff = await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
    ok('letzten Weg nicht aus', lastOff.data?.error === 'LAST_METHOD', JSON.stringify(lastOff.data));

    // --- nur Online ---
    const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
    if (on.error || !on.data?.success) abbruch('online an: ' + JSON.stringify(on));
    const onsiteOff = await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
    if (onsiteOff.error || !onsiteOff.data?.success) abbruch('onsite aus: ' + JSON.stringify(onsiteOff));
    const onlyOnline = await asMember.rpc('booking_payment_options', { p_course_id: kurs.id });
    ok(
      'nur Online methods',
      methodsOf(onlyOnline.data).join() === 'online',
      JSON.stringify(onlyOnline.data),
    );
    ok('nur Online default', onlyOnline.data?.default === 'online');
    ok('nur Online required', onlyOnline.data?.online_required === true);

    const lastOnlineOff = await asOwner.rpc('set_online_payments_enabled', { p_enabled: false });
    ok(
      'Online als letzten Weg nicht aus',
      lastOnlineOff.data?.error === 'LAST_METHOD',
      JSON.stringify(lastOnlineOff.data),
    );

    // --- beide (Z2: Online bleibt wählbar) ---
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
    const both = await asMember.rpc('booking_payment_options', { p_course_id: kurs.id });
    ok(
      'beide methods',
      methodsOf(both.data).join() === 'online,onsite',
      JSON.stringify(both.data),
    );
    ok('beide default online', both.data?.default === 'online');
    ok('beide online_required false', both.data?.online_required === false);

    // Online nicht bereit (AVV entfällt nicht — Schalter aus simulieren via Amount)
    const over = await asMember.rpc('booking_payment_options', {
      p_course_id: kurs.id,
      p_amount_cents: 25001,
    });
    ok(
      'nicht bereit: nur onsite',
      methodsOf(over.data).join() === 'onsite' &&
        over.data?.reason === 'AMOUNT_ABOVE_RECEIPT_LIMIT',
      JSON.stringify(over.data),
    );

    // Mit Karte (Pass verkaufen)
    const prod = await asOwner.rpc('create_pass_product', {
      p_name: '10er-Karte',
      p_units: 10,
      p_price_cents: 15000,
      p_validity_rule: 'months',
      p_validity_value: 6,
    });
    if (prod.error || !prod.data?.success) {
      abbruch('create_pass_product: ' + (prod.error?.message || JSON.stringify(prod.data)));
    }
    const productId = prod.data.id;

    const sell = await asOwner.rpc('sell_pass', {
      p_member_id: member.id,
      p_product_id: productId,
      p_method: 'cash',
    });
    if (sell.error || !sell.data?.success) {
      abbruch('sell_pass: ' + (sell.error?.message || JSON.stringify(sell.data)));
    }

    const withPass = await asMember.rpc('booking_payment_options', { p_course_id: kurs.id });
    ok(
      'mit Karte default pass',
      withPass.data?.default === 'pass' && methodsOf(withPass.data)[0] === 'pass',
      JSON.stringify(withPass.data),
    );
    ok(
      'mit Karte alle drei',
      methodsOf(withPass.data).join() === 'pass,online,onsite',
      JSON.stringify(withPass.data),
    );

    // Ein-Tipp: register mit default (pass)
    const booked = await asMember.rpc('register_for_course', {
      p_course_id: kurs.id,
      p_method: 'pass',
    });
    ok(
      'buchen mit pass',
      booked.data?.success === true && booked.data?.coverage === 'pass',
      JSON.stringify(booked.data),
    );

    // Zweiter Kurs: online gewählt obwohl Vor Ort an
    const kurs2 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'ZW1 Online',
      price: 18,
      date: berlinDate(5),
    });
    const onlineBook = await asMember.rpc('register_for_course', {
      p_course_id: kurs2.id,
      p_method: 'online',
    });
    ok(
      'online trotz Vor Ort',
      onlineBook.data?.success === true && onlineBook.data?.status === 'pending_payment',
      JSON.stringify(onlineBook.data),
    );

    // Dritter Kurs: onsite
    const kurs3 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'ZW1 Onsite',
      price: 14,
      date: berlinDate(7),
    });
    const onsiteBook = await asMember.rpc('register_for_course', {
      p_course_id: kurs3.id,
      p_method: 'onsite',
    });
    ok(
      'onsite registered',
      onsiteBook.data?.success === true && onsiteBook.data?.status === 'registered',
      JSON.stringify(onsiteBook.data),
    );

    console.log('\nZW-1 fertig');
  } finally {
    try {
      await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    } catch (e) {
      console.warn('Aufräumen:', e?.message || e);
    }
    await plattform(admin, platformWas);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
