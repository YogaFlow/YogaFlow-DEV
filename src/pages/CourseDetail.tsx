import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  MapPin,
  MoreHorizontal,
  User,
  Users,
} from 'lucide-react';
import CourseCancelDialog from '../components/courses/CourseCancelDialog';
import CourseDeleteDialog from '../components/courses/CourseDeleteDialog';
import BookingPayMethodRow from '../components/courses/BookingPayMethodRow';
import BookingPayMethodSheet from '../components/courses/BookingPayMethodSheet';
import CourseEnrollmentDialogs from '../components/courses/CourseEnrollmentDialogs';
import OnsiteBookConfirmSheet from '../components/courses/OnsiteBookConfirmSheet';
import AccentPill from '../components/ui/AccentPill';
import FeedbackDialog from '../components/ui/FeedbackDialog';
import PaymentSheet from '../features/payments/PaymentSheet';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import {
  fetchBookingPaymentOptions,
  type BookingPayMethod,
  type BookingPaymentOptions,
} from '../lib/bookingPaymentOptions';
import { bookingPrimaryLabel } from '../lib/bookingMethodTexts';
import {
  courseDurationMinutes,
  isCourseCancelled,
  isCourseUpcoming,
} from '../lib/courseDateTime';
import { fetchCourseParticipantCounts } from '../lib/courseParticipantCounts';
import {
  formatDate,
  formatDuration,
  formatPrice,
  formatTimeRange,
  formatDateTime,
  formatTodayOrTomorrow,
} from '../lib/format';
import {
  passRefundInfo,
  passRefundStatusLine,
} from '../lib/passRefundInfo';
import { onlinePaidStatusLine } from '../lib/refundTexts';
import {
  isDevPendingPaymentMock,
  resolveHoldExpiresAt,
} from '../lib/devPendingPaymentMock';
import PaymentPendingStatus from '../components/ui/PaymentPendingStatus';
import { PAY_NOW_LABEL } from '../lib/paymentTexts';
import {
  cancellationDeadlineLine,
  previewCancellationDeadlineIso,
} from '../lib/cancellationDeadline';
import { RELEASE_SEAT_LABEL } from '../lib/pendingPaymentLabel';
import { paymentsClientConfig } from '../lib/paymentsClientConfig';
import { supabase } from '../lib/supabase';
import { canSelfEnrollInCourse, canSelfEnrollInCourses } from '../lib/userRoles';
import { useCourseCancellation } from '../lib/useCourseCancellation';
import { useCourseDeletion } from '../lib/useCourseDeletion';
import { useCourseEnrollment } from '../lib/useCourseEnrollment';
import { formatStaffName, withCourseTeachers } from '../lib/staffNames';
import type { Course } from '../types';

