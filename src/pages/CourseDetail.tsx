import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Check, Clock, MapPin, User, Users } from 'lucide-react';
import CourseEnrollmentDialogs from '../components/courses/CourseEnrollmentDialogs';
import AccentPill from '../components/ui/AccentPill';
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

  let status: React.ReactNode = null;
  if (isRegistered && registrationStatus === 'registered') {
    status = (
      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
        <Check className="h-4 w-4" aria-hidden />
        Angemeldet
      </span>
    );
  } else if (isRegistered) {
    status = (
      <AccentPill>
        {waitlistPosition ? `Warteliste Pos. ${waitlistPosition}` : 'Warteliste'}
      </AccentPill>
    );
  } else if (isFull) {
    status = <span className="text-[13px] font-medium text-textMuted">Ausgebucht</span>;
  } else if (remaining <= 2) {
    status = (
      <AccentPill>
        {remaining === 1 ? 'noch 1 Platz' : `noch ${remaining} Plätze`}
      </AccentPill>
    );
  } else if (course.teacher_id === userProfile?.id) {
    status = <span className="text-[13px] font-medium text-textMuted">Dein Kurs</span>;
  }

  const goBack = () => {
    if (location.key === 'default') {
      navigate('/courses');
      return;
    }
    navigate(-1);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <CourseEnrollmentDialogs
        confirmDialog={confirmDialog}
        unregistering={unregistering}
        handleUnregister={handleUnregister}
        cancelUnregister={cancelUnregister}
        feedbackDialog={feedbackDialog}
        setFeedbackDialog={setFeedbackDialog}
      />

      <button
        type="button"
        onClick={goBack}
        className="inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-textMuted"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden />
        Zurück
      </button>

      <h2 className="mt-4 text-[22px] font-medium text-text">{course.title}</h2>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {status}
        {cancelled ? <span className="text-[13px] font-medium text-textMuted">Abgesagt</span> : null}
        {!upcoming ? (
          <span className="text-[13px] font-medium text-textMuted">Hat bereits begonnen</span>
        ) : null}
      </div>

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

      <div className="sticky bottom-0 z-20 -mx-3 mt-8 flex min-h-11 items-center justify-between gap-3 border-t border-border bg-surface px-3 py-3 sm:-mx-6 sm:px-6">
        <p className="text-[19px] font-medium text-text tabular-nums">{formatPrice(course.price)}</p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canAct ? (
            isRegistered ? (
              <button
                type="button"
                onClick={() => requestUnregister(course)}
                className="inline-flex min-h-11 items-center px-3 text-[15px] font-medium text-danger"
              >
                Abmelden
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleRegister(course.id)}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-medium ${
                  isFull
                    ? 'border border-accent bg-accentSoft text-accentText'
                    : 'bg-brand text-onBrand'
                }`}
              >
                {isFull ? 'Warteliste' : 'Anmelden'}
              </button>
            )
          ) : null}
          {showStaffLinks ? (
            <>
              <Link
                to={`/course/${course.id}/participants`}
                className="inline-flex min-h-11 items-center px-2 text-[15px] font-medium text-brand"
              >
                Teilnehmer
              </Link>
              <Link
                to={`/course/${course.id}/edit`}
                className="inline-flex min-h-11 items-center px-2 text-[15px] font-medium text-brand"
              >
                Bearbeiten
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;
