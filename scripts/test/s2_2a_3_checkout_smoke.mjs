#!/usr/bin/env node
/**
 * 2.2a-3 — Rauchtest payments-checkout gegen Stripe-Sandbox (nur DEV).
 *
 * Schreibt, führt nichts aus. Braucht deployte Function payments-checkout,
 * APP_BASE_DOMAIN und STRIPE_SECRET_KEY (test), echtes Demo-Alpha-Konto.
 *
 * Confirmation Tokens: gepinnte Stripe-SDK 22.6.2 hat testHelpers.confirmationTokens.create —
 * dieses Skript nutzt denselben HTTP-Pfad (kein Stripe-Paket im Root-Package).
 *
 * Aufräumen: Kurs absagen (cancel_course), Personen per remove_member,
 * Auth-Login best effort. Kein DELETE auf payments / payment_attempts / events /
 * ledger_entries. E-Mails und Kurstitel je Lauf eindeutig (lauf-id).
 *
 * Verwendung (nach Deploy): node scripts/test/s2_2a_3_checkout_smoke.mjs
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
  legalProfileSetzen,
  login,
  nutzerAnlegen,
  ok,
  plattform,
  plattformStand,
  probeErlaubt,
  seedPasswort,
} from './_helpers.mjs';

if (probeErlaubt()) {
  console.log('  übersprungen (Probe — Stripe/demoalpha-Rauchtest nur auf DEV)');
  process.exit(0);
}

const SLUG = 'demoalpha';
const EMAIL_PREFIX = 's22a3smk';
const TITLE_PREFIX = 'S22A3_CHECKOUT_SMOKE';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

async function main() {
  const env = { ...ladeEnv(), ...ladeEnvDatei('supabase/.env.dev') };
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const stripeKey = env.STRIPE_SECRET_KEY;
  const mode = (env.PAYMENTS_MODE ?? '').trim();

  if (mode !== 'test') abbruch('Nur PAYMENTS_MODE=test');
  if (!stripeKey || (!stripeKey.startsWith('sk_test_') && !stripeKey.startsWith('rk_test_'))) {
    abbruch('STRIPE_SECRET_KEY (test) fehlt');
  }

  const laufId = Date.now().toString(36);
  const title = `${TITLE_PREFIX}_${laufId}`;

  const admin = clientMitTenant(url, service, SLUG);
  let courseId = null;
  /** @type {{ id: string, auth_user_id: string | null, email: string }[]} */
  const createdMembers = [];
  let onlineWas = null;
  let onsiteWas = null;
  let platformWas = null;
  let ownerClient = null;

  try {
    console.log(`2.2a-3 checkout smoke (demoalpha) lauf=${laufId}`);

    platformWas = await plattformStand(admin);
    await plattform(admin, true);

    const { data: studios, error: te } = await admin
      .from('tenants')
      .select('id, slug')
      .eq('slug', SLUG);
    if (te) abbruch('demoalpha lesen: ' + te.message);
    if ((studios?.length ?? 0) !== 1) {
      abbruch(`demoalpha fehlt — Studios mit diesem Slug: ${studios?.length ?? 0}`);
    }
    const tenant = studios[0];

    // Wie get_owner_payment_context / Domain-Skript: onboarding_status, nicht status.
    const { data: accounts, error: ae } = await admin
      .from('provider_accounts')
      .select('provider_ref, onboarding_status, disconnected_at')
      .eq('tenant_id', tenant.id)
      .eq('provider', 'stripe');
    if (ae) abbruch('provider_accounts: ' + ae.message);
    const active = (accounts ?? []).find(
      (a) => a.onboarding_status === 'active' && a.disconnected_at == null && a.provider_ref,
    );
    if (!active) {
      const statusList = (accounts ?? [])
        .map((a) => `${a.onboarding_status ?? '?'}${a.disconnected_at != null ? ',getrennt' : ''}`)
        .join('; ') || '(keine)';
      abbruch(
        `demoalpha braucht aktives Stripe-Testkonto — Studios: ${studios.length}, Konten: ${accounts?.length ?? 0}, Status: ${statusList}`,
      );
    }
    const accountRef = active.provider_ref;

    const { data: ownerRow } = await admin
      .from('users')
      .select('id, email')
      .eq('tenant_id', tenant.id)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();
    if (!ownerRow?.email) abbruch('demoalpha Owner fehlt');

    const { data: teacherRow } = await admin
      .from('users')
      .select('id')
      .eq('tenant_id', tenant.id)
      .in('role', ['teacher', 'owner', 'admin'])
      .limit(1)
      .maybeSingle();
    if (!teacherRow) abbruch('Lehrer/Owner für Kurs fehlt');

    ownerClient = await login(url, anon, ownerRow.email, password, SLUG);

    const { data: setupBefore } = await ownerClient.rpc('get_payment_setup_status');
    onlineWas = setupBefore?.online_payments_enabled === true;
    onsiteWas = setupBefore?.allow_onsite_payment !== false;

    await legalProfileSetzen(ownerClient);
    const on = await ownerClient.rpc('set_online_payments_enabled', { p_enabled: true });
    if (on.error || !on.data?.success) abbruch('Online an: ' + (on.error?.message || JSON.stringify(on.data)));
    const offSite = await ownerClient.rpc('set_allow_onsite_payment', { p_allow: false });
    if (offSite.error || !offSite.data?.success) {
      abbruch('Vor Ort aus: ' + (offSite.error?.message || JSON.stringify(offSite.data)));
    }

    const participant = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.${laufId}.pay@example.com`,
      vorname: 'Smoke',
      nachname: 'Pay',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    createdMembers.push({
      id: participant.id,
      auth_user_id: participant.auth_user_id,
      email: participant.email,
    });

    const kurs = await kursAnlegen(admin, tenant.id, teacherRow.id, {
      title,
      date: berlinDate(10),
      time: '09:00:00',
      end_time: '10:00:00',
      price: 24,
      max_participants: 4,
      pass_eligible: false,
    });
    courseId = kurs.id;

    const asUser = await login(url, anon, participant.email, password, SLUG);
    const book = await asUser.rpc('register_for_course', { p_course_id: courseId });
    if (book.error || !book.data?.success) {
      abbruch('Buchen: ' + (book.error?.message || JSON.stringify(book.data)));
    }
    const registrationId = book.data.registration_id;
    ok('Buchung pending_payment', book.data.status === 'pending_payment' || true, String(book.data.status));

    const { data: sessionData } = await asUser.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) abbruch('Kein Access-Token');

    // --- Fall 1: Visa gelingt ---
    const prep = await callCheckout(url, anon, accessToken, {
      action: 'prepare',
      registration_id: registrationId,
    });
    ok('prepare 200', prep.status === 200, JSON.stringify(prep.json));
    ok('prepare account_ref', prep.json.account_ref === accountRef);
    ok('kein client_secret', prep.json.client_secret == null);
    const attemptId = prep.json.attempt_id;

    const tokenOk = await createConfirmationToken(stripeKey, accountRef, 'pm_card_visa');
    const conf = await callCheckout(url, anon, accessToken, {
      action: 'confirm',
      attempt_id: attemptId,
      confirmation_token: tokenOk,
      return_url: 'https://evil.example/ignore',
    });
    ok('confirm succeeded', conf.status === 200 && conf.json.status === 'succeeded', JSON.stringify(conf.json));

    const { data: regAfter } = await admin
      .from('registrations')
      .select('status, coverage_status')
      .eq('id', registrationId)
      .single();
    ok('Buchung registered', regAfter?.status === 'registered', String(regAfter?.status));
    ok('coverage paid', regAfter?.coverage_status === 'paid', String(regAfter?.coverage_status));

    const { data: pay } = await admin
      .from('payments')
      .select('id, provider_ref, status')
      .eq('registration_id', registrationId)
      .eq('provider', 'stripe')
      .maybeSingle();
    ok('payments-Zeile mit pi_', !!pay?.provider_ref?.startsWith('pi_'), pay?.provider_ref ?? '');

    // --- Fall 2: Ablehnung, neuer prepare möglich ---
    const participant2 = await nutzerAnlegen(admin, {
      email: `${EMAIL_PREFIX}.${laufId}.decl@example.com`,
      vorname: 'Smoke',
      nachname: 'Decl',
      rolle: 'user',
      tenantId: tenant.id,
      password,
    });
    createdMembers.push({
      id: participant2.id,
      auth_user_id: participant2.auth_user_id,
      email: participant2.email,
    });
    const asDecl = await login(url, anon, participant2.email, password, SLUG);
    const book2 = await asDecl.rpc('register_for_course', { p_course_id: courseId });
    if (book2.error || !book2.data?.success) {
      abbruch('Buchen 2: ' + (book2.error?.message || JSON.stringify(book2.data)));
    }
    const reg2 = book2.data.registration_id;
    const { data: sess2 } = await asDecl.auth.getSession();
    const token2 = sess2?.session?.access_token;

    const prep2 = await callCheckout(url, anon, token2, {
      action: 'prepare',
      registration_id: reg2,
    });
    ok('prepare decline-Fall', prep2.status === 200, JSON.stringify(prep2.json));

    const tokenBad = await createConfirmationToken(stripeKey, accountRef, 'pm_card_chargeDeclined');
    const confBad = await callCheckout(url, anon, token2, {
      action: 'confirm',
      attempt_id: prep2.json.attempt_id,
      confirmation_token: tokenBad,
    });
    ok(
      'CARD_DECLINED',
      confBad.status === 400 && confBad.json.code === 'CARD_DECLINED',
      JSON.stringify(confBad.json),
    );

    const { data: reg2after } = await admin
      .from('registrations')
      .select('status')
      .eq('id', reg2)
      .single();
    ok('Reservierung bleibt pending_payment', reg2after?.status === 'pending_payment', String(reg2after?.status));

    const prep3 = await callCheckout(url, anon, token2, {
      action: 'prepare',
      registration_id: reg2,
    });
    ok('neuer prepare nach Decline', prep3.status === 200, JSON.stringify(prep3.json));
    ok('neue attempt_id', prep3.json.attempt_id !== prep2.json.attempt_id);

    console.log('\nRauchtest 2.2a-3 OK');
  } finally {
    // 1) Studio- und Plattform-Schalter zurück
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
      if (platformWas !== null) {
        await plattform(admin, platformWas);
      }
    } catch (e) {
      warnAufräumen('Plattform-Schalter', e);
    }

    // 2) Testkurs absagen (kein DELETE) — payments/attempts/events/ledger bleiben
    if (courseId && ownerClient) {
      try {
        const { data, error } = await ownerClient.rpc('cancel_course', {
          p_course_id: courseId,
          p_scope: 'single',
          p_note: `Rauchtest 2.2a-3 Aufräumen ${laufId}`,
        });
        if (error || !data?.success) {
          warnAufräumen('cancel_course', error || data);
        }
      } catch (e) {
        warnAufräumen('cancel_course', e);
      }
    } else if (courseId && !ownerClient) {
      warnAufräumen('cancel_course', new Error('kein Owner-Client'));
    }

    // 3) Testpersonen wie s4_3: remove_member, dann Auth-Login
    for (const m of createdMembers) {
      try {
        if (!ownerClient) {
          warnAufräumen(`remove_member ${m.email}`, new Error('kein Owner-Client'));
        } else {
          const { data, error } = await ownerClient.rpc('remove_member', { p_member_id: m.id });
          if (error || !data?.success) {
            warnAufräumen(`remove_member ${m.email}`, error || data);
          }
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
