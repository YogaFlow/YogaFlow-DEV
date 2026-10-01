#!/usr/bin/env node
/**
 * 2.2a-4c — Rauchtest Webhook + Provider-Jobs gegen Stripe-Sandbox (nur DEV).
 *
 * Nur demoalpha. Keine direkten Tabellen-Schreibzugriffe (nur RPCs / Edge / Stripe-HTTP).
 * Aufräumen wie 2.2a-3: Fehler nur als Warnung. Lauf-ID in E-Mails und Kurstiteln.
 *
 * Standard: wartet auf echten Cron (bis 3 Min. je Schritt).
 * --direkt: ruft payments-jobs per POST mit PROVIDER_JOBS_SECRET aus .env.dev auf.
 *
 * Verwendung (nach Deploy + Vault):
 *   node scripts/test/s2_2a_4c_webhook_smoke.mjs
 *   node scripts/test/s2_2a_4c_webhook_smoke.mjs --direkt
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
const EMAIL_PREFIX = 's22a4csmk';
const TITLE_PREFIX = 'S22A4C_WEBHOOK_SMOKE';
const PRICE = 24;
const PRICE_CENTS = 2400;

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIREKT = process.argv.includes('--direkt');

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

function warnAufräumen(schritt, err) {
  console.warn(`Aufräumen ${schritt}: ${err?.message ?? err}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createConfirmationToken(stripeKey, accountRef, paymentMethod) {
  const body = new URLSearchParams({ payment_method: paymentMethod });
  const res = await fetch('https://api.stripe.com/v1/test_helpers/confirmation_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': accountRef,
    },
    body,
  });
  const json = await res.json();
  if (!res.ok || typeof json.id !== 'string') {
    abbruch('Confirmation Token: ' + (json?.error?.message || res.status));
  }
  return json.id;
}

/** PaymentIntent direkt bei Stripe bestätigen (ohne unser confirm) — wie nach 3-D-Secure. */
async function confirmPiDirect(stripeKey, accountRef, piRef, paymentMethod) {
  const body = new URLSearchParams({ payment_method: paymentMethod });
  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piRef)}/confirm`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': accountRef,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function retrievePi(stripeKey, accountRef, piRef) {
  const res = await fetch(
    `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(piRef)}?expand[]=latest_charge`,
    {
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Stripe-Account': accountRef,
      },
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    abbruch('Stripe retrieve PI: ' + (json?.error?.message || res.status));
  }
  return json;
}

async function listRefundsForPi(stripeKey, accountRef, piRef) {
  const q = new URLSearchParams({ payment_intent: piRef, limit: '10' });
  const res = await fetch(`https://api.stripe.com/v1/refunds?${q}`, {
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Stripe-Account': accountRef,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    abbruch('Stripe refunds: ' + (json?.error?.message || res.status));
  }
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
  if (!res.ok) {
    abbruch(`payments-jobs ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

/**
 * Wartet auf Bedingung. Mit --direkt: ruft payments-jobs je Schritt.
 * Ohne: nur pollen (Cron). Kein expire_payment_holds — hält Holds der Fälle intakt.
 */
async function warteZustand(pruefFn, opts) {
  const maxMs = opts?.maxMs ?? 180_000;
  const schrittMs = opts?.schrittMs ?? (DIREKT ? 2_000 : 5_000);
  const label = opts?.label ?? 'warte';
  const url = opts?.url;
  const jobsSecret = opts?.jobsSecret;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (DIREKT && url && jobsSecret) {
      await callPaymentsJobs(url, jobsSecret);
    }
    if (await pruefFn()) return Date.now() - start;
    await sleep(schrittMs);
  }
  abbruch(`${label}: Timeout nach ${maxMs} ms`);
}

async function attemptPi(admin, attemptId) {
  const { data, error } = await admin
    .from('payment_attempts')
    .select('id, provider_ref, status, payment_id, failure_code')
    .eq('id', attemptId)
    .single();
  if (error) abbruch('payment_attempts: ' + error.message);
  return data;
}

async function jobsFor(admin, opts = {}) {
  let q = admin
    .from('provider_jobs')
    .select('id, kind, attempt_id, payment_id, status, tries, last_error_code');
  if (opts.kind) q = q.eq('kind', opts.kind);
  if (opts.attempt_id) q = q.eq('attempt_id', opts.attempt_id);
  if (opts.payment_id) q = q.eq('payment_id', opts.payment_id);
  const { data, error } = await q;
  if (error) abbruch('provider_jobs: ' + error.message);
  return data || [];
}

/** Outbox (dispatch-emails-Cron) — unabhängig von --direkt / payments-jobs. */
async function warteOutbox(admin, { kind, registrationId, label, maxMs = 180_000 }) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data: rows, error } = await admin
      .from('email_deliveries')
      .select('id, status, last_error_code')
      .eq('kind', kind)
      .eq('registration_id', registrationId);
    if (error) abbruch(`${label} lesen: ` + error.message);
    const row = rows?.[0];
    if (row?.status === 'sent') return `sent`;
    if (row?.status === 'skipped') return `skipped:${row.last_error_code || '?'}`;
    if (row?.status === 'failed') {
      abbruch(`${label} failed: ` + (row.last_error_code || '?'));
    }
    await sleep(5_000);
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
  if (!jobsSecret) {
    abbruch('PROVIDER_JOBS_SECRET fehlt in supabase/.env.dev — zuerst erzeugen + secrets:dev + Vault');
  }

  const laufId = Date.now().toString(36);
  const titleBase = `${TITLE_PREFIX}_${laufId}`;

  const admin = clientMitTenant(url, service, SLUG);
  /** @type {string[]} */
  const courseIds = [];
  /** @type {{ id: string, auth_user_id: string | null, email: string }[]} */
  const createdMembers = [];
  let onlineWas = null;
  let onsiteWas = null;
  let platformWas = null;
  let ownerClient = null;
  let accountRef = null;
  let tenantId = null;

  /** @type {{ name: string, ok: boolean, ms: number, detail?: string }[]} */
  const summary = [];

  const mark = (name, passed, ms, detail = '') => {
    summary.push({ name, ok: passed, ms, detail });
    if (passed) {
      console.log(`  OK  ${name}${detail ? ' — ' + detail : ''} (${ms} ms)`);
    } else {
      abbruch(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
    }
  };

  try {
    console.log(
      `2.2a-4c webhook smoke (demoalpha) lauf=${laufId} modus=${DIREKT ? 'direkt' : 'cron'}`,
    );

    platformWas = await plattformStand(admin);
    await plattform(admin, true);

    const { data: studios, error: te } = await admin
      .from('tenants')
      .select('id, slug')
      .eq('slug', SLUG);
    if (te) abbruch('demoalpha lesen: ' + te.message);
    if ((studios?.length ?? 0) !== 1) {
      abbruch(`demoalpha fehlt — Studios: ${studios?.length ?? 0}`);
    }
    tenantId = studios[0].id;

    const { data: accounts, error: ae } = await admin
      .from('provider_accounts')
      .select('provider_ref, onboarding_status, disconnected_at')
      .eq('tenant_id', tenantId)
      .eq('provider', 'stripe');
    if (ae) abbruch('provider_accounts: ' + ae.message);
    const active = (accounts ?? []).find(
      (a) => a.onboarding_status === 'active' && a.disconnected_at == null && a.provider_ref,
    );
    if (!active) {
      abbruch('demoalpha braucht aktives Stripe-Testkonto');
    }
    accountRef = active.provider_ref;

    const { data: ownerRow } = await admin
      .from('users')
      .select('id, email')
      .eq('tenant_id', tenantId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    if (!ownerRow?.email) abbruch('demoalpha Owner fehlt');

    const { data: teacherRow } = await admin
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('role', ['teacher', 'owner', 'admin'])
      .limit(1)
      .maybeSingle();
    if (!teacherRow) abbruch('Lehrer/Owner für Kurs fehlt');

    ownerClient = await login(url, anon, ownerRow.email, password, SLUG);

    const { data: setupBefore } = await ownerClient.rpc('get_payment_setup_status');
    onlineWas = setupBefore?.online_payments_enabled === true;
    onsiteWas = setupBefore?.allow_onsite_payment !== false;

    // Steuerstatus: demoalpha hat oft schon Buchungen — dann ist er gesetzt und unveränderlich.
    // Nur setzen wenn fehlend; ALREADY_BOOKED = OK. Nie zurücksetzen (geht nicht).
    if (!setupBefore?.tax_setting_present) {
      const tax = await ownerClient.rpc('set_tax_setting', {
        p_regime: 'small_business',
        p_vat_rate_bp: 0,
        p_valid_from: berlinDate(0),
      });
      if (tax.error) {
        abbruch('tax: ' + tax.error.message);
      }
      if (!tax.data?.success && tax.data?.error !== 'ALREADY_BOOKED') {
        abbruch('tax: ' + JSON.stringify(tax.data));
      }
    }

    const on = await ownerClient.rpc('set_online_payments_enabled', { p_enabled: true });
    if (on.error || !on.data?.success) {
      abbruch('Online an: ' + (on.error?.message || JSON.stringify(on.data)));
    }
    const offSite = await ownerClient.rpc('set_allow_onsite_payment', { p_allow: false });
    if (offSite.error || !offSite.data?.success) {
      abbruch('Vor Ort aus: ' + (offSite.error?.message || JSON.stringify(offSite.data)));
    }

    async function neuerNutzer(tag, vorname, nachname) {
      const p = await nutzerAnlegen(admin, {
        email: `${EMAIL_PREFIX}.${laufId}.${tag}@example.com`,
        vorname,
        nachname,
        rolle: 'user',
        tenantId,
        password,
      });
      createdMembers.push({ id: p.id, auth_user_id: p.auth_user_id, email: p.email });
      return p;
    }

    async function neuerKurs(suffix, maxParticipants) {
      const kurs = await kursAnlegen(admin, tenantId, teacherRow.id, {
        title: `${titleBase}_${suffix}`,
        date: berlinDate(10),
        time: '09:00:00',
        end_time: '10:00:00',
        price: PRICE,
        max_participants: maxParticipants,
        pass_eligible: false,
      });
      courseIds.push(kurs.id);
      return kurs;
    }

    // ========== Fall 1 — Webhook schließt ab (ohne unser confirm) ==========
    console.log('\nFall 1 — Webhook schließt ab');
    const t1 = Date.now();
    {
      const kurs = await neuerKurs('F1', 4);
      const user = await neuerNutzer('f1', 'Smoke', 'WhOk');
      const asUser = await login(url, anon, user.email, password, SLUG);
      const book = await asUser.rpc('register_for_course', { p_course_id: kurs.id });
      if (book.error || !book.data?.success) {
        abbruch('F1 buchen: ' + (book.error?.message || JSON.stringify(book.data)));
      }
      ok('F1 pending_payment', book.data.status === 'pending_payment', String(book.data.status));
      const regId = book.data.registration_id;

      const { data: sess } = await asUser.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) abbruch('F1 kein Access-Token');

      const prep = await callCheckout(url, anon, token, {
        action: 'prepare',
        registration_id: regId,
      });
      ok('F1 prepare 200', prep.status === 200, JSON.stringify(prep.json));
      const attemptId = prep.json.attempt_id;
      const att = await attemptPi(admin, attemptId);
      ok('F1 pi_', !!att?.provider_ref?.startsWith('pi_'), att?.provider_ref ?? '');
      const piRef = att.provider_ref;

      const conf = await confirmPiDirect(stripeKey, accountRef, piRef, 'pm_card_visa');
      ok(
        'F1 Stripe confirm',
        conf.ok && conf.json?.status === 'succeeded',
        JSON.stringify({ status: conf.status, pi: conf.json?.status, err: conf.json?.error?.message }),
      );

      await warteBis(
        async () => {
          const { data: reg } = await admin
            .from('registrations')
            .select('status, coverage_status')
            .eq('id', regId)
            .single();
          return reg?.status === 'registered' && reg?.coverage_status === 'paid';
        },
        { admin, maxMs: 60_000, schrittMs: 2_000, label: 'F1 Buchung paid' },
      );

      const { data: regAfter } = await admin
        .from('registrations')
        .select('status, coverage_status')
        .eq('id', regId)
        .single();
      ok('F1 registered/paid', regAfter?.status === 'registered' && regAfter?.coverage_status === 'paid');

      const { data: pay } = await admin
        .from('payments')
        .select('id, provider_ref, status')
        .eq('registration_id', regId)
        .eq('provider', 'stripe')
        .eq('provider_ref', piRef)
        .maybeSingle();
      ok('F1 payments pi_', !!pay?.provider_ref?.startsWith('pi_'), pay?.provider_ref ?? '');

      const attDone = await attemptPi(admin, attemptId);
      ok('F1 Versuch succeeded', attDone?.status === 'succeeded', String(attDone?.status));

      const outboxDetail = await warteOutbox(admin, {
        kind: 'payment_succeeded',
        registrationId: regId,
        label: 'F1 Outbox payment_succeeded',
      });

      mark('Fall 1', true, Date.now() - t1, `Outbox ${outboxDetail}`);
    }

    // ========== Fall 2 — Abbruch wirkt bei Stripe ==========
    console.log('\nFall 2 — Abbruch bei Stripe');
    const t2 = Date.now();
    {
      const kurs = await neuerKurs('F2', 4);
      const user = await neuerNutzer('f2', 'Smoke', 'Cancel');
      const asUser = await login(url, anon, user.email, password, SLUG);
      const book = await asUser.rpc('register_for_course', { p_course_id: kurs.id });
      if (book.error || !book.data?.success) {
        abbruch('F2 buchen: ' + (book.error?.message || JSON.stringify(book.data)));
      }
      const regId = book.data.registration_id;
      const { data: sess } = await asUser.auth.getSession();
      const token = sess?.session?.access_token;

      const prep = await callCheckout(url, anon, token, {
        action: 'prepare',
        registration_id: regId,
      });
      ok('F2 prepare', prep.status === 200, JSON.stringify(prep.json));
      const attemptId = prep.json.attempt_id;
      const att = await attemptPi(admin, attemptId);
      const piRef = att.provider_ref;
      ok('F2 pi_', !!piRef?.startsWith('pi_'));

      const free = await asUser.rpc('unregister_from_course', { p_course_id: kurs.id });
      if (free.error || !free.data?.success) {
        abbruch('F2 Platz freigeben: ' + (free.error?.message || JSON.stringify(free.data)));
      }

      await warteZustand(
        async () => {
          const jobs = await jobsFor(admin, { kind: 'cancel_payment_intent', attempt_id: attemptId });
          return jobs.some((j) => j.status === 'pending' || j.status === 'done' || j.status === 'running');
        },
        { maxMs: 30_000, label: 'F2 Cancel-Auftrag entsteht', url, jobsSecret },
      );

      await warteZustand(
        async () => {
          const jobs = await jobsFor(admin, { kind: 'cancel_payment_intent', attempt_id: attemptId });
          return jobs.some((j) => j.status === 'done');
        },
        { maxMs: 180_000, label: 'F2 Cancel-Auftrag done', url, jobsSecret },
      );

      const pi = await retrievePi(stripeKey, accountRef, piRef);
      ok('F2 PI canceled', pi.status === 'canceled', String(pi.status));
      mark('Fall 2', true, Date.now() - t2, `pi=${pi.status}`);
    }

    // ========== Fall 3 — Erstattung (Platz vergeben) ==========
    console.log('\nFall 3 — Erstattung');
    const t3 = Date.now();
    let fall3Weg = null;
    let fall3CancelTooLate = false;
    let fall3NichtErzwungen = false;

    async function fall3Versuch(versuchNr) {
      const kurs = await neuerKurs(`F3v${versuchNr}`, 1);
      const userA = await neuerNutzer(`f3a${versuchNr}`, 'Smoke', `A${versuchNr}`);
      const userB = await neuerNutzer(`f3b${versuchNr}`, 'Smoke', `B${versuchNr}`);
      const asA = await login(url, anon, userA.email, password, SLUG);
      const asB = await login(url, anon, userB.email, password, SLUG);

      const bookA = await asA.rpc('register_for_course', { p_course_id: kurs.id });
      if (bookA.error || !bookA.data?.success) {
        abbruch(`F3.${versuchNr} A buchen: ` + (bookA.error?.message || JSON.stringify(bookA.data)));
      }
      const regA = bookA.data.registration_id;
      const { data: sessA } = await asA.auth.getSession();
      const tokenA = sessA?.session?.access_token;

      const prep = await callCheckout(url, anon, tokenA, {
        action: 'prepare',
        registration_id: regA,
      });
      ok(`F3.${versuchNr} prepare`, prep.status === 200, JSON.stringify(prep.json));
      const attemptId = prep.json.attempt_id;
      const att = await attemptPi(admin, attemptId);
      const piRef = att.provider_ref;
      ok(`F3.${versuchNr} pi_`, !!piRef?.startsWith('pi_'));

      const free = await asA.rpc('unregister_from_course', { p_course_id: kurs.id });
      if (free.error || !free.data?.success) {
        abbruch(`F3.${versuchNr} freigeben: ` + (free.error?.message || JSON.stringify(free.data)));
      }

      // B registered: kurz Vor-Ort erlauben → online_payment_required aus
      const onsiteOn = await ownerClient.rpc('set_allow_onsite_payment', { p_allow: true });
      if (onsiteOn.error || !onsiteOn.data?.success) {
        abbruch('F3 onsite an: ' + JSON.stringify(onsiteOn.data));
      }
      const bookB = await asB.rpc('register_for_course', { p_course_id: kurs.id });
      if (bookB.error || !bookB.data?.success) {
        abbruch(`F3.${versuchNr} B buchen: ` + (bookB.error?.message || JSON.stringify(bookB.data)));
      }
      ok(
        `F3.${versuchNr} B registered`,
        bookB.data.status === 'registered',
        String(bookB.data.status),
      );
      const onsiteOff = await ownerClient.rpc('set_allow_onsite_payment', { p_allow: false });
      if (onsiteOff.error || !onsiteOff.data?.success) {
        abbruch('F3 onsite aus: ' + JSON.stringify(onsiteOff.data));
      }

      // Sofort A's PI bestätigen
      const conf = await confirmPiDirect(stripeKey, accountRef, piRef, 'pm_card_visa');
      if (!conf.ok || conf.json?.status !== 'succeeded') {
        const piNow = await retrievePi(stripeKey, accountRef, piRef).catch(() => ({ status: '?' }));
        console.log(
          `  Abbruch schneller, wiederhole (Versuch ${versuchNr}: confirm ${conf.status}, pi=${piNow.status}, err=${conf.json?.error?.message || ''})`,
        );
        return { weg: 2, attemptId, piRef, paymentId: null, cancelTooLate: false };
      }

      // Weg 1: Webhook → REFUND_REQUIRED → refund job
      let paymentId = null;
      await warteZustand(
        async () => {
          const { data: pays } = await admin
            .from('payments')
            .select('id, provider_ref, amount_cents')
            .eq('provider_ref', piRef)
            .eq('provider', 'stripe');
          const pay = pays?.[0];
          if (!pay) return false;
          paymentId = pay.id;
          const jobs = await jobsFor(admin, { kind: 'refund_payment', payment_id: pay.id });
          return jobs.length >= 1;
        },
        { maxMs: 60_000, label: `F3.${versuchNr} REFUND_REQUIRED/Job`, url, jobsSecret },
      );

      await warteZustand(
        async () => {
          const jobs = await jobsFor(admin, { kind: 'refund_payment', payment_id: paymentId });
          return jobs.some((j) => j.status === 'done');
        },
        { maxMs: 180_000, label: `F3.${versuchNr} refund done`, url, jobsSecret },
      );

      const { data: gegen } = await admin
        .from('payments')
        .select('id, provider_ref, amount_cents, reverses_payment_id')
        .eq('reverses_payment_id', paymentId)
        .maybeSingle();
      ok(
        `F3.${versuchNr} Gegenzeile re_`,
        !!gegen?.provider_ref?.startsWith('re_') && gegen.amount_cents === -PRICE_CENTS,
        JSON.stringify(gegen),
      );

      const { count: evRev } = await admin
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'payment.reversed')
        .eq('subject_id', gegen.id);
      ok(`F3.${versuchNr} payment.reversed`, (evRev ?? 0) >= 1);

      const led = await admin.rpc('process_ledger', { p_limit: 100 });
      if (led.error) abbruch('process_ledger: ' + led.error.message);
      ok(
        `F3.${versuchNr} ledger failed=0`,
        (led.data?.failed ?? 0) === 0,
        JSON.stringify(led.data),
      );
      const { data: entries } = await admin
        .from('ledger_entries')
        .select('account, debit_cents, credit_cents')
        .eq('payment_id', gegen.id)
        .eq('tenant_id', tenantId);
      ok(
        `F3.${versuchNr} psp_clearing Gegenbuchung`,
        (entries || []).some((e) => e.account === 'psp_clearing' && e.credit_cents === PRICE_CENTS),
        JSON.stringify(entries),
      );

      const outboxDetail = await warteOutbox(admin, {
        kind: 'payment_refunded',
        registrationId: regA,
        label: `F3.${versuchNr} Outbox payment_refunded`,
      });
      ok(`F3.${versuchNr} Outbox payment_refunded`, !!outboxDetail, outboxDetail);

      const refunds = await listRefundsForPi(stripeKey, accountRef, piRef);
      const sum = refunds.reduce((s, r) => s + (r.amount || 0), 0);
      ok(`F3.${versuchNr} Stripe Erstattung 24 €`, sum === PRICE_CENTS, `sum=${sum}`);

      const cancelJobs = await jobsFor(admin, {
        kind: 'cancel_payment_intent',
        attempt_id: attemptId,
      });
      // cancel_too_late: Cancel-Job done, PI aber succeeded (nicht canceled)
      const pi = await retrievePi(stripeKey, accountRef, piRef);
      const cancelDone = cancelJobs.some((j) => j.status === 'done');
      const cancelTooLate = cancelDone && pi.status === 'succeeded';

      return {
        weg: 1,
        attemptId,
        piRef,
        paymentId,
        cancelTooLate,
        outboxDetail,
      };
    }

    {
      let ergebnis = await fall3Versuch(1);
      if (ergebnis.weg === 2) {
        ergebnis = await fall3Versuch(2);
        if (ergebnis.weg === 2) {
          fall3NichtErzwungen = true;
          fall3Weg = 2;
          fall3CancelTooLate = false;
          console.log('  Fall 3: zweimal Weg 2 — nicht erzwungen (kein Fehler)');
          mark(
            'Fall 3',
            true,
            Date.now() - t3,
            'Weg 2 ×2, nicht erzwungen',
          );
        } else {
          fall3Weg = 1;
          fall3CancelTooLate = ergebnis.cancelTooLate;
          mark(
            'Fall 3',
            true,
            Date.now() - t3,
            `Weg 1 (2. Versuch), cancel_too_late=${fall3CancelTooLate}`,
          );
        }
      } else {
        fall3Weg = 1;
        fall3CancelTooLate = ergebnis.cancelTooLate;
        mark(
          'Fall 3',
          true,
          Date.now() - t3,
          `Weg 1, cancel_too_late=${fall3CancelTooLate}`,
        );
      }
    }

    // ========== Fall 4 — Ablehnung + Cancel-Auftrag ==========
    console.log('\nFall 4 — Ablehnung');
    const t4 = Date.now();
    {
      const kurs = await neuerKurs('F4', 4);
      const user = await neuerNutzer('f4', 'Smoke', 'Decl');
      const asUser = await login(url, anon, user.email, password, SLUG);
      const book = await asUser.rpc('register_for_course', { p_course_id: kurs.id });
      if (book.error || !book.data?.success) {
        abbruch('F4 buchen: ' + (book.error?.message || JSON.stringify(book.data)));
      }
      const regId = book.data.registration_id;
      const { data: sess } = await asUser.auth.getSession();
      const token = sess?.session?.access_token;

      const prep = await callCheckout(url, anon, token, {
        action: 'prepare',
        registration_id: regId,
      });
      ok('F4 prepare', prep.status === 200, JSON.stringify(prep.json));
      const attemptId = prep.json.attempt_id;

      const tokenBad = await createConfirmationToken(stripeKey, accountRef, 'pm_card_chargeDeclined');
      const confBad = await callCheckout(url, anon, token, {
        action: 'confirm',
        attempt_id: attemptId,
        confirmation_token: tokenBad,
      });
      ok(
        'F4 CARD_DECLINED',
        confBad.status === 400 && confBad.json.code === 'CARD_DECLINED',
        JSON.stringify(confBad.json),
      );

      const { data: regAfter } = await admin
        .from('registrations')
        .select('status')
        .eq('id', regId)
        .single();
      ok('F4 bleibt pending_payment', regAfter?.status === 'pending_payment', String(regAfter?.status));

      await warteZustand(
        async () => {
          const jobs = await jobsFor(admin, { kind: 'cancel_payment_intent', attempt_id: attemptId });
          return jobs.some((j) => j.status === 'done');
        },
        { maxMs: 180_000, label: 'F4 Cancel-Auftrag done', url, jobsSecret },
      );

      mark('Fall 4', true, Date.now() - t4, 'cancel done');
    }

    console.log('\n========== Zusammenfassung ==========');
    for (const s of summary) {
      console.log(
        `  ${s.ok ? 'OK' : 'FAIL'}  ${s.name}  ${s.ms} ms` +
          (s.detail ? `  (${s.detail})` : ''),
      );
    }
    console.log(
      `  Fall 3 Weg=${fall3Weg}` +
        (fall3NichtErzwungen ? ' (nicht erzwungen)' : '') +
        `  cancel_too_late=${fall3CancelTooLate}`,
    );
    console.log(`\nRauchtest 2.2a-4c OK (modus=${DIREKT ? 'direkt' : 'cron'})`);
  } finally {
    try {
      if (ownerClient) {
        if (onlineWas !== null) {
          await ownerClient.rpc('set_online_payments_enabled', { p_enabled: onlineWas });
        }
        if (onsiteWas !== null) {
          await ownerClient.rpc('set_allow_onsite_payment', { p_allow: onsiteWas });
        }
      }
    } catch (e) {
      warnAufräumen('Studio-Schalter', e);
    }
    try {
      if (platformWas !== null) await plattform(admin, platformWas);
    } catch (e) {
      warnAufräumen('Plattform-Schalter', e);
    }

    for (const courseId of courseIds) {
      if (!ownerClient) {
        warnAufräumen('cancel_course', new Error('kein Owner-Client'));
        continue;
      }
      try {
        const { data, error } = await ownerClient.rpc('cancel_course', {
          p_course_id: courseId,
          p_scope: 'single',
          p_note: `Rauchtest 2.2a-4c Aufräumen ${laufId}`,
        });
        if (error || !data?.success) warnAufräumen('cancel_course', error || data);
      } catch (e) {
        warnAufräumen('cancel_course', e);
      }
    }

    for (const m of createdMembers) {
      try {
        if (!ownerClient) {
          warnAufräumen(`remove_member ${m.email}`, new Error('kein Owner-Client'));
        } else {
          const { data, error } = await ownerClient.rpc('remove_member', { p_member_id: m.id });
          if (error || !data?.success) warnAufräumen(`remove_member ${m.email}`, error || data);
        }
      } catch (e) {
        warnAufräumen(`remove_member ${m.email}`, e);
      }
      if (m.auth_user_id) {
        try {
          const { error } = await admin.auth.admin.deleteUser(m.auth_user_id);
          if (error && !/not found/i.test(error.message)) {
            warnAufräumen(`auth.deleteUser ${m.email}`, error);
          }
        } catch (e) {
          warnAufräumen(`auth.deleteUser ${m.email}`, e);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err?.abbruch ? err.message : err);
  process.exit(1);
});
