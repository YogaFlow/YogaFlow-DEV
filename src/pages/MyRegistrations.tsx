import React, { useCallback, useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import CourseEnrollmentDialogs from '../components/courses/CourseEnrollmentDialogs';
import EnrollmentCards from '../components/courses/EnrollmentCards';
import MyPassesSection from '../components/passes/MyPassesSection';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import PaymentSheet from '../features/payments/PaymentSheet';
import {
  clearPaymentAttempt,
  readAnyPaymentAttempt,
  usePaymentCheckout,
} from '../features/payments/usePaymentCheckout';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { isCourseUpcoming, isRegistrationVisible } from '../lib/courseDateTime';
import { fetchMemberPasses, type MemberPassSummary } from '../lib/passes';
import { paymentMessageForCode } from '../lib/paymentTexts';
import { supabase } from '../lib/supabase';
import { withCourseTeachers } from '../lib/staffNames';
import { canSelfEnrollInCourses } from '../lib/userRoles';
import { useCourseEnrollment } from '../lib/useCourseEnrollment';
import type { Course, Registration } from '../types';

const MyRegistrations: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userProfile } = useAuth();
  const { tenant } = useTenant();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [ownPasses, setOwnPasses] = useState<MemberPassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackDialogState | null>(null);
  const [paySheet, setPaySheet] = useState<{
    registrationId: string;
    holdExpiresAt?: string | null;
  } | null>(null);
  const returnCheckout = usePaymentCheckout();

  const canSelfEnroll = canSelfEnrollInCourses(userProfile);

  const loadRegistrations = useCallback(async () => {
    if (!userProfile || !canSelfEnroll) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadError(false);

      const [{ data, error }, passes] = await Promise.all([
        supabase
          .from('registrations')
          .select(
            `
            *,
            course:courses(*)
          `,
          )
          .eq('user_id', userProfile.id)
          .or(
            'cancel_reason.eq.course_cancelled,and(status.in.(registered,waitlist,pending_payment),cancellation_timestamp.is.null)',
          ),
        fetchMemberPasses(userProfile.id),
      ]);

      if (error) throw error;

      setOwnPasses(passes);

      const visible = (data || []).filter((registration: Registration) => {
        if (registration.cancel_reason === 'course_cancelled') {
          const course = registration.course;
          return course != null && isCourseUpcoming(course);
        }
        return isRegistrationVisible(registration);
      });
      const coursesWithTeachers = await withCourseTeachers(
        visible
          .map((registration) => registration.course)
          .filter((course): course is Course => Boolean(course)),
      );
      const teacherByCourseId = Object.fromEntries(
        coursesWithTeachers.map((course) => [course.id, course.teacher]),
      );

      const futureRegistrations = visible
        .map((registration) => ({
          ...registration,
          course: registration.course
            ? { ...registration.course, teacher: teacherByCourseId[registration.course.id] }
            : registration.course,
        }))
        .sort((a: Registration, b: Registration) => {
          const dateA = `${a.course?.date ?? ''}T${a.course?.time ?? ''}`;
          const dateB = `${b.course?.date ?? ''}T${b.course?.time ?? ''}`;
          return dateA.localeCompare(dateB);
        });

      setRegistrations(futureRegistrations);
    } catch (error) {
      console.error('Error loading registrations:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userProfile, canSelfEnroll]);

  const enrollment = useCourseEnrollment(() => {
    void loadRegistrations();
  }, {
    onPendingPayment: (info) => setPaySheet(info),
  });

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  useEffect(() => {
    enrollment.setRegistrations(
      registrations.map((row) => ({
        id: row.id,
        course_id: row.course_id,
        status: row.status,
        is_waitlist: row.is_waitlist,
        waitlist_position: row.waitlist_position,
        coverage_status: row.coverage_status,
        cancellation_deadline: row.cancellation_deadline,
        hold_expires_at: row.hold_expires_at,
      })),
    );
    // Sync list into enrollment hook for Abmelden/Platz freigeben.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrations]);

  // Z5: Rückkehr nach 3-D-Secure
  useEffect(() => {
    if (searchParams.get('payment') !== 'return') return;
    const next = new URLSearchParams(searchParams);
    next.delete('payment');
    setSearchParams(next, { replace: true });

    const stored = readAnyPaymentAttempt();
    if (!stored) {
      void loadRegistrations();
      return;
    }

    void (async () => {
      const status = await returnCheckout.runStatus(stored.attemptId);
      clearPaymentAttempt(stored.registrationId);
      void loadRegistrations();
      if (status.kind === 'continue') {
        const polled = await returnCheckout.pollUntilDone(stored.attemptId);
        void loadRegistrations();
        setFeedback({
          title: 'Zahlung',
          message: polled.message || paymentMessageForCode(polled.code),
          type: polled.code === 'CARD_DECLINED' ? 'error' : 'success',
        });
        return;
      }
      setFeedback({
        title: status.kind === 'done' ? 'Zahlung' : 'Hinweis',
        message: status.message || paymentMessageForCode(status.code),
        type: status.kind === 'done' ? 'success' : 'error',
      });
    })();
    // nur einmal bei payment=return
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-brand" />
      </div>
    );
  }

  if (!canSelfEnroll) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <FeedbackDialog dialog={feedback} onClose={() => setFeedback(null)} />
      <CourseEnrollmentDialogs
        feedbackDialog={enrollment.feedbackDialog}
        setFeedbackDialog={enrollment.setFeedbackDialog}
        confirmDialog={enrollment.confirmDialog}
        cancelUnregister={enrollment.cancelUnregister}
        handleUnregister={() => void enrollment.handleUnregister()}
        unregistering={enrollment.unregistering}
      />
      <PaymentSheet
        open={paySheet != null}
        registrationId={paySheet?.registrationId ?? null}
        studioName={tenant?.name ?? ''}
        holdExpiresAt={paySheet?.holdExpiresAt}
        onClose={() => setPaySheet(null)}
        onFinished={() => {
          void loadRegistrations();
        }}
      />
      <MyPassesSection />
      {loadError ? (
        <div className="rounded-sm border border-danger bg-dangerSoft p-4 text-sm text-danger">
          Deine Anmeldungen konnten nicht geladen werden. Bitte lade die Seite erneut.
        </div>
      ) : registrations.length === 0 ? (
        <div className="py-12 text-center">
          <Calendar className="mx-auto mb-4 h-16 w-16 text-textSubtle" />
          <h2 className="mb-2 text-lg font-medium text-text">
            Keine Anmeldungen gefunden
          </h2>
          <p className="mb-6 text-textMuted">
            Du bist noch nicht für einen kommenden Kurs angemeldet.
          </p>
          <button
            type="button"
            onClick={() => navigate('/courses')}
            className="rounded-sm bg-brand px-6 py-3 text-onBrand transition-colors hover:bg-brandPressed"
          >
            Kurse durchsuchen
          </button>
        </div>
      ) : (
        <EnrollmentCards
          registrations={registrations}
          ownPasses={ownPasses}
          onCoverageChanged={() => void loadRegistrations()}
          onFeedback={(message, type) =>
            setFeedback({
              title: type === 'success' ? 'Erledigt' : 'Hinweis',
              message,
              type,
            })
          }
          onReleaseSeat={(registration) => {
            if (!registration.course) return;
            enrollment.requestUnregister(registration.course);
          }}
          onPayNow={(registration) => {
            setPaySheet({
              registrationId: registration.id,
              holdExpiresAt: registration.hold_expires_at,
            });
          }}
          releasingCourseId={enrollment.pendingUnregisterCourseId}
        />
      )}
    </div>
  );
};

export default MyRegistrations;
