#!/usr/bin/env node
/**
 * F1 / L3 — Studio gibt v1 frei → v2 wird aktuell → Online bleibt bereit,
 * Banner new_template, /agb zeigt v1 → Freigabe v2 → /agb zeigt v2.
 * Studio e2ef1leg — nicht demoalpha.
 */
import { createHash } from 'node:crypto';
import {
  abbruch,
  assertDevEnv,
  clientMitTenant,
  ladeEnv,
  legalProfileSetzen,
  login,
  nutzerAnlegen,
  ok,
  resteEntfernen,
  seedPasswort,
} from './_helpers.mjs';
import {
  findStudioLegalTemplateRelease,
  STUDIO_LEGAL_ACCEPTANCE_DOCS,
  STUDIO_LEGAL_TEMPLATE_RELEASES,
} from '../../src/generated/studioLegalTemplates.ts';
import { renderStudioLegalTemplate } from '../../src/lib/studioLegalRender.ts';

const SLUG = 'e2ef1leg';
const EMAIL_PREFIX = 'e2ef1leg.';

function normalize(t) {
  return String(t)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '')
    .concat('\n');
}
function hash(t) {
  return createHash('sha256').update(normalize(t), 'utf8').digest('hex');
}

const v1Terms = STUDIO_LEGAL_TEMPLATE_RELEASES.terms.find((r) => r.version === '2026-10-05');
const v2Terms = STUDIO_LEGAL_TEMPLATE_RELEASES.terms.find((r) => r.version === '2026-10-08');
const v1Priv = STUDIO_LEGAL_TEMPLATE_RELEASES.privacy.find((r) => r.version === '2026-10-05');
const v2Priv = STUDIO_LEGAL_TEMPLATE_RELEASES.privacy.find((r) => r.version === '2026-10-08');
if (!v1Terms || !v2Terms || !v1Priv || !v2Priv) abbruch('v1/v2 Releases fehlen in generated');

