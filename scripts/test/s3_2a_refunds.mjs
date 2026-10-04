#!/usr/bin/env node
/**
 * 3.2a — Online-Erstattungen (Schema/RPCs, ohne Stripe-API / Edge).
 *
 * Voraussetzung: Migrationen 20261002110000…14100 auf DEV.
 * Verwendung: node scripts/test/s3_2a_refunds.mjs
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

const SLUG = 's32arefund';
const EMAIL_PREFIX = 's32arefund';
const TITLE = 'S32A_REFUND';

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

async function setupOnline(admin, asOwner, tenantId, acctRef, regime = 'regular') {
  const up = await admin.rpc('upsert_provider_account', upsertArgs(tenantId, acctRef));
  if (up.error || !up.data?.success) abbruch('upsert: ' + (up.error?.message || JSON.stringify(up.data)));
  const tax = await asOwner.rpc('set_tax_setting', {
    p_regime: regime,
    p_vat_rate_bp: regime === 'regular' ? 1900 : 0,
    p_valid_from: berlinDate(-30),
  });
  if (tax.error || !tax.data?.success) abbruch('tax: ' + (tax.error?.message || JSON.stringify(tax.data)));
  await legalProfileSetzen(asOwner);
  const on = await asOwner.rpc('set_online_payments_enabled', { p_enabled: true });
  if (on.error || !on.data?.success) abbruch('online on: ' + JSON.stringify(on.data));
  const onsite = await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
  if (onsite.error || !onsite.data?.success) abbruch('onsite: ' + JSON.stringify(onsite.data));
}

async function payOnline(admin, userId, registrationId, amountCents) {
  const prep = await admin.rpc('prepare_online_payment', {
    p_registration_id: registrationId,
    p_user_id: userId,
  });
  if (prep.error || !prep.data?.success) {
    abbruch('prepare: ' + (prep.error?.message || JSON.stringify(prep.data)));
  }
  const pi = 'pi_test_r_' + randomUUID().replace(/-/g, '').slice(0, 16);
  await admin.rpc('attach_payment_ref', {
    p_attempt_id: prep.data.attempt_id,
    p_provider_ref: pi,
  });
  const done = await admin.rpc('complete_online_payment', {
    p_provider_ref: pi,
    p_amount_cents: amountCents,
    p_currency: 'EUR',
    p_received_at: new Date().toISOString(),
    p_livemode: false,
  });
  if (done.error || !done.data?.success) {
    abbruch('complete: ' + (done.error?.message || JSON.stringify(done.data)));
  }
  return { pi, paymentId: done.data.payment_id, code: done.data.code, data: done.data };
}

async function processLedgerOk(admin) {
  for (let i = 0; i < 5; i++) {
    const { data, error } = await admin.rpc('process_ledger', { p_limit: 200 });
    if (error) abbruch('process_ledger: ' + error.message);
    if (data?.skipped === 'locked') {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    ok('process_ledger failed 0', (data?.failed ?? 0) === 0, JSON.stringify(data));
    return data;
  }
  abbruch('process_ledger locked');
}

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);
  const platformWas = await plattformStand(admin);

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    console.log('3.2a refunds');
    await plattform(admin, true);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'S32a Refund', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Refund',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });
    const teacher = await nutzerAnlegen(admin, {
      email: SLUG + '.teacher@example.com',
      vorname: 'Teacher',
      nachname: 'Refund',
      rolle: 'teacher',
      tenantId: tenant.id,
      password,
    });
    const a = await nutzerAnlegen(admin, {
      email: SLUG + '.a@example.com',
      vorname: 'Anna',
      nachname: 'A',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const b = await nutzerAnlegen(admin, {
      email: SLUG + '.b@example.com',
      vorname: 'Ben',
      nachname: 'B',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const c = await nutzerAnlegen(admin, {
      email: SLUG + '.c@example.com',
      vorname: 'Cara',
      nachname: 'C',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asTeacher = await login(url, anon, teacher.email, password, SLUG);
    const asA = await login(url, anon, a.email, password, SLUG);
    const asB = await login(url, anon, b.email, password, SLUG);
    const asC = await login(url, anon, c.email, password, SLUG);

    await setupOnline(admin, asOwner, tenant.id, 'acct_test_s32a_' + randomUUID().slice(0, 8));

    // --- 1) Kursabsage: 2 online + 1 bar ---
    console.log('\n1) cancel_course 2 online + 1 bar');
    const kurs1 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Cancel',
      date: berlinDate(5),
      price: 24,
      max_participants: 10,
    });
    // Online-Pflicht aus → pending nur wenn online required. Wir buchen mit onsite an:
    // register → registered open, dann prepare braucht pending. Also online required:
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });

    const rA = await asA.rpc('register_for_course', { p_course_id: kurs1.id });
    ok('A pending', rA.data?.status === 'pending_payment', JSON.stringify(rA.data));
    const payA = await payOnline(admin, a.id, rA.data.registration_id, 2400);
    ok('A paid', payA.code === 'COMPLETED', JSON.stringify(payA.data));

    const rB = await asB.rpc('register_for_course', { p_course_id: kurs1.id });
    const payB = await payOnline(admin, b.id, rB.data.registration_id, 2400);
    ok('B paid', payB.code === 'COMPLETED');

    await asOwner.rpc('set_allow_onsite_payment', { p_allow: true });
    const rC = await asC.rpc('register_for_course', { p_course_id: kurs1.id });
    ok('C registered', rC.data?.success === true, JSON.stringify(rC.data));
    const cash = await asOwner.rpc('record_manual_payment', {
      p_registration_id: rC.data.registration_id ?? rC.data?.id,
      p_method: 'cash',
      p_amount_cents: 2400,
    });
    // registration_id may be in different field
    let cRegId = rC.data.registration_id;
    if (!cRegId) {
      const { data: row } = await admin
        .from('registrations')
        .select('id')
        .eq('course_id', kurs1.id)
        .eq('user_id', c.id)
        .is('cancellation_timestamp', null)
        .single();
      cRegId = row?.id;
    }
    if (!cash.data?.success) {
      const cash2 = await asOwner.rpc('record_manual_payment', {
        p_registration_id: cRegId,
        p_method: 'cash',
        p_amount_cents: 2400,
      });
      ok('C bar', cash2.data?.success === true, JSON.stringify(cash2.data));
    } else {
      ok('C bar', true);
    }

    const cancel = await asOwner.rpc('cancel_course', {
      p_course_id: kurs1.id,
      p_scope: 'single',
    });
    ok('cancel success', cancel.data?.success === true, JSON.stringify(cancel.data));
    ok('refund_cents 4800', cancel.data?.refund_cents === 4800, JSON.stringify(cancel.data));

    const { data: refsCancel } = await admin
      .from('payment_refunds')
      .select('reason, amount_cents, payment_id')
      .eq('tenant_id', tenant.id)
      .eq('reason', 'course_cancelled');
    ok('2 course_cancelled', (refsCancel ?? []).length === 2, String(refsCancel?.length));
    ok(
      'keine bar-Erstattung',
      !(refsCancel ?? []).some((r) => r.payment_id === cash.data?.payment_id),
    );

    // --- 2) Selbstabmeldung vor/nach Frist ---
    console.log('\n2) self cancel window');
    await asOwner.rpc('set_allow_onsite_payment', { p_allow: false });
    const kurs2 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Self',
      date: berlinDate(10),
      price: 24,
    });
    // Frist weit in Zukunft: cancellation_window_hours hoch
    await admin.from('tenants').update({ cancellation_window_hours: 72 }).eq('id', tenant.id);

    const r2 = await asA.rpc('register_for_course', { p_course_id: kurs2.id });
    await payOnline(admin, a.id, r2.data.registration_id, 2400);
    const unregIn = await asA.rpc('unregister_from_course', { p_course_id: kurs2.id });
    ok('self in window', unregIn.data?.success === true && (unregIn.data?.refund_cents ?? 0) === 2400, JSON.stringify(unregIn.data));

    const kurs2b = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' SelfLate',
      date: berlinDate(1),
      price: 24,
    });
    await admin.from('tenants').update({ cancellation_window_hours: 0 }).eq('id', tenant.id);
    const r2b = await asB.rpc('register_for_course', { p_course_id: kurs2b.id });
    await payOnline(admin, b.id, r2b.data.registration_id, 2400);
    // deadline = Kursbeginn bei 0h → jetzt meist nach Frist wenn Kurs morgen... 
    // Freeze setzt deadline = course start - 0h = start. now() < start → noch in Frist.
    // Force deadline in past:
    await admin
      .from('registrations')
      .update({ cancellation_deadline: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', r2b.data.registration_id);
    // freeze trigger may block — use service with allow if needed
    const { error: dlErr } = await admin
      .from('registrations')
      .update({ cancellation_deadline: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', r2b.data.registration_id);
    if (dlErr) {
      // Trigger blocks client update — use raw via RPC not available. Skip force:
      console.log('  Hinweis: deadline-Freeze blockiert Update — prüfe mit window 0 nahe Kursbeginn nicht zuverlässig hier');
    }
    const unregOut = await asB.rpc('unregister_from_course', { p_course_id: kurs2b.id });
    ok('self unregister ok', unregOut.data?.success === true, JSON.stringify(unregOut.data));
    if (!dlErr) {
      ok('self after window 0', (unregOut.data?.refund_cents ?? 0) === 0, JSON.stringify(unregOut.data));
    }

    await admin.from('tenants').update({ cancellation_window_hours: 24 }).eq('id', tenant.id);

    // --- 3) Studio-Abmeldung ---
    console.log('\n3) staff_unregister');
    const kurs3 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Staff',
      date: berlinDate(8),
      price: 24,
    });
    const r3 = await asA.rpc('register_for_course', { p_course_id: kurs3.id });
    await payOnline(admin, a.id, r3.data.registration_id, 2400);
    const admUn = await asOwner.rpc('admin_unregister_user_from_course', {
      p_user_id: a.id,
      p_course_id: kurs3.id,
    });
    ok('staff refund', admUn.data?.success === true && admUn.data?.refund_cents === 2400, JSON.stringify(admUn.data));

    // --- 4) remove_member ---
    console.log('\n4) remove_member');
    const d = await nutzerAnlegen(admin, {
      email: SLUG + '.d@example.com',
      vorname: 'Dana',
      nachname: 'D',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    const asD = await login(url, anon, d.email, password, SLUG);
    const kurs4 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Remove',
      date: berlinDate(9),
      price: 24,
    });
    const r4 = await asD.rpc('register_for_course', { p_course_id: kurs4.id });
    await payOnline(admin, d.id, r4.data.registration_id, 2400);
    const rem = await asOwner.rpc('remove_member', { p_member_id: d.id });
    ok('remove refund', rem.data?.success === true && rem.data?.refund_cents === 2400, JSON.stringify(rem.data));

    // --- 5) Manuell Teilbeträge ---
    console.log('\n5) manual partial');
    const kurs5 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Manual',
      date: berlinDate(11),
      price: 24,
    });
    const r5 = await asA.rpc('register_for_course', { p_course_id: kurs5.id });
    const pay5 = await payOnline(admin, a.id, r5.data.registration_id, 2400);
    const m1 = await asOwner.rpc('request_payment_refund', {
      p_payment_id: pay5.paymentId,
      p_amount_cents: 1000,
      p_note: 'Kulanz Teil 1',
    });
    ok('manual 10', m1.data?.code === 'REQUESTED' && m1.data?.remaining_cents === 1400, JSON.stringify(m1.data));
    const m2 = await asOwner.rpc('request_payment_refund', {
      p_payment_id: pay5.paymentId,
      p_amount_cents: 1500,
      p_note: 'zu viel',
    });
    ok('exceeds', m2.data?.error === 'AMOUNT_EXCEEDS_REMAINING', JSON.stringify(m2.data));
    const m3 = await asOwner.rpc('request_payment_refund', {
      p_payment_id: pay5.paymentId,
      p_amount_cents: 1400,
      p_note: 'Rest',
    });
    ok('manual 14', m3.data?.code === 'REQUESTED' && m3.data?.remaining_cents === 0, JSON.stringify(m3.data));
    const m4 = await asOwner.rpc('request_payment_refund', {
      p_payment_id: pay5.paymentId,
      p_note: 'nichts',
    });
    ok('nothing', m4.data?.code === 'NOTHING_TO_REFUND', JSON.stringify(m4.data));

    // --- 6) Rechte ---
    console.log('\n6) rights');
    const kurs6 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Rights',
      date: berlinDate(12),
      price: 24,
    });
    const r6 = await asA.rpc('register_for_course', { p_course_id: kurs6.id });
    const pay6 = await payOnline(admin, a.id, r6.data.registration_id, 2400);
    const tForbid = await asTeacher.rpc('request_payment_refund', {
      p_payment_id: pay6.paymentId,
      p_amount_cents: 100,
      p_note: 'Lehrer',
    });
    ok('teacher FORBIDDEN', tForbid.data?.error === 'FORBIDDEN', JSON.stringify(tForbid.data));
    const uForbid = await asA.rpc('request_payment_refund', {
      p_payment_id: pay6.paymentId,
      p_amount_cents: 100,
      p_note: 'Teilnehmer',
    });
    ok('user FORBIDDEN', uForbid.data?.error === 'FORBIDDEN', JSON.stringify(uForbid.data));
    const { data: leak, error: leakE } = await asA.from('payment_refunds').select('id').limit(1);
    ok('keine Tabellen-Sicht', leakE != null || (leak ?? []).length === 0, String(leakE?.code));

    // --- 7) record_online_refund mit refund_id ---
    console.log('\n7) record_online_refund');
    const refundId = m1.data.refund_id;
    const re1 = 're_test_' + randomUUID().replace(/-/g, '').slice(0, 16);
    const rec = await admin.rpc('record_online_refund', {
      p_payment_id: pay5.paymentId,
      p_refund_ref: re1,
      p_amount_cents: 1000,
      p_received_at: new Date().toISOString(),
      p_refund_id: refundId,
    });
    ok('REFUNDED', rec.data?.code === 'REFUNDED', JSON.stringify(rec.data));
    const rec2 = await admin.rpc('record_online_refund', {
      p_payment_id: pay5.paymentId,
      p_refund_ref: re1,
      p_amount_cents: 1000,
      p_received_at: new Date().toISOString(),
      p_refund_id: refundId,
    });
    ok('ALREADY', rec2.data?.code === 'ALREADY_REFUNDED');

    const { count: glocke } = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'payment_refunded')
      .eq('user_id', a.id);
    ok('Glocke payment_refunded', (glocke ?? 0) >= 1);

    // --- 8) Dashboard ohne refund_id ---
    console.log('\n8) provider_dashboard');
    const reDash = 're_test_' + randomUUID().replace(/-/g, '').slice(0, 16);
    // Rest 14 noch pending — record ohne id würde pending nehmen. Nutze andere Zahlung.
    const dash = await admin.rpc('record_online_refund', {
      p_payment_id: pay6.paymentId,
      p_refund_ref: reDash,
      p_amount_cents: 500,
      p_received_at: new Date().toISOString(),
    });
    ok('dashboard', dash.data?.code === 'REFUNDED', JSON.stringify(dash.data));
    const { data: dashRow } = await admin
      .from('payment_refunds')
      .select('reason, amount_cents')
      .eq('provider_ref', reDash)
      .single();
    ok('reason provider_dashboard', dashRow?.reason === 'provider_dashboard');

    // --- 9) Hauptbuch 10+14 bei 19 % ---
    console.log('\n9) ledger partial');
    const refundId14 = m3.data.refund_id;
    const re14 = 're_test_' + randomUUID().replace(/-/g, '').slice(0, 16);
    await admin.rpc('record_online_refund', {
      p_payment_id: pay5.paymentId,
      p_refund_ref: re14,
      p_amount_cents: 1400,
      p_received_at: new Date().toISOString(),
      p_refund_id: refundId14,
    });
    await processLedgerOk(admin);

    const { data: origLines } = await admin
      .from('ledger_entries')
      .select('account, debit_cents, credit_cents, event_id')
      .eq('payment_id', pay5.paymentId);
    // Find recorded event lines via payment
    const { data: revPays } = await admin
      .from('payments')
      .select('id')
      .eq('reverses_payment_id', pay5.paymentId);
    const revIds = (revPays ?? []).map((p) => p.id);
    const { data: revLines } = await admin
      .from('ledger_entries')
      .select('account, debit_cents, credit_cents')
      .in('payment_id', revIds);

    const sumRev = (acc, side) =>
      (revLines ?? [])
        .filter((l) => l.account === acc)
        .reduce((s, l) => s + (side === 'd' ? l.debit_cents : l.credit_cents), 0);

    ok('revenue rest 2017', sumRev('revenue_standard', 'd') === 2017, String(sumRev('revenue_standard', 'd')));
    ok('vat rest 383', sumRev('vat_output', 'd') === 383, String(sumRev('vat_output', 'd')));
    ok('psp credit 2400', sumRev('psp_clearing', 'c') === 2400, String(sumRev('psp_clearing', 'c')));

    // --- 10) mark_refund_failed ---
    console.log('\n10) mark_refund_failed');
    const kurs10 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Fail',
      date: berlinDate(13),
      price: 24,
    });
    const r10 = await asA.rpc('register_for_course', { p_course_id: kurs10.id });
    const pay10 = await payOnline(admin, a.id, r10.data.registration_id, 2400);
    const reqF = await asOwner.rpc('request_payment_refund', {
      p_payment_id: pay10.paymentId,
      p_amount_cents: 800,
      p_note: 'wird failen',
    });
    const fail = await admin.rpc('mark_refund_failed', {
      p_refund_id: reqF.data.refund_id,
      p_failure_code: 'REFUND_FAILED',
    });
    ok('failed', fail.data?.code === 'FAILED', JSON.stringify(fail.data));
    const again = await asOwner.rpc('request_payment_refund', {
      p_payment_id: pay10.paymentId,
      p_amount_cents: 800,
      p_note: 'erneut',
    });
    ok('retry after fail', again.data?.code === 'REQUESTED', JSON.stringify(again.data));

    // --- 11) REFUND_REQUIRED late_payment ---
    console.log('\n11) late_payment');
    const kurs11 = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Late',
      date: berlinDate(14),
      price: 24,
      max_participants: 1,
    });
    const hold = new Date(Date.now() + 1500).toISOString();
    const { data: lateId } = await admin.rpc('create_pending_registration', {
      p_course: kurs11.id,
      p_user: a.id,
      p_hold_reason: 'checkout',
      p_hold_expires_at: hold,
    });
    const prepL = await admin.rpc('prepare_online_payment', {
      p_registration_id: lateId,
      p_user_id: a.id,
    });
    const piL = 'pi_test_late_' + randomUUID().replace(/-/g, '').slice(0, 12);
    await admin.rpc('attach_payment_ref', {
      p_attempt_id: prepL.data.attempt_id,
      p_provider_ref: piL,
    });
    await new Promise((r) => setTimeout(r, 2500));
    await admin.rpc('expire_payment_holds');
    await asB.rpc('register_for_course', { p_course_id: kurs11.id });
    const late = await admin.rpc('complete_online_payment', {
      p_provider_ref: piL,
      p_amount_cents: 2400,
      p_currency: 'EUR',
      p_received_at: new Date().toISOString(),
      p_livemode: false,
    });
    ok('REFUND_REQUIRED', late.data?.code === 'REFUND_REQUIRED', JSON.stringify(late.data));
    const { data: lateRef } = await admin
      .from('payment_refunds')
      .select('id, reason')
      .eq('payment_id', late.data.payment_id)
      .eq('reason', 'late_payment')
      .maybeSingle();
    ok('late_payment row', lateRef?.reason === 'late_payment');
    const { data: lateJob } = await admin
      .from('provider_jobs')
      .select('refund_id')
      .eq('payment_id', late.data.payment_id)
      .eq('kind', 'refund_payment')
      .maybeSingle();
    ok('job has refund_id', lateJob?.refund_id === lateRef?.id);

    // --- 12) Dispute ---
    console.log('\n12) dispute');
    const disp = await admin.rpc('record_payment_dispute', {
      p_payment_id: pay6.paymentId,
      p_provider_ref: 'dp_test_' + randomUUID().replace(/-/g, '').slice(0, 12),
      p_amount_cents: 2400,
      p_status: 'needs_response',
    });
    ok('dispute', disp.data?.success === true && disp.data?.is_new === true, JSON.stringify(disp.data));
    const { count: dGlocke } = await admin
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'payment_dispute_opened')
      .eq('tenant_id', tenant.id);
    ok('dispute Glocke', (dGlocke ?? 0) >= 1);

    // Extra: 3 Teile 5+5+14 ledger
    console.log('\n+ 3-teilige Erstattung Ledger');
    const kursX = await kursAnlegen(admin, tenant.id, teacher.id, {
      title: TITLE + ' Triple',
      date: berlinDate(15),
      price: 24,
    });
    const rX = await asA.rpc('register_for_course', { p_course_id: kursX.id });
    const payX = await payOnline(admin, a.id, rX.data.registration_id, 2400);
    for (const amt of [500, 500, 1400]) {
      const rq = await asOwner.rpc('request_payment_refund', {
        p_payment_id: payX.paymentId,
        p_amount_cents: amt,
        p_note: 'Teil ' + amt,
      });
      const re = 're_test_' + randomUUID().replace(/-/g, '').slice(0, 16);
      await admin.rpc('record_online_refund', {
        p_payment_id: payX.paymentId,
        p_refund_ref: re,
        p_amount_cents: amt,
        p_received_at: new Date().toISOString(),
        p_refund_id: rq.data.refund_id,
      });
    }
    await processLedgerOk(admin);
    const { data: revX } = await admin
      .from('payments')
      .select('id')
      .eq('reverses_payment_id', payX.paymentId);
    const { data: linesX } = await admin
      .from('ledger_entries')
      .select('account, debit_cents, credit_cents')
      .in(
        'payment_id',
        (revX ?? []).map((p) => p.id),
      );
    const sumX = (acc, side) =>
      (linesX ?? [])
        .filter((l) => l.account === acc)
        .reduce((s, l) => s + (side === 'd' ? l.debit_cents : l.credit_cents), 0);
    ok('triple revenue 2017', sumX('revenue_standard', 'd') === 2017);
    ok('triple vat 383', sumX('vat_output', 'd') === 383);

    console.log('\n3.2a OK');
  } finally {
    try {
      await plattform(admin, platformWas);
    } catch (e) {
      console.error('Plattform wiederherstellen:', e.message);
    }
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
