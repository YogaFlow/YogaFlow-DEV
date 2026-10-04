#!/usr/bin/env node
/**
 * K1 — Online-Kartenkauf SQL-Schicht (nur DEV, ohne Stripe-API).
 *
 * Deckt: doppelter Webhook einmal; Wertersatz 0/2/10 (+ 3er/5er); extend nur Owner;
 * Cross-Tenant blockiert; öffentlicher Widerruf ohne Leak; späte Zahlung nach
 * Cancel legt Karte an; >250 nicht online; Dispute-/Kulanz-Pfad.
 *
 * Verwendung: node scripts/test/k1_pass_online.mjs
 */
import { createHash, randomUUID } from 'node:crypto';
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

const SLUG = 'k1passon';
const SLUG2 = 'k1passonx';
const EMAIL_PREFIX = 'k1passon';

const IMMEDIATE_TEXT =
  'Ich verlange ausdrücklich, dass ich die Karte sofort nutzen kann. Mir ist bekannt, dass ich bei einem Widerruf für bereits genutzte Termine anteilig Wertersatz leiste.';
const WITHDRAWAL_TEXT =
  'Du hast ein 14-tägiges Widerrufsrecht. Widerrufsbelehrung.';

function hashLegal(text) {
  const norm = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '')
    .concat('\n');
  return createHash('sha256').update(norm, 'utf8').digest('hex');
}

const HASH_IMMEDIATE = hashLegal(IMMEDIATE_TEXT);
const HASH_WITHDRAWAL = hashLegal(WITHDRAWAL_TEXT);

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
  await avvAkzeptieren(asOwner);
  const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
  if (on.error || !on.data?.success) {
    abbruch('set_online_payments_enabled: ' + (on.error?.message || JSON.stringify(on.data)));
  }
}

async function prepareAndComplete(admin, memberId, productId, piRef) {
  const prep = await admin.rpc('prepare_pass_online_payment', {
    p_product_id: productId,
    p_user_id: memberId,
    p_immediate_use_hash: HASH_IMMEDIATE,
    p_withdrawal_info_hash: HASH_WITHDRAWAL,
  });
  if (prep.error || !prep.data?.success) {
    abbruch('prepare: ' + (prep.error?.message || JSON.stringify(prep.data)));
  }
  const attemptId = prep.data.attempt_id;
  const amount = prep.data.amount_cents;

  const attach = await admin.rpc('attach_payment_ref', {
    p_attempt_id: attemptId,
    p_provider_ref: piRef,
  });
  if (attach.error || !attach.data?.success) {
    abbruch('attach: ' + (attach.error?.message || JSON.stringify(attach.data)));
  }

  const done = await admin.rpc('complete_online_payment', {
    p_provider_ref: piRef,
    p_amount_cents: amount,
    p_currency: 'EUR',
    p_received_at: new Date().toISOString(),
    p_livemode: false,
  });
  if (done.error || !done.data?.success) {
    abbruch('complete: ' + (done.error?.message || JSON.stringify(done.data)));
  }
  return { prep: prep.data, done: done.data, attemptId, amount };
}

