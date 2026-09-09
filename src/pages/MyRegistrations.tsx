import React, { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import EnrollmentCards from '../components/courses/EnrollmentCards';
import { useAuth } from '../context/AuthContext';
import { isCourseUpcoming } from '../lib/courseDateTime';
import { runPastRegistrationCleanup } from '../lib/registrationMaintenance';
import { supabase } from '../lib/supabase';
import { canSelfEnrollInCourses } from '../lib/userRoles';
import type { Registration } from '../types';

const MyRegistrations: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const canSelfEnroll = canSelfEnrollInCourses(userProfile);

  useEffect(() => {
    let isMounted = true;

    const loadRegistrations = async () => {
      if (!userProfile || !canSelfEnroll) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setLoadError(false);
        await runPastRegistrationCleanup();

        const { data, error } = await supabase
          .from('registrations')
          .select(
            `
            *,
            course:courses(
              *,
              teacher:users!courses_teacher_id_fkey(first_name, last_name)
            )
          `
          )
          .eq('user_id', userProfile.id)
          .in('status', ['registered', 'waitlist'])
          .is('cancellation_timestamp', null);

        if (error) throw error;
        if (!isMounted) return;

        const futureRegistrations = (data || [])
          .filter(
            (registration: Registration) =>
              registration.course && isCourseUpcoming(registration.course)
          )
          .sort((a: Registration, b: Registration) => {
            const dateA = `${a.course?.date ?? ''}T${a.course?.time ?? ''}`;
            const dateB = `${b.course?.date ?? ''}T${b.course?.time ?? ''}`;
            return dateA.localeCompare(dateB);
          });

        setRegistrations(futureRegistrations);
      } catch (error) {
        console.error('Error loading registrations:', error);
        if (isMounted) setLoadError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadRegistrations();

    return () => {
      isMounted = false;
    };
  }, [userProfile, canSelfEnroll]);

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
      <div>
        <h1 className="text-2xl font-bold text-text">Meine Anmeldungen</h1>
        <p className="text-textMuted">
          Kurse, für die Sie sich selbst als Teilnehmer angemeldet haben.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-danger bg-dangerSoft p-4 text-sm text-danger">
          Ihre Anmeldungen konnten nicht geladen werden. Bitte laden Sie die Seite erneut.
        </div>
      ) : registrations.length === 0 ? (
        <div className="py-12 text-center">
          <Calendar className="mx-auto mb-4 h-16 w-16 text-textSubtle" />
          <h2 className="mb-2 text-lg font-medium text-text">
            Keine Anmeldungen gefunden
          </h2>
          <p className="mb-6 text-textMuted">
            Sie sind noch nicht für einen kommenden Kurs angemeldet.
          </p>
          <button
            type="button"
            onClick={() => navigate('/courses')}
            className="rounded-lg bg-brand px-6 py-3 text-onBrand transition-colors hover:bg-brandPressed"
          >
            Kurse durchsuchen
          </button>
        </div>
      ) : (
        <EnrollmentCards registrations={registrations} />
      )}
    </div>
  );
};

export default MyRegistrations;
