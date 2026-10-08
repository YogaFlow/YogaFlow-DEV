#!/usr/bin/env node
/**
 * RT-2 — retention_cleanup + legal_acceptances überleben delete_tenant_complete (DEV).
 * Studio rt2ret / rt2retb.
 */
import { randomUUID } from 'node:crypto';
import {
  abbruch,
  assertDevEnv,
  clientMitTenant,
  ladeEnv,
  login,
  nutzerAnlegen,
  ok,
  resteEntfernen,
  seedPasswort,
  TERMS_TEST_HASH,
  TERMS_TEST_VERSION,
} from './_helpers.mjs';

const SLUG = 'rt2ret';
const SLUG_B = 'rt2retb';

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);

  try {
    await resteEntfernen(admin, [SLUG, SLUG_B], 'rt2ret.');
    console.log('RT-2 retention');

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'RT2 Retention', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const owner = await nutzerAnlegen(admin, {
      email: SLUG + '.owner@example.com',
      vorname: 'Owner',
      nachname: 'Ret',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });
    const asOwner = await login(url, anon, owner.email, password, SLUG);

    const acc = await asOwner.rpc('accept_legal_document', {
      p_document: 'terms',
      p_version: TERMS_TEST_VERSION,
      p_content_hash: TERMS_TEST_HASH,
    });
    ok('terms akzeptiert', acc.data?.success === true, JSON.stringify(acc.data));

    const { error: delErr } = await admin.rpc('delete_tenant_complete', {
      p_tenant_id: tenant.id,
    });
    ok('delete_tenant_complete', !delErr, delErr?.message);

    const { data: orphan, error: orErr } = await admin
      .from('legal_acceptances')
      .select('id, tenant_id, user_id, tenant_name_snapshot, document')
      .is('tenant_id', null)
      .eq('document', 'terms')
      .eq('tenant_name_snapshot', 'RT2 Retention');
    if (orErr) abbruch('orphan select: ' + orErr.message);
    ok('Acceptance überlebt mit Schnappschuss', (orphan ?? []).length >= 1, String(orphan?.length));
    ok('user_id NULL', orphan[0].user_id == null);

    const orphanId = orphan[0].id;

    const alertKey = SLUG + ':rt2_retention_test';
    await admin.from('ops_alerts').delete().eq('key', alertKey);
    const { error: alertIns } = await admin.from('ops_alerts').insert({
      key: alertKey,
      count: 1,
      resolved_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (alertIns) abbruch('ops_alerts insert: ' + alertIns.message);

    const { data: t2, error: t2e } = await admin
      .from('tenants')
      .insert({ name: 'RT2 Ret B', slug: SLUG_B })
      .select('id')
      .single();
    if (t2e) abbruch('Studio B: ' + t2e.message);

    const evtId = 'evt_rt2ret_' + randomUUID().replace(/-/g, '').slice(0, 20);
    const oldRecv = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    const { error: rawErr } = await admin.from('provider_events_raw').insert({
      provider: 'stripe',
      event_id: evtId,
      event_type: 'account.updated',
      account_ref: 'acct_rt2ret',
      tenant_id: t2.id,
      livemode: false,
      payload: { object: { id: 'acct_rt2ret' } },
      received_at: oldRecv,
      processed_at: oldRecv,
      attempts: 1,
    });
    if (rawErr) abbruch('provider_events_raw: ' + rawErr.message);

    // Alte email_deliveries: Event über insert_event (private) — hier RPC retention
    // ohne Mail-Zeile; Mail-Pfad wird in Selbstprüfung/Migration abgedeckt, sofern
    // Zeilen existieren. Optionaler Insert über service, wenn event verfügbar.

    const { data: cleaned, error: cErr } = await admin.rpc('retention_cleanup');
    if (cErr) abbruch('retention_cleanup: ' + cErr.message);
    ok('ops_alerts gelöscht', (cleaned?.ops_alerts ?? 0) >= 1, JSON.stringify(cleaned));
    ok(
      'provider_events_raw gelöscht',
      (cleaned?.provider_events_raw ?? 0) >= 1,
      JSON.stringify(cleaned),
    );

    const { data: alertLeft } = await admin
      .from('ops_alerts')
      .select('key')
      .eq('key', alertKey);
    ok('ops_alerts weg', (alertLeft ?? []).length === 0);

    const { data: rawLeft } = await admin
      .from('provider_events_raw')
      .select('id')
      .eq('event_id', evtId);
    ok('raw event weg', (rawLeft ?? []).length === 0);

    const { data: stillOrphan } = await admin
      .from('legal_acceptances')
      .select('id')
      .eq('id', orphanId);
    ok('frische verwaiste Acceptance bleibt', (stillOrphan ?? []).length === 1);

    console.log('RT-2 retention fertig', JSON.stringify(cleaned));
  } finally {
    try {
      await resteEntfernen(admin, [SLUG, SLUG_B], 'rt2ret.');
      await admin.from('ops_alerts').delete().eq('key', SLUG + ':rt2_retention_test');
    } catch (e) {
      console.warn('Aufräumen:', e.message || e);
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