async function redeemN(admin, asUser, tenantId, teacherId, _passId, n) {
  for (let i = 0; i < n; i++) {
    const k = await kursAnlegen(admin, tenantId, teacherId, {
      title: 'K1 R' + randomUUID().slice(0, 8),
      date: berlinDate(4 + i),
      time: `${10 + (i % 8)}:15:00`,
      end_time: `${11 + (i % 8)}:15:00`,
      price: 15,
      max_participants: 10,
      pass_eligible: true,
    });
    const book = await asUser.rpc('register_for_course', {
      p_course_id: k.id,
      p_use_pass: true,
    });
    if (book.error || !book.data?.success) {
      abbruch('book with pass: ' + (book.error?.message || JSON.stringify(book.data)));
    }
    if (book.data.status !== 'registered' && book.data.coverage_status !== 'pass') {
      // some RPCs return success+status nested
      const { data: reg } = await admin
        .from('registrations')
        .select('status, coverage_status, pass_id')
        .eq('id', book.data.registration_id)
        .single();
      if (reg?.coverage_status !== 'pass') {
        abbruch('redeem not applied: ' + JSON.stringify({ book: book.data, reg }));
      }
    }
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
    console.log('K1 pass online');

    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'K1 Pass Online', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);
    const tenantId = tenant.id;

    const { data: tenant2, error: te2 } = await admin
      .from('tenants')
      .insert({ name: 'K1 Pass X', slug: SLUG2 })
      .select('id')
      .single();
    if (te2) abbruch('Studio2: ' + te2.message);

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'K1',
      rolle: 'owner',
      tenantId,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Lehrer',
      nachname: 'K1',
      rolle: 'teacher',
      tenantId,
      password,
    });
    const buyer = await nutzerAnlegen(admin, {
      email: SLUG + '.buyer@example.com',
      vorname: 'Buyer',
      nachname: 'K1',
      rolle: 'user',
      tenantId,
      password,
    });

    // separate users so pick_pass does not mix cards
    const u0 = await nutzerAnlegen(admin, {
      email: SLUG + '.u0@example.com', vorname: 'U0', nachname: 'K1', rolle: 'user', tenantId, password,
    });
    const u2 = await nutzerAnlegen(admin, {
      email: SLUG + '.u2@example.com', vorname: 'U2', nachname: 'K1', rolle: 'user', tenantId, password,
    });
    const u10 = await nutzerAnlegen(admin, {
      email: SLUG + '.u10@example.com', vorname: 'U10', nachname: 'K1', rolle: 'user', tenantId, password,
    });
    const u3 = await nutzerAnlegen(admin, {
      email: SLUG + '.u3@example.com', vorname: 'U3', nachname: 'K1', rolle: 'user', tenantId, password,
    });
    const u5 = await nutzerAnlegen(admin, {
      email: SLUG + '.u5@example.com', vorname: 'U5', nachname: 'K1', rolle: 'user', tenantId, password,
    });
    const uW = await nutzerAnlegen(admin, {
      email: SLUG + '.uw@example.com', vorname: 'UW', nachname: 'K1', rolle: 'user', tenantId, password,
    });
    const uK = await nutzerAnlegen(admin, {
      email: SLUG + '.uk@example.com', vorname: 'UK', nachname: 'K1', rolle: 'user', tenantId, password,
    });
    const ownerB = await nutzerAnlegen(admin, {
      email: SLUG2 + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'X',
      rolle: 'owner',
      tenantId: tenant2.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asBuyer = await login(url, anon, buyer.email, password, SLUG);
    const asU0 = await login(url, anon, u0.email, password, SLUG);
    const asU2 = await login(url, anon, u2.email, password, SLUG);
    const asU10 = await login(url, anon, u10.email, password, SLUG);
    const asU3 = await login(url, anon, u3.email, password, SLUG);
    const asU5 = await login(url, anon, u5.email, password, SLUG);
    const asUW = await login(url, anon, uW.email, password, SLUG);
    const asUK = await login(url, anon, uK.email, password, SLUG);
    const asOwnerB = await login(url, anon, ownerB.email, password, SLUG2);
    const asAnon = clientMitTenant(url, anon, SLUG);

    const acctRef = 'acct_k1_' + randomUUID().replace(/-/g, '').slice(0, 16);
    await setupOnlineStudio(admin, asOwner, tenantId, acctRef);

    // ensure onsite allowed so register without pass stays open/registered
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });

    console.log('\n1) Produkt >250 nicht online; 10er online');
    const big = await asOwner.rpc('create_pass_product', {
      p_name: 'Teure 20er',
      p_units: 20,
      p_price_cents: 30000,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: 'zu teuer',
      p_online_purchasable: true,
    });
    ok(
      '>250 online blocked',
      big.data?.success === false && big.data?.error === 'ONLINE_NOT_AVAILABLE',
      JSON.stringify(big.data),
    );

    const prod10 = await asOwner.rpc('create_pass_product', {
      p_name: '10er Online',
      p_units: 10,
      p_price_cents: 12000,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_description: 'Zehn Termine',
      p_online_purchasable: true,
    });
    if (prod10.error || !prod10.data?.success) {
      abbruch('create 10er: ' + (prod10.error?.message || JSON.stringify(prod10.data)));
    }
    const productId = prod10.data.id;

    const list = await asBuyer.rpc('list_online_pass_products');
    ok(
      'list_online enthält 10er',
      list.data?.success === true
        && Array.isArray(list.data.products)
        && list.data.products.some((p) => p.id === productId),
      JSON.stringify(list.data),
    );

    console.log('\n2) Kauf + doppelter Webhook');
    const pi1 = 'pi_k1_' + randomUUID().replace(/-/g, '').slice(0, 20);
    const first = await prepareAndComplete(admin, buyer.id, productId, pi1);
    ok(
      'complete COMPLETED',
      first.done.code === 'COMPLETED' && !!first.done.pass_id && !!first.done.payment_id,
      JSON.stringify(first.done),
    );
    const passId = first.done.pass_id;
    const paymentId = first.done.payment_id;

    const again = await admin.rpc('complete_online_payment', {
      p_provider_ref: pi1,
      p_amount_cents: first.amount,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok(
      'doppelter Webhook einmal',
      again.data?.success === true && again.data?.code === 'ALREADY_COMPLETED',
      JSON.stringify(again.data),
    );

    const { count: passCount } = await admin
      .from('passes')
      .select('id', { count: 'exact', head: true })
      .eq('payment_id', paymentId);
    ok('eine Pass-Zeile je PI', passCount === 1, String(passCount));

    const { data: receipt } = await admin
      .from('receipts')
      .select('id, number, snapshot')
      .eq('payment_id', paymentId)
      .eq('kind', 'receipt')
      .maybeSingle();
    ok(
      'Beleg pass_purchase',
      !!receipt?.number && String(receipt.snapshot?.service_text || '').includes('Termine'),
      JSON.stringify(receipt),
    );

    const { data: consent } = await admin
      .from('pass_purchase_consents')
      .select('*')
      .eq('attempt_id', first.attemptId)
      .maybeSingle();
    ok(
      'Consent gespeichert',
      consent?.immediate_use_text_hash === HASH_IMMEDIATE
        && consent?.payment_id === paymentId,
      JSON.stringify(consent),
    );

    console.log('\n3) Wertersatz 0 / 2 / 10 / 3er / 5er');
    async function assertWertersatz(user, asUser, used, expectW, expectR, product = productId) {
      const pi = 'pi_k1w_' + used + '_' + randomUUID().replace(/-/g, '').slice(0, 10);
      const bought = await prepareAndComplete(admin, user.id, product, pi);
      if (used > 0) await redeemN(admin, asUser, tenantId, teacher.id, bought.done.pass_id, used);
      const prev = await asUser.rpc('get_pass_withdrawal_preview', {
        p_pass_id: bought.done.pass_id,
      });
      ok(
        `Wertersatz used=${used}`,
        prev.data?.success === true
          && prev.data.wertersatz_cents === expectW
          && prev.data.refund_cents === expectR
          && prev.data.units_used === used,
        JSON.stringify(prev.data),
      );
      return bought;
    }

    await assertWertersatz(u0, asU0, 0, 0, 12000);
    await assertWertersatz(u2, asU2, 2, 2400, 9600);
    await assertWertersatz(u10, asU10, 10, 12000, 0);

    const prod3 = await asOwner.rpc('create_pass_product', {
      p_name: '3er Online',
      p_units: 3,
      p_price_cents: 10000,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_online_purchasable: true,
    });
    const prod5 = await asOwner.rpc('create_pass_product', {
      p_name: '5er Online',
      p_units: 5,
      p_price_cents: 6500,
      p_validity_rule: 'months',
      p_validity_value: 12,
      p_online_purchasable: true,
    });
    if (!prod3.data?.success || !prod5.data?.success) {
      abbruch('create 3/5: ' + JSON.stringify({ prod3: prod3.data, prod5: prod5.data }));
    }
    await assertWertersatz(u3, asU3, 1, 3333, 6667, prod3.data.id);
    await assertWertersatz(u5, asU5, 5, 6500, 0, prod5.data.id);

    console.log('\n4) Widerruf nach 2 → void + refund 9600');
    const wBought = await assertWertersatz(uW, asUW, 2, 2400, 9600);
    const conf = await asUW.rpc('confirm_pass_withdrawal', { p_pass_id: wBought.done.pass_id });
    ok(
      'Widerruf WITHDRAWN',
      conf.data?.success === true
        && conf.data.code === 'WITHDRAWN'
        && conf.data.refund_cents === 9600,
      JSON.stringify(conf.data),
    );
    const { data: wPassRow } = await admin
      .from('passes')
      .select('status')
      .eq('id', wBought.done.pass_id)
      .single();
    ok('Pass revoked nach Widerruf', wPassRow?.status === 'revoked', JSON.stringify(wPassRow));
    const { data: refunds } = await admin
      .from('payment_refunds')
      .select('amount_cents, reason')
      .eq('payment_id', wBought.done.payment_id);
    ok(
      'refund withdrawal 9600',
      refunds?.some((r) => r.reason === 'withdrawal' && r.amount_cents === 9600),
      JSON.stringify(refunds),
    );

    console.log('\n5) extend nur Owner; Cross-Tenant');
    const extBuyer = await asBuyer.rpc('extend_pass', {
      p_pass_id: passId,
      p_new_valid_until: berlinDate(400),
      p_note: 'Bitte verlängern',
    });
    ok(
      'Teilnehmer extend FORBIDDEN',
      extBuyer.data?.success === false && extBuyer.data?.error === 'FORBIDDEN',
      JSON.stringify(extBuyer.data),
    );

    const newUntil = berlinDate(400);
    const ext = await asOwner.rpc('extend_pass', {
      p_pass_id: passId,
      p_new_valid_until: newUntil,
      p_note: 'Kulanz Verlängerung',
    });
    ok(
      'Owner extend',
      ext.data?.success === true && ext.data.new_valid_until === newUntil,
      JSON.stringify(ext.data),
    );
    const { data: chg } = await admin
      .from('pass_validity_changes')
      .select('new_valid_until, note')
      .eq('pass_id', passId)
      .maybeSingle();
    ok(
      'validity_changes Zeile',
      chg?.new_valid_until === newUntil && chg?.note === 'Kulanz Verlängerung',
      JSON.stringify(chg),
    );

    const cross = await asOwnerB.rpc('extend_pass', {
      p_pass_id: passId,
      p_new_valid_until: berlinDate(500),
      p_note: 'fremd',
    });
    ok(
      'Cross-Tenant extend blockiert',
      cross.data?.success === false
        && (cross.data?.error === 'NOT_FOUND' || cross.data?.error === 'FORBIDDEN'),
      JSON.stringify(cross.data),
    );

    console.log('\n6) Öffentlicher Widerruf ohne Leak');
    const pubMiss = await asAnon.rpc('lookup_pass_withdrawal_public', {
      p_receipt_number: '2099-99999',
      p_email: 'niemand@example.com',
      p_client_ip: '203.0.113.10',
    });
    ok(
      'Lookup Miss neutral',
      pubMiss.data?.success === true
        && pubMiss.data?.found !== true
        && !pubMiss.data?.pass_id,
      JSON.stringify(pubMiss.data),
    );

    const pubHit = await asAnon.rpc('lookup_pass_withdrawal_public', {
      p_receipt_number: receipt.number,
      p_email: buyer.email,
      p_client_ip: '203.0.113.11',
    });
    ok(
      'Lookup Hit Zusammenfassung',
      pubHit.data?.success === true
        && pubHit.data?.found === true
        && pubHit.data?.within_window === true
        && pubHit.data?.pass_id === passId,
      JSON.stringify(pubHit.data),
    );

    console.log('\n7) Späte Zahlung nach Cancel legt Karte trotzdem an');
    const prepLate = await admin.rpc('prepare_pass_online_payment', {
      p_product_id: productId,
      p_user_id: buyer.id,
      p_immediate_use_hash: HASH_IMMEDIATE,
      p_withdrawal_info_hash: HASH_WITHDRAWAL,
    });
    if (!prepLate.data?.success) abbruch('prepare late: ' + JSON.stringify(prepLate.data));
    const lateAttempt = prepLate.data.attempt_id;
    const latePi = 'pi_k1late_' + randomUUID().replace(/-/g, '').slice(0, 14);
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: lateAttempt,
      p_provider_ref: latePi,
    });
    await admin.rpc('set_payment_attempt_status', {
      p_attempt_id: lateAttempt,
      p_status: 'canceled',
      p_failure_code: 'ATTEMPT_EXPIRED',
    });
    const lateDone = await admin.rpc('complete_online_payment', {
      p_provider_ref: latePi,
      p_amount_cents: prepLate.data.amount_cents,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok(
      'late after cancel creates pass',
      lateDone.data?.success === true
        && lateDone.data.code === 'COMPLETED_AFTER_CANCEL'
        && !!lateDone.data.pass_id,
      JSON.stringify(lateDone.data),
    );
    const { count: lateRefunds } = await admin
      .from('payment_refunds')
      .select('id', { count: 'exact', head: true })
      .eq('payment_id', lateDone.data.payment_id);
    ok('keine Auto-Erstattung nach Cancel', lateRefunds === 0, String(lateRefunds));

    console.log('\n8) Dispute-Pfad auf pass_purchase');
    const dispRef = 'dp_k1_' + randomUUID().replace(/-/g, '').slice(0, 14);
    const disp = await admin.rpc('record_payment_dispute', {
      p_payment_id: paymentId,
      p_provider_ref: dispRef,
      p_amount_cents: 12000,
      p_status: 'needs_response',
    });
    ok(
      'dispute auf pass_purchase',
      disp.data?.success === true,
      JSON.stringify(disp.data || disp.error),
    );

    console.log('\n9) Kulanz-Erstattung entwertet Rest');
    const kBought = await assertWertersatz(uK, asUK, 1, 1200, 10800);
    const kulanz = await asOwner.rpc('request_payment_refund', {
      p_payment_id: kBought.done.payment_id,
      p_amount_cents: 5000,
      p_note: 'Kulanz anteilig',
    });
    ok('Kulanz request', kulanz.data?.success === true, JSON.stringify(kulanz.data));
    const { data: kPassRow } = await admin
      .from('passes')
      .select('status')
      .eq('id', kBought.done.pass_id)
      .single();
    ok('Kulanz voided pass', kPassRow?.status === 'revoked', JSON.stringify(kPassRow));

    console.log('\nOK K1 pass online');
  } finally {
    try {
      await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    } catch (e) {
      console.warn('Aufräumen:', e.message);
    }
    try {
      await plattform(admin, platformWas);
    } catch (e) {
      console.warn('Plattform zurück:', e.message);
    }
  }
}

main().catch((e) => {
  if (e.abbruch) {
    console.error(e.message);
  } else {
    console.error(e);
  }
  process.exit(1);
});
