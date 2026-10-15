import { useEffect, useState } from 'react';
import { ConfirmDialogState } from '../components/ui/ConfirmDialog';
import type { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { Course, RegisterForCourseResult, Registration } from '../types';
import { onsiteLateCancelHint } from './cancellationDeadline';
import {
  passRefundInfo,
  unregisterPassDialogMessage,
} from './passRefundInfo';
import {
  onlineRefundInfo,
  unregisterOnlineDialogMessage,
  unregisterRefundSuccessMessage,
  type RegistrationRefundState,
} from './refundTexts';
import { fetchRegistrationRefundStates } from './refunds';
import { RELEASE_SEAT_LABEL } from './pendingPaymentLabel';
import { passRedeemErrorMessage } from './passes';
import { supabase } from './supabase';
import { enrolledToastLine } from './toastTexts';
import { TOAST_UNDO_MS, toastUndoAllowed } from './toastModel';

export type EnrollmentFeedbackDialog = FeedbackDialogState;

/** Spalten, die die Kursliste für die eigene Anmeldung wirklich lädt. */
type OwnCourseRegistration = Pick<
  Registration,
  | 'id'
  | 'course_id'
  | 'status'
  | 'is_waitlist'
  | 'waitlist_position'
  | 'coverage_status'
  | 'cancellation_deadline'
  | 'hold_expires_at'
  | 'price_cents_at_booking'
>;

export function useCourseEnrollment(
  onAfterSuccess: () => void,
  options?: {
    onPendingPayment?: (info: {
      registrationId: string;
      holdExpiresAt?: string | null;
    }) => void;
  },
) {
  const { userProfile } = useAuth();
  const { tenant } = useTenant();
  const [registrations, setRegistrations] = useState<OwnCourseRegistration[]>([]);
  const [feedbackDialog, setFeedbackDialog] = useState<EnrollmentFeedbackDialog | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [pendingUnregisterCourseId, setPendingUnregisterCourseId] = useState<string | null>(null);
  const [unregistering, setUnregistering] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [refundStates, setRefundStates] = useState<Record<string, RegistrationRefundState>>({});

  useEffect(() => {
    const paidIds = registrations
      .filter((row) => row.coverage_status === 'paid' && row.status === 'registered')
      .map((row) => row.id);
    if (paidIds.length === 0) {
      setRefundStates({});
      return;
    }
    let active = true;
    void fetchRegistrationRefundStates(paidIds).then((states) => {
      if (active) setRefundStates(states);
    });
    return () => {
      active = false;
    };
  }, [registrations]);

  const showFeedbackDialog = (
    message: string,
    type: 'success' | 'error' = 'success',
    title?: string,
    extra?: Pick<FeedbackDialogState, 'undo' | 'durationMs'>,
  ) => {
    setFeedbackDialog({
      title: title || (type === 'success' ? 'Erfolg' : 'Hinweis'),
      message,
      type,
      ...extra,
    });
  };

  const getSupabaseErrorMessage = (error: unknown, fallback: string) => {
    if (!error || typeof error !== 'object') {
      return fallback;
    }

    const maybeError = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    const parts = [maybeError.message, maybeError.details, maybeError.hint].filter(Boolean);
    const withCode = maybeError.code ? [...parts, `Code: ${maybeError.code}`] : parts;

    return withCode.length > 0 ? withCode.join(' | ') : fallback;
  };

  const fetchUserRegistrations = async () => {
    if (!userProfile) return;

    try {
      const { data, error } = await supabase
        .from('registrations')
        .select(
          'id, course_id, status, is_waitlist, waitlist_position, coverage_status, cancellation_deadline, hold_expires_at, price_cents_at_booking',
        )
        .eq('user_id', userProfile.id)
        .is('cancellation_timestamp', null);

      if (error) throw error;
      setRegistrations(data || []);
    } catch (error) {
      console.error('Error fetching registrations:', error);
    }
  };

  const handleRegister = async (
    courseId: string,
    usePassOrOpts:
      | boolean
      | {
          method?: 'pass' | 'online' | 'onsite';
          usePass?: boolean;
          course?: Pick<Course, 'title' | 'date' | 'time'>;
        } = false,
  ) => {
    if (!userProfile || registering) return false;

    const opts =
      typeof usePassOrOpts === 'boolean'
        ? { usePass: usePassOrOpts }
        : usePassOrOpts ?? {};
    const usePass = opts.usePass === true || opts.method === 'pass';
    const method = opts.method ?? (usePass ? 'pass' : undefined);
    const courseMeta = opts.course;

    setRegistering(true);
    try {
      const { data, error } = await supabase.rpc('register_for_course', {
        p_course_id: courseId,
        p_use_pass: usePass,
        ...(method ? { p_method: method } : {}),
      });

      if (error) throw error;

      const result = data as RegisterForCourseResult | null;

      if (result && !result.success) {
        const code = result.error;
        const message =
          code === 'NO_VALID_PASS' ||
          code === 'PASS_EMPTY' ||
          code === 'PASS_EXPIRED' ||
          code === 'NOT_PASS_ELIGIBLE'
            ? passRedeemErrorMessage(code)
            : result.message || result.error || 'Fehler bei der Anmeldung.';
        showFeedbackDialog(message, 'error', 'Anmeldung nicht möglich');
        return false;
      }

      onAfterSuccess();
      fetchUserRegistrations();

      if (result?.status === 'pending_payment' && result.registration_id) {
        options?.onPendingPayment?.({
          registrationId: result.registration_id,
          holdExpiresAt: result.hold_expires_at ?? null,
        });
        return true;
      }

      // UX-5: Buchungen ohne Rückgängig — bei Vertipper normal abmelden.
      if (result?.waitlist_position) {
        showFeedbackDialog(
          `Du wurdest auf die Warteliste gesetzt (Position ${result.waitlist_position}). Du wirst benachrichtigt, wenn ein Platz frei wird.`,
          'success',
          'Warteliste',
        );
      } else {
        const base = courseMeta
          ? enrolledToastLine(courseMeta)
          : 'Du bist dabei';
        const successText =
          result?.coverage === 'pass' && result.pass_remaining != null
            ? `${base} · noch ${result.pass_remaining}`
            : base;
        showFeedbackDialog(successText, 'success', successText);
      }
      return true;
    } catch (error) {
      console.error('Error registering for course:', error);
      try {
        console.error('Error registering for course (serialized):', JSON.stringify(error, null, 2));
      } catch {
        // Ignore serialization issues (e.g. circular refs)
      }
      showFeedbackDialog(
        getSupabaseErrorMessage(error, 'Fehler bei der Anmeldung. Bitte versuche es erneut.'),
        'error',
        'Anmeldung fehlgeschlagen'
      );
      return false;
    } finally {
      setRegistering(false);
    }
  };

  const requestUnregister = (course: Course) => {
    const reg = registrations.find((row) => row.course_id === course.id);
    const paymentPending = reg?.status === 'pending_payment';
    const refund = reg && !paymentPending ? passRefundInfo(reg) : null;
    const online = reg && !paymentPending ? onlineRefundInfo(reg, refundStates[reg.id]) : null;
    let message = paymentPending
      ? `Möchtest du den Platz für „${course.title}“ freigeben? Die Zahlungsfrist entfällt dann.`
      : refund
        ? unregisterPassDialogMessage(refund)
        : online
          ? unregisterOnlineDialogMessage(online)
          : `Möchtest du dich vom Kurs „${course.title}“ abmelden? Der Platz wird wieder frei.`;
    if (
      !paymentPending &&
      !refund &&
      !online &&
      reg?.coverage_status === 'open'
    ) {
      const late = onsiteLateCancelHint({
        studioName: tenant?.name ?? 'Das Studio',
        deadlineIso: reg.cancellation_deadline,
        priceCents: reg.price_cents_at_booking ?? course.price ?? 0,
      });
      if (late) message = late;
    }
    setPendingUnregisterCourseId(course.id);
    setConfirmDialog({
      title: paymentPending ? 'Platz freigeben?' : 'Vom Kurs abmelden?',
      message,
      confirmLabel: paymentPending ? RELEASE_SEAT_LABEL : 'Abmelden',
      cancelLabel: 'Abbrechen',
      variant: 'danger',
    });
  };

  const cancelUnregister = () => {
    if (unregistering) return;
    setConfirmDialog(null);
    setPendingUnregisterCourseId(null);
  };

  const handleUnregister = async () => {
    if (!userProfile || !pendingUnregisterCourseId) return;

    const courseId = pendingUnregisterCourseId;
    const reg = registrations.find((row) => row.course_id === courseId);
    const wasPaidOnline = Boolean(reg && (refundStates[reg.id]?.payment_cents ?? 0) > 0);
    setUnregistering(true);

    try {
      const { data, error } = await supabase.rpc('unregister_from_course', {
        p_course_id: courseId,
      });

      if (error) throw error;

      if (data && !data.success) {
        const d = data as { message?: string; error?: string };
        showFeedbackDialog(
          d.message || d.error || 'Fehler bei der Abmeldung.',
          'error',
          'Abmeldung nicht möglich'
        );
        return;
      }

      onAfterSuccess();
      fetchUserRegistrations();

      const refundCents = (data as { refund_cents?: number }).refund_cents ?? 0;
      // UX-5: Rückgängig nur bei Abmelden ohne Erstattung.
      const canUndo = toastUndoAllowed({ refundCents, wasPaidOnline });
      const successText =
        refundCents > 0 || wasPaidOnline
          ? unregisterRefundSuccessMessage(refundCents)
          : 'Abgemeldet';
      showFeedbackDialog(
        successText,
        'success',
        successText,
        canUndo
          ? {
              durationMs: TOAST_UNDO_MS,
              undo: {
                label: 'Rückgängig',
                onAction: async () => {
                  await handleRegister(courseId, false);
                },
              },
            }
          : undefined,
      );
    } catch (error) {
      console.error('Error unregistering from course:', error);
      try {
        console.error('Error unregistering from course (serialized):', JSON.stringify(error, null, 2));
      } catch {
        // Ignore serialization issues (e.g. circular refs)
      }
      showFeedbackDialog(
        getSupabaseErrorMessage(error, 'Fehler bei der Abmeldung. Bitte versuche es erneut.'),
        'error',
        'Abmeldung fehlgeschlagen'
      );
    } finally {
      setUnregistering(false);
      setConfirmDialog(null);
      setPendingUnregisterCourseId(null);
    }
  };

  const isUserRegistered = (courseId: string) => {
    return registrations.some(reg => reg.course_id === courseId);
  };

  const getUserRegistrationStatus = (courseId: string) => {
    const reg = registrations.find(reg => reg.course_id === courseId);
    return reg?.status || null;
  };

  const getUserWaitlistPosition = (courseId: string) => {
    const reg = registrations.find(reg => reg.course_id === courseId);
    return reg?.waitlist_position || null;
  };

  const getOwnRegistration = (courseId: string) => {
    return registrations.find((reg) => reg.course_id === courseId) ?? null;
  };

  const getOnlineRefundInfo = (courseId: string) => {
    const reg = registrations.find((row) => row.course_id === courseId);
    return reg ? onlineRefundInfo(reg, refundStates[reg.id]) : null;
  };

  return {
    setRegistrations,
    fetchUserRegistrations,
    feedbackDialog,
    setFeedbackDialog,
    confirmDialog,
    unregistering,
    pendingUnregisterCourseId,
    registering,
    handleRegister,
    requestUnregister,
    cancelUnregister,
    handleUnregister,
    isUserRegistered,
    getUserRegistrationStatus,
    getUserWaitlistPosition,
    getOwnRegistration,
    getOnlineRefundInfo,
  };
}
