/**
 * UX-6: get_upcoming_open_coverage — Rechte und Filter (nur DEV).
 *
 *   node scripts/test/ux6_upcoming_open_coverage.mjs
 */
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
  resteEntfernen,
  seedPasswort,
} from './_helpers.mjs';
import { assertDevGuard, ERLAUBTE_DEV_REF } from '../dev/dev_guard.mjs';

const SLUG = 'e2eux6cov';
const EMAIL_PREFIX = 'e2eux6cov';

assertDevGuard();
const env = ladeEnv();
const { url, anon, service } = assertDevEnv(env);
if (!String(url).includes(ERLAUBTE_DEV_REF)) abbruch('nur DEV');
const password = seedPasswort();
const admin = clientMitTenant(url, service, SLUG);
const laufId = `ux6${Date.now().toString(36)}`;

try {
  await resteEntfernen(admin, [SLUG], EMAIL_PREFIX);

  const { data: tenant, error: te } = await admin
    .from('tenants')
    .insert({ name: 'E2E UX6 Cov', slug: SLUG })
    .select('id')
    .single();
  if (te) abbruch(te.message);

  const owner = await nutzerAnlegen(admin, {
    email: `${EMAIL_PREFIX}.owner@example.com`,
    vorname: 'Owner',
    nachname: laufId,
    rolle: 'owner',
    tenantId: tenant.id,
    password,
  });
  const teacher = await nutzerAnlegen(admin, {
    email: `${EMAIL_PREFIX}.teacher@example.com`,
    vorname: 'Teacher',
    nachname: laufId,
    rolle: 'teacher',
    tenantId: tenant.id,
    password,
  });
  const user = await nutzerAnlegen(admin, {
    email: `${EMAIL_PREFIX}.user@example.com`,
    vorname: 'User',
    nachname: laufId,
    rolle: 'user',
    tenantId: tenant.id,
    password,
  });

  const { data: otherTenant } = await admin
    .from('tenants')
    .insert({ name: 'E2E UX6 Fremd', slug: `${SLUG}x` })
    .select('id')
    .single();
  const otherOwner = await nutzerAnlegen(admin, {
    email: `${EMAIL_PREFIX}.fremd@example.com`,
    vorname: 'Fremd',
    nachname: laufId,
    rolle: 'owner',
    tenantId: otherTenant.id,
    password,
  });

  const future = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: `UX6 Zukunft ${laufId}`,
    date: berlinDate(2),
    time: '18:00:00',
    end_time: '19:00:00',
    price: 18,
  });
  const past = await kursAnlegen(admin, tenant.id, teacher.id, {
    title: `UX6 Vergangenheit ${laufId}`,
    date: berlinDate(1),
    time: '10:00:00',
    end_time: '11:00:00',
    price: 18,
  });

  for (const courseId of [future.id, past.id]) {
    const { error } = await admin.from('registrations').insert({
      tenant_id: tenant.id,
      course_id: courseId,
      user_id: user.id,
      status: 'registered',
      is_waitlist: false,
      coverage_status: 'open',
    });
    if (error) abbruch('reg: ' + error.message);
  }
  await admin.from('courses').update({ date: berlinDate(-1) }).eq('id', past.id);

  const ownerClient = await login(url, anon, owner.email, password, SLUG);
  const teacherClient = await login(url, anon, teacher.email, password, SLUG);
  const fremdClient = await login(url, anon, otherOwner.email, password, `${SLUG}x`);

  const { data: upcoming, error: upErr } = await ownerClient.rpc('get_upcoming_open_coverage');
  if (upErr) abbruch('upcoming: ' + upErr.message);
  const ownUpcoming = (upcoming ?? []).filter((r) => r.course_id === future.id);
  ok('kommende open sichtbar', ownUpcoming.length === 1, `got ${ownUpcoming.length}`);

  const { data: overdue } = await ownerClient.rpc('get_open_coverage');
  const ownOverdue = (overdue ?? []).filter((r) => r.course_id === past.id);
  ok('überfällig getrennt', ownOverdue.length === 1, `got ${ownOverdue.length}`);

  const { data: teacherData, error: tErr } = await teacherClient.rpc('get_upcoming_open_coverage');
  ok(
    'Lehrende FORBIDDEN',
    Boolean(tErr && String(tErr.message).includes('FORBIDDEN')),
    tErr?.message || `rows=${teacherData?.length ?? 0}`,
  );

  const { data: fremdData } = await fremdClient.rpc('get_upcoming_open_coverage');
  ok(
    'kein Fremd-Tenant',
    !(fremdData ?? []).some((r) => r.course_id === future.id),
  );

  console.log('\nux6_upcoming_open_coverage OK');
} catch (e) {
  abbruch(e instanceof Error ? e.message : String(e));
} finally {
  try {
    await resteEntfernen(admin, [SLUG, `${SLUG}x`], EMAIL_PREFIX);
  } catch (e) {
    console.warn('cleanup', e);
  }
}
