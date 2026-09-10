import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Clock, MapPin, Users, Plus, Edit, Trash2, Eye, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course } from '../types';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { de } from 'date-fns/locale';
import { isCourseManagerRole } from '../lib/userRoles';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import { isCourseUpcoming } from '../lib/courseDateTime';

const MyCourses: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userProfile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<{ id: string; title: string; series_id: string | null } | null>(null);
  const [seriesCount, setSeriesCount] = useState(0);
  const [deleteScope, setDeleteScope] = useState<'single' | 'series'>('single');
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<FeedbackDialogState | null>(null);

  const isCourseManager = isCourseManagerRole(userProfile);

  useEffect(() => {
    let isMounted = true;

    const fetchMyCourses = async () => {
      if (!userProfile || !isCourseManager) return;

      const { data, error } = await supabase
        .from('courses')
        .select(`
          *,
          teacher:users!courses_teacher_id_fkey(first_name, last_name),
          registrations:registrations(user_id, status, is_waitlist, cancellation_timestamp)
        `)
        .eq('teacher_id', userProfile.id)
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;
      if (isMounted) {
        setCourses((data || []).filter((course) => isCourseUpcoming(course)));
      }
    };

    const loadPage = async () => {
      if (!userProfile) return;
      try {
        setLoading(true);
        if (isCourseManager) {
          await fetchMyCourses();
        }
      } catch (error) {
        console.error('Error loading my courses:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (userProfile) {
      loadPage();
    }

    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => setSuccessMessage(''), 5000);
    }

    return () => {
      isMounted = false;
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, [userProfile, location.state, isCourseManager]);

  const handleDeleteClick = async (courseId: string, courseTitle: string, seriesId: string | null) => {
    if (!seriesId) {
      if (!confirm(`Möchten Sie den Kurs "${courseTitle}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
        return;
      }
      await deleteCourse(courseId, 'single');
      return;
    }

    try {
      const { count } = await supabase
        .from('courses')
        .select('*', { count: 'exact', head: true })
        .eq('series_id', seriesId);

      setSeriesCount(count || 0);
      setCourseToDelete({ id: courseId, title: courseTitle, series_id: seriesId });
      setDeleteScope('single');
      setDeleteDialogOpen(true);
    } catch (error) {
      console.error('Error checking series:', error);
      setFeedbackDialog({
        title: 'Fehler',
        message: 'Fehler beim Überpruefen der Serie. Bitte versuchen Sie es erneut.',
        type: 'error',
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!courseToDelete) return;

    await deleteCourse(courseToDelete.id, deleteScope);
    setDeleteDialogOpen(false);
    setCourseToDelete(null);
  };

  const deleteCourse = async (courseId: string, scope: 'single' | 'series') => {
    try {
      if (scope === 'series' && courseToDelete?.series_id) {
        const { error } = await supabase
          .from('courses')
          .delete()
          .eq('series_id', courseToDelete.series_id);

        if (error) throw error;

        setCourses(courses.filter(course => course.series_id !== courseToDelete.series_id));
        setSuccessMessage(`Alle ${seriesCount} Kurse der Serie wurden erfolgreich gelöscht!`);
      } else {
        const { error } = await supabase
          .from('courses')
          .delete()
          .eq('id', courseId);

        if (error) throw error;

        setCourses(courses.filter(course => course.id !== courseId));
        setSuccessMessage('Kurs erfolgreich gelöscht!');
      }

      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => setSuccessMessage(''), 5000);
    } catch (error) {
      console.error('Error deleting course:', error);
      setFeedbackDialog({
        title: 'Loeschen fehlgeschlagen',
        message: 'Fehler beim Loeschen des Kurses. Bitte versuchen Sie es erneut.',
        type: 'error',
      });
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      if (isToday(date)) {
        return 'Heute';
      } else if (isTomorrow(date)) {
        return 'Morgen';
      }
      return format(date, 'dd.MM.yyyy', { locale: de });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  if (!isCourseManager) {
    return <Navigate to="/my-registrations" replace />;
  }

  return (
    <div className="space-y-6">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Kurse verwalten</h1>
          <p className="text-textMuted">Kurse, die Sie selbst unterrichten.</p>
        </div>
        
        <button
          onClick={() => navigate('/create-course')}
          className="mt-4 sm:mt-0 bg-brand text-onBrand px-4 py-2 rounded-sm hover:bg-brandPressed transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Neuer Kurs
        </button>
      </div>

      {successMessage && (
        <div className="p-4 bg-sage-100 border border-sage-200 rounded-sm">
          <p className="text-sm text-brand">{successMessage}</p>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-16 h-16 text-textSubtle mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text mb-2">Keine Kurse gefunden</h3>
          <p className="text-textMuted mb-6">Sie haben noch keine Kurse erstellt.</p>
          <button
            onClick={() => navigate('/create-course')}
            className="bg-brand text-onBrand px-6 py-3 rounded-sm hover:bg-brandPressed transition-colors flex items-center mx-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ersten Kurs erstellen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => {
            const registeredCount = course.registrations?.filter(
              (r) => r.status === 'registered' && !r.is_waitlist && !r.cancellation_timestamp
            ).length ?? 0;
            const waitlistCount = course.registrations?.filter(
              (r) => r.is_waitlist && !r.cancellation_timestamp
            ).length ?? 0;
            const isFull = registeredCount >= (course.max_participants || 0);
            return (
              <div key={course.id} className="bg-surface rounded-md border border-border overflow-hidden">
                <div className="p-3.5">
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-lg font-semibold text-text line-clamp-2">{course.title}</h3>
                    <span className="text-xl font-bold text-brand">€{course.price}</span>
                  </div>
                  
                  <p className="text-textMuted text-sm mb-4 line-clamp-3">{course.description}</p>
                  
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-textMuted">
                      <Calendar className="w-4 h-4 mr-2" />
                      {formatDate(course.date)}
                    </div>
                    <div className="flex items-center text-sm text-textMuted">
                      <Clock className="w-4 h-4 mr-2" />
                      {course.time}{course.end_time && ` - ${course.end_time}`}
                      {course.duration && ` (${course.duration} Min.)`}
                    </div>
                    <div className="flex items-center text-sm text-textMuted">
                      <MapPin className="w-4 h-4 mr-2" />
                      {course.location}
                    </div>
                    <div className="flex items-center text-sm text-textMuted">
                      <Users className="w-4 h-4 mr-2" />
                      {registeredCount}/{course.max_participants} Teilnehmer
                      {waitlistCount > 0 && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-accentSoft text-accent rounded-full">
                          +{waitlistCount} Wartend
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className={`flex items-center ${
                      isFull
                        ? 'rounded-sm bg-surfaceSunken px-3 py-1'
                        : course.max_participants - registeredCount <= 2
                          ? 'rounded-sm bg-accentSoft px-3 py-1'
                          : ''
                    }`}>
                      <div className={`w-3 h-3 rounded-full mr-2 ${
                        isFull ? 'bg-textMuted' : (course.max_participants - registeredCount <= 2 ? 'bg-accent' : 'bg-sage-500')
                      }`}></div>
                      <span className={`text-xs ${
                        isFull
                          ? 'text-textMuted'
                          : course.max_participants - registeredCount <= 2
                            ? 'text-accent'
                            : 'text-textMuted'
                      }`}>
                        {isFull ? 'Leider schon ausgebucht' : (course.max_participants - registeredCount <= 2 ? `noch ${course.max_participants - registeredCount} ${course.max_participants - registeredCount === 1 ? 'Restplatz' : 'Restplätze'}` : 'Verfügbar')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <button
                      onClick={() => navigate(`/course/${course.id}/participants`)}
                      className="flex items-center text-brand hover:text-brandPressed text-sm"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Teilnehmer
                    </button>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => navigate(`/course/${course.id}/edit`)}
                        className="p-2 text-textSubtle hover:text-brandPressed transition-colors"
                        title="Bearbeiten"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteClick(course.id, course.title, course.series_id ?? null)}
                        className="p-2 text-textSubtle hover:text-danger transition-colors"
                        title="Löschen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deleteDialogOpen && courseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/50">
          <div className="bg-surface rounded-lg border border-border shadow-lg max-w-lg w-full mx-4">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start">
                  <AlertCircle className="w-6 h-6 text-danger mr-3 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold text-text mb-1">
                      Kurs löschen
                    </h3>
                    <p className="text-sm text-textMuted">
                      {courseToDelete.title}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteDialogOpen(false)}
                  className="text-textSubtle hover:text-textMuted"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {seriesCount > 1 ? (
                <div className="space-y-4">
                  <div className="p-4 bg-accentSoft border border-accent rounded-sm">
                    <p className="text-sm text-text">
                      Dieser Kurs ist Teil einer Serie mit {seriesCount} Terminen.
                      Möchten Sie nur diesen Termin oder alle Termine der Serie löschen?
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-start p-3.5 border border-border rounded-md cursor-pointer hover:bg-surfaceSunken transition-colors">
                      <input
                        type="radio"
                        value="single"
                        checked={deleteScope === 'single'}
                        onChange={(e) => setDeleteScope(e.target.value as 'single' | 'series')}
                        className="w-4 h-4 text-danger border-border focus:ring-danger mt-0.5"
                      />
                      <div className="ml-3">
                        <span className="block text-sm font-medium text-text">
                          Nur diesen Termin löschen
                        </span>
                        <span className="block text-sm text-textMuted mt-1">
                          Die anderen Termine der Serie bleiben bestehen.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start p-3.5 border border-border rounded-md cursor-pointer hover:bg-surfaceSunken transition-colors">
                      <input
                        type="radio"
                        value="series"
                        checked={deleteScope === 'series'}
                        onChange={(e) => setDeleteScope(e.target.value as 'single' | 'series')}
                        className="w-4 h-4 text-danger border-border focus:ring-danger mt-0.5"
                      />
                      <div className="ml-3">
                        <span className="block text-sm font-medium text-text">
                          Alle {seriesCount} Termine der Serie löschen
                        </span>
                        <span className="block text-sm text-textMuted mt-1">
                          Alle Termine dieser Serie werden unwiderruflich gelöscht.
                        </span>
                      </div>
                    </label>
                  </div>

                  <div className="p-4 bg-dangerSoft border border-danger rounded-sm">
                    <p className="text-sm text-danger font-medium">
                      Diese Aktion kann nicht rückgängig gemacht werden!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-textMuted">
                    Möchten Sie diesen Kurs wirklich löschen?
                  </p>
                  <div className="p-4 bg-dangerSoft border border-danger rounded-sm">
                    <p className="text-sm text-danger font-medium">
                      Diese Aktion kann nicht rückgängig gemacht werden!
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-border">
                <button
                  onClick={() => setDeleteDialogOpen(false)}
                  className="px-4 py-2 text-textMuted bg-surfaceSunken hover:bg-borderStrong rounded-sm transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 text-danger rounded-sm hover:bg-dangerSoft transition-colors"
                >
                  {deleteScope === 'series' && seriesCount > 1
                    ? `Alle ${seriesCount} Termine löschen`
                    : 'Kurs löschen'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyCourses;