/**
 * UX-5 — RLS liest archivierte Kurse im eigenen Studio; fremdes Studio nicht.
 * Anzeige-Filter ist nicht Aufgabe von RLS.
 *
 * Eigenes Studio `secux5arch`, zweites `secux5archb`; am Ende delete_tenant_complete.
 * Verwendung: node scripts/test/security_ux5_archived_select.mjs
 */
import { randomUUID } from 'node:crypto';
import {
  assertDevEnv,
  berlinDate,
  clientMitTenant,
  kursAnlegen,
  ladeEnv,
  login,
  nutzerAnlegen,
  resteEntfernen,
  seedPasswort,
} from './_helpers.mjs';
import { assertDevGuard, ERLAUBTE_DEV_REF } from '../dev/dev_guard.mjs';

const SLUG = 'secux5arch';
const SLUG_B = 'secux5archb';
const EMAIL_PREFIX = 'secux5arch';

function ok(name, cond, detail = '') {
  if (!cond) throw new Error(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  OK  ${name}${detail ? ' — ' + detail : ''}`);
}

assertDevGuard();
const env = ladeEnv();
const { url, anon, service } = assertDevEnv(env);
if (!String(url).includes(ERLAUBTE_DEV_REF)) throw new Error('nur DEV');
const password = seedPasswort();
const admin = clientMitTenant(url, service, SLUG);

try {
  await resteEntfernen(admin, [SLUG, SLUG_B], EMAIL_PREFIX);

  const { data: tenantA, error: ta } = await admin
    .from('tenants')
    .insert({ name: 'SEC UX5 Arch A', slug: SLUG })
    .select('id')
    .single();
  if (ta) throw new Error(ta.message);

  const adminB = clientMitTenant(url, service, SLUG_B);
  const { data: tenantB, error: tb } = await adminB
    .from('tenants')
    .insert({ name: 'SEC UX5 Arch B', slug: SLUG_B })
    .select('id')
    .single();
  if (tb) throw new Error(tb.message);

  const ownerA = await nutzerAnlegen(admin, {
    email: `${EMAIL_PREFIX}.a@example.com`,
    vorname: 'Owner',
    nachname: 'Alpha',
    rolle: 'owner',
    tenantId: tenantA.id,
    password,
  });
  const teacherA = await nutzerAnlegen(admin, {
    email: `${EMAIL_PREFIX}.t@example.com`,
    vorname: 'Teacher',
    nachname: 'Alpha',
    rolle: 'teacher',
    tenantId: tenantA.id,
    password,
  });
  await nutzerAnlegen(adminB, {
    email: `${EMAIL_PREFIX}.b@example.com`,
    vorname: 'Owner',
    nachname: 'Beta',
    rolle: 'owner',
    tenantId: tenantB.id,
    password,
  });

  const course = await kursAnlegen(admin, tenantA.id, teacherA.id, {
    title: `ARCH_RLS_${randomUUID().slice(0, 8)}`,
    date: berlinDate(5),
    price: 16,
  });
  const now = new Date().toISOString();
  const { error: archErr } = await admin
    .from('courses')
    .update({ archived_at: now })
    .eq('id', course.id);
  if (archErr) throw new Error(archErr.message);

  const asOwnerA = await login(url, anon, ownerA.email, password, SLUG);
  const { data: ownRow, error: ownErr } = await asOwnerA
    .from('courses')
    .select('id, title, archived_at')
    .eq('id', course.id)
    .maybeSingle();
  ok('Owner liest archivierten Kurs im eigenen Studio', !ownErr && ownRow?.id === course.id && ownRow.archived_at != null);

  const asOwnerB = await login(url, anon, `${EMAIL_PREFIX}.b@example.com`, password, SLUG_B);
  const { data: foreignRow, error: foreignErr } = await asOwnerB
    .from('courses')
    .select('id, title')
    .eq('id', course.id)
    .maybeSingle();
  ok(
    'Owner fremdes Studio sieht archivierten Kurs nicht',
    !foreignErr && foreignRow == null,
    foreignRow ? `id=${foreignRow.id}` : '',
  );

  console.log('\n  security_ux5_archived_select grün\n');
} catch (e) {
  console.error('\n  FEHLER:', e.message || e, '\n');
  process.exitCode = 1;
} finally {
  try {
    await resteEntfernen(admin, [SLUG, SLUG_B], EMAIL_PREFIX);
  } catch (e) {
    console.warn('Aufräumen', e);
  }
}
