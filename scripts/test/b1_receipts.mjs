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

    const pay1 = await stripeZahlung(admin, tenant.id, book.data.registration_id, 2400);
    const payB = await stripeZahlung(admin, tenant.id, bookB.data.registration_id, 2400);
    const pay2 = await stripeZahlung(admin, tenant2.id, book2.data.registration_id, 1800);

    const r1 = await asOwner.rpc('get_receipt_by_payment', { p_payment_id: pay1 });
    const rB = await asOwner.rpc('get_receipt_by_payment', { p_payment_id: payB });
    const r2 = await asOwner2.rpc('get_receipt_by_payment', { p_payment_id: pay2 });
    const year = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric' }).format(
      new Date(),
    );
    ok('Nummer 1', r1.data?.number === `${year}-00001`, r1.data?.number);
    ok('Nummer 2 gleiches Studio', rB.data?.number === `${year}-00002`, rB.data?.number);
    ok('anderes Studio zählt getrennt', r2.data?.number === `${year}-00001`, r2.data?.number);
    ok('§ 19-Satz', r1.data?.snapshot?.tax_text === 'gemäß § 19 UStG ohne USt');
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
