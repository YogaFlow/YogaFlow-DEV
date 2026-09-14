import { useState } from 'react';
import { ConfirmDialogState } from '../components/ui/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { Course, Registration } from '../types';
import { supabase } from './supabase';

export type EnrollmentFeedbackDialog = {
  title: string;
  message: string;
  type: 'success' | 'error';
};

export function useCourseEnrollment(onAfterSuccess: () => void) {
  const { userProfile } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [feedbackDialog, setFeedbackDialog] = useState<EnrollmentFeedbackDialog | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [pendingUnregisterCourseId, setPendingUnregisterCourseId] = useState<string | null>(null);
  const [unregistering, setUnregistering] = useState(false);

  const showFeedbackDialog = (
    message: string,
    type: 'success' | 'error' = 'success',
    title?: string
  ) => {
    setFeedbackDialog({
      title: title || (type === 'success' ? 'Erfolg' : 'Hinweis'),
      message,
      type,
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
        .select('course_id, status, is_waitlist, waitlist_position')
        .eq('user_id', userProfile.id)
        .is('cancellation_timestamp', null);

      if (error) throw error;
      setRegistrations(data || []);
    } catch (error) {
      console.error('Error fetching registrations:', error);
    }
  };

  const handleRegister = async (courseId: string) => {
    if (!userProfile) return;

    try {
      const { data, error } = await supabase.rpc('register_for_course', {
        p_course_id: courseId,
      });

      if (error) throw error;

      if (data && !data.success) {
        const d = data as { message?: string; error?: string };
        showFeedbackDialog(
          d.message || d.error || 'Fehler bei der Anmeldung.',
          'error',
          'Anmeldung nicht moeglich'
        );
        return;
      }

      onAfterSuccess();
      fetchUserRegistrations();

      if (data.waitlist_position) {
        showFeedbackDialog(
          `Sie wurden auf die Warteliste gesetzt (Position ${data.waitlist_position}). Sie werden benachrichtigt, wenn ein Platz frei wird.`,
          'success',
          'Warteliste'
        );
      } else {
        showFeedbackDialog(data.message || 'Erfolgreich angemeldet.', 'success', 'Anmeldung erfolgreich');
      }
    } catch (error) {
      console.error('Error registering for course:', error);
      try {
        console.error('Error registering for course (serialized):', JSON.stringify(error, null, 2));
      } catch {
        // Ignore serialization issues (e.g. circular refs)
      }
      showFeedbackDialog(
        getSupabaseErrorMessage(error, 'Fehler bei der Anmeldung. Bitte versuchen Sie es erneut.'),
        'error',
        'Anmeldung fehlgeschlagen'
      );
    }
  };

  const requestUnregister = (course: Course) => {
    setPendingUnregisterCourseId(course.id);
    setConfirmDialog({
      title: 'Vom Kurs abmelden?',
      message: `Möchten Sie sich vom Kurs „${course.title}“ abmelden? Der Platz wird wieder frei.`,
      confirmLabel: 'Abmelden',
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
          'Abmeldung nicht moeglich'
        );
        return;
      }

      onAfterSuccess();
      fetchUserRegistrations();

      showFeedbackDialog(data.message || 'Erfolgreich abgemeldet.', 'success', 'Abmeldung erfolgreich');
    } catch (error) {
      console.error('Error unregistering from course:', error);
      try {
        console.error('Error unregistering from course (serialized):', JSON.stringify(error, null, 2));
      } catch {
        // Ignore serialization issues (e.g. circular refs)
      }
      showFeedbackDialog(
        getSupabaseErrorMessage(error, 'Fehler bei der Abmeldung. Bitte versuchen Sie es erneut.'),
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

  return {
    setRegistrations,
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
  };
}
