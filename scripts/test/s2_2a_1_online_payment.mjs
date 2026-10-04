#!/usr/bin/env node
/**
 * 2.2a-1 — Online-Zahlung Abschluss (nur DEV, ohne Stripe-API).
 *
 * Nicht ausführen, bevor 20260930100000_s2_2a_1_online_payment.sql auf DEV liegt.
 * Gegen PROD nie. Studios s22a1pay / s22a1payx, am Ende delete_tenant_complete.
 * Setzt Plattform-Schalter online_payments am Ende auf den Ausgangswert zurück.
 *
 * Verwendung: node scripts/test/s2_2a_1_online_payment.mjs
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
  warteBis,
} from './_helpers.mjs';

const SLUG = 's22a1pay';
const SLUG2 = 's22a1payx';
const EMAIL_PREFIX = 's22a1pay';
const TITLE = 'S22A1_ONLINE_PAY';

function upsertArgs(tenantId, ref, status, charges, card) {
  return {
    p_tenant: tenantId,
    p_provider: 'stripe',
    p_ref: ref,
    p_status: status,
    p_charges: charges,
    p_payouts: charges,
    p_details: status !== 'not_started',
    p_livemode: false,
    p_capabilities: card ? { card } : null,
  };
}

async function setupOnlineStudio(admin, asOwner, tenantId, acctRef) {
  const up = await admin.rpc(
    'upsert_provider_account',
    upsertArgs(tenantId, acctRef, 'active', true, 'active'),
  );
  if (up.error || !up.data?.success) {
    abbruch('upsert_provider_account: ' + (up.error?.message || JSON.stringify(up.data)));
  }
  const tax = await asOwner.rpc('set_tax_setting', {
    p_regime: 'small_business',
    p_vat_rate_bp: 0,
    p_valid_from: berlinDate(0),
  });
  if (tax.error || !tax.data?.success) {
    abbruch('set_tax_setting: ' + (tax.error?.message || JSON.stringify(tax.data)));
  }
  await legalProfileSetzen(asOwner);
  const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
  if (on.error || !on.data?.success) {
    abbruch('set_online_payments_enabled: ' + (on.error?.message || JSON.stringify(on.data)));
  }
  const onsite = await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
  if (onsite.error || !onsite.data?.success) {
    abbruch('set_allow_onsite_payment: ' + (onsite.error?.message || JSON.stringify(onsite.data)));
  }
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    console.log('2.2a-1 online payment');

    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'S22a-1 Online', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);
    const tenantId = tenant.id;

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Pay',
      rolle: 'owner',
      tenantId,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Lehrer',
      nachname: 'Pay',
      rolle: 'teacher',
      tenantId,
      password,
    });
    const a = await nutzerAnlegen(admin, {
      email: SLUG + '.a@example.com',
      vorname: 'Anna',
      nachname: 'A',
      rolle: 'user',
      tenantId,
      password,
    });
    const b = await nutzerAnlegen(admin, {
      email: SLUG + '.b@example.com',
      vorname: 'Ben',
      nachname: 'B',
      rolle: 'user',
      tenantId,
      password,
    });
    const c = await nutzerAnlegen(admin, {
      email: SLUG + '.c@example.com',
      vorname: 'Cara',
      nachname: 'C',
      rolle: 'user',
      tenantId,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asA = await login(url, anon, a.email, password, SLUG);
    const asB = await login(url, anon, b.email, password, SLUG);
    const asC = await login(url, anon, c.email, password, SLUG);

    const acctRef = 'acct_s22a1_' + randomUUID().replace(/-/g, '').slice(0, 16);
    await setupOnlineStudio(admin, asOwner, tenantId, acctRef);

    const kurs1 = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Direkt',
      date: berlinDate(7),
      time: '10:00:00',
      end_time: '11:00:00',
      price: 24,
      max_participants: 1,
      pass_eligible: true,
    });
    const kurs2 = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Karte',
      date: berlinDate(8),
      time: '11:00:00',
      end_time: '12:00:00',
      price: 24,
      max_participants: 2,
      pass_eligible: true,
    });

    // --- 1) Direktbuchung ohne Karte → pending_payment ---
    console.log('\n1) Direktbuchung pending_payment');
    const bookA = await asA.rpc('register_for_course', { p_course_id: kurs1.id });
    if (bookA.error) abbruch('A buchen: ' + bookA.error.message);
    ok(
      'A pending_payment',
      bookA.data?.success === true
        && bookA.data.status === 'pending_payment'
        && !!bookA.data.registration_id,
      JSON.stringify(bookA.data),
    );
    const regAId = bookA.data.registration_id;
    const holdIso = bookA.data.hold_expires_at;
    const holdMs = new Date(holdIso).getTime() - Date.now();
    ok('Hold ≈ 15 Min', holdMs > 13 * 60_000 && holdMs < 16 * 60_000, String(Math.round(holdMs / 1000)) + 's');

    const { data: regA } = await admin
      .from('registrations')
      .select('status, hold_reason, hold_expires_at, coverage_status, price_cents_at_booking')
      .eq('id', regAId)
      .single();
    ok(
      'Hold checkout, open, 2400',
      regA?.status === 'pending_payment'
        && regA.hold_reason === 'checkout'
        && regA.coverage_status === 'open'
        && regA.price_cents_at_booking === 2400,
      JSON.stringify(regA),
    );

    // --- 2) Mit Karte unverändert ---
    console.log('\n2) Mit Karte p_use_pass');
    const prod = await asOwner.rpc('create_pass_product', {
      p_name: '10er S22a1',
      p_units: 10,
      p_price_cents: 15000,
      p_validity_rule: 'months',
      p_validity_value: 6,
    });
    if (prod.error || !prod.data?.success) abbruch('pass product: ' + JSON.stringify(prod));
    const sold = await asOwner.rpc('sell_pass', {
      p_member_id: b.id,
      p_product_id: prod.data.id,
      p_method: 'cash',
    });
    if (sold.error || !sold.data?.success) abbruch('sell_pass: ' + JSON.stringify(sold));
    const bookB = await asB.rpc('register_for_course', {
      p_course_id: kurs2.id,
      p_use_pass: true,
    });
    if (bookB.error) abbruch('B buchen: ' + bookB.error.message);
    ok(
      'B registered + pass',
      bookB.data?.success === true
        && bookB.data.status === 'registered'
        && bookB.data.coverage === 'pass',
      JSON.stringify(bookB.data),
    );

    // --- 3) prepare ---
    console.log('\n3) prepare_online_payment');
    const prep1 = await admin.rpc('prepare_online_payment', {
      p_registration_id: regAId,
      p_user_id: a.id,
    });
    if (prep1.error) abbruch('prepare: ' + prep1.error.message);
    ok(
      'prepare Versuch',
      prep1.data?.success === true && !!prep1.data.attempt_id && prep1.data.amount_cents === 2400,
      JSON.stringify(prep1.data),
    );
    const attemptId = prep1.data.attempt_id;
    ok('account_ref', prep1.data.account_ref === acctRef);

    const prep2 = await admin.rpc('prepare_online_payment', {
      p_registration_id: regAId,
      p_user_id: a.id,
    });
    ok('zweiter prepare gleicher Versuch', prep2.data?.attempt_id === attemptId);

    const prepFremd = await admin.rpc('prepare_online_payment', {
      p_registration_id: regAId,
      p_user_id: b.id,
    });
    ok('fremd → FORBIDDEN', prepFremd.data?.error === 'FORBIDDEN', JSON.stringify(prepFremd.data));

    // --- 4) attach_payment_ref ---
    console.log('\n4) attach_payment_ref');
    const piOk = 'pi_test_' + randomUUID().replace(/-/g, '').slice(0, 20);
    const att1 = await admin.rpc('attach_payment_ref', {
      p_attempt_id: attemptId,
      p_provider_ref: piOk,
    });
    ok('Ref gesetzt', att1.data?.success === true && att1.data.provider_ref === piOk);
    const attSame = await admin.rpc('attach_payment_ref', {
      p_attempt_id: attemptId,
      p_provider_ref: piOk,
    });
    ok('gleicher Ref idempotent', attSame.data?.success === true);
    const attOther = await admin.rpc('attach_payment_ref', {
      p_attempt_id: attemptId,
      p_provider_ref: piOk + 'x',
    });
    ok('anderer Ref → REF_ALREADY_SET', attOther.data?.error === 'REF_ALREADY_SET');

    // --- 5) check_before_confirm ---
    console.log('\n5) check_before_confirm');
    const chk = await admin.rpc('check_before_confirm', {
      p_attempt_id: attemptId,
      p_user_id: a.id,
    });
    ok('check ok → processing', chk.data?.success === true && chk.data.status === 'processing', JSON.stringify(chk.data));
    const { data: attRow } = await admin
      .from('payment_attempts')
      .select('status')
      .eq('id', attemptId)
      .single();
    ok('Versuch processing', attRow?.status === 'processing');

    // --- 6) complete ---
    console.log('\n6) complete_online_payment');
    const done = await admin.rpc('complete_online_payment', {
      p_provider_ref: piOk,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    if (done.error) abbruch('complete: ' + done.error.message);
    ok('COMPLETED', done.data?.code === 'COMPLETED' && !!done.data.payment_id, JSON.stringify(done.data));
    const paymentId = done.data.payment_id;

    const { data: regDone } = await admin
      .from('registrations')
      .select('status, coverage_status, hold_expires_at, hold_reason')
      .eq('id', regAId)
      .single();
    // W6 (2.2a-4a): COMPLETED leert Haltefelder nicht mehr (Verlauf).
    ok(
      'Buchung registered/paid (Holds bleiben)',
      regDone?.status === 'registered'
        && regDone.coverage_status === 'paid'
        && regDone.hold_expires_at != null
        && !!regDone.hold_reason,
      JSON.stringify(regDone),
    );

    const { data: pays, error: pe } = await admin
      .from('payments')
      .select('id')
      .eq('provider', 'stripe')
      .eq('provider_ref', piOk);
    if (pe) abbruch('payments: ' + pe.message);
    ok('genau eine payments-Zeile', pays?.length === 1);

    const { count: evPay } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'payment.recorded')
      .eq('subject_id', paymentId);
    ok('Event payment.recorded', evPay === 1);

    const { count: glocke } = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', a.id)
      .eq('type', 'payment_succeeded');
    ok('Glocke payment_succeeded', glocke >= 1);

    const { count: outbox } = await admin
      .from('email_deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'payment_succeeded')
      .eq('registration_id', regAId);
    ok('Outbox payment_succeeded', outbox >= 1);

    const again = await admin.rpc('complete_online_payment', {
      p_provider_ref: piOk,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok('zweiter Aufruf ALREADY_COMPLETED', again.data?.code === 'ALREADY_COMPLETED');
    const { data: pays2 } = await admin
      .from('payments')
      .select('id')
      .eq('provider', 'stripe')
      .eq('provider_ref', piOk);
    ok('weiterhin eine Zeile', pays2?.length === 1);

    // --- 7) Hauptbuch Kleinunternehmer ---
    console.log('\n7) process_ledger Kleinunternehmer');
    const led = await admin.rpc('process_ledger', { p_limit: 50 });
    if (led.error) abbruch('process_ledger: ' + led.error.message);
    ok('process_ledger ohne Fehler', led.data?.failed === 0 || led.data?.failed == null, JSON.stringify(led.data));

    const { data: entries } = await admin
      .from('ledger_entries')
      .select('account, debit_cents, credit_cents')
      .eq('payment_id', paymentId)
      .order('account');
    const soll = entries?.find((e) => e.account === 'psp_clearing');
    const haben = entries?.find((e) => e.account === 'revenue_small_business');
    ok(
      'psp_clearing Soll 2400 / revenue_small_business Haben 2400',
      soll?.debit_cents === 2400
        && soll?.credit_cents === 0
        && haben?.credit_cents === 2400
        && haben?.debit_cents === 0,
      JSON.stringify(entries),
    );
    ok('kein UNSUPPORTED', !entries?.some((e) => e.account === null));

    // --- 7b) Zweites Studio regulär 19 % ---
    console.log('\n7b) Studio regulär 19 %');
    const admin2 = clientMitTenant(url, service, SLUG2);
    const { data: tenant2, error: t2e } = await admin2
      .from('tenants')
      .insert({ name: 'S22a-1 Regular', slug: SLUG2 })
      .select('id')
      .single();
    if (t2e) abbruch('Studio2: ' + t2e.message);
    const owner2 = await nutzerAnlegen(admin2, {
      email: SLUG2 + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Reg',
      rolle: 'owner',
      tenantId: tenant2.id,
      password,
    });
    const teacher2 = await nutzerAnlegen(admin2, {
      email: SLUG2 + '.teacher@example.com',
      vorname: 'Lehrer',
      nachname: 'Reg',
      rolle: 'teacher',
      tenantId: tenant2.id,
      password,
    });
    const u2 = await nutzerAnlegen(admin2, {
      email: SLUG2 + '.u@example.com',
      vorname: 'Uta',
      nachname: 'U',
      rolle: 'user',
      tenantId: tenant2.id,
      password,
    });
    const asOwner2 = await login(url, anon, owner2.email, password, SLUG2);
    const asU2 = await login(url, anon, u2.email, password, SLUG2);
    const acct2 = 'acct_s22a1r_' + randomUUID().replace(/-/g, '').slice(0, 14);
    {
      const up = await admin2.rpc(
        'upsert_provider_account',
        upsertArgs(tenant2.id, acct2, 'active', true, 'active'),
      );
      if (up.error || !up.data?.success) abbruch('upsert2: ' + JSON.stringify(up));
      const tax = await asOwner2.rpc('set_tax_setting', {
        p_regime: 'regular',
        p_vat_rate_bp: 1900,
        p_valid_from: berlinDate(0),
      });
      if (tax.error || !tax.data?.success) abbruch('tax2: ' + JSON.stringify(tax));
      await legalProfileSetzen(asOwner2);
      const on = await asOwner2.rpc('set_online_payments_enabled', { p_enabled: true });
      if (on.error || !on.data?.success) abbruch('online2: ' + JSON.stringify(on));
      await asOwner2.rpc('set_allow_onsite_payment', { p_allow: false });
    }
    const kursR = await kursAnlegen(admin2, tenant2.id, teacher2.id, {
      title: TITLE + ' USt',
      date: berlinDate(9),
      price: 24,
      max_participants: 1,
    });
    const bookU = await asU2.rpc('register_for_course', { p_course_id: kursR.id });
    if (bookU.error || bookU.data?.status !== 'pending_payment') {
      abbruch('U pending: ' + JSON.stringify(bookU));
    }
    const prepU = await admin2.rpc('prepare_online_payment', {
      p_registration_id: bookU.data.registration_id,
      p_user_id: u2.id,
    });
    const piU = 'pi_test_u_' + randomUUID().replace(/-/g, '').slice(0, 16);
    await admin2.rpc('attach_payment_ref', {
      p_attempt_id: prepU.data.attempt_id,
      p_provider_ref: piU,
    });
    await admin2.rpc('check_before_confirm', {
      p_attempt_id: prepU.data.attempt_id,
      p_user_id: u2.id,
    });
    const doneU = await admin2.rpc('complete_online_payment', {
      p_provider_ref: piU,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok('U COMPLETED', doneU.data?.code === 'COMPLETED', JSON.stringify(doneU.data));
    const ledU = await admin2.rpc('process_ledger', { p_limit: 50 });
    if (ledU.error) abbruch('process_ledger U: ' + ledU.error.message);
    ok(
      'process_ledger U failed 0',
      ledU.data?.failed === 0 || ledU.data?.failed == null,
      JSON.stringify(ledU.data),
    );
    const { data: entU } = await admin2
      .from('ledger_entries')
      .select('account, debit_cents, credit_cents')
      .eq('payment_id', doneU.data.payment_id);
    const psp = entU?.find((e) => e.account === 'psp_clearing');
    const rev = entU?.find((e) => e.account === 'revenue_standard');
    const vat = entU?.find((e) => e.account === 'vat_output');
    const sollU = (entU || []).reduce((s, r) => s + (r.debit_cents || 0), 0);
    const habenU = (entU || []).reduce((s, r) => s + (r.credit_cents || 0), 0);
    ok('U Soll=Haben', sollU === habenU && sollU === 2400, JSON.stringify(entU));
    ok(
      '2400 / 2017 / 383',
      psp?.debit_cents === 2400 && rev?.credit_cents === 2017 && vat?.credit_cents === 383,
      JSON.stringify(entU),
    );

    // --- 8) AMOUNT_MISMATCH ---
    console.log('\n8) AMOUNT_MISMATCH');
    const kursM = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Mismatch',
      date: berlinDate(10),
      price: 24,
      max_participants: 1,
    });
    const bookM = await asA.rpc('register_for_course', { p_course_id: kursM.id });
    if (bookM.error || bookM.data?.status !== 'pending_payment') {
      abbruch('M pending: ' + JSON.stringify(bookM));
    }
    const prepM = await admin.rpc('prepare_online_payment', {
      p_registration_id: bookM.data.registration_id,
      p_user_id: a.id,
    });
    const piM = 'pi_test_m_' + randomUUID().replace(/-/g, '').slice(0, 16);
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prepM.data.attempt_id,
      p_provider_ref: piM,
    });
    const badAmt = await admin.rpc('complete_online_payment', {
      p_provider_ref: piM,
      p_amount_cents: 2300,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok('AMOUNT_MISMATCH', badAmt.data?.error === 'AMOUNT_MISMATCH', JSON.stringify(badAmt.data));
    const { data: paysM } = await admin
      .from('payments')
      .select('id')
      .eq('provider_ref', piM);
    ok('keine Zeile bei Mismatch', (paysM?.length ?? 0) === 0);

    // --- 9) mark failed + neuer Versuch; dann Geld auf failed → COMPLETED (K4) ---
    console.log('\n9) mark failed / Failed dann Geld');
    const fail = await admin.rpc('mark_online_payment_failed', {
      p_provider_ref: piM,
      p_failure_code: 'CARD_DECLINED',
    });
    ok('failed', fail.data?.success === true && fail.data.status === 'failed', JSON.stringify(fail.data));
    const { data: regM } = await admin
      .from('registrations')
      .select('status')
      .eq('id', bookM.data.registration_id)
      .single();
    ok('Reservierung bleibt', regM?.status === 'pending_payment');
    const prepNew = await admin.rpc('prepare_online_payment', {
      p_registration_id: bookM.data.registration_id,
      p_user_id: a.id,
    });
    ok(
      'neuer Versuch',
      prepNew.data?.success === true && prepNew.data.attempt_id !== prepM.data.attempt_id,
      JSON.stringify(prepNew.data),
    );

    const failThenPay = await admin.rpc('complete_online_payment', {
      p_provider_ref: piM,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok(
      'Failed dann Geld → COMPLETED',
      failThenPay.data?.code === 'COMPLETED',
      JSON.stringify(failThenPay.data),
    );
    const { data: regMDone } = await admin
      .from('registrations')
      .select('status, coverage_status')
      .eq('id', bookM.data.registration_id)
      .single();
    ok(
      'Buchung paid nach failed+Geld',
      regMDone?.status === 'registered' && regMDone.coverage_status === 'paid',
      JSON.stringify(regMDone),
    );
    const { data: attFailed } = await admin
      .from('payment_attempts')
      .select('status, payment_id')
      .eq('id', prepM.data.attempt_id)
      .single();
    ok(
      'Versuch bleibt failed mit payment_id',
      attFailed?.status === 'failed' && attFailed.payment_id === failThenPay.data.payment_id,
      JSON.stringify(attFailed),
    );
    const { data: attSup } = await admin
      .from('payment_attempts')
      .select('status, failure_code')
      .eq('id', prepNew.data.attempt_id)
      .single();
    ok(
      'anderer Versuch SUPERSEDED',
      attSup?.status === 'canceled' && attSup.failure_code === 'SUPERSEDED',
      JSON.stringify(attSup),
    );

    // --- 9b) Doppelzahlung → REFUND_REQUIRED ALREADY_BOOKED ---
    console.log('\n9b) Doppelzahlung');
    const kursD = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Doppel',
      date: berlinDate(10),
      time: '14:00:00',
      end_time: '15:00:00',
      price: 24,
      max_participants: 2,
    });
    const bookD = await asA.rpc('register_for_course', { p_course_id: kursD.id });
    if (bookD.error || bookD.data?.status !== 'pending_payment') {
      abbruch('D pending: ' + JSON.stringify(bookD));
    }
    const prepD1 = await admin.rpc('prepare_online_payment', {
      p_registration_id: bookD.data.registration_id,
      p_user_id: a.id,
    });
    const piD1 = 'pi_test_d1_' + randomUUID().replace(/-/g, '').slice(0, 14);
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prepD1.data.attempt_id,
      p_provider_ref: piD1,
    });
    await admin.rpc('mark_online_payment_failed', {
      p_provider_ref: piD1,
      p_failure_code: 'CARD_DECLINED',
    });
    const prepD2 = await admin.rpc('prepare_online_payment', {
      p_registration_id: bookD.data.registration_id,
      p_user_id: a.id,
    });
    const piD2 = 'pi_test_d2_' + randomUUID().replace(/-/g, '').slice(0, 14);
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prepD2.data.attempt_id,
      p_provider_ref: piD2,
    });
    await admin.rpc('check_before_confirm', {
      p_attempt_id: prepD2.data.attempt_id,
      p_user_id: a.id,
    });
    const doneD2 = await admin.rpc('complete_online_payment', {
      p_provider_ref: piD2,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok('Versuch 2 COMPLETED', doneD2.data?.code === 'COMPLETED', JSON.stringify(doneD2.data));
    const doneD1 = await admin.rpc('complete_online_payment', {
      p_provider_ref: piD1,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok(
      'Doppel → REFUND_REQUIRED ALREADY_BOOKED',
      doneD1.data?.code === 'REFUND_REQUIRED' && doneD1.data.reason === 'ALREADY_BOOKED',
      JSON.stringify(doneD1.data),
    );
    const { data: paysD } = await admin
      .from('payments')
      .select('id, provider_ref')
      .eq('registration_id', bookD.data.registration_id)
      .eq('provider', 'stripe');
    ok('genau zwei payments-Zeilen', paysD?.length === 2, JSON.stringify(paysD));

    // --- 10) Spätfall RESTORED ---
    console.log('\n10) RESTORED');
    const kursR2 = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Restore',
      date: berlinDate(11),
      price: 24,
      max_participants: 1,
    });
    const holdSoon = new Date(Date.now() + 2_000).toISOString();
    const { data: lateRegId, error: lateE } = await admin.rpc('create_pending_registration', {
      p_course: kursR2.id,
      p_user: c.id,
      p_hold_reason: 'checkout',
      p_hold_expires_at: holdSoon,
    });
    if (lateE) abbruch('late pending: ' + lateE.message);
    const prepL = await admin.rpc('prepare_online_payment', {
      p_registration_id: lateRegId,
      p_user_id: c.id,
    });
    const piL = 'pi_test_l_' + randomUUID().replace(/-/g, '').slice(0, 16);
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prepL.data.attempt_id,
      p_provider_ref: piL,
    });
    // PC-/DB-Uhr können abweichen → warteBis statt festem Sleep.
    await warteBis(
      async () => {
        const { data } = await admin
          .from('registrations')
          .select('status')
          .eq('id', lateRegId)
          .single();
        return data?.status === 'cancelled';
      },
      { admin, maxMs: 70_000, schrittMs: 2_000, label: 'Fall 10 hold expire' },
    );
    const rest = await admin.rpc('complete_online_payment', {
      p_provider_ref: piL,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok('RESTORED', rest.data?.code === 'RESTORED' && !!rest.data.registration_id, JSON.stringify(rest.data));
    const { data: newReg } = await admin
      .from('registrations')
      .select('status, coverage_status, user_id')
      .eq('id', rest.data.registration_id)
      .single();
    ok(
      'neue Buchung registered/paid',
      newReg?.status === 'registered' && newReg.coverage_status === 'paid' && newReg.user_id === c.id,
      JSON.stringify(newReg),
    );

    // --- 11) Spätfall REFUND_REQUIRED ---
    console.log('\n11) REFUND_REQUIRED');
    const kursF = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Full',
      date: berlinDate(12),
      price: 24,
      max_participants: 1,
    });
    const holdSoon2 = new Date(Date.now() + 2_000).toISOString();
    const { data: late2Id, error: late2E } = await admin.rpc('create_pending_registration', {
      p_course: kursF.id,
      p_user: a.id,
      p_hold_reason: 'checkout',
      p_hold_expires_at: holdSoon2,
    });
    if (late2E) abbruch('late2: ' + late2E.message);
    const prepF = await admin.rpc('prepare_online_payment', {
      p_registration_id: late2Id,
      p_user_id: a.id,
    });
    const piF = 'pi_test_f_' + randomUUID().replace(/-/g, '').slice(0, 16);
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prepF.data.attempt_id,
      p_provider_ref: piF,
    });
    await warteBis(
      async () => {
        const { data } = await admin
          .from('registrations')
          .select('status')
          .eq('id', late2Id)
          .single();
        return data?.status === 'cancelled';
      },
      { admin, maxMs: 70_000, schrittMs: 2_000, label: 'Fall 11 hold expire' },
    );
    // Platz belegen mit B
    const bookOcc = await asB.rpc('register_for_course', { p_course_id: kursF.id });
    // Online required → B also pending unless... onsite off and online on → pending.
    // Capacity 1 - if B gets pending, seat is occupied. Good for NO_SEAT.
    ok(
      'Platz belegt (pending oder registered)',
      bookOcc.data?.success === true,
      JSON.stringify(bookOcc.data),
    );
    const refReq = await admin.rpc('complete_online_payment', {
      p_provider_ref: piF,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok(
      'REFUND_REQUIRED',
      refReq.data?.code === 'REFUND_REQUIRED' && refReq.data.reason === 'NO_SEAT',
      JSON.stringify(refReq.data),
    );
    const payRefundId = refReq.data.payment_id;
    const { count: evRef } = await admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'payment.refund_required')
      .eq('subject_id', payRefundId);
    ok('Event payment.refund_required', evRef === 1);

    const reRef = 're_test_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const refunded = await admin.rpc('record_online_refund', {
      p_payment_id: payRefundId,
      p_refund_ref: reRef,
      p_amount_cents: 2400,
      p_received_at: new Date().toISOString(),
    });
    ok('REFUNDED', refunded.data?.code === 'REFUNDED', JSON.stringify(refunded.data));
    const refunded2 = await admin.rpc('record_online_refund', {
      p_payment_id: payRefundId,
      p_refund_ref: reRef,
      p_amount_cents: 2400,
      p_received_at: new Date().toISOString(),
    });
    ok('ALREADY_REFUNDED', refunded2.data?.code === 'ALREADY_REFUNDED');

    const ledRefund = await admin.rpc('process_ledger', { p_limit: 100 });
    if (ledRefund.error) abbruch('process_ledger Erstattung: ' + ledRefund.error.message);
    ok(
      'process_ledger Erstattung failed 0',
      ledRefund.data?.failed === 0 || ledRefund.data?.failed == null,
      JSON.stringify(ledRefund.data),
    );
    const { data: revEntries } = await admin
      .from('ledger_entries')
      .select('account, debit_cents, credit_cents')
      .eq('payment_id', refunded.data.payment_id);
    const back = revEntries?.find((e) => e.account === 'psp_clearing');
    const sollRe = (revEntries || []).reduce((s, r) => s + (r.debit_cents || 0), 0);
    const habenRe = (revEntries || []).reduce((s, r) => s + (r.credit_cents || 0), 0);
    ok('Erstattung Soll=Haben', sollRe === habenRe && sollRe > 0, JSON.stringify(revEntries));
    ok(
      'Hauptbuch Erstattung psp_clearing zurück',
      back?.credit_cents === 2400 && back?.debit_cents === 0,
      JSON.stringify(revEntries),
    );

    // --- 12) check_before_confirm HOLD_EXPIRED ---
    console.log('\n12) check HOLD_EXPIRED');
    const kursH = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' HoldExp',
      date: berlinDate(13),
      price: 24,
      max_participants: 2,
    });
    const holdPast = new Date(Date.now() + 2_000).toISOString();
    // Use C for a fresh pending — C may have restored booking on kursR2
    const d = await nutzerAnlegen(admin, {
      email: SLUG + '.d@example.com',
      vorname: 'Doris',
      nachname: 'D',
      rolle: 'user',
      tenantId,
      password,
    });
    const { data: holdRegId } = await admin.rpc('create_pending_registration', {
      p_course: kursH.id,
      p_user: d.id,
      p_hold_reason: 'checkout',
      p_hold_expires_at: holdPast,
    });
    const prepH = await admin.rpc('prepare_online_payment', {
      p_registration_id: holdRegId,
      p_user_id: d.id,
    });
    // Hold expires in 2s but check needs ≥1 min — wait past 1 min? Spec: hold valid at least 1 minute.
    // With hold in 2s, check_before_confirm should fail HOLD_EXPIRED immediately (expires ≤ now+1min).
    const chkExp = await admin.rpc('check_before_confirm', {
      p_attempt_id: prepH.data.attempt_id,
      p_user_id: d.id,
    });
    ok('HOLD_EXPIRED vor Confirm', chkExp.data?.error === 'HOLD_EXPIRED', JSON.stringify(chkExp.data));

    // --- 13) Rechte ---
    console.log('\n13) Rechte authenticated');
    for (const name of [
      'prepare_online_payment',
      'attach_payment_ref',
      'check_before_confirm',
      'complete_online_payment',
      'record_online_refund',
      'mark_online_payment_failed',
    ]) {
      const { error } = await asA.rpc(name, {});
      ok(
        name + ' verweigert',
        !!error,
        error?.message || error?.code || 'kein Fehler',
      );
    }

    // --- 14) Bar-Kassieren unverändert ---
    console.log('\n14) Bar unverändert');
    // Temporarily allow onsite for a free course path — use kurs2 capacity: B already on pass.
    // Create course without online path: turn onsite on briefly OR use free course.
    // Simpler: set_allow_onsite true, create open registered via admin_register, then cash.
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
    // With onsite true, online_payment_required is false → register → registered open
    const kursBar = await kursAnlegen(admin, tenantId, teacher.id, {
      title: TITLE + ' Bar',
      date: berlinDate(14),
      price: 18,
      max_participants: 5,
    });
    const bookBar = await asA.rpc('register_for_course', { p_course_id: kursBar.id });
    ok(
      'ohne Online-Pflicht registered',
      bookBar.data?.success === true && bookBar.data.status === 'registered',
      JSON.stringify(bookBar.data),
    );
    const cash = await asOwner.rpc('record_manual_payment', {
      p_registration_id: bookBar.data.registration_id,
      p_method: 'cash',
    });
    ok('Bar-Kassieren ok', cash.data?.success === true, JSON.stringify(cash.data));
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });

    console.log('\nAlle 2.2a-1-Fälle grün.');
  } finally {
    try {
      await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    } catch (e) {
      console.error('Aufräumen:', e.message);
    }
    try {
      await plattform(admin, platformWas);
    } catch (e) {
      console.error('Plattform zurück:', e.message);
    }
  }
}

main().catch((e) => {
  console.error(e.abbruch ? e.message : e);
  process.exit(1);
});
