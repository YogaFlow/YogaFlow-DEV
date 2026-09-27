import { isCourseUpcoming } from './courseDateTime';

export type CancelTarget = {
  id: string;
  date: string;
  time: string;
  status?: string | null;
  series_id?: string | null;
  teacher_id?: string | null;
};

function startKey(row: { date: string; time?: string | null }): string {
  const time = row.time && row.time.length >= 5 ? row.time.slice(0, 8) : '00:00:00';
  return `${row.date}T${time}`;
}

function inSeriesFromHere(anchor: CancelTarget, row: CancelTarget): boolean {
  if (anchor.series_id) return row.series_id === anchor.series_id;
  return row.id === anchor.id;
}

/**
 * Gleiche Auswahl wie cancel_course / uncancel_course:
 * gleiche series_id, Beginn ≥ dieser Termin, noch nicht begonnen.
 * Lehrende nur eigene Kurse. „Noch nicht begonnen“ folgt isCourseUpcoming.
 */
export function cancelTargets(
  anchor: CancelTarget,
  sessions: CancelTarget[],
  teacherOnlyId: string | null,
  mode: 'cancel' | 'uncancel',
): CancelTarget[] {
  const from = startKey(anchor);
  return sessions.filter((row) => {
    if (!inSeriesFromHere(anchor, row)) return false;
    if (startKey(row) < from) return false;
    if (!isCourseUpcoming(row)) return false;
    if (mode === 'cancel' && row.status !== 'active') return false;
    if (mode === 'uncancel' && row.status !== 'canceled') return false;
    if (teacherOnlyId && row.teacher_id !== teacherOnlyId) return false;
    return true;
  });
}
