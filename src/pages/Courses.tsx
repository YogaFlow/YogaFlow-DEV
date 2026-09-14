import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { Course } from '../types';
import { isCourseUpcoming } from '../lib/courseDateTime';
import { formatDayLabel, formatPrice, formatTime } from '../lib/format';
import { groupCoursesByDay } from '../lib/courseGrouping';
import { runPastRegistrationCleanup } from '../lib/registrationMaintenance';
import { canSelfEnrollInCourses } from '../lib/userRoles';
import { useCourseEnrollment } from '../lib/useCourseEnrollment';
import AccentPill from '../components/ui/AccentPill';

const Courses: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, isAdmin, isCourseLeader } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, { registered: number; waitlist: number }>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<CourseDateFilterState>(EMPTY_DATE_FILTER);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

  const availableTeachers = useMemo(() => uniqueTeachersFromCourses(courses), [courses]);

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

  const {
    setRegistrations,
    isUserRegistered,
    getUserRegistrationStatus,
    getUserWaitlistPosition,
  } = useCourseEnrollment(fetchCourses);

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
                  const until = formatTime(course.end_time);
                  const meta = [until ? `bis ${until}` : '', teacherName, course.location, occupancy]
                    .filter(Boolean)
                    .join(' · ');
                  const description = course.description?.trim() ?? '';

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
                    status = (
                      <span className="text-[13px] font-medium text-textMuted">Ausgebucht</span>
                    );
                  } else if (remaining <= 2) {
                    status = (
                      <AccentPill>
                        {remaining === 1 ? 'noch 1 Platz' : `noch ${remaining} Plätze`}
                      </AccentPill>
                    );
                  } else if (course.teacher_id === userProfile?.id) {
                    status = (
                      <span className="text-[13px] font-medium text-textMuted">Dein Kurs</span>
                    );
                  }

                  return (
                    <article key={course.id} className="relative">
                      <div className="hidden items-start gap-3 px-3.5 py-3 md:flex">
                        <div className="shrink-0 rounded-sm bg-brandSoft px-2 py-1 text-[15px] font-medium leading-tight text-brandOnSoft tabular-nums">
                          {formatTime(course.time)}
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
                      </div>

                      <div className="flex items-start gap-3 px-3.5 py-3 md:hidden">
                        <div className="shrink-0 rounded-sm bg-brandSoft px-2 py-1 text-[15px] font-medium leading-tight text-brandOnSoft tabular-nums">
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
                          {status ? <div className="mt-2 flex items-center justify-end">{status}</div> : null}
                        </div>
                      </div>
                      <Link
                        to={`/course/${course.id}`}
                        className="absolute inset-0 z-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                      >
                        <span className="sr-only">{course.title}</span>
                      </Link>
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
