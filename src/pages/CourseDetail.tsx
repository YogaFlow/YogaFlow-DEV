import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Check, Clock, MapPin, User, Users } from 'lucide-react';
import CourseDeleteDialog from '../components/courses/CourseDeleteDialog';
import CourseEnrollmentDialogs from '../components/courses/CourseEnrollmentDialogs';
import AccentPill from '../components/ui/AccentPill';
import FeedbackDialog from '../components/ui/FeedbackDialog';
import { useAuth } from '../context/AuthContext';
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
  formatTodayOrTomorrow,
} from '../lib/format';
import { supabase } from '../lib/supabase';
import { canSelfEnrollInCourse, canSelfEnrollInCourses } from '../lib/userRoles';
import { useCourseDeletion } from '../lib/useCourseDeletion';
import { useCourseEnrollment } from '../lib/useCourseEnrollment';
import type { Course } from '../types';

const CourseDetail: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile, isAdmin, isCourseLeader } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [registeredCount, setRegisteredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflows, setDescriptionOverflows] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  const loadCourse = useCallback(async () => {
    if (!courseId) {
      setCourse(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('courses')
      .select(
        `
          *,
          teacher:users!courses_teacher_id_fkey(first_name, last_name)
        `
      )
      .eq('id', courseId)
      .maybeSingle();

    if (error || !data) {
      setCourse(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    setCourse(data);
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
    handleRegister,
    requestUnregister,
    cancelUnregister,
    handleUnregister,
    isUserRegistered,
    getUserRegistrationStatus,
    getUserWaitlistPosition,
  } = useCourseEnrollment(loadCourse);

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
    feedbackDialog: deleteFeedback,
  } = useCourseDeletion(course);

  useEffect(() => {
    setLoading(true);
    setDescriptionExpanded(false);
    void loadCourse();
    if (canSelfEnrollInCourses(userProfile)) {
      void fetchUserRegistrations();
    }
    // fetchUserRegistrations is recreated every render; reload on course/profile change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, userProfile?.id, loadCourse]);

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
  const isFull = registeredCount >= course.max_participants;
  const remaining = course.max_participants - registeredCount;
  const cancelled = isCourseCancelled(course.status);
  const upcoming = isCourseUpcoming(course);
  const canAct = canSelfEnrollInCourse(course, userProfile) && upcoming;
  const showStaffLinks =
    isCourseLeader && (isAdmin || course.teacher_id === userProfile?.id);
  const durationMinutes = courseDurationMinutes(course);
  const teacherName = course.teacher
    ? `${course.teacher.first_name} ${course.teacher.last_name}`.trim()
    : '';
  const locationLine = [course.location, course.room].filter(Boolean).join(' · ');
  const nearDay = formatTodayOrTomorrow(course.date);
  const dateLine = nearDay ? `${nearDay} · ${formatDate(course.date)}` : formatDate(course.date);
  const timeLine = durationMinutes != null
    ? `${formatTimeRange(course.time, course.end_time)} · ${formatDuration(durationMinutes)}`
    : formatTimeRange(course.time, course.end_time);
  const prerequisites = course.prerequisites?.trim() ?? '';

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
    'inline-flex items-center justify-center rounded-full min-h-11 min-w-[9.5rem] px-5 text-[15px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';
  const staffButtonShape =
    'inline-flex items-center justify-center rounded-full min-h-11 px-5 text-[15px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

  const goBack = () => {
    if (location.key === 'default') {
      navigate('/courses');
      return;
    }
    navigate(-1);
  };

  return (
    <div className="mx-auto max-w-2xl pb-28 lg:pb-0">
      <CourseEnrollmentDialogs
        confirmDialog={confirmDialog}
        unregistering={unregistering}
        handleUnregister={handleUnregister}
        cancelUnregister={cancelUnregister}
        feedbackDialog={feedbackDialog}
        setFeedbackDialog={setFeedbackDialog}
      />
      <CourseDeleteDialog
        open={dialogOpen}
        courseTitle={courseTitle}
        upcomingCount={upcomingCount}
        scope={scope}
        onScopeChange={setScope}
        personCount={personCount}
        singleHasRegistrations={singleHasRegistrations}
        blockedSessions={blockedSessions}
        deleting={deleting}
        onCancel={cancelDelete}
        onConfirm={() => void confirmDelete()}
      />
      <FeedbackDialog dialog={deleteFeedback} onClose={closeFeedback} />

      <button
        type="button"
        onClick={goBack}
        className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-textMuted"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
        Zurück
      </button>

      <h2 className="mt-4 text-[22px] font-medium text-text">{course.title}</h2>

      {courseStatus ? <div className="mt-2">{courseStatus}</div> : null}

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
        {(isAdmin || isCourseLeader) ? (
          <div className="flex items-start gap-3 px-3.5 py-3">
            <Users className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
            <p className="text-[15px] text-text tabular-nums">
              {registeredCount} von {course.max_participants} Plätzen belegt
            </p>
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

      {isAdmin && upcoming ? (
        <button
          type="button"
          onClick={() => void requestDelete()}
          className="mt-8 inline-flex min-h-11 items-center text-[15px] font-medium text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
        >
          Kurs löschen
        </button>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:sticky lg:inset-x-auto lg:bottom-0 lg:-mx-6 lg:mt-8 lg:py-3">
        <div className="mx-auto flex min-h-11 max-w-2xl items-center justify-between gap-3 px-3 max-[380px]:px-2 sm:px-6 lg:max-w-none lg:px-6">
          <div className="min-w-0 shrink-0">
            <p className="text-[19px] font-medium leading-tight text-text tabular-nums">
              {formatPrice(course.price)}
            </p>
            {isRegistered && registrationStatus === 'registered' ? (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium text-success">
                <Check className="h-3.5 w-3.5" aria-hidden />
                Angemeldet
              </span>
            ) : isRegistered ? (
              <span className="mt-0.5 inline-block">
                <AccentPill>
                  {waitlistPosition ? `Warteliste Pos. ${waitlistPosition}` : 'Warteliste'}
                </AccentPill>
              </span>
            ) : (
              <p className="mt-0.5 text-[13px] text-textMuted">pro Termin</p>
            )}
          </div>
          {canAct ? (
            isRegistered ? (
              <button
                type="button"
                onClick={() => requestUnregister(course)}
                className={`${buttonShape} border border-borderStrong bg-surface text-danger active:bg-dangerSoft`}
              >
                Abmelden
              </button>
            ) : isFull ? (
              <button
                type="button"
                onClick={() => handleRegister(course.id)}
                className={`${buttonShape} border border-accent bg-accentSoft text-accentText`}
              >
                Auf die Warteliste
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleRegister(course.id)}
                className={`${buttonShape} bg-brand text-onBrand active:bg-brandPressed`}
              >
                Anmelden
              </button>
            )
          ) : null}
          {showStaffLinks ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;
