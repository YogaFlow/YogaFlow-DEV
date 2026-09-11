import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Check, Plus } from 'lucide-react';
import CourseFilterBar from '../components/courses/CourseFilterBar';
import {
  EMPTY_DATE_FILTER,
  CourseDateFilterState,
  matchesCourseDateFilter,
} from '../lib/courseDateFilter';
import {
  matchesCourseTeacherFilter,
  uniqueTeachersFromCourses,
} from '../lib/courseTeacherFilter';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, Registration } from '../types';
import { isCourseUpcoming } from '../lib/courseDateTime';
import { formatDayLabel, formatPrice, formatTime } from '../lib/format';
import { groupCoursesByDay } from '../lib/courseGrouping';
import { runPastRegistrationCleanup } from '../lib/registrationMaintenance';
import { canSelfEnrollInCourses } from '../lib/userRoles';
import ConfirmDialog, { ConfirmDialogState } from '../components/ui/ConfirmDialog';

const Courses: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, isAdmin, isCourseLeader } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, { registered: number; waitlist: number }>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<CourseDateFilterState>(EMPTY_DATE_FILTER);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [pendingUnregisterCourseId, setPendingUnregisterCourseId] = useState<string | null>(null);
  const [unregistering, setUnregistering] = useState(false);

  const availableTeachers = useMemo(() => uniqueTeachersFromCourses(courses), [courses]);

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

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        await runPastRegistrationCleanup();
        const { data, error } = await supabase
          .from('courses')
          .select(`
            *,
            teacher:users!courses_teacher_id_fkey(first_name, last_name)
          `)
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true })
          .order('time', { ascending: true });

        if (error) throw error;
        if (isMounted) {
          const upcomingCourses = (data || []).filter((course) => isCourseUpcoming(course));
          setCourses(upcomingCourses);

          if (upcomingCourses.length > 0) {
            const courseIds = upcomingCourses.map(c => c.id);
            const { data: countsData, error: countsError } = await supabase.rpc(
              'get_course_participant_counts',
              { p_course_ids: courseIds }
            );

            if (!countsError && countsData && isMounted) {
              const countsMap: Record<string, { registered: number; waitlist: number }> = {};
              countsData.forEach((c: { course_id: string; registered_count: number; waitlist_count: number }) => {
                countsMap[c.course_id] = {
                  registered: c.registered_count,
                  waitlist: c.waitlist_count
                };
              });
              setParticipantCounts(countsMap);
            }
          }
        }

        if (canSelfEnrollInCourses(userProfile)) {
          const { data: regData, error: regError } = await supabase
            .from('registrations')
            .select('course_id, status, is_waitlist, waitlist_position')
            .eq('user_id', userProfile.id)
            .is('cancellation_timestamp', null);

          if (!regError && isMounted) {
            setRegistrations(regData || []);
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [userProfile]);

  useEffect(() => {
    if (selectedTeacherId && !availableTeachers.some((teacher) => teacher.id === selectedTeacherId)) {
      setSelectedTeacherId(null);
    }
  }, [availableTeachers, selectedTeacherId]);

  const fetchCourses = async () => {
    try {
      await runPastRegistrationCleanup();
      const { data, error } = await supabase
        .from('courses')
        .select(`
          *,
          teacher:users!courses_teacher_id_fkey(first_name, last_name)
        `)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true })
        .order('time', { ascending: true });

      if (error) throw error;
      const upcomingCourses = (data || []).filter((course) => isCourseUpcoming(course));
      setCourses(upcomingCourses);

      if (upcomingCourses.length > 0) {
        const courseIds = upcomingCourses.map(c => c.id);
        const { data: countsData, error: countsError } = await supabase.rpc(
          'get_course_participant_counts',
          { p_course_ids: courseIds }
        );

        if (!countsError && countsData) {
          const countsMap: Record<string, { registered: number; waitlist: number }> = {};
          countsData.forEach((c: { course_id: string; registered_count: number; waitlist_count: number }) => {
            countsMap[c.course_id] = {
              registered: c.registered_count,
              waitlist: c.waitlist_count
            };
          });
          setParticipantCounts(countsMap);
        }
      } else {
        setParticipantCounts({});
      }
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoading(false);
    }
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

      fetchCourses();
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

      fetchCourses();
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


  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          course.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDate = matchesCourseDateFilter(course.date, dateFilter);
    const matchesTeacher = matchesCourseTeacherFilter(course.teacher_id, selectedTeacherId);
    return matchesSearch && matchesDate && matchesTeacher && isCourseUpcoming(course);
  });

  const dayGroups = groupCoursesByDay(filteredCourses);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        dialog={confirmDialog}
        loading={unregistering}
        onConfirm={handleUnregister}
        onCancel={cancelUnregister}
      />
      {feedbackDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/45 p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
            <div className="mb-3 flex items-center gap-2">
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${
                  feedbackDialog.type === 'success' ? 'bg-sage-500' : 'bg-danger'
                }`}
                aria-hidden
              />
              <h3 className="text-lg font-medium text-text">{feedbackDialog.title}</h3>
            </div>
            <p className="text-sm leading-6 text-textMuted">{feedbackDialog.message}</p>
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setFeedbackDialog(null)}
                className={`rounded-full px-6 py-2 text-sm font-medium text-onBrand transition-colors ${
                  feedbackDialog.type === 'success'
                    ? 'bg-brand hover:bg-brandPressed'
                    : 'bg-danger hover:bg-danger'
                }`}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {(isAdmin || isCourseLeader) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end">
          <button
            onClick={() => navigate('/create-course')}
            className="inline-flex items-center self-start rounded-sm border border-border px-3 py-2 text-[13px] font-medium text-brand transition-colors hover:bg-surfaceSunken"
          >
            <Plus className="mr-2 h-4 w-4" />
            Neuer Kurs
          </button>
        </div>
      )}

      <CourseFilterBar
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        filterState={dateFilter}
        onFilterChange={setDateFilter}
        teachers={availableTeachers}
        selectedTeacherId={selectedTeacherId}
        onTeacherChange={setSelectedTeacherId}
      />

      {filteredCourses.length === 0 ? (
        <div className="py-12 text-center">
          <Calendar className="mx-auto mb-4 h-16 w-16 text-textSubtle" />
          <h3 className="mb-2 text-lg font-medium text-text">Keine Kurse gefunden</h3>
          <p className="text-textMuted">
            {searchTerm || dateFilter.preset || selectedTeacherId
              ? 'Versuchen Sie andere Suchkriterien.'
              : 'Derzeit sind keine Kurse verfügbar.'}
          </p>
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
                  const registeredCount = participantCounts[course.id]?.registered || 0;
                  const isRegistered = isUserRegistered(course.id);
                  const registrationStatus = getUserRegistrationStatus(course.id);
                  const waitlistPosition = getUserWaitlistPosition(course.id);
                  const isFull = registeredCount >= course.max_participants;
                  const remaining = course.max_participants - registeredCount;
                  const teacherName = course.teacher
                    ? `${course.teacher.first_name} ${course.teacher.last_name}`.trim()
                    : '';
                  const occupancy =
                    isAdmin || isCourseLeader
                      ? `${registeredCount}/${course.max_participants} Plätze`
                      : '';
                  const meta = [teacherName, course.location, occupancy]
                    .filter(Boolean)
                    .join(' · ');
                  const description = course.description?.trim() ?? '';
                  const canAct =
                    course.status === 'active' &&
                    canSelfEnrollInCourses(userProfile) &&
                    course.teacher_id !== userProfile?.id;

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
                      <span className="text-[13px] font-medium text-accent">
                        {waitlistPosition ? `Warteliste Pos. ${waitlistPosition}` : 'Warteliste'}
                      </span>
                    );
                  } else if (isFull) {
                    status = (
                      <span className="text-[13px] font-medium text-textMuted">Ausgebucht</span>
                    );
                  } else if (remaining <= 2) {
                    status = (
                      <span className="text-[13px] font-medium text-accent">
                        {remaining === 1 ? 'noch 1 Platz' : `noch ${remaining} Plätze`}
                      </span>
                    );
                  } else if (course.teacher_id === userProfile?.id) {
                    status = (
                      <span className="text-[13px] font-medium text-textMuted">Dein Kurs</span>
                    );
                  }

                  const action = canAct ? (
                    isRegistered ? (
                      <button
                        type="button"
                        onClick={() => requestUnregister(course)}
                        className="inline-flex min-h-11 items-center rounded-sm px-3 text-[13px] font-medium text-danger transition-colors hover:bg-dangerSoft"
                      >
                        Abmelden
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRegister(course.id)}
                        className={`inline-flex min-h-11 items-center rounded-sm px-3 text-[13px] font-medium transition-colors ${
                          isFull
                            ? 'border border-accent bg-accentSoft text-accent hover:bg-accentSoft'
                            : 'bg-brand text-onBrand hover:bg-brandPressed'
                        }`}
                      >
                        {isFull ? 'Warteliste' : 'Anmelden'}
                      </button>
                    )
                  ) : null;

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
                        <div className="shrink-0">{action}</div>
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
                          {(status || action) && (
                            <div className="mt-2 flex items-center justify-end gap-2">
                              {status}
                              {action}
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
    </div>
  );
};

export default Courses;