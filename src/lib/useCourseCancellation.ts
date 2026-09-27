import { useCallback, useState } from 'react';
import type { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import type { Course } from '../types';
import { isCourseCancelled } from './courseDateTime';
import { cancelTargets, type CancelTarget } from './courseCancelTargets';
import { supabase } from './supabase';

export type CourseCancelScope = 'single' | 'series_from_here';
export type CourseCancelMode = 'cancel' | 'uncancel';

type CancelBody = {
  success?: boolean;
  error?: string;
  canceled_course_ids?: string[];
  cancelled_registrations?: number;
  paid_registrations?: number;
  uncanceled_course_ids?: string[];
  restored_registrations?: number;
  overflow_to_waitlist?: string[];
};

export type CourseCancelDialogModel = {
  open: boolean;
  mode: CourseCancelMode;
  courseTitle: string;
  seriesCount: number;
  scope: CourseCancelScope;
  note: string;
  registered: number;
  waitlist: number;
  paid: number | null;
  busy: boolean;
  error: string;
};

const EMPTY_DIALOG: CourseCancelDialogModel = {
  open: false,
  mode: 'cancel',
  courseTitle: '',
  seriesCount: 1,
  scope: 'single',
  note: '',
  registered: 0,
  waitlist: 0,
  paid: null,
  busy: false,
  error: '',
};

function rpcError(code: string | undefined): string {
  switch (code) {
    case 'FORBIDDEN':
      return 'Dafür hast du keine Berechtigung.';
    case 'NOT_FOUND':
      return 'Der Kurs wurde nicht gefunden.';
    case 'ALREADY_STARTED':
      return 'Der Kurs hat schon begonnen.';
    case 'ALREADY_CANCELED':
      return 'Der Kurs ist schon abgesagt.';
    case 'NOT_CANCELED':
      return 'Der Kurs ist nicht abgesagt.';
    case 'NOTE_TOO_LONG':
      return 'Der Grund darf höchstens 200 Zeichen haben.';
    case 'INVALID_SCOPE':
      return 'Dieser Umfang ist nicht möglich.';
    case 'COURSE_NOT_AVAILABLE':
      return 'Dieser Kurs lässt sich so nicht ändern.';
    case 'CONFLICT':
      return 'Der Kurs hat sich inzwischen geändert. Lade die Seite neu.';
    default:
      return 'Das hat nicht geklappt. Bitte lade die Seite neu.';
  }
}

function countLine(count: number, one: string, many: string): string {
  return count === 1 ? one : many.replace('%n', String(count));
}

function cancelFeedback(body: CancelBody, showPaid: boolean): string {
  const courses = body.canceled_course_ids?.length ?? 0;
  const regs = body.cancelled_registrations ?? 0;
  const paid = body.paid_registrations ?? 0;
  const courseLine = countLine(courses, '1 Termin ist abgesagt.', '%n Termine sind abgesagt.');
  const regLine = countLine(
    regs,
    '1 Anmeldung wurde storniert.',
    '%n Anmeldungen wurden storniert.',
  );
  const paidLine =
    showPaid && paid > 0
      ? ` ${countLine(paid, '1 Person hatte bereits bezahlt.', '%n Personen hatten bereits bezahlt.')}`
      : '';
  return `${courseLine} ${regLine}${paidLine}`;
}

function uncancelFeedback(body: CancelBody): string {
  const courses = body.uncanceled_course_ids?.length ?? 0;
  const restored = body.restored_registrations ?? 0;
  const overflow = body.overflow_to_waitlist?.length ?? 0;
  const courseLine = countLine(
    courses,
    'Die Absage ist zurückgenommen.',
    '%n Absagen sind zurückgenommen.',
  );
  const restoredLine = countLine(
    restored,
    '1 Anmeldung ist wiederhergestellt.',
    '%n Anmeldungen sind wiederhergestellt.',
  );
  const overflowLine =
    overflow > 0
      ? ` ${countLine(
          overflow,
          '1 Person steht jetzt auf der Warteliste, weil der Kurs voll war.',
          '%n Personen stehen jetzt auf der Warteliste, weil der Kurs voll war.',
        )}`
      : '';
  return `${courseLine} ${restoredLine}${overflowLine}`;
}

export function useCourseCancellation(
  course: Course | null,
  options: { isManager: boolean; teacherOnlyId: string | null; onChanged: () => void },
) {
  const [dialog, setDialog] = useState<CourseCancelDialogModel>(EMPTY_DIALOG);
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);

  const closeDialog = useCallback(() => {
    setDialog((current) => (current.busy ? current : EMPTY_DIALOG));
  }, []);

  const prepare = useCallback(
    async (mode: CourseCancelMode) => {
      if (!course) return;
      const anchor: CancelTarget = course;
      let sessions: CancelTarget[] = [anchor];

      if (course.series_id) {
        const { data, error } = await supabase
          .from('courses')
          .select('id, date, time, status, series_id, teacher_id')
          .eq('series_id', course.series_id);
        if (error) {
          setFeedbackDialog({
            title: 'Hinweis',
            message: 'Die Termine der Serie konnten nicht geladen werden. Bitte die Seite neu laden.',
            type: 'error',
          });
          return;
        }
        sessions = data ?? [];
      }

      const targets = cancelTargets(anchor, sessions, options.teacherOnlyId, mode);
      const ids = targets.map((row) => row.id);
      if (!ids.includes(course.id)) {
        const alreadyCancelled = mode === 'cancel' && isCourseCancelled(course.status);
        setFeedbackDialog({
          title: 'Hinweis',
          message: alreadyCancelled
            ? 'Dieser Kurs ist bereits abgesagt.'
            : mode === 'cancel'
              ? 'Dieser Kurs lässt sich nicht absagen.'
              : 'Diese Absage lässt sich nicht zurücknehmen.',
          type: 'error',
        });
        return;
      }

      let registered = 0;
      let waitlist = 0;
      if (mode === 'cancel') {
        const { data: counts, error: countError } = await supabase.rpc(
          'get_course_participant_counts',
          { p_course_ids: ids },
        );
        if (countError || ids.some((id) => !(counts ?? []).some((row: { course_id: string }) => row.course_id === id))) {
          setFeedbackDialog({
            title: 'Hinweis',
            message: 'Die Anmeldungen konnten nicht geprüft werden. Bitte die Seite neu laden.',
            type: 'error',
          });
          return;
        }
        for (const row of counts ?? []) {
          registered += row.registered_count ?? 0;
          waitlist += row.waitlist_count ?? 0;
        }
      }

      let paid: number | null = null;
      if (mode === 'cancel' && options.isManager) {
        const { count, error: paidError } = await supabase
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .in('course_id', ids)
          .in('status', ['registered', 'waitlist'])
          .eq('coverage_status', 'paid');
        if (paidError) {
          setFeedbackDialog({
            title: 'Hinweis',
            message: 'Die Zahlungen konnten nicht geprüft werden. Bitte die Seite neu laden.',
            type: 'error',
          });
          return;
        }
        paid = count ?? 0;
      }

      setDialog({
        open: true,
        mode,
        courseTitle: course.title,
        seriesCount: targets.length,
        scope: 'single',
        note: '',
        registered,
        waitlist,
        paid,
        busy: false,
        error: '',
      });
    },
    [course, options.isManager, options.teacherOnlyId],
  );

  const confirm = useCallback(async () => {
    if (!course || !dialog.open || dialog.busy) return;
    const note = dialog.note.trim();
    if (dialog.mode === 'cancel' && note.length > 200) {
      setDialog((current) => ({ ...current, error: rpcError('NOTE_TOO_LONG') }));
      return;
    }

    setDialog((current) => ({ ...current, busy: true, error: '' }));
    const scope = dialog.seriesCount > 1 ? dialog.scope : 'single';
    const { data, error } =
      dialog.mode === 'cancel'
        ? await supabase.rpc('cancel_course', {
            p_course_id: course.id,
            p_scope: scope,
            p_note: note || null,
          })
        : await supabase.rpc('uncancel_course', {
            p_course_id: course.id,
            p_scope: scope,
          });

    const body = (typeof data === 'string' ? JSON.parse(data) : data) as CancelBody | null;
    if (error || !body?.success) {
      setDialog((current) => ({
        ...current,
        busy: false,
        error: rpcError(body?.error),
      }));
      return;
    }

    setDialog(EMPTY_DIALOG);
    setFeedbackDialog({
      title: dialog.mode === 'cancel' ? 'Kurs abgesagt' : 'Absage zurückgenommen',
      message:
        dialog.mode === 'cancel'
          ? cancelFeedback(body, options.isManager)
          : uncancelFeedback(body),
      type: 'success',
    });
    options.onChanged();
  }, [course, dialog, options]);

  return {
    dialog,
    setScope: (scope: CourseCancelScope) => setDialog((current) => ({ ...current, scope })),
    setNote: (note: string) =>
      setDialog((current) => ({ ...current, note: note.slice(0, 200) })),
    feedbackDialog,
    closeFeedback: () => setFeedbackDialog(null),
    requestCancel: () => void prepare('cancel'),
    requestUncancel: () => void prepare('uncancel'),
    closeDialog,
    confirm: () => void confirm(),
  };
}
