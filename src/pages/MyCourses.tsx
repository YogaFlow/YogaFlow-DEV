import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Calendar, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course } from '../types';
import { isCourseManagerRole } from '../lib/userRoles';
import { formatDayLabel, formatTime } from '../lib/format';
import { groupCoursesByDay } from '../lib/courseGrouping';
import CourseRow from '../components/courses/CourseRow';
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
        <div className="space-y-5">
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
                      <div className="flex flex-wrap items-center gap-2">
                        {occupancyStatus}
                        {waitlistStatus}
                      </div>
                    ) : null;

                  return (
                    <CourseRow
                      key={course.id}
                      course={course}
                      href={`/course/${course.id}`}
                      leading="time"
                      meta={meta}
                      status={status}
                    />
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
