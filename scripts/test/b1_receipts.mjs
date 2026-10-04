#!/usr/bin/env node
/**
 * B1 Teil C — Belege (nur DEV). Studios b1rcpt / b1rcptx.
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

const SLUG = 'b1rcpt';
const SLUG2 = 'b1rcptx';
const EMAIL_PREFIX = 'b1rcpt';

async function stripeZahlung(admin, tenantId, registrationId, amountCents) {
  if (!registrationId) abbruch('Zahlung ohne registration_id');
  const ref = 'pi_b1_' + randomUUID().replace(/-/g, '').slice(0, 18);
  const row = {
    tenant_id: tenantId,
    subject_type: 'registration',
    subject_id: registrationId,
    registration_id: registrationId,
    provider: 'stripe',
    method: 'card',
    status: 'succeeded',
    amount_cents: amountCents,
    currency: 'EUR',
    provider_ref: ref,
    received_at: new Date().toISOString(),
  };
  const { data, error } = await admin.from('payments').insert(row).select('id').single();
  if (error) {
    abbruch('Zahlung: ' + error.message);
  }
  return data.id;
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG, SLUG2], EMAIL_PREFIX);
    console.log('B1 Belege');

    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'B1 Receipts', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);
    const { data: tenant2, error: te2 } = await admin
      .from('tenants')
      .insert({ name: 'B1 ReceiptsX', slug: SLUG2 })
      .select('id')
      .single();
    if (te2) abbruch('Studio2: ' + te2.message);

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Rcpt',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Lehrer',
      nachname: 'Rcpt',
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });
    const member = await nutzerAnlegen(admin, {
      email: SLUG + '.user@example.com',
      vorname: 'Anna',
      nachname: 'Rcpt',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const other = await nutzerAnlegen(admin, {
      email: SLUG + '.b@example.com',
      vorname: 'Ben',
      nachname: 'Rcpt',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const foreign = await nutzerAnlegen(admin, {
      email: SLUG2 + '.user@example.com',
      vorname: 'Fremd',
      nachname: 'X',
      rolle: 'user',
      tenantId: tenant2.id,
      password,
    });
    const owner2 = await nutzerAnlegen(admin, {
      email: SLUG2 + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'X',
      rolle: 'owner',
      tenantId: tenant2.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asTeacher = await login(url, anon, teacher.email, password, SLUG);
    const asMember = await login(url, anon, member.email, password, SLUG);
    const asOther = await login(url, anon, other.email, password, SLUG);
    const asForeign = await login(url, anon, foreign.email, password, SLUG2);
    const asOwner2 = await login(url, anon, owner2.email, password, SLUG2);

    await legalProfileSetzen(asOwner, { p_legal_name: 'Yoga Mitte · Anna', p_city: 'Berlin' });
    await asOwner.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(0),
    });
    await legalProfileSetzen(asOwner2, { p_legal_name: 'Yoga Ost', p_city: 'Hamburg' });
    await asOwner2.rpc('set_tax_setting', {
      p_regime: 'regular',
      p_vat_rate_bp: 1900,
      p_valid_from: berlinDate(0),
    });

    const kurs = await kursAnlegen(admin, tenant.id, teacher.id, { title: 'Yin', price: 24 });
    const kurs2 = await kursAnlegen(admin, tenant2.id, owner2.id, { title: 'Vinyasa', price: 18 });

    const book = await asMember.rpc('register_for_course', { p_course_id: kurs.id, p_use_pass: false });
    if (book.error || !book.data?.registration_id) {
      abbruch('anmelden: ' + (book.error?.message || JSON.stringify(book.data)));
    }
    const bookB = await asOther.rpc('register_for_course', { p_course_id: kurs.id, p_use_pass: false });
    if (bookB.error || !bookB.data?.registration_id) {
      abbruch('anmelden B: ' + (bookB.error?.message || JSON.stringify(bookB.data)));
    }
    const book2 = await asForeign.rpc('register_for_course', { p_course_id: kurs2.id, p_use_pass: false });
    if (book2.error || !book2.data?.registration_id) {
      abbruch('anmelden 2: ' + (book2.error?.message || JSON.stringify(book2.data)));
    }

    // NEGATIV: erzwungener Belegfehler — Zahlung muss trotzdem gebucht werden.
    const forceUser = await nutzerAnlegen(admin, {
      email: SLUG + '.force@example.com',
      vorname: 'Force',
      nachname: 'Fail',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const asForce = await login(url, anon, forceUser.email, password, SLUG);
    const kursForce = await kursAnlegen(admin, tenant.id, teacher.id, { title: 'Force', price: 5 });
    const bookForce = await asForce.rpc('register_for_course', {
      p_course_id: kursForce.id,
      p_use_pass: false,
    });
    if (bookForce.error || !bookForce.data?.registration_id) {
      abbruch('anmelden Force: ' + (bookForce.error?.message || JSON.stringify(bookForce.data)));
    }
    const { data: forcePayId, error: forceErr } = await admin.rpc(
      'debug_insert_payment_force_receipt_fail',
      {
        p_tenant_id: tenant.id,
        p_registration_id: bookForce.data.registration_id,
        p_amount_cents: 500,
      },
    );
    if (forceErr) abbruch('NEGATIV force: ' + forceErr.message);
    const { data: forcePay } = await admin
      .from('payments')
      .select('id, status')
      .eq('id', forcePayId)
      .maybeSingle();
    ok('NEGATIV Zahlung gebucht', forcePay?.status === 'succeeded', forcePay?.status);
    const { data: forceReceipts } = await admin
      .from('receipts')
      .select('id')
      .eq('payment_id', forcePayId)
      .eq('kind', 'receipt');
    ok('NEGATIV kein Beleg', (forceReceipts || []).length === 0);
    const { data: forceEvents } = await admin
      .from('events')
      .select('type, payload')
      .eq('tenant_id', tenant.id)
      .eq('type', 'receipt.issue_failed')
      .eq('subject_id', forcePayId);
    ok(
      'NEGATIV Ereignis receipt.issue_failed',
      (forceEvents || []).length === 1 &&
        forceEvents?.[0]?.payload?.error_code === 'FORCED_RECEIPT_FAIL' &&
        forceEvents?.[0]?.payload?.payment_id === forcePayId,
      JSON.stringify(forceEvents?.[0]?.payload),
    );

    // N4: fehlender Steuerstatus → kein Beleg, Event TAX_STATUS_MISSING.
    const { data: tenantNoTax, error: tntErr } = await admin
      .from('tenants')
      .insert({ name: 'B1 NoTax', slug: SLUG + 'nt' })
      .select('id')
      .single();
    if (tntErr) abbruch('Studio NoTax: ' + tntErr.message);
    const ownerNt = await nutzerAnlegen(admin, {
      email: SLUG + '.nt.owner@example.com',
      vorname: 'Owner',
      nachname: 'NoTax',
      rolle: 'owner',
      tenantId: tenantNoTax.id,
      password,
    });
    const memberNt = await nutzerAnlegen(admin, {
      email: SLUG + '.nt.user@example.com',
      vorname: 'User',
      nachname: 'NoTax',
      rolle: 'user',
      tenantId: tenantNoTax.id,
      password,
    });
    const asOwnerNt = await login(url, anon, ownerNt.email, password, SLUG + 'nt');
    const asMemberNt = await login(url, anon, memberNt.email, password, SLUG + 'nt');
    await legalProfileSetzen(asOwnerNt, { p_legal_name: 'No Tax Yoga', p_city: 'Leipzig' });
    const kursNt = await kursAnlegen(admin, tenantNoTax.id, ownerNt.id, { title: 'NoTax', price: 12 });
    const bookNt = await asMemberNt.rpc('register_for_course', {
      p_course_id: kursNt.id,
      p_use_pass: false,
    });
    if (bookNt.error || !bookNt.data?.registration_id) {
      abbruch('anmelden NoTax: ' + (bookNt.error?.message || JSON.stringify(bookNt.data)));
    }
    const payNt = await stripeZahlung(admin, tenantNoTax.id, bookNt.data.registration_id, 1200);
    const { data: payNtRow } = await admin.from('payments').select('id, status').eq('id', payNt).single();
    ok('N4 Zahlung ohne Steuerstatus gebucht', payNtRow?.status === 'succeeded');
    const { data: ntReceipts } = await admin
      .from('receipts')
      .select('id')
      .eq('payment_id', payNt);
    ok('N4 kein Beleg ohne Steuerstatus', (ntReceipts || []).length === 0);
    const { data: ntEvents } = await admin
      .from('events')
      .select('payload')
      .eq('tenant_id', tenantNoTax.id)
      .eq('type', 'receipt.issue_failed')
      .eq('subject_id', payNt);
    ok(
      'N4 TAX_STATUS_MISSING',
      ntEvents?.[0]?.payload?.error_code === 'TAX_STATUS_MISSING',
      JSON.stringify(ntEvents?.[0]?.payload),
    );

    // N2: Steuer setzen → retry_missing_receipts holt Beleg nach.
    await asOwnerNt.rpc('set_tax_setting', {
      p_regime: 'small_business',
      p_vat_rate_bp: 0,
      p_valid_from: berlinDate(-1),
    });
    const { data: retryRes, error: retryErr } = await admin.rpc('retry_missing_receipts', {
      p_tenant_id: tenantNoTax.id,
    });
    if (retryErr) abbruch('retry_missing_receipts: ' + retryErr.message);
    const rNt = await asOwnerNt.rpc('get_receipt_by_payment', { p_payment_id: payNt });
    ok('N2 Nachholen Beleg', rNt.data?.success === true && !!rNt.data?.number, rNt.data?.number);
    ok('N2 retry zählt', (retryRes?.payments_issued ?? 0) >= 1, JSON.stringify(retryRes));

    const pay1 = await stripeZahlung(admin, tenant.id, book.data.registration_id, 2400);
    const payB = await stripeZahlung(admin, tenant.id, bookB.data.registration_id, 2400);
    const pay2 = await stripeZahlung(admin, tenant2.id, book2.data.registration_id, 1800);

    const r1 = await asOwner.rpc('get_receipt_by_payment', { p_payment_id: pay1 });
    const rB = await asOwner.rpc('get_receipt_by_payment', { p_payment_id: payB });
    const r2 = await asOwner2.rpc('get_receipt_by_payment', { p_payment_id: pay2 });
    const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(
      new Date(),
    );
    // forcePay verbraucht keine Nummer (fehlgeschlagen vor next_receipt_number).
    ok('Nummer 1', r1.data?.number === `${year}-00001`, r1.data?.number);
    ok('Nummer 2 gleiches Studio', rB.data?.number === `${year}-00002`, rB.data?.number);
    ok('anderes Studio zählt getrennt', r2.data?.number === `${year}-00001`, r2.data?.number);
    ok('§ 19-Kurzform im Schnappschuss', r1.data?.snapshot?.tax_text === 'gemäß § 19 UStG ohne USt');
    ok('regular USt im Schnappschuss', r2.data?.snapshot?.tax_text === 'enthält 19 % USt');
    ok('Leistungstext', String(r1.data?.snapshot?.service_text || '').includes('Yin'));

    const again = await admin.rpc ? null : null;
    const { data: second } = await admin
      .from('receipts')
      .select('id')
      .eq('payment_id', pay1)
      .eq('kind', 'receipt');
    ok('ein Beleg je Zahlung', (second || []).length === 1);

    const parallelRegs = [];
    for (let i = 0; i < 2; i++) {
      const u = await nutzerAnlegen(admin, {
        email: `${SLUG}.p${i}@example.com`,
        vorname: 'Par',
        nachname: 'P' + i,
        rolle: 'user',
        tenantId: tenant.id,
        password,
      });
      const c = await login(url, anon, u.email, password, SLUG);
      const kursP = await kursAnlegen(admin, tenant.id, teacher.id, { title: 'Par ' + i, price: 10 });
      const b = await c.rpc('register_for_course', { p_course_id: kursP.id, p_use_pass: false });
      parallelRegs.push(b.data.registration_id);
    }
    const [pA, pB] = await Promise.all(
      parallelRegs.map((rid) => stripeZahlung(admin, tenant.id, rid, 1000)),
    );
    const nA = (await asOwner.rpc('get_receipt_by_payment', { p_payment_id: pA })).data?.number;
    const nB = (await asOwner.rpc('get_receipt_by_payment', { p_payment_id: pB })).data?.number;
    ok('parallele Nummern verschieden', nA && nB && nA !== nB, `${nA} / ${nB}`);

    const { data: refund1, error: re1 } = await admin
      .from('payment_refunds')
      .insert({
        tenant_id: tenant.id,
        payment_id: pay1,
        amount_cents: 1000,
        status: 'succeeded',
        reason: 'manual',
        note: 'Kulanz',
      })
      .select('id')
      .single();
    if (re1) abbruch('Erstattung 1: ' + re1.message);
    const { data: refund2, error: re2 } = await admin
      .from('payment_refunds')
      .insert({
        tenant_id: tenant.id,
        payment_id: pay1,
        amount_cents: 1400,
        status: 'succeeded',
        reason: 'manual',
        note: 'Rest',
      })
      .select('id')
      .single();
    if (re2) abbruch('Erstattung 2: ' + re2.message);

    const { data: refundRows } = await admin
      .from('receipts')
      .select('id, number, amount_cents, original_receipt_id, snapshot')
      .eq('payment_id', pay1)
      .eq('kind', 'refund_receipt')
      .order('number');
    ok('zwei Erstattungsbelege', (refundRows || []).length === 2);
    ok(
      'Bezug Original',
      refundRows?.every((row) => row.original_receipt_id === r1.data.id),
    );
    ok('negativer Betrag', refundRows?.[0]?.amount_cents === -1000);

    await legalProfileSetzen(asOwner, { p_legal_name: 'Neuer Name', p_city: 'Köln' });
    const old = await asOwner.rpc('get_receipt', { p_id: r1.data.id });
    ok(
      'alter Beleg unverändert',
      old.data?.snapshot?.legal_name === 'Yoga Mitte · Anna' && old.data?.snapshot?.city === 'Berlin',
    );

    const own = await asMember.rpc('get_receipt', { p_id: r1.data.id });
    ok('Teilnehmende eigener Beleg', own.data?.success === true && own.data?.number === r1.data.number);

    const fremd = await asOther.rpc('get_receipt', { p_id: r1.data.id });
    ok(
      'fremde Person FORBIDDEN',
      fremd.data?.error === 'FORBIDDEN' || fremd.data?.error === 'NOT_FOUND',
      JSON.stringify(fremd.data),
    );

    const teacherRead = await asTeacher.rpc('get_receipt', { p_id: r1.data.id });
    ok(
      'Lehrende nicht',
      teacherRead.data?.error === 'FORBIDDEN',
      JSON.stringify(teacherRead.data),
    );

    const x = await asForeign.rpc('get_receipt', { p_id: r1.data.id });
    ok(
      'fremdes Studio NOT_FOUND',
      x.data?.error === 'NOT_FOUND' || x.data?.error === 'FORBIDDEN',
      JSON.stringify(x.data),
    );

    void refund1;
    void refund2;
    void again;
    console.log('\nFertig.');
  } finally {
    try {
      await plattform(admin, platformWas);
    } catch (e) {
      console.error('Plattform wiederherstellen:', e);
    }
    try {
      await resteEntfernen(admin, [SLUG, SLUG2, SLUG + 'nt'], EMAIL_PREFIX);
    } catch (e) {
      console.error('Reste:', e);
    }
  }
}

main().catch((e) => {
  console.error(e.abbruch ? e.message : e);
  process.exit(1);
});
