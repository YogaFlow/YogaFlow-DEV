import { supabase } from './supabase';
import { isCourseUpcoming } from './courseDateTime';
import { reactToSessionInvokeError } from './sessionGuard';

export type RemovalPreview = {
  upcoming: number;
  openBookings: number;
  openCourseId: string | null;
};

type CourseEmbed = {
  id: string;
  date: string;
  time: string | null;
  status: string | null;
};

function oneCourse(value: CourseEmbed | CourseEmbed[] | null | undefined): CourseEmbed | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/**
 * Kommende Anmeldungen und offene vergangene Buchungen, bevor der Dialog aufgeht.
 * Der Aufruf von delete-user hängt x-omlify-tenant an, weil der Client in
 * src/lib/supabase.ts jeden fetch (auch functions.invoke) damit versieht.
 */
export async function loadRemovalPreview(userId: string): Promise<RemovalPreview> {
  const { data, error } = await supabase
    .from('registrations')
    .select('status, cancellation_timestamp, coverage_status, courses!registrations_course_id_fkey(id, date, time, status)')
    .eq('user_id', userId);
  if (error) throw error;

  let upcoming = 0;
  let openBookings = 0;
  let openCourseId: string | null = null;

  for (const row of data ?? []) {
    if (row.cancellation_timestamp) continue;
    const course = oneCourse(row.courses as CourseEmbed | CourseEmbed[] | null);
    if (!course?.date) continue;
    const active = (course.status ?? 'active') === 'active';
    const notStarted = isCourseUpcoming(course);
    const seated =
      row.status === 'registered' ||
      row.status === 'waitlist' ||
      row.status === 'pending_payment';
    if (active && notStarted && seated) upcoming += 1;
    if (!notStarted && row.coverage_status === 'open') {
      openBookings += 1;
      openCourseId = openBookings === 1 ? course.id : null;
    }
  }

  return { upcoming, openBookings, openCourseId };
}

export async function readInvokeErrorBody(
  error: unknown,
): Promise<{ code: string | null; message: string | null }> {
  const context = (error as { context?: { clone?: () => { json?: () => Promise<unknown> }; json?: () => Promise<unknown> } }).context;
  const source = typeof context?.clone === 'function' ? context.clone() : context;
  if (!source || typeof source.json !== 'function') return { code: null, message: null };
  try {
    const body = await source.json();
    if (!body || typeof body !== 'object') return { code: null, message: null };
    const record = body as { code?: unknown; message?: unknown };
    return {
      code: typeof record.code === 'string' ? record.code : null,
      message: typeof record.message === 'string' ? record.message : null,
    };
  } catch {
    return { code: null, message: null };
  }
}

export type RemovePersonResult =
  | { ok: true; code: string; message: string }
  | { ok: false; code: string | null; message: string };

export async function removePerson(userId: string): Promise<RemovePersonResult> {
  const { data, error } = await supabase.functions.invoke('delete-user', {
    body: { userId },
  });
  if (error) {
    if (await reactToSessionInvokeError(error)) {
      return { ok: false, code: 'session_ended', message: '' };
    }
    const body = await readInvokeErrorBody(error);
    return {
      ok: false,
      code: body.code,
      message: body.message ?? 'Das hat nicht geklappt. Bitte versuche es noch einmal.',
    };
  }
  const record = (data ?? {}) as { code?: unknown; message?: unknown };
  return {
    ok: true,
    code: typeof record.code === 'string' ? record.code : 'REMOVED',
    message: typeof record.message === 'string' ? record.message : '',
  };
}