const CourseDetail: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile, isAdmin, isCourseLeader } = useAuth();
  const { tenant } = useTenant();
  const [course, setCourse] = useState<Course | null>(null);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const [payOptions, setPayOptions] = useState<BookingPaymentOptions | null>(null);
  const [chosenMethod, setChosenMethod] = useState<BookingPayMethod | null>(null);
  const [altPayOpen, setAltPayOpen] = useState(false);
  const [onsiteConfirmOpen, setOnsiteConfirmOpen] = useState(false);
  const [paySheet, setPaySheet] = useState<{
    registrationId: string;
    holdExpiresAt?: string | null;
  } | null>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const staffMenuRef = useRef<HTMLDivElement>(null);
  const [staffMenuOpen, setStaffMenuOpen] = useState(false);
  const [isLgViewport, setIsLgViewport] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLgViewport(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const loadCourse = useCallback(async () => {
    if (!courseId) {
      setCourse(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('courses')
      .select('*').is('archived_at', null)
      .eq('id', courseId)
      .maybeSingle();

    if (error || !data) {
      setCourse(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const [withTeacher] = await withCourseTeachers([data]);
    setCourse(withTeacher);
    setNotFound(false);

    const counts = await fetchCourseParticipantCounts([courseId]);
    setRegisteredCount(counts[courseId]?.registered ?? 0);
    setLoading(false);
  }, [courseId]);

  const {
    fetchUserRegistrations,
    feedbackDialog,
    setFeedbackDialog,
    confirmDialog,
    unregistering,
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
  } = useCourseEnrollment(loadCourse, {
    onPendingPayment: (info) => setPaySheet(info),
  });

  const {
    requestDelete,
    confirmDelete,
    cancelDelete,
    closeFeedback,
    dialogOpen,
    deleting,
    scope,
    setScope,
    upcomingCount,
    personCount,
    singleHasRegistrations,
    blockedSessions,
    courseTitle,
    singleRowCount,
    seriesRowCount,
    feedbackDialog: deleteFeedback,
  } = useCourseDeletion(course);

  const cancellation = useCourseCancellation(course, {
    isManager: isAdmin,
    teacherOnlyId: isAdmin ? null : userProfile?.id ?? null,
    onChanged: () => {
      void loadCourse();
    },
  });

  useEffect(() => {
    setLoading(true);
    setDescriptionExpanded(false);
    setChosenMethod(null);
    setAltPayOpen(false);
    setOnsiteConfirmOpen(false);
    void loadCourse();
    if (canSelfEnrollInCourses(userProfile)) {
      void fetchUserRegistrations();
    }
    // fetchUserRegistrations is recreated every render; reload on course/profile change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, userProfile?.id, loadCourse]);

  useEffect(() => {
    let cancelled = false;
    const loadOptions = async () => {
      if (!courseId || !canSelfEnrollInCourses(userProfile)) {
        setPayOptions(null);
        setChosenMethod(null);
        return;
      }
      const opts = await fetchBookingPaymentOptions(courseId);
      if (cancelled) return;
      setPayOptions(opts);
      setChosenMethod((prev) => {
        if (prev && opts.methods.some((m) => m.method === prev)) return prev;
        return opts.defaultMethod;
      });
    };
    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [courseId, userProfile?.id, userProfile?.role]);

  const description = course?.description?.trim() ?? '';

  useLayoutEffect(() => {
    if (descriptionExpanded) return;
    const el = descriptionRef.current;
    if (!el) {
      setDescriptionOverflows(false);
      return;
    }
    setDescriptionOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [description, descriptionExpanded]);

  useEffect(() => {
    if (!staffMenuOpen) return;
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('[data-staff-menu-root]')) return;
      setStaffMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [staffMenuOpen]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-brand" />
      </div>
    );
  }

  if (notFound || !course) {
    return (
      <div className="py-12 text-center">
        <h2 className="mb-2 text-[22px] font-medium text-text">Kurs nicht gefunden</h2>
        <Link to="/courses" className="inline-flex min-h-11 items-center text-[15px] font-medium text-brand">
          Zu den Kursen
        </Link>
      </div>
    );
  }

  const isRegistered = isUserRegistered(course.id);
  const registrationStatus = getUserRegistrationStatus(course.id);
  const waitlistPosition = getUserWaitlistPosition(course.id);
  const ownRegistration = getOwnRegistration(course.id);
  // DEV-Mock: jede eigene Anmeldung (auch Warteliste), wenn ?pendingPayment=1
  const showPendingPayment =
    (isRegistered && registrationStatus === 'pending_payment') ||
    (isDevPendingPaymentMock() && isRegistered);
  const refundInfo =
    ownRegistration && registrationStatus === 'registered' && !ownRegistration.is_waitlist && !showPendingPayment
      ? passRefundInfo(ownRegistration)
      : null;
  const onlineInfo =
    !refundInfo && registrationStatus === 'registered' && !showPendingPayment
      ? getOnlineRefundInfo(course.id)
      : null;
  const isFull = registeredCount >= course.max_participants;
  const remaining = course.max_participants - registeredCount;
  const cancelled = isCourseCancelled(course.status);
  const activeMethod: BookingPayMethod =
    chosenMethod ?? payOptions?.defaultMethod ?? 'onsite';
  const passOption = payOptions?.methods.find((m) => m.method === 'pass') ?? null;
  const showAltPay = (payOptions?.methods.length ?? 0) > 1;
  const showOnlinePayHint =
    Boolean(payOptions?.showOnlinePayHint) && activeMethod === 'online';

  const reloadPayOptions = async () => {
    if (!courseId || !canSelfEnrollInCourses(userProfile)) return;
    const opts = await fetchBookingPaymentOptions(courseId);
    setPayOptions(opts);
    setChosenMethod((prev) => {
      if (prev && opts.methods.some((m) => m.method === prev)) return prev;
      return opts.defaultMethod;
    });
  };

  const requestEnroll = (mode: 'seat' | 'waitlist') => {
    if (registering) return;
    void (async () => {
      if (activeMethod === 'onsite' && mode === 'seat') {
        setOnsiteConfirmOpen(true);
        return;
      }
      const ok = await handleRegister(course.id, {
        method: activeMethod,
        course: { title: course.title, date: course.date, time: course.time },
      });
      if (ok) void reloadPayOptions();
    })();
  };

  const confirmOnsiteBook = async () => {
    const ok = await handleRegister(course.id, {
      method: 'onsite',
      course: { title: course.title, date: course.date, time: course.time },
    });
    if (ok) {
      setOnsiteConfirmOpen(false);
      void reloadPayOptions();
    }
  };
  const upcoming = isCourseUpcoming(course);
  const canAct = canSelfEnrollInCourse(course, userProfile) && upcoming;
  const canManageCourse = isAdmin || course.teacher_id === userProfile?.id;
  const showStaffLinks = isCourseLeader && canManageCourse;
  const canCancelCourse = canManageCourse && course.status === 'active' && upcoming;
  const canUncancelCourse = canManageCourse && course.status === 'canceled' && upcoming;
  const cancelledOn = course.canceled_at ? formatDateTime(course.canceled_at) : '';
  const cancelNote = course.cancel_note?.trim() ?? '';
  const durationMinutes = courseDurationMinutes(course);
  const teacherName = formatStaffName(course.teacher);
  const locationLine = [course.location, course.room].filter(Boolean).join(' · ');
  const nearDay = formatTodayOrTomorrow(course.date);
  const dateLine = nearDay ? `${nearDay} · ${formatDate(course.date)}` : formatDate(course.date);
  const timeLine = durationMinutes != null
    ? `${formatTimeRange(course.time, course.end_time)} · ${formatDuration(durationMinutes)}`
    : formatTimeRange(course.time, course.end_time);
  const prerequisites = course.prerequisites?.trim() ?? '';
  const teacherInitials = (() => {
    const person = course.teacher;
    if (!person) return null;
    const first = person.first_name?.trim()?.[0] ?? '';
    const last = person.last_name?.trim()?.[0] ?? '';
    const letters = `${first}${last}`.toUpperCase();
    return letters || null;
  })();
  const mapsQuery = course.location?.trim() || locationLine;
  const mapsHref = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null;
  const showStaffMenu = showStaffLinks || canCancelCourse || (isAdmin && upcoming);
  const occupancyDetail =
    cancelled || isFull
      ? isFull && !cancelled
        ? 'Ausgebucht'
        : null
      : remaining === 1
        ? '1 frei'
        : `${remaining} frei`;
  const occupancyLine =
    !cancelled && occupancyDetail
      ? `${registeredCount} von ${course.max_participants} · ${occupancyDetail}`
      : !cancelled
        ? `${registeredCount} von ${course.max_participants}`
        : null;
  const occupancyPercent =
    course.max_participants > 0
      ? Math.min(100, Math.round((registeredCount / course.max_participants) * 100))
      : 0;

  let courseStatus: React.ReactNode = null;
  if (cancelled) {
    courseStatus = <span className="text-[13px] font-medium text-textMuted">Abgesagt</span>;
  } else if (!upcoming) {
    courseStatus = (
      <span className="text-[13px] font-medium text-textMuted">Hat bereits begonnen</span>
    );
  } else if (isFull) {
    courseStatus = <span className="text-[13px] font-medium text-textMuted">Ausgebucht</span>;
  } else if (remaining <= 2) {
    courseStatus = (
      <AccentPill>
        {remaining === 1 ? 'noch 1 Platz' : `noch ${remaining} Plätze`}
      </AccentPill>
    );
  } else if (course.teacher_id === userProfile?.id) {
    courseStatus = <span className="text-[13px] font-medium text-textMuted">Dein Kurs</span>;
  }

  const buttonShape =
    'inline-flex items-center justify-center whitespace-nowrap rounded-full min-h-11 min-w-[9.5rem] px-5 text-[15px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';
  /** Gestapelte Buchungsleiste (UX-5): Primärknopf volle Breite, 52 px. */
  const buttonShapeMobileStack =
    'inline-flex items-center justify-center whitespace-nowrap rounded-full min-h-[52px] w-full px-5 text-[15px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';
  /** Angemeldet / Warteliste: Knopf neben Status. */
  const buttonShapeMobileInline =
    'inline-flex items-center justify-center whitespace-nowrap rounded-full min-h-12 min-w-[8.25rem] px-5 text-[15px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';
  const staffButtonShape =
    'inline-flex items-center justify-center whitespace-nowrap rounded-full min-h-11 px-5 text-[15px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

  const goBack = () => {
    if (location.key === 'default') {
      navigate('/courses');
      return;
    }
    navigate(-1);
  };

  const windowHours =
    typeof tenant?.cancellation_window_hours === 'number'
      ? tenant.cancellation_window_hours
      : null;
  const bookedDeadlineIso =
    ownRegistration?.cancellation_deadline ??
    refundInfo?.deadline ??
    onlineInfo?.deadline ??
    null;
  const previewDeadlineIso =
    windowHours == null || !course.date
      ? null
      : previewCancellationDeadlineIso(course.date, course.time, windowHours);
  const cancelDeadlineLineText = cancelled
    ? null
    : isRegistered && registrationStatus === 'registered' && !showPendingPayment
      ? cancellationDeadlineLine(bookedDeadlineIso)
      : previewDeadlineIso
        ? cancellationDeadlineLine(previewDeadlineIso)
        : null;
  const paymentStatusSuffix = refundInfo
    ? passRefundStatusLine()
    : onlineInfo
      ? onlinePaidStatusLine()
      : null;
  const renderBookingStatus = () =>
    isRegistered && registrationStatus === 'registered' && !showPendingPayment ? (
      <div className="mt-0.5">
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
          <Check className="h-3.5 w-3.5" aria-hidden />
          {paymentStatusSuffix ? `Angemeldet · ${paymentStatusSuffix}` : 'Angemeldet'}
        </span>
      </div>
    ) : showPendingPayment ? (
      <div className="mt-0.5">
        <PaymentPendingStatus
          holdExpiresAt={resolveHoldExpiresAt(ownRegistration?.hold_expires_at)}
          className="!items-start"
        />
      </div>
    ) : isRegistered && registrationStatus === 'waitlist' ? (
      <span className="mt-0.5 inline-block">
        <AccentPill>
          {waitlistPosition ? `Warteliste Pos. ${waitlistPosition}` : 'Warteliste'}
        </AccentPill>
      </span>
    ) : (
      <div className="mt-0.5">
        <p className="text-[13px] text-textMuted">pro Termin</p>
      </div>
    );

  const renderStaffMenu = () =>
    showStaffMenu ? (
      <div className="relative shrink-0" data-staff-menu-root ref={staffMenuRef}>
        <button
          type="button"
          aria-label="Kurs verwalten"
          aria-expanded={staffMenuOpen}
          aria-haspopup="menu"
          data-testid="course-detail-menu"
          onClick={() => setStaffMenuOpen((open) => !open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-textMuted active:bg-surfaceSunken"
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden />
        </button>
        {staffMenuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-10 mt-1 min-w-[11rem] rounded-md border border-border bg-surface py-1 shadow-lg"
          >
            {showStaffLinks ? (
              <Link
                role="menuitem"
                to={`/course/${course.id}/edit`}
                onClick={() => setStaffMenuOpen(false)}
                className="flex w-full px-4 py-3 text-left text-[15px] font-medium text-text"
              >
                Bearbeiten
              </Link>
            ) : null}
            {canCancelCourse ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setStaffMenuOpen(false);
                  cancellation.requestCancel();
                }}
                className="flex w-full px-4 py-3 text-left text-[15px] font-medium text-danger"
              >
                Kurs absagen
              </button>
            ) : null}
            {isAdmin && upcoming ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setStaffMenuOpen(false);
                  void requestDelete();
                }}
                className="flex w-full px-4 py-3 text-left text-[15px] font-medium text-danger"
              >
                Kurs löschen
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : null;

  const renderBookingActions = (desktop: boolean) => {
    const mobileShape =
      !desktop && canAct && !isRegistered
        ? buttonShapeMobileStack
        : buttonShapeMobileInline;
    const shape = desktop ? buttonShape : mobileShape;
    return (
    <>
      {canAct ? (
        isRegistered ? (
          showPendingPayment ? (
            <div
              className={
                desktop
                  ? 'flex w-full flex-col gap-2'
                  : 'flex shrink-0 flex-col items-stretch gap-2'
              }
            >
              {paymentsClientConfig().enabled && ownRegistration?.id ? (
                <button
                  type="button"
                  onClick={() =>
                    setPaySheet({
                      registrationId: ownRegistration.id,
                      holdExpiresAt: ownRegistration.hold_expires_at,
                    })
                  }
                  className={`${shape} bg-brand text-onBrand active:bg-brandPressed${desktop ? ' w-full' : ''}`}
                >
                  {PAY_NOW_LABEL}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => requestUnregister(course)}
                className={`${shape} border border-borderStrong bg-surface text-textMuted active:bg-surfaceSunken${desktop ? ' w-full' : ''}`}
              >
                {RELEASE_SEAT_LABEL}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => requestUnregister(course)}
              data-testid="course-unregister"
              className={`${shape} border border-borderStrong bg-surface text-danger active:bg-dangerSoft${desktop ? ' w-full' : ''}`}
            >
              Abmelden
            </button>
          )
        ) : isFull ? (
          <button
            type="button"
            onClick={() => requestEnroll('waitlist')}
            disabled={registering}
            data-testid="book-primary"
            className={`${shape} border border-accent bg-accentSoft text-accentText disabled:opacity-50${desktop ? ' w-full' : ''}`}
          >
            {desktop ? 'Auf die Warteliste' : 'Warteliste'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => requestEnroll('seat')}
            disabled={registering}
            data-testid="book-primary"
            className={`${shape} bg-brand text-onBrand active:bg-brandPressed disabled:opacity-50${desktop ? ' w-full' : ''}`}
          >
            {bookingPrimaryLabel(activeMethod, {
              passLabel: passOption?.label,
            })}
          </button>
        )
      ) : null}
      {showStaffLinks ? (
        desktop ? (
          <div className="flex w-full flex-col gap-2">
            <Link
              to={`/course/${course.id}/kassieren`}
              className={`${buttonShape} w-full bg-brand text-onBrand active:bg-brandPressed`}
            >
              Check-in öffnen
            </Link>
            <Link
              to={`/course/${course.id}/participants`}
              className={`${staffButtonShape} w-full border border-borderStrong bg-surface text-brand`}
            >
              Teilnehmerliste
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to={`/course/${course.id}/participants`}
              className={`${staffButtonShape} border border-borderStrong bg-surface text-brand`}
            >
              Teilnehmer
            </Link>
            <Link
              to={`/course/${course.id}/edit`}
              className={`${staffButtonShape} border border-borderStrong bg-surface text-brand`}
            >
              Bearbeiten
            </Link>
          </div>
        )
      ) : null}
    </>
    );
  };

  return (
    <div
      className="mx-auto max-w-2xl pb-28 lg:max-w-[1120px] lg:pb-8"
      data-testid="course-detail-layout"
    >
      <CourseEnrollmentDialogs
        confirmDialog={confirmDialog}
        unregistering={unregistering}
        handleUnregister={handleUnregister}
        cancelUnregister={cancelUnregister}
        feedbackDialog={feedbackDialog}
        setFeedbackDialog={setFeedbackDialog}
      />
      <BookingPayMethodSheet
        open={altPayOpen}
        methods={payOptions?.methods ?? []}
        selected={activeMethod}
        onSelect={(method) => setChosenMethod(method)}
        onClose={() => setAltPayOpen(false)}
      />
      <OnsiteBookConfirmSheet
        open={onsiteConfirmOpen}
        busy={registering}
        courseTitle={course.title}
        courseWhen={`${formatDate(course.date)} · ${formatTimeRange(course.time, course.end_time)}`}
        price={course.price}
        cancelDeadlineLine={cancelDeadlineLineText}
        onConfirm={() => void confirmOnsiteBook()}
        onClose={() => {
          if (!registering) setOnsiteConfirmOpen(false);
        }}
      />
      <PaymentSheet
        open={paySheet != null}
        registrationId={paySheet?.registrationId ?? null}
        studioName={tenant?.name ?? ''}
        holdExpiresAt={paySheet?.holdExpiresAt}
        courseTitle={course?.title}
        courseWhen={
          course
            ? `${formatDate(course.date)} · ${formatTimeRange(course.time, course.end_time)}`
            : null
        }
        courseId={course?.id}
        courseBookable={Boolean(course && !cancelled && isCourseUpcoming(course))}
        courseMeta={
          course
            ? {
                durationMinutes: courseDurationMinutes(course),
                place: [course.location, course.room].filter(Boolean).join(' · ') || null,
                teacherName: formatStaffName(course.teacher) || null,
              }
            : null
        }
        onClose={() => setPaySheet(null)}
        onFinished={() => {
          void fetchUserRegistrations();
          void loadCourse();
        }}
      />
      <CourseDeleteDialog
        open={dialogOpen}
        courseTitle={courseTitle}
        upcomingCount={upcomingCount}
        scope={scope}
        onScopeChange={setScope}
        personCount={personCount}
        singleHasRegistrations={singleHasRegistrations}
        singleRowCount={singleRowCount}
        seriesRowCount={seriesRowCount}
        blockedSessions={blockedSessions}
        deleting={deleting}
        onCancel={cancelDelete}
        onConfirm={() => void confirmDelete()}
        onRequestCancel={() => {
          cancelDelete();
          cancellation.requestCancel();
        }}
        alreadyCancelled={cancelled}
      />
      <CourseCancelDialog
        dialog={cancellation.dialog}
        onScopeChange={cancellation.setScope}
        onNoteChange={cancellation.setNote}
        onCancel={cancellation.closeDialog}
        onConfirm={cancellation.confirm}
      />
      <FeedbackDialog dialog={deleteFeedback} onClose={closeFeedback} />
      <FeedbackDialog dialog={cancellation.feedbackDialog} onClose={cancellation.closeFeedback} />

      <div className="lg:hidden">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-textMuted"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
            Zurück
          </button>
          {!isLgViewport ? renderStaffMenu() : null}
        </div>

        <h2 className="mt-4 text-[22px] font-medium text-text">{course.title}</h2>

        {courseStatus ? <div className="mt-2">{courseStatus}</div> : null}

        {cancelled ? (
          <div className="mt-4 rounded-md border border-border bg-surfaceSunken px-3.5 py-3">
            <p className="text-[15px] font-medium text-text">
              {cancelledOn ? `Abgesagt am ${cancelledOn}` : 'Abgesagt'}
              {cancelNote ? ` · Grund: ${cancelNote}` : ''}
            </p>
            {canUncancelCourse ? (
              <button
                type="button"
                onClick={cancellation.requestUncancel}
                className="mt-2 inline-flex min-h-11 items-center text-[15px] font-medium text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Absage zurücknehmen
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          {dateLine ? (
            <div className="flex items-start gap-3 px-3.5 py-3">
              <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
              <p className="text-[15px] text-text">{dateLine}</p>
            </div>
          ) : null}
          {timeLine ? (
            <div className="flex items-start gap-3 px-3.5 py-3">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
              <p className="text-[15px] text-text tabular-nums">{timeLine}</p>
            </div>
          ) : null}
          {teacherName ? (
            <div className="flex items-start gap-3 px-3.5 py-3">
              <User className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
              <p className="text-[15px] text-text">{teacherName}</p>
            </div>
          ) : null}
          {locationLine ? (
            <div className="flex items-start gap-3 px-3.5 py-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
              <p className="text-[15px] text-text">{locationLine}</p>
            </div>
          ) : null}
          {isAdmin || isCourseLeader ? (
            <div className="flex items-start gap-3 px-3.5 py-3">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
              <p className="text-[15px] text-text tabular-nums">
                {registeredCount} von {course.max_participants} Plätzen belegt
              </p>
            </div>
          ) : null}
          {isAdmin && course.pass_eligible === false ? (
            <div className="flex items-start gap-3 px-3.5 py-3">
              <p className="text-[13px] text-textMuted">Nicht mit Karte buchbar</p>
            </div>
          ) : null}
        </div>

        {description ? (
          <section className="mt-6">
            <h3 className="text-[17px] font-medium text-text">Über den Kurs</h3>
            <p
              ref={descriptionRef}
              className={`mt-2 whitespace-pre-line text-[15px] text-text${
                descriptionExpanded ? '' : ' line-clamp-5'
              }`}
            >
              {description}
            </p>
            {descriptionOverflows ? (
              <button
                type="button"
                onClick={() => setDescriptionExpanded((open) => !open)}
                className="mt-1 inline-flex min-h-11 items-center text-[15px] font-medium text-brand"
              >
                {descriptionExpanded ? 'Weniger' : 'Weiterlesen'}
              </button>
            ) : null}
          </section>
        ) : null}

        {prerequisites ? (
          <section className="mt-6">
            <h3 className="text-[17px] font-medium text-text">Voraussetzungen</h3>
            <p className="mt-2 whitespace-pre-line text-[15px] text-text">{prerequisites}</p>
          </section>
        ) : null}
      </div>

      <div className="hidden lg:block">
        <Link
          to="/courses"
          className="inline-flex min-h-11 items-center text-[13px] font-medium text-textMuted"
        >
          Kurse ›
        </Link>

        <div className="mt-2 flex items-start justify-between gap-6">
          <h2 className="min-w-0 flex-1 text-[32px] font-medium leading-tight text-text">
            {course.title}
          </h2>
          {isLgViewport ? renderStaffMenu() : null}
        </div>

        {courseStatus ? <div className="mt-3">{courseStatus}</div> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {dateLine ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-text">
              <Calendar className="h-4 w-4 shrink-0 text-sage-500" aria-hidden />
              {dateLine}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] tabular-nums text-text">
            <Clock className="h-4 w-4 shrink-0 text-sage-500" aria-hidden />
            {formatTimeRange(course.time, course.end_time)}
          </span>
          {locationLine ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-text">
              <MapPin className="h-4 w-4 shrink-0 text-sage-500" aria-hidden />
              {course.location?.trim() || locationLine}
            </span>
          ) : null}
        </div>

        <div className="mt-8 grid grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] items-start gap-10">
          <div className="min-w-0">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
                <Clock className="h-5 w-5 text-sage-500" aria-hidden />
                <p className="mt-3 text-[17px] font-medium tabular-nums text-text">
                  {durationMinutes != null ? formatDuration(durationMinutes) : '—'}
                </p>
                <p className="mt-1 text-[13px] text-textMuted">Dauer</p>
              </div>
              <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-brandSoft text-[13px] font-medium text-brandOnSoft"
                  aria-hidden
                >
                  {teacherInitials ?? <User className="h-5 w-5" aria-hidden />}
                </div>
                <p className="mt-3 text-[17px] font-medium text-text">{teacherName}</p>
                <p className="mt-1 text-[13px] text-textMuted">Lehrende</p>
              </div>
              <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
                <MapPin className="h-5 w-5 text-sage-500" aria-hidden />
                {locationLine && mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 block text-[17px] font-medium text-brand"
                  >
                    {locationLine}
                  </a>
                ) : (
                  <p className="mt-3 text-[17px] font-medium text-text">{locationLine || '—'}</p>
                )}
                <p className="mt-1 text-[13px] text-textMuted">Ort</p>
              </div>
            </div>

            {cancelled ? (
              <div className="mt-6 rounded-md border border-border bg-surfaceSunken px-3.5 py-3">
                <p className="text-[15px] font-medium text-text">
                  {cancelledOn ? `Abgesagt am ${cancelledOn}` : 'Abgesagt'}
                  {cancelNote ? ` · Grund: ${cancelNote}` : ''}
                </p>
                {canUncancelCourse ? (
                  <button
                    type="button"
                    onClick={cancellation.requestUncancel}
                    className="mt-2 inline-flex min-h-11 items-center text-[15px] font-medium text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    Absage zurücknehmen
                  </button>
                ) : null}
              </div>
            ) : null}

            {description ? (
              <section className="mt-8 max-w-prose">
                <h3 className="text-[17px] font-medium text-text">Über den Kurs</h3>
                <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[15px] leading-relaxed text-text">
                  {description}
                </p>
              </section>
            ) : null}

            {prerequisites ? (
              <section className="mt-8 max-w-prose">
                <h3 className="text-[17px] font-medium text-text">Voraussetzungen</h3>
                <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[15px] leading-relaxed text-text">
                  {prerequisites}
                </p>
              </section>
            ) : null}
          </div>

          <aside className="sticky top-6" data-testid="course-booking-card">
            <div className="rounded-md border border-border bg-surface p-5 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[22px] font-medium leading-tight text-text tabular-nums">
                    {formatPrice(course.price)}
                  </p>
                  {renderBookingStatus()}
                </div>
                {cancelDeadlineLineText ? (
                  <p
                    className="max-w-[11rem] text-right text-[12px] leading-snug text-textMuted line-clamp-2"
                    data-testid="cancel-deadline-line"
                  >
                    {cancelDeadlineLineText}
                  </p>
                ) : null}
              </div>
              {occupancyLine ? (
                <div className="mt-4">
                  <div
                    className="h-2 overflow-hidden rounded-full bg-surfaceSunken"
                    role="presentation"
                  >
                    <div
                      className="h-full rounded-full bg-brand transition-[width]"
                      style={{ width: `${occupancyPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[13px] tabular-nums text-textMuted">{occupancyLine}</p>
                </div>
              ) : null}
              {canAct && !isRegistered ? (
                <div className="mt-3">
                  <BookingPayMethodRow
                    method={activeMethod}
                    passLabel={passOption?.label}
                    canChange={showAltPay}
                    showOnlineHint={showOnlinePayHint}
                    onChange={() => setAltPayOpen(true)}
                    testId="book-method-line"
                  />
                </div>
              ) : null}
              <div className="mt-3 flex flex-col gap-2">{renderBookingActions(true)}</div>
            </div>
          </aside>
        </div>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(31,27,22,0.08)] lg:hidden"
        data-testid="course-booking-bar-mobile"
      >
        <div className="mx-auto max-w-2xl">
          {canAct && !isRegistered ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex flex-wrap items-baseline gap-x-1.5 leading-tight">
                  <span className="text-[20px] font-semibold text-text tabular-nums">
                    {formatPrice(course.price)}
                  </span>
                  <span className="text-[13px] text-textMuted">pro Termin</span>
                </p>
                {cancelDeadlineLineText ? (
                  <p
                    className="max-w-[11rem] text-right text-[12px] leading-snug text-textMuted line-clamp-2"
                    data-testid="cancel-deadline-line"
                  >
                    {cancelDeadlineLineText}
                  </p>
                ) : null}
              </div>
              <BookingPayMethodRow
                method={activeMethod}
                passLabel={passOption?.label}
                canChange={showAltPay}
                showOnlineHint={showOnlinePayHint}
                onChange={() => setAltPayOpen(true)}
                testId="book-method-line-mobile"
              />
              {renderBookingActions(false)}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  {isRegistered && registrationStatus === 'registered' && !showPendingPayment ? (
                    <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
                      <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">
                        {paymentStatusSuffix
                          ? `Angemeldet · ${paymentStatusSuffix}`
                          : 'Angemeldet'}
                      </span>
                    </span>
                  ) : showPendingPayment ? (
                    <PaymentPendingStatus
                      holdExpiresAt={resolveHoldExpiresAt(ownRegistration?.hold_expires_at)}
                      className="!items-start"
                    />
                  ) : isRegistered && registrationStatus === 'waitlist' ? (
                    <AccentPill>
                      {waitlistPosition ? `Warteliste Pos. ${waitlistPosition}` : 'Warteliste'}
                    </AccentPill>
                  ) : (
                    <p className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
                      <span className="text-[20px] font-semibold text-text tabular-nums">
                        {formatPrice(course.price)}
                      </span>
                      <span className="text-[13px] text-textMuted">pro Termin</span>
                    </p>
                  )}
                </div>
                {renderBookingActions(false)}
              </div>
              {cancelDeadlineLineText ? (
                <p
                  className="mt-2 text-[12px] leading-snug text-textMuted"
                  data-testid="cancel-deadline-line"
                >
                  {cancelDeadlineLineText}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;
