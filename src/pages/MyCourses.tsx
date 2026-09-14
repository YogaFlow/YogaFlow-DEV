import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Calendar, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course } from '../types';
import { isCourseManagerRole } from '../lib/userRoles';
import { formatDayLabel, formatPrice, formatTime } from '../lib/format';
import { groupCoursesByDay } from '../lib/courseGrouping';
import AccentPill from '../components/ui/AccentPill';
import { isCourseUpcoming } from '../lib/courseDateTime';

const MyCourses: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

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

    return () => {
      isMounted = false;
    };
  }, [userProfile, isCourseManager]);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end">
        <button
          onClick={() => navigate('/create-course')}
          className="bg-brand text-onBrand px-4 py-2 rounded-sm hover:bg-brandPressed transition-colors flex items-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Neuer Kurs
        </button>
      </div>

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
                  const until = formatTime(course.end_time);
                  const meta = [until ? `bis ${until}` : '', course.location, occupancy]
                    .filter(Boolean)
                    .join(' · ');
                  const description = course.description?.trim() ?? '';

                  let occupancyStatus: React.ReactNode = null;
                  if (isFull) {
                    occupancyStatus = (
                      <span className="text-[13px] font-medium text-textMuted">Ausgebucht</span>
                    );
                  } else if (remaining <= 2) {
                    occupancyStatus = (
                      <AccentPill>
                        {remaining === 1 ? 'noch 1 Platz' : `noch ${remaining} Plätze`}
                      </AccentPill>
                    );
                  }

                  const waitlistStatus =
                    waitlistCount > 0 ? (
                      <AccentPill>
                        {waitlistCount} auf Warteliste
                      </AccentPill>
                    ) : null;

                  const status =
                    occupancyStatus || waitlistStatus ? (
                      <div className="flex items-center gap-2">
                        {occupancyStatus}
                        {waitlistStatus}
                      </div>
                    ) : null;

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
                          {status ? (
                            <div className="mt-2 flex items-center justify-end gap-2">
                              {status}
                            </div>
                          ) : null}
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

export default MyCourses;
