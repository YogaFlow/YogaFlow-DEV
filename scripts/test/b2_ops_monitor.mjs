#!/usr/bin/env node
/**
 * B2 O1–O4 — Cron-Toleranz, ledger nur mit Steuerstatus, reviewed_at.
 * Studio b2ops. Nur DEV.
 */
import { randomUUID } from 'node:crypto';
import {
  abbruch,
  assertDevEnv,
  clientMitTenant,
  ladeEnv,
  ok,
  resteEntfernen,
} from './_helpers.mjs';

const SLUG = 'b2ops';

function findingKeys(data) {
  return (Array.isArray(data) ? data : []).map((f) => f.key);
}

function findingCount(data, key) {
  const row = (Array.isArray(data) ? data : []).find((f) => f.key === key);
  return row ? Number(row.count) || 0 : 0;
}

async function main() {
  const env = ladeEnv();
  const { url, service } = assertDevEnv(env);
  const admin = clientMitTenant(url, service, SLUG);

  try {
    await resteEntfernen(admin, [SLUG], 'b2ops.');
    console.log('B2 ops-monitor O1–O4');

    // --- O1: Toleranz / is_due (reine RPC-Fixtures) ---
    const tolHourly = await admin.rpc('ops_cron_tolerance', { p_schedule: '5 * * * *' });
    if (tolHourly.error) abbruch('tolerance: ' + tolHourly.error.message);
    ok('O1 stündlich → 3 h', String(tolHourly.data).includes('3 hours') || tolHourly.data === '03:00:00');

    const tolMin = await admin.rpc('ops_cron_tolerance', { p_schedule: '* * * * *' });
    ok('O1 minutely → 5 min', String(tolMin.data).includes('5 mins') || String(tolMin.data).includes('00:05:00'));

    const tol15 = await admin.rpc('ops_cron_tolerance', { p_schedule: '*/15 * * * *' });
    ok('O1 */15 → 45 min', String(tol15.data).includes('45 mins') || String(tol15.data).includes('00:45:00'));

    const now = new Date('2026-10-04T12:55:00.000Z');
    const success55 = new Date(now.getTime() - 50 * 60 * 1000).toISOString(); // vor 50 min
    const dueHourly = await admin.rpc('ops_cron_is_due', {
      p_schedule: '5 * * * *',
      p_first_seen: '2026-09-01T00:00:00.000Z',
      p_last_success: success55,
      p_now: now.toISOString(),
    });
    if (dueHourly.error) abbruch('is_due hourly: ' + dueHourly.error.message);
    ok('O1 stündlicher Job ok um :55', dueHourly.data === false, String(dueHourly.data));

    const dueYoung = await admin.rpc('ops_cron_is_due', {
      p_schedule: '*/15 * * * *',
      p_first_seen: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      p_last_success: null,
      p_now: now.toISOString(),
    });
    ok('O1 Job nie gelaufen und jung → nicht due', dueYoung.data === false, String(dueYoung.data));

    const dueOldNever = await admin.rpc('ops_cron_is_due', {
      p_schedule: '*/15 * * * *',
      p_first_seen: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      p_last_success: null,
      p_now: now.toISOString(),
    });
    ok('O1 Job nie gelaufen und alt → due', dueOldNever.data === true, String(dueOldNever.data));

    // --- Studio für O2 / O3 ---
    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'B2 Ops', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const occurred = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const subjectId = randomUUID();
    const { error: evErr } = await admin.from('events').insert({
      tenant_id: tenant.id,
      type: 'payment.recorded',
      subject_type: 'payment',
      subject_id: subjectId,
      payload: { test: 'b2ops_ledger' },
      occurred_at: occurred,
      causation_id: randomUUID(),
    });
    if (evErr) abbruch('Event: ' + evErr.message);

    const collect1 = await admin.rpc('ops_monitor_collect');
    if (collect1.error) abbruch('collect1: ' + collect1.error.message);
    ok(
      'O2 Studio ohne Steuerstatus → kein ledger_stuck',
      !findingKeys(collect1.data).includes(SLUG + ':ledger_stuck'),
      findingKeys(collect1.data).filter((k) => k.startsWith(SLUG)).join(',') || 'keine',
    );

    // --- O3: Fehler zählt, nach reviewed nicht mehr ---
    const evtId = 'evt_b2ops_' + randomUUID().replace(/-/g, '').slice(0, 24);
    const { data: raw, error: rawErr } = await admin
      .from('provider_events_raw')
      .insert({
        provider: 'stripe',
        event_id: evtId,
        event_type: 'account.updated',
        account_ref: 'acct_b2ops_test',
        tenant_id: tenant.id,
        livemode: false,
        payload: { object: { id: 'acct_b2ops_test' } },
        processed_at: new Date().toISOString(),
        processing_error: 'TEST_OPS_REVIEW',
        attempts: 1,
      })
      .select('id')
      .single();
    if (rawErr) abbruch('raw insert: ' + rawErr.message);

    const collect2 = await admin.rpc('ops_monitor_collect');
    if (collect2.error) abbruch('collect2: ' + collect2.error.message);
    ok(
      'O3 ungeprüfter Fehler zählt',
      findingCount(collect2.data, SLUG + ':provider_event_error') >= 1,
      String(findingCount(collect2.data, SLUG + ':provider_event_error')),
    );

    const { error: revErr } = await admin
      .from('provider_events_raw')
      .update({ reviewed_at: new Date().toISOString() })
      .eq('id', raw.id);
    if (revErr) abbruch('reviewed_at: ' + revErr.message);

    const collect3 = await admin.rpc('ops_monitor_collect');
    if (collect3.error) abbruch('collect3: ' + collect3.error.message);
    ok(
      'O3 geprüfter Fehler zählt nicht',
      findingCount(collect3.data, SLUG + ':provider_event_error') === 0,
      String(findingCount(collect3.data, SLUG + ':provider_event_error')),
    );

    console.log('B2 ops-monitor O1–O4 fertig');
  } finally {
    try {
      await resteEntfernen(admin, [SLUG], 'b2ops.');
    } catch (e) {
      console.warn('Aufräumen:', e.message || e);
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
