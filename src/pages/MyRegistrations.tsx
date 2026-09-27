import React, { useCallback, useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import EnrollmentCards from '../components/courses/EnrollmentCards';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import { useAuth } from '../context/AuthContext';
import { isCourseUpcoming, isRegistrationVisible } from '../lib/courseDateTime';
import { fetchMemberPasses, type MemberPassSummary } from '../lib/passes';
import { supabase } from '../lib/supabase';
import { withCourseTeachers } from '../lib/staffNames';
import { canSelfEnrollInCourses } from '../lib/userRoles';
import type { Course, Registration } from '../types';

const MyRegistrations: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [ownPasses, setOwnPasses] = useState<MemberPassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackDialogState | null>(null);

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
            'cancel_reason.eq.course_cancelled,and(status.in.(registered,waitlist),cancellation_timestamp.is.null)',
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

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

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
        />
      )}
    </div>
  );
};

export default MyRegistrations;