async function main() {
  const env = ladeEnv();
  const { url, anon, service } = assertDevEnv(env);
  const password = seedPasswort();
  const admin = clientMitTenant(url, service, SLUG);

  async function setTplCurrent(termsRel, privRel) {
    for (const row of [
      { document: 'studio_terms_tpl', ...termsRel },
      { document: 'studio_privacy_tpl', ...privRel },
    ]) {
      const { error } = await admin
        .from('legal_document_versions')
        .update({
          version: row.version,
          content_hash: row.contentHash,
          updated_at: new Date().toISOString(),
        })
        .eq('document', row.document);
      if (error) abbruch('legal_document_versions: ' + error.message);
    }
  }

  try {
    await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    console.log('F1 L3 — Vorlagen v1→v2 ohne Online-Sperre');

    // Aktuelle Vorlage auf v1 stellen (Simulation „nur v1 existiert“)
    await setTplCurrent(v1Terms, v1Priv);

    const { data: tenant, error: te } = await admin
      .from('tenants')
      .insert({ name: 'F1 Legal L3', slug: SLUG })
      .select('id')
      .single();
    if (te) abbruch('Studio: ' + te.message);

    const owner = await nutzerAnlegen(admin, {
      email: EMAIL_PREFIX + 'owner@example.com',
      vorname: 'Fiona',
      nachname: 'Eins',
      rolle: 'owner',
      tenantId: tenant.id,
      password,
    });

    const asOwner = await login(url, anon, owner.email, password, SLUG);
    const asAnon = clientMitTenant(url, anon, SLUG);

    await legalProfileSetzen(asOwner, {
      p_legal_name: 'Fiona Eins Yoga',
      p_legal_form: 'sole_trader',
    });

    const values = {
      studio_name: 'Fiona Eins Yoga',
      legal_name: 'Fiona Eins Yoga',
      legal_form_label: 'Einzelunternehmen',
      representatives: '',
      street: 'Testweg',
      house_number: '1',
      postal_code: '10115',
      city: 'Berlin',
      country: 'Deutschland',
      contact_email: owner.email,
      phone: '',
      register_court: '',
      register_number: '',
      vat_id: '',
      economic_id: '',
      studio_url: `https://${SLUG}.omlify.de`,
      cancellation_hours: '24 Stunden',
      tax_small_business: true,
      pay_online: true,
      pay_onsite: true,
      passes_any: true,
      passes_online: true,
      extra_rules: '',
      stand_date: '8. Oktober 2026',
      subprocessors_list: 'Test',
    };

    const imprintBody = renderStudioLegalTemplate(
      findStudioLegalTemplateRelease('imprint').body,
      values,
    );
    const pubImp = await asOwner.rpc('publish_studio_legal_document', {
      p_kind: 'imprint',
      p_template_version: findStudioLegalTemplateRelease('imprint').version,
      p_body_md: imprintBody,
      p_values: values,
      p_content_hash: hash(imprintBody),
      p_trigger: 'profile_change',
    });
    ok('Impressum publish', pubImp.data?.success === true, JSON.stringify(pubImp.data));

    for (const [kind, rel] of [
      ['terms', v1Terms],
      ['privacy', v1Priv],
    ]) {
      const body = renderStudioLegalTemplate(rel.body, values);
      const relRes = await asOwner.rpc('release_studio_legal', {
        p_kind: kind,
        p_template_version: rel.version,
        p_body_md: body,
        p_values: values,
        p_content_hash: hash(body),
      });
      ok(`Freigabe v1 ${kind}`, relRes.data?.success === true, JSON.stringify(relRes.data));
    }

    const statusV1 = await asOwner.rpc('get_studio_legal_status');
    ok('texts_ready nach v1', statusV1.data?.texts_ready === true, JSON.stringify(statusV1.data));
    ok('AGB current nach v1', statusV1.data?.terms?.status === 'current', JSON.stringify(statusV1.data?.terms));

    const pubV1 = await asAnon.rpc('get_public_studio_legal', { p_kind: 'terms' });
    ok(
      '/agb zeigt v1 Mehrfachkarten',
      typeof pubV1.data?.body_md === 'string' &&
        pubV1.data.body_md.includes('## 8. Mehrfachkarten') &&
        !pubV1.data.body_md.includes('## 8. Kurskarten'),
      String(pubV1.data?.body_md).slice(0, 200),
    );

    // v2 erscheint (aktuell in DB)
    await setTplCurrent(v2Terms, v2Priv);

    const statusV2pending = await asOwner.rpc('get_studio_legal_status');
    ok(
      'Banner new_template',
      statusV2pending.data?.terms?.status === 'new_template',
      JSON.stringify(statusV2pending.data?.terms),
    );
    ok(
      'Online texts_ready bleibt true',
      statusV2pending.data?.texts_ready === true,
      JSON.stringify(statusV2pending.data),
    );

    const setup = await asOwner.rpc('get_payment_setup_status');
    ok(
      'studio_legal_texts_ready im Setup',
      setup.data?.studio_legal_texts_ready === true,
      JSON.stringify(setup.data),
    );

    const pubStillV1 = await asAnon.rpc('get_public_studio_legal', { p_kind: 'terms' });
    ok(
      '/agb bleibt v1 bis Freigabe',
      typeof pubStillV1.data?.body_md === 'string' &&
        pubStillV1.data.body_md.includes('## 8. Mehrfachkarten'),
      String(pubStillV1.data?.body_md).slice(0, 200),
    );

    // Freigabe v2
    for (const [kind, rel] of [
      ['terms', v2Terms],
      ['privacy', v2Priv],
    ]) {
      const body = renderStudioLegalTemplate(rel.body, values);
      const relRes = await asOwner.rpc('release_studio_legal', {
        p_kind: kind,
        p_template_version: rel.version,
        p_body_md: body,
        p_values: values,
        p_content_hash: hash(body),
      });
      ok(`Freigabe v2 ${kind}`, relRes.data?.success === true, JSON.stringify(relRes.data));
    }

    const statusDone = await asOwner.rpc('get_studio_legal_status');
    ok('AGB current nach v2', statusDone.data?.terms?.status === 'current', JSON.stringify(statusDone.data?.terms));
    ok(
      'accepted_version v2',
      statusDone.data?.terms?.accepted_version === STUDIO_LEGAL_ACCEPTANCE_DOCS.terms.version,
      JSON.stringify(statusDone.data?.terms),
    );

    const pubV2 = await asAnon.rpc('get_public_studio_legal', { p_kind: 'terms' });
    ok(
      '/agb zeigt v2 Kurskarten',
      typeof pubV2.data?.body_md === 'string' &&
        pubV2.data.body_md.includes('## 8. Kurskarten') &&
        !pubV2.data.body_md.includes('## 8. Mehrfachkarten'),
      String(pubV2.data?.body_md).slice(0, 200),
    );

    console.log('\nF1 L3 ok.\n');
  } finally {
    // Immer wieder auf aktuelle v2 (Repo-Stand) stellen
    try {
      await setTplCurrent(v2Terms, v2Priv);
    } catch (e) {
      console.warn('v2 wiederherstellen:', e instanceof Error ? e.message : e);
    }
    try {
      await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);
    } catch (e) {
      console.warn('Aufräumen:', e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
