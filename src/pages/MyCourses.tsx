import React, { useEffect, useState, useRef } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Plus, Edit, Trash2, Eye, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course } from '../types';
import { isCourseManagerRole } from '../lib/userRoles';
import { formatDayLabel, formatPrice, formatTime } from '../lib/format';
import { groupCoursesByDay } from '../lib/courseGrouping';
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

  const dayGroups = groupCoursesByDay(courses);

  return (
    <div className="space-y-6">
      <FeedbackDialog dialog={feedbackDialog} onClose={() => setFeedbackDialog(null)} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium text-text">Kurse verwalten</h1>
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
          <p className="text-sm text-sage-800">{successMessage}</p>
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
        <div className="space-y-8">
          {dayGroups.map((group) => (
            <section key={group.date}>
              <h2 className="mb-2 text-[15px] font-medium text-textMuted">
                {formatDayLabel(group.date)}
              </h2>
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
                {group.courses.map((course) => {
                  const registeredCount = course.registrations?.filter(
                    (r) => r.status === 'registered' && !r.is_waitlist && !r.cancellation_timestamp
                  ).length ?? 0;
                  const waitlistCount = course.registrations?.filter(
                    (r) => r.is_waitlist && !r.cancellation_timestamp
                  ).length ?? 0;
                  const isFull = registeredCount >= (course.max_participants || 0);
                  const remaining = (course.max_participants || 0) - registeredCount;
                  const occupancy = `${registeredCount}/${course.max_participants} Plätze`;
                  const meta = [course.location, occupancy].filter(Boolean).join(' · ');
                  const description = course.description?.trim() ?? '';

                  let occupancyStatus: React.ReactNode = null;
                  if (isFull) {
                    occupancyStatus = (
                      <span className="text-[13px] font-medium text-textMuted">Ausgebucht</span>
                    );
                  } else if (remaining <= 2) {
                    occupancyStatus = (
                      <span className="text-[13px] font-medium text-accent">
                        {remaining === 1 ? 'noch 1 Platz' : `noch ${remaining} Plätze`}
                      </span>
                    );
                  }

                  const waitlistStatus =
                    waitlistCount > 0 ? (
                      <span className="text-[13px] font-medium text-accent">
                        {waitlistCount} auf Warteliste
                      </span>
                    ) : null;

                  const status =
                    occupancyStatus || waitlistStatus ? (
                      <div className="flex items-center gap-2">
                        {occupancyStatus}
                        {waitlistStatus}
                      </div>
                    ) : null;

                  const actions = (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/course/${course.id}/participants`)}
                        className="inline-flex min-h-11 items-center rounded-sm px-2 text-[13px] font-medium text-brand transition-colors hover:text-brandPressed"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        Teilnehmer
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/course/${course.id}/edit`)}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-textSubtle transition-colors hover:text-brandPressed"
                        title="Bearbeiten"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(course.id, course.title, course.series_id ?? null)}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-textSubtle transition-colors hover:text-danger"
                        title="Löschen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );

                  return (
                    <article key={course.id}>
                      <div className="hidden items-center gap-4 px-3.5 py-3 md:flex">
                        <div className="w-[88px] shrink-0 tabular-nums">
                          <div className="text-[17px] font-medium text-text">
                            {formatTime(course.time)}
                          </div>
                          {course.end_time ? (
                            <div className="text-[13px] text-textMuted">
                              {formatTime(course.end_time)}
                            </div>
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[17px] font-medium text-text">{course.title}</h3>
                          {meta ? (
                            <p className="text-[13px] text-textMuted tabular-nums">{meta}</p>
                          ) : null}
                          {description ? (
                            <p className="line-clamp-1 text-[13px] text-textSubtle">{description}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0">{status}</div>
                        <div className="w-20 shrink-0 text-right text-[17px] font-medium text-text tabular-nums">
                          {formatPrice(course.price)}
                        </div>
                        <div className="shrink-0">{actions}</div>
                      </div>

                      <div className="flex gap-3 px-3.5 py-3 md:hidden">
                        <div className="w-14 shrink-0 text-[17px] font-medium text-text tabular-nums">
                          {formatTime(course.time)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <h3 className="min-w-0 truncate text-[17px] font-medium text-text">
                              {course.title}
                            </h3>
                            <span className="shrink-0 text-[17px] font-medium text-text tabular-nums">
                              {formatPrice(course.price)}
                            </span>
                          </div>
                          {meta ? (
                            <p className="text-[13px] text-textMuted tabular-nums">{meta}</p>
                          ) : null}
                          {description ? (
                            <p className="line-clamp-1 text-[13px] text-textSubtle">{description}</p>
                          ) : null}
                          {(status || actions) && (
                            <div className="mt-2 flex items-center justify-end gap-2">
                              {status}
                              {actions}
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
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
                    <h3 className="text-lg font-medium text-text mb-1">
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