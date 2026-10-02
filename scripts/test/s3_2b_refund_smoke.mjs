#!/usr/bin/env node
/**
 * 3.2b — Rauchtest Online-Erstattung gegen Stripe-Sandbox (nur DEV, demoalpha).
 *
 * F1 Teilerstattung 10 € via request_payment_refund → Job
 * F2 Dashboard-Erstattung Rest 14 € (Stripe-API ohne metadata.refund_id) → Webhook
 * F3 Kursabsage → course_cancelled Vollerstattung + Mail-Grund
 * F4 Selbstabmeldung vor Frist → Erstattung; nach Frist → keine
 * F5 Dispute (pm_card_createDispute) → payment_disputes + Glocke, kein Hauptbuch
 * F6 Webhook vor Job: durch Deno-Test abgedeckt (hier vermerkt)
 *
 * Standard: --direkt (payments-jobs per Secret). Ohne Flag: Cron (nach Resume).
 *
 * Verwendung:
 *   node scripts/test/s3_2b_refund_smoke.mjs --direkt
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  abbruch,
  assertDevEnv,
  berlinDate,
  clientMitTenant,
  kursAnlegen,
  ladeEnv,
  login,
  nutzerAnlegen,
  ok,
  plattform,
  plattformStand,
  seedPasswort,
  warteBis,
} from './_helpers.mjs';

const SLUG = 'demoalpha';
const EMAIL_PREFIX = 's32bsmk';
const TITLE_PREFIX = 'S32B_REFUND_SMOKE';
const PRICE = 24;
const PRICE_CENTS = 2400;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIREKT = process.argv.includes('--direkt'); // nach Resume reicht Cron; --direkt für manuell

function ladeEnvDatei(datei) {
  const out = {};
  try {
    for (const zeile of readFileSync(join(root, datei), 'utf8').split(/\r?\n/)) {
      const m = zeile.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* optional */
  }
  return out;
}

function warnAufräumen(schritt, err) {
  console.warn(`Aufräumen ${schritt}: ${err?.message ?? err}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function confirmPiDirect(stripeKey, accountRef, piRef, paymentMethod) {
  const body = new URLSearchParams({ payment_method: paymentMethod });
  const res = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piRef)}/confirm`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': accountRef,
      },
      body,
    },
  );
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function createStripeRefund(stripeKey, accountRef, piRef, amountCents) {
  const body = new URLSearchParams({
    payment_intent: piRef,
    amount: String(amountCents),
  });
  const res = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': accountRef,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) abbruch('Stripe refund create: ' + (json?.error?.message || res.status));
  return json;
}

async function listStripeRefunds(stripeKey, accountRef, piRef) {
  const q = new URLSearchParams({ payment_intent: piRef, limit: '20' });
  const res = await fetch(`https://api.stripe.com/v1/refunds?${q}`, {
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Stripe-Account': accountRef,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) abbruch('Stripe refunds list: ' + (json?.error?.message || res.status));
  return json.data ?? [];
}

async function callCheckout(url, anon, accessToken, actionBody) {
  const res = await fetch(`${url}/functions/v1/payments-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: anon,
      'x-omlify-tenant': SLUG,
    },
    body: JSON.stringify(actionBody),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function callPaymentsJobs(url, secret) {
  const res = await fetch(`${url}/functions/v1/payments-jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) abbruch(`payments-jobs ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function warteJobs(pruefFn, { url, jobsSecret, maxMs = 120_000, label = 'jobs' }) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (DIREKT) await callPaymentsJobs(url, jobsSecret);
    if (await pruefFn()) return;
    await sleep(2_000);
  }
  abbruch(`${label}: Timeout nach ${maxMs} ms`);
}

async function main() {
  const env = { ...ladeEnv(), ...ladeEnvDatei('supabase/.env.dev') };
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const stripeKey = env.STRIPE_SECRET_KEY;
  const mode = (env.PAYMENTS_MODE ?? '').trim();
  const jobsSecret = (env.PROVIDER_JOBS_SECRET ?? '').trim();

  if (mode !== 'test') abbruch('Nur PAYMENTS_MODE=test');
  if (!stripeKey || (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('rk_test_'))) {
    abbruch('STRIPE_SECRET_KEY (test) fehlt');
  }
  if (!jobsSecret) abbruch('PROVIDER_JOBS_SECRET fehlt');

  const laufId = Date.now().toString(36);
  const titleBase = `${TITLE_PREFIX}_${laufId}`;
  const admin = clientMitTenant(url, service, SLUG);
  const courseIds = [];
  const createdMembers = [];
  let onlineWas = null;
  let onsiteWas = null;
  let platformWas = null;
  let windowHoursWas = null;
  let ownerClient = null;
  let accountRef = null;
  let tenantId = null;

  async function bezahleOnline(asUser, regId, paymentMethod = 'pm_card_visa') {
    const { data: sess } = await asUser.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) abbruch('kein Access-Token');
    const prep = await callCheckout(url, anon, token, {
      action: 'prepare',
      registration_id: regId,
    });
    if (prep.status !== 200) abbruch('prepare: ' + JSON.stringify(prep.json));
    const { data: att } = await admin
      .from('payment_attempts')
      .select('id, provider_ref')
      .eq('id', prep.json.attempt_id)
      .single();
    if (!att?.provider_ref?.startsWith('pi_')) abbruch('kein pi_');
    const conf = await confirmPiDirect(stripeKey, accountRef, att.provider_ref, paymentMethod);
    if (!conf.ok || conf.json?.status !== 'succeeded') {
      abbruch('confirm: ' + JSON.stringify({ status: conf.status, pi: conf.json?.status }));
    }
    await warteBis(
      async () => {
        const { data: reg } = await admin
          .from('registrations')
          .select('status, coverage_status')
          .eq('id', regId)
          .single();
        return reg?.status === 'registered' && reg?.coverage_status === 'paid';
      },
      { admin, maxMs: 90_000, schrittMs: 2_000, label: 'paid' },
    );
    const { data: pay } = await admin
      .from('payments')
      .select('id, provider_ref, amount_cents')
      .eq('registration_id', regId)
      .eq('provider', 'stripe')
      .is('reverses_payment_id', null)
      .gt('amount_cents', 0)
      .maybeSingle();
    if (!pay) abbruch('payment fehlt');
    return { piRef: att.provider_ref, paymentId: pay.id, attemptId: att.id };
  }

  try {
    console.log(`3.2b refund smoke (demoalpha) lauf=${laufId}`);

    platformWas = await plattformStand(admin);
    await plattform(admin, true);

    const { data: studios } = await admin.from('tenants').select('id').eq('slug', SLUG);
    if ((studios?.length ?? 0) !== 1) abbruch('demoalpha fehlt');
    tenantId = studios[0].id;

    const { data: accounts } = await admin
      .from('provider_accounts')
      .select('provider_ref, onboarding_status, disconnected_at')
      .eq('tenant_id', tenantId)
      .eq('provider', 'stripe');
    const active = (accounts ?? []).find(
      (a) => a.onboarding_status === 'active' && a.disconnected_at == null && a.provider_ref,
    );
    if (!active) abbruch('demoalpha braucht aktives Stripe-Testkonto');
    accountRef = active.provider_ref;

    const { data: ownerRow } = await admin
      .from('users')
      .select('id, email')
      .eq('tenant_id', tenantId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    if (!ownerRow?.email) abbruch('Owner fehlt');

    const { data: teacherRow } = await admin
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('role', ['teacher', 'owner', 'admin'])
      .limit(1)
      .maybeSingle();
    if (!teacherRow) abbruch('Lehrer fehlt');

    ownerClient = await login(url, anon, ownerRow.email, password, SLUG);
    const { data: setupBefore } = await ownerClient.rpc('get_payment_setup_status');
    onlineWas = setupBefore?.online_payments_enabled === true;
    onsiteWas = setupBefore?.allow_onsite_payment !== false;

    if (!setupBefore?.tax_setting_present) {
      const tax = await ownerClient.rpc('set_tax_setting', {
        p_regime: 'small_business',
        p_vat_rate_bp: 0,
        p_valid_from: berlinDate(0),
      });
      if (tax.error) abbruch('tax: ' + tax.error.message);
      if (!tax.data?.success && tax.data?.error !== 'ALREADY_BOOKED') {
        abbruch('tax: ' + JSON.stringify(tax.data));
      }
    }

    await ownerClient.rpc('set_online_payments_enabled', { p_enabled: true });
    await ownerClient.rpc('set_allow_onsite_payment', { p_allow: false });

    async function neuerNutzer(tag) {
      const p = await nutzerAnlegen(admin, {
        email: `${EMAIL_PREFIX}.${laufId}.${tag}@example.com`,
        vorname: 'Smoke',
        nachname: tag,
        rolle: 'user',
        tenantId,
        password,
      });
      createdMembers.push({ id: p.id, auth_user_id: p.auth_user_id, email: p.email });
      return p;
    }

    async function neuerKurs(suffix, opts = {}) {
      const kurs = await kursAnlegen(admin, tenantId, teacherRow.id, {
        title: `${titleBase}_${suffix}`,
        date: opts.date ?? berlinDate(10),
        time: opts.time ?? '09:00:00',
        end_time: opts.end_time ?? '10:00:00',
        price: PRICE,
        max_participants: opts.max ?? 8,
        pass_eligible: false,
      });
      courseIds.push(kurs.id);
      return kurs;
    }

    // ----- F1 + F2: eine Zahlung, Teil dann Dashboard -----
    console.log('\nF1 — Teilerstattung 10 €');
    {
      const kurs = await neuerKurs('F1');
      const user = await neuerNutzer('f1');
      const asUser = await login(url, anon, user.email, password, SLUG);
      const book = await asUser.rpc('register_for_course', { p_course_id: kurs.id });
      if (!book.data?.success) abbruch('F1 book: ' + JSON.stringify(book.data));
      const regId = book.data.registration_id;
      const { piRef, paymentId } = await bezahleOnline(asUser, regId);
      ok('F1 bezahlt', !!paymentId);

      const req = await ownerClient.rpc('request_payment_refund', {
        p_payment_id: paymentId,
        p_amount_cents: 1000,
        p_note: `Rauchtest Teil ${laufId}`,
      });
      if (!req.data?.success) abbruch('F1 request: ' + JSON.stringify(req.data));
      const refundId = req.data.refund_id;
      ok('F1 REQUESTED', req.data.code === 'REQUESTED', String(req.data.code));

      await warteJobs(
        async () => {
          const { data: rows } = await admin
            .from('payment_refunds')
            .select('id, status, provider_ref, amount_cents')
            .eq('id', refundId);
          const r = rows?.[0];
          return r?.status === 'succeeded' && !!r?.provider_ref?.startsWith('re_');
        },
        { url, jobsSecret, label: 'F1 job' },
      );

      const stripeRs = await listStripeRefunds(stripeKey, accountRef, piRef);
      const partial = stripeRs.find((r) => r.amount === 1000);
      ok('F1 Stripe 10,00 €', !!partial, `n=${stripeRs.length}`);

      const { data: gegen } = await admin
        .from('payments')
        .select('id, amount_cents')
        .eq('reverses_payment_id', paymentId)
        .eq('amount_cents', -1000)
        .maybeSingle();
      ok('F1 Gegenzeile -1000', !!gegen);

      // subject_id = Gegenzeile (wie record_online_refund / s2_2a_4c)
      const { count: evN } = await admin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'payment.reversed')
        .eq('subject_id', gegen.id);
      ok('F1 payment.reversed', (evN ?? 0) >= 1);

      await admin.rpc('process_ledger', { p_limit: 200 });

      const { data: notif } = await admin
        .from('user_notifications')
        .select('id, type, body')
        .eq('user_id', user.id)
        .eq('type', 'payment_refunded')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      ok('F1 Glocke', !!notif);

      // Mail-Text: delivery existiert; Inhalt prüft dispatch Deno — hier Status
      const { data: mails } = await admin
        .from('email_deliveries')
        .select('id, status')
        .eq('registration_id', regId)
        .eq('kind', 'payment_refunded');
      ok('F1 Mail-Outbox', (mails?.length ?? 0) >= 1);

      // ----- F2 Dashboard Rest -----
      console.log('\nF2 — Dashboard-Erstattung 14 €');
      const dash = await createStripeRefund(stripeKey, accountRef, piRef, 1400);
      ok('F2 Stripe re_', typeof dash.id === 'string' && dash.id.startsWith('re_'));

      await warteBis(
        async () => {
          const { data: rows } = await admin
            .from('payment_refunds')
            .select('id, reason, amount_cents, status')
            .eq('payment_id', paymentId)
            .eq('reason', 'provider_dashboard')
            .eq('amount_cents', 1400);
          return rows?.some((r) => r.status === 'succeeded' || r.status === 'pending');
        },
        { admin, maxMs: 120_000, schrittMs: 3_000, label: 'F2 webhook' },
      );

      const { data: allRef } = await admin
        .from('payment_refunds')
        .select('amount_cents, status, reason')
        .eq('payment_id', paymentId)
        .neq('status', 'failed');
      const sum = (allRef ?? []).reduce((s, r) => s + r.amount_cents, 0);
      ok('F2 Summe 24 €', sum === PRICE_CENTS, `sum=${sum}`);

      const led = await admin.rpc('process_ledger', { p_limit: 200 });
      ok('F2 ledger failed=0', (led.data?.failed ?? 1) === 0, JSON.stringify(led.data));

      const nothing = await ownerClient.rpc('request_payment_refund', {
        p_payment_id: paymentId,
        p_amount_cents: null,
        p_note: 'soll nichts',
      });
      ok(
        'F2 NOTHING_TO_REFUND',
        nothing.data?.success === true && nothing.data?.code === 'NOTHING_TO_REFUND',
        JSON.stringify(nothing.data),
      );
    }

    // ----- F3 Kursabsage -----
    console.log('\nF3 — Kursabsage Vollerstattung');
    {
      const kurs = await neuerKurs('F3');
      const user = await neuerNutzer('f3');
      const asUser = await login(url, anon, user.email, password, SLUG);
      const book = await asUser.rpc('register_for_course', { p_course_id: kurs.id });
      const regId = book.data.registration_id;
      const { paymentId } = await bezahleOnline(asUser, regId);

      const cancel = await ownerClient.rpc('cancel_course', {
        p_course_id: kurs.id,
        p_scope: 'single',
        p_note: `Rauchtest Absage ${laufId}`,
      });
      if (cancel.error || !cancel.data?.success) {
        abbruch('F3 cancel: ' + JSON.stringify(cancel.error ?? cancel.data));
      }
      ok('F3 refund_cents', (cancel.data.refund_cents ?? 0) >= PRICE_CENTS);

      await warteJobs(
        async () => {
          const { data: rows } = await admin
            .from('payment_refunds')
            .select('status, reason, provider_ref')
            .eq('payment_id', paymentId)
            .eq('reason', 'course_cancelled');
          return rows?.some((r) => r.status === 'succeeded' && r.provider_ref?.startsWith('re_'));
        },
        { url, jobsSecret, label: 'F3 job' },
      );

      const { data: n } = await admin
        .from('user_notifications')
        .select('metadata')
        .eq('user_id', user.id)
        .eq('type', 'payment_refunded')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      ok(
        'F3 reason course_cancelled',
        n?.metadata?.reason === 'course_cancelled',
        JSON.stringify(n?.metadata),
      );
    }

    // ----- F4 Selbstabmeldung -----
    console.log('\nF4 — Selbstabmeldung vor Frist');
    {
      const kurs = await neuerKurs('F4a');
      const user = await neuerNutzer('f4a');
      const asUser = await login(url, anon, user.email, password, SLUG);
      const book = await asUser.rpc('register_for_course', { p_course_id: kurs.id });
      const regId = book.data.registration_id;
      const { paymentId } = await bezahleOnline(asUser, regId);

      const un = await asUser.rpc('unregister_from_course', { p_course_id: kurs.id });
      if (!un.data?.success) abbruch('F4a unreg: ' + JSON.stringify(un.data));
      ok('F4a refund_cents', (un.data.refund_cents ?? 0) === PRICE_CENTS);

      await warteJobs(
        async () => {
          const { data: rows } = await admin
            .from('payment_refunds')
            .select('status, reason')
            .eq('payment_id', paymentId)
            .eq('reason', 'self_cancel_in_window');
          return rows?.some((r) => r.status === 'succeeded');
        },
        { url, jobsSecret, label: 'F4a job' },
      );
      ok('F4a succeeded', true);
    }

    console.log('\nF4b — nach Frist');
    {
      // Wie a6_3: Studio-Fenster 72 h + Kurs morgen → eingefrorene Deadline schon vorbei.
      // (Direktes UPDATE auf cancellation_deadline ist eingefroren — CANCELLATION_DEADLINE_FROZEN.)
      const { data: tBefore } = await admin
        .from('tenants')
        .select('cancellation_window_hours')
        .eq('id', tenantId)
        .single();
      windowHoursWas = tBefore?.cancellation_window_hours ?? 24;
      const { error: winErr } = await admin
        .from('tenants')
        .update({ cancellation_window_hours: 72 })
        .eq('id', tenantId);
      if (winErr) abbruch('F4b window: ' + winErr.message);

      const kurs = await neuerKurs('F4b', { date: berlinDate(1), time: '12:00:00', end_time: '13:00:00' });
      const user = await neuerNutzer('f4b');
      const asUser = await login(url, anon, user.email, password, SLUG);
      const book = await asUser.rpc('register_for_course', { p_course_id: kurs.id });
      if (!book.data?.success) abbruch('F4b book: ' + JSON.stringify(book.data));
      const regId = book.data.registration_id;
      const { paymentId } = await bezahleOnline(asUser, regId);

      const { data: regRow } = await admin
        .from('registrations')
        .select('cancellation_deadline')
        .eq('id', regId)
        .single();
      const deadlinePast =
        regRow?.cancellation_deadline != null &&
        new Date(regRow.cancellation_deadline).getTime() < Date.now();
      ok('F4b Deadline Vergangenheit', deadlinePast, String(regRow?.cancellation_deadline));

      const un = await asUser.rpc('unregister_from_course', { p_course_id: kurs.id });
      ok('F4b abgemeldet', un.data?.success === true, JSON.stringify(un.data));
      ok('F4b kein refund_cents', (un.data?.refund_cents ?? 0) === 0, JSON.stringify(un.data));
      const { data: rows } = await admin
        .from('payment_refunds')
        .select('id')
        .eq('payment_id', paymentId);
      ok('F4b keine Erstattung', (rows?.length ?? 0) === 0);

      await admin
        .from('tenants')
        .update({ cancellation_window_hours: windowHoursWas })
        .eq('id', tenantId);
      windowHoursWas = null;
    }

    // ----- F5 Dispute -----
    console.log('\nF5 — Dispute');
    {
      const kurs = await neuerKurs('F5');
      const user = await neuerNutzer('f5');
      const asUser = await login(url, anon, user.email, password, SLUG);
      const book = await asUser.rpc('register_for_course', { p_course_id: kurs.id });
      const regId = book.data.registration_id;
      const { paymentId } = await bezahleOnline(asUser, regId, 'pm_card_createDispute');

      await warteBis(
        async () => {
          const { data: rows } = await admin
            .from('payment_disputes')
            .select('id, status, provider_ref')
            .eq('payment_id', paymentId);
          return (rows?.length ?? 0) > 0;
        },
        { admin, maxMs: 180_000, schrittMs: 5_000, label: 'F5 dispute webhook' },
      );

      const { data: disp } = await admin
        .from('payment_disputes')
        .select('id, provider_ref')
        .eq('payment_id', paymentId)
        .maybeSingle();
      ok('F5 dispute Zeile', !!disp?.provider_ref?.startsWith('dp_'));

      const { data: glocken } = await admin
        .from('user_notifications')
        .select('id, type')
        .eq('tenant_id', tenantId)
        .eq('type', 'payment_dispute_opened')
        .order('created_at', { ascending: false })
        .limit(5);
      ok('F5 Owner-Glocke', (glocken?.length ?? 0) >= 1);

      const { data: rev } = await admin
        .from('payments')
        .select('id')
        .eq('reverses_payment_id', paymentId);
      ok('F5 kein Hauptbuch-Gegen', (rev?.length ?? 0) === 0);
    }

    console.log('\nF6 — Webhook vor Job: Deno-Test payments-webhook (17. ALREADY_REFUNDED), hier nicht erzwungen');
    ok('F6 Deno abgedeckt', true);

    console.log('\n3.2b refund smoke OK');
  } catch (err) {
    console.error('\nFEHLER:', err?.message ?? err);
    process.exitCode = 1;
  } finally {
    try {
      if (ownerClient && onlineWas !== null) {
        await ownerClient.rpc('set_online_payments_enabled', { p_enabled: onlineWas });
      }
      if (ownerClient && onsiteWas !== null) {
        await ownerClient.rpc('set_allow_onsite_payment', { p_allow: onsiteWas });
      }
      if (windowHoursWas !== null && tenantId) {
        await admin
          .from('tenants')
          .update({ cancellation_window_hours: windowHoursWas })
          .eq('id', tenantId);
      }
      if (platformWas !== null) await plattform(admin, platformWas);
    } catch (e) {
      warnAufräumen('settings', e);
    }
    for (const cid of courseIds) {
      try {
        await admin.rpc('cancel_course', {
          p_course_id: cid,
          p_reason: 'smoke cleanup',
          p_scope: 'single',
        });
      } catch (e) {
        warnAufräumen('cancel ' + cid, e);
      }
    }
    for (const m of createdMembers) {
      try {
        if (m.id) await admin.rpc('remove_member', { p_member_id: m.id });
      } catch (e) {
        warnAufräumen('remove_member', e);
      }
      try {
        if (m.auth_user_id) await admin.auth.admin.deleteUser(m.auth_user_id);
      } catch (e) {
        warnAufräumen('auth delete', e);
      }
    }
  }
}

main();
