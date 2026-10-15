#!/usr/bin/env node
/**
 * 3.1 — Zahlungsübersicht: get_studio_payments (Rechte, Filter, Status, fremdes Studio).
 *
 * Voraussetzung: Migration 20261002220000 auf DEV.
 * Verwendung: node scripts/test/s3_1_payment_overview.mjs
 */
import { randomUUID } from 'node:crypto';
import {
  abbruch,
  assertDevEnv,
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

const SLUG = 's31pay';
const SLUG2 = 's31payb';
const EMAIL_PREFIX = 's31pay';

async function setupOnline(admin, asOwner, tenantId) {
  const up = await admin.rpc('upsert_provider_account', {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_ref: 'acct_test_s31_' + randomUUID().slice(0, 8),
    p_status: 'active',
    p_charges: true,
    p_payouts: true,
    p_details: true,
    p_livemode: false,
    p_capabilities: { card: 'active' },
  });
  if (up.error || !up.data?.success) abbruch('upsert: ' + (up.error?.message || JSON.stringify(up.data)));
  const tax = await asOwner.rpc('set_tax_setting', {
    p_regime: 'regular',
    p_vat_rate_bp: 1900,
    p_valid_from: berlinDate(-30),
  });
  if (tax.error || !tax.data?.success) abbruch('tax: ' + JSON.stringify(tax.data ?? tax.error));
  await legalProfileSetzen(asOwner);
  const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
  if (on.error || !on.data?.success) abbruch('online on: ' + JSON.stringify(on.data ?? on.error));
  const onsite = await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
  if (onsite.error || !onsite.data?.success) abbruch('onsite: ' + JSON.stringify(onsite.data ?? onsite.error));
}

async function payOnline(admin, userId, registrationId, amountCents) {
  const prep = await admin.rpc('prepare_online_payment', {
    p_registration_id: registrationId,
    p_user_id: userId,
  });
  if (prep.error || !prep.data?.success) abbruch('prepare: ' + JSON.stringify(prep.data ?? prep.error));
  const pi = 'pi_test_o_' + randomUUID().replace(/-/g, '').slice(0, 16);
  await admin.rpc('attach_payment_ref', { p_attempt_id: prep.data.attempt_id, p_provider_ref: pi });
  const done = await admin.rpc('complete_online_payment', {
    p_provider_ref: pi,
    p_amount_cents: amountCents,
    p_currency: 'EUR',
    p_received_at: new Date().toISOString(),
    p_livemode: false,
  });
  if (done.error || !done.data?.success) abbruch('complete: ' + JSON.stringify(done.data ?? done.error));
  return done.data.payment_id;
}

function item(res, paymentId) {
  return (res.data?.items ?? []).find((i) => i.payment_id === paymentId) ?? null;
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    console.log('3.1 Zahlungsübersicht');
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'S31 Zahlungen', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);
    const { data: tenant2, error: te2 } = await admin
      .from('tenants')
      .insert({ name: 'S31 Fremd', slug: SLUG2 })
      .select('id')
      .single();
    if (te2) abbruch('Studio 2: ' + te2.message);

    const mk = (key, rolle, tenantId, vorname) =>
      nutzerAnlegen(admin, {
        email: `${EMAIL_PREFIX}.${key}@example.com`,
        vorname,
        nachname: 'Zahlung',
        rolle,
        tenantId,
        password,
      });
    const owner = await mk('owner', 'owner', tenant.id, 'Olga');
    const adm = await mk('admin', 'admin', tenant.id, 'Adam');
    const teacher = await mk('teacher', 'teacher', tenant.id, 'Tina');
    const a = await mk('a', 'user', tenant.id, 'Anna');
    const b = await mk('b', 'user', tenant.id, 'Ben');
    const c = await mk('c', 'user', tenant.id, 'Cleo');
    const d = await mk('d', 'user', tenant.id, 'Dora');
    const e = await mk('e', 'user', tenant.id, 'Emil');
    const owner2 = await mk('owner2', 'owner', tenant2.id, 'Fremd');

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asAdmin = await login(url, anon, adm.email, password, SLUG);
    const asTeacher = await login(url, anon, teacher.email, password, SLUG);
    const asA = await login(url, anon, a.email, password, SLUG);
    const asB = await login(url, anon, b.email, password, SLUG);
    const asC = await login(url, anon, c.email, password, SLUG);
    const asD = await login(url, anon, d.email, password, SLUG);
    const asE = await login(url, anon, e.email, password, SLUG);
    const asOwner2 = await login(url, anon, owner2.email, password, SLUG2);

    const kurs = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: 'S31_PAY Flow',
      date: berlinDate(6),
      price: 24,
      max_participants: 10,
    });

    // Vor Online-Pflicht: Bar-Zahlungen und Kartenverkäufe.
    const rC = await asC.rpc('register_for_course', { p_course_id: kurs.id });
    const rD = await asD.rpc('register_for_course', { p_course_id: kurs.id });
    if (!rC.data?.success || !rD.data?.success) abbruch('Buchung C/D: ' + JSON.stringify([rC.data, rD.data]));
    const cashC = await asOwner.rpc('record_manual_payment', {
      p_registration_id: rC.data.registration_id,
      p_method: 'cash',
    });
    const cashD = await asOwner.rpc('record_manual_payment', {
      p_registration_id: rD.data.registration_id,
      p_method: 'bank_transfer',
    });
    if (!cashC.data?.success || !cashD.data?.success) abbruch('Bar: ' + JSON.stringify([cashC.data, cashD.data]));
    const revC = await asOwner.rpc('reverse_manual_payment', { p_payment_id: cashC.data.payment_id });
    if (!revC.data?.success) abbruch('reverse C: ' + JSON.stringify(revC.data ?? revC.error));

    const prod = await asOwner.rpc('create_pass_product', {
      p_name: '10er-Karte',
      p_units: 10,
      p_price_cents: 15000,
      p_validity_rule: 'years_to_year_end',
      p_validity_value: 1,
    });
    if (!prod.data?.success) abbruch('Produkt: ' + JSON.stringify(prod.data ?? prod.error));
    const productId = prod.data.product_id ?? prod.data.id;
    const sellD = await asOwner.rpc('sell_pass', {
      p_member_id: d.id,
      p_product_id: productId,
      p_method: 'paypal_manual',
    });
    const sellC = await asOwner.rpc('sell_pass', {
      p_member_id: c.id,
      p_product_id: productId,
      p_method: 'cash',
    });
    if (!sellD.data?.success || !sellC.data?.success) abbruch('sell: ' + JSON.stringify([sellD.data, sellC.data]));
    const revoke = await asOwner.rpc('revoke_pass', { p_pass_id: sellC.data.pass_id });
    if (!revoke.data?.success) abbruch('revoke: ' + JSON.stringify(revoke.data ?? revoke.error));

    await setupOnline(admin, asOwner, tenant.id);
    const rA = await asA.rpc('register_for_course', { p_course_id: kurs.id });
    const rB = await asB.rpc('register_for_course', { p_course_id: kurs.id });
    const rE = await asE.rpc('register_for_course', { p_course_id: kurs.id });
    const payA = await payOnline(admin, a.id, rA.data.registration_id, 2400);
    const payB = await payOnline(admin, b.id, rB.data.registration_id, 2400);
    const payE = await payOnline(admin, e.id, rE.data.registration_id, 2400);

    // A: 10 € erstattet (Teil), B: Erstattung läuft, E: Erstattung fehlgeschlagen.
    const mA = await asOwner.rpc('request_payment_refund', {
      p_payment_id: payA,
      p_amount_cents: 1000,
      p_note: 'Kulanz',
    });
    await admin.rpc('record_online_refund', {
      p_payment_id: payA,
      p_refund_ref: 're_test_' + randomUUID().replace(/-/g, '').slice(0, 16),
      p_amount_cents: 1000,
      p_received_at: new Date().toISOString(),
      p_refund_id: mA.data.refund_id,
    });
    await asOwner.rpc('request_payment_refund', {
      p_payment_id: payB,
      p_amount_cents: 2400,
      p_note: 'läuft',
    });
    const mE = await asOwner.rpc('request_payment_refund', {
      p_payment_id: payE,
      p_amount_cents: 400,
      p_note: 'scheitert',
    });
    await admin.rpc('mark_refund_failed', { p_refund_id: mE.data.refund_id, p_failure_code: 'REFUND_FAILED' });

    console.log('\n1) Rechte');
    const all = await asOwner.rpc('get_studio_payments', {});
    ok('Owner success', all.data?.success === true, JSON.stringify(all.data ?? all.error));
    ok('7 Zahlungen (keine Gegenbuchungen)', all.data?.total === 7, `total=${all.data?.total}`);
    ok('page_size 50', all.data?.page_size === 50);
    const asAdm = await asAdmin.rpc('get_studio_payments', {});
    ok('Admin success', asAdm.data?.success === true && asAdm.data?.total === 7, JSON.stringify(asAdm.data?.total));
    const asT = await asTeacher.rpc('get_studio_payments', {});
    ok('Lehrende FORBIDDEN', asT.data?.error === 'FORBIDDEN', JSON.stringify(asT.data));
    const asU = await asA.rpc('get_studio_payments', {});
    ok('Teilnehmende FORBIDDEN', asU.data?.error === 'FORBIDDEN', JSON.stringify(asU.data));
    const fremd = await asOwner2.rpc('get_studio_payments', {});
    ok('Fremd-Studio sieht nichts', fremd.data?.success === true && fremd.data?.total === 0, JSON.stringify(fremd.data));
    const { error: anonErr } = await clientMitTenant(url, anon, SLUG).rpc('get_studio_payments', {});
    ok('anon kein EXECUTE', anonErr != null, String(anonErr?.code));

    console.log('\n2) Status');
    const st = (id) => item(all, id)?.status;
    ok('A teilweise erstattet', st(payA) === 'partially_refunded', JSON.stringify(item(all, payA)));
    ok('A refunded_cents 1000', item(all, payA)?.refunded_cents === 1000);
    ok('B Erstattung läuft', st(payB) === 'refund_pending', st(payB));
    ok('E fehlgeschlagen', st(payE) === 'refund_failed', st(payE));
    ok('C Bar storniert', st(cashC.data.payment_id) === 'canceled', st(cashC.data.payment_id));
    ok('D Überweisung bezahlt', st(cashD.data.payment_id) === 'paid', st(cashD.data.payment_id));
    ok('Karte D bezahlt', st(sellD.data.payment_id) === 'paid', st(sellD.data.payment_id));
    ok('Karte C storniert', st(sellC.data.payment_id) === 'canceled', st(sellC.data.payment_id));
    const pass = item(all, sellD.data.payment_id);
    ok('Karte: Wofür 10er-Karte', pass?.pass_name === '10er-Karte' && pass?.subject_type === 'pass_purchase');
    ok('Karte: Art paypal_manual', pass?.kind === 'paypal_manual');
    const onl = item(all, payA);
    ok('Kurs + Termin', onl?.course_title === 'S31_PAY Flow' && onl?.course_date === berlinDate(6));
    ok('Person Anna', onl?.first_name === 'Anna' && onl?.kind === 'online');

    console.log('\n3) Filter');
    const fOnline = await asOwner.rpc('get_studio_payments', { p_kind: 'online' });
    ok('online 3', fOnline.data?.total === 3, String(fOnline.data?.total));
    const fCash = await asOwner.rpc('get_studio_payments', { p_kind: 'cash' });
    ok('bar 2 (Kurs C, Karte C)', fCash.data?.total === 2, String(fCash.data?.total));
    const fStatus = await asOwner.rpc('get_studio_payments', { p_status: 'canceled' });
    ok('storniert 2', fStatus.data?.total === 2, String(fStatus.data?.total));
    const fBoth = await asOwner.rpc('get_studio_payments', { p_kind: 'online', p_status: 'partially_refunded' });
    ok('online + teilweise = A', fBoth.data?.total === 1 && fBoth.data.items[0]?.payment_id === payA);
    const fName = await asOwner.rpc('get_studio_payments', { p_search: 'dora' });
    ok('Suche dora 2', fName.data?.total === 2, String(fName.data?.total));
    const fWild = await asOwner.rpc('get_studio_payments', { p_search: '%' });
    ok('Suche % ist kein Joker', fWild.data?.total === 0, String(fWild.data?.total));
    const lastMonth = await asOwner.rpc('get_studio_payments', { p_month: berlinDate(-40) });
    ok('Vormonat leer', lastMonth.data?.total === 0, String(lastMonth.data?.total));
    const p2 = await asOwner.rpc('get_studio_payments', { p_page: 2 });
    ok('Seite 2 leer, total bleibt', p2.data?.items?.length === 0 && p2.data?.total === 7);
    const bad = await asOwner.rpc('get_studio_payments', { p_kind: 'card' });
    ok('INVALID_KIND', bad.data?.error === 'INVALID_KIND', JSON.stringify(bad.data));
    const badS = await asOwner.rpc('get_studio_payments', { p_status: 'x' });
    ok('INVALID_STATUS', badS.data?.error === 'INVALID_STATUS');

    console.log('\n4) Rückbuchung schlägt alles');
    await admin.rpc('record_payment_dispute', {
      p_payment_id: payA,
      p_provider_ref: 'du_test_' + randomUUID().replace(/-/g, '').slice(0, 12),
      p_amount_cents: 1400,
      p_status: 'needs_response',
    });
    const afterDispute = await asOwner.rpc('get_studio_payments', { p_status: 'dispute_open' });
    ok('A Rückbuchung offen', afterDispute.data?.total === 1 && afterDispute.data.items[0]?.payment_id === payA);

    console.log('\n5) Glocke führt zur Zahlung');
    const { data: notes } = await admin
      .from('user_notifications')
      .select('type, action_path')
      .eq('user_id', owner.id)
      .in('type', ['payment_dispute_opened', 'payment_refund_failed']);
    const path = (type) => (notes ?? []).find((n) => n.type === type)?.action_path;
    ok('Rückbuchung → /payments?payment=A', path('payment_dispute_opened') === `/payments?payment=${payA}`, path('payment_dispute_opened'));
    ok('fehlgeschlagen → /payments?payment=E', path('payment_refund_failed') === `/payments?payment=${payE}`, path('payment_refund_failed'));

    console.log('\n3.1 Zahlungsübersicht OK');
  } finally {
    try {
      await plattform(admin, platformWas);
    } catch (err) {
      console.error('Plattform wiederherstellen:', err.message);
    }
    await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
