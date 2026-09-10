import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Calendar, Users, BookOpen, Clock, MapPin, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, Registration } from '../types';
import { isCourseUpcoming } from '../lib/courseDateTime';
import {
  formatDayLabel,
  formatDuration,
  formatPrice,
  formatTimeRange,
} from '../lib/format';
import { runPastRegistrationCleanup } from '../lib/registrationMaintenance';
import { fetchCourseParticipantCounts } from '../lib/courseParticipantCounts';
import { isParticipantOnlyRole, isTeacherOnly } from '../lib/userRoles';

type StatCard = {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  path?: string;
};

type CourseWithCount = Course & { registrationCount?: number };

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, isAdmin, isCourseLeader } = useAuth();
  const [courses, setCourses] = useState<CourseWithCount[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats, setStats] = useState({
    totalCourses: 0,
    upcomingCourses: 0,
    totalParticipants: 0,
    myCourses: 0,
    myRegistrations: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const attachCounts = async (courseList: Course[]): Promise<CourseWithCount[]> => {
      const counts = await fetchCourseParticipantCounts(courseList.map((course) => course.id));
      return courseList.map((course) => ({
        ...course,
        registrationCount: counts[course.id]?.registered ?? 0,
      }));
    };

    const fetchDashboardData = async () => {
      if (!userProfile) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        await runPastRegistrationCleanup();

        if (userProfile.role !== 'user') {
          let coursesQuery = supabase
            .from('courses')
            .select(`
              *,
              teacher:users!courses_teacher_id_fkey(first_name, last_name)
            `)
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date', { ascending: true })
            .order('time', { ascending: true });

          if (userProfile.role === 'teacher') {
            coursesQuery = coursesQuery.eq('teacher_id', userProfile.id);
          }

          const { data: coursesData, error: coursesError } = await coursesQuery.limit(20);

          if (coursesError) throw coursesError;
          if (!isMounted) return;

          const visibleCourses = (coursesData || []).filter((course) => isCourseUpcoming(course)).slice(0, 5);
          setCourses(await attachCounts(visibleCourses));
        } else if (isMounted) {
          setCourses([]);
        }

        if (userProfile.role === 'user' || userProfile.role === 'teacher') {
          const { data: regData, error: regError } = await supabase
            .from('registrations')
            .select(`
              *,
              course:courses(
                *,
                teacher:users!courses_teacher_id_fkey(first_name, last_name)
              )
            `)
            .eq('user_id', userProfile.id)
            .eq('status', 'registered')
            .is('cancellation_timestamp', null);

          if (regError) throw regError;
          if (!isMounted) return;

          const futureRegistrations = (regData || []).filter(
            (registration) => registration.course && isCourseUpcoming(registration.course)
          );

          const countedCourses = await attachCounts(
            futureRegistrations
              .map((registration) => registration.course)
              .filter((course): course is Course => Boolean(course))
          );
          const countsById = Object.fromEntries(
            countedCourses.map((course) => [course.id, course.registrationCount ?? 0])
          );

          if (!isMounted) return;
          const registrationsWithCounts = futureRegistrations.map((registration) => ({
            ...registration,
            course: registration.course
              ? { ...registration.course, registrationCount: countsById[registration.course.id] ?? 0 }
              : registration.course,
          }));

          const sortedRegistrations = registrationsWithCounts.sort((a, b) => {
            const dateA = a.course?.date ?? '';
            const dateB = b.course?.date ?? '';
            return dateA.localeCompare(dateB);
          });
          setRegistrations(sortedRegistrations);
        } else if (isMounted) {
          setRegistrations([]);
        }

        await fetchStats();
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const fetchStats = async () => {
      if (!userProfile || !isMounted) return;

      try {
        const today = new Date().toISOString().split('T')[0];
        const { data: upcomingCoursesData } = await supabase
          .from('courses')
          .select('id, date, time, teacher_id')
          .gte('date', today);

        const upcomingCourses = (upcomingCoursesData || []).filter((course) =>
          isCourseUpcoming(course)
        );
        const upcomingCourseIds = upcomingCourses.map((course) => course.id);

        const totalCoursesCount = upcomingCourseIds.length;
        const upcomingCoursesCount = totalCoursesCount;

        const participantCourseIds =
          userProfile.role === 'teacher'
            ? upcomingCourses
                .filter((course) => course.teacher_id === userProfile.id)
                .map((course) => course.id)
            : upcomingCourseIds;

        let totalParticipantsCount = 0;
        if (participantCourseIds.length > 0) {
          const { count } = await supabase
            .from('registrations')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'registered')
            .is('cancellation_timestamp', null)
            .in('course_id', participantCourseIds);
          totalParticipantsCount = count || 0;
        }

        let myCoursesCount = 0;
        let myRegistrationsCount = 0;

        if (userProfile.role !== 'user') {
          const { data } = await supabase
            .from('courses')
            .select('id, date, time')
            .eq('teacher_id', userProfile.id)
            .gte('date', today);
          myCoursesCount = (data || []).filter((course) => isCourseUpcoming(course)).length;
        }

        if (userProfile.role === 'user' || userProfile.role === 'teacher') {
          const { data } = await supabase
            .from('registrations')
            .select(`
              course:courses(id, date, time)
            `)
            .eq('user_id', userProfile.id)
            .in('status', ['registered', 'waitlist'])
            .is('cancellation_timestamp', null);
          myRegistrationsCount = (data || []).filter((item: any) => item.course && isCourseUpcoming(item.course)).length;
        }

        if (!isMounted) return;
        setStats({
          totalCourses: totalCoursesCount,
          upcomingCourses: upcomingCoursesCount,
          totalParticipants: totalParticipantsCount,
          myCourses: myCoursesCount,
          myRegistrations: myRegistrationsCount,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchDashboardData();

    return () => {
      isMounted = false;
    };
  }, [userProfile]);

  const isParticipantOnly = isParticipantOnlyRole(userProfile);
  const isTeacher = isTeacherOnly(userProfile);


  const getStatCards = (): StatCard[] => {
    if (isTeacher) {
      return [
        {
          title: 'Kurse verwalten',
          value: stats.myCourses,
          icon: BookOpen,
          color: 'bg-sage-500',
          path: '/my-courses'
        },
        {
          title: 'Meine Anmeldungen',
          value: stats.myRegistrations,
          icon: Calendar,
          color: 'bg-sage-500',
          path: '/my-registrations'
        },
        {
          title: 'Gesamt Teilnehmer',
          value: stats.totalParticipants,
          icon: Users,
          color: 'bg-sage-500',
          path: '/participants'
        }
      ];
    }

    const baseCards: StatCard[] = [
      {
        title: 'Kommende Kurse',
        value: stats.upcomingCourses,
        icon: Calendar,
        color: 'bg-sage-500'
      },
      {
        title: 'Gesamt Teilnehmer',
        value: stats.totalParticipants,
        icon: Users,
        color: 'bg-sage-500',
        path: '/participants'
      }
    ];

    if (isCourseLeader && !isParticipantOnly) {
      return [
        {
          title: 'Kurse verwalten',
          value: stats.myCourses,
          icon: BookOpen,
          color: 'bg-sage-500',
          path: '/my-courses'
        },
        ...baseCards
      ];
    } else if (isParticipantOnly) {
      return [
        {
          title: 'Meine Anmeldungen',
          value: stats.myRegistrations,
          icon: BookOpen,
          color: 'bg-sage-500',
          path: '/my-registrations'
        },
        {
          title: 'Alle Kurse',
          value: stats.totalCourses,
          icon: Calendar,
          color: 'bg-sage-500',
          path: '/courses'
        }
      ];
    }

    return [
      {
        title: 'Alle Kurse',
        value: stats.totalCourses,
        icon: BookOpen,
        color: 'bg-sage-500',
        path: '/courses'
      },
      ...baseCards
    ];
  };

  const renderCourseCards = (
    items: Array<CourseWithCount | Registration>,
    emptyMessage: string,
    options?: { showRegisteredBadge?: boolean }
  ) => {
    if (items.length === 0) {
      return <p className="text-textMuted text-center py-8">{emptyMessage}</p>;
    }

    return (
      <div className="space-y-4">
        {items.map((item, index) => {
          const isRegistration = 'course' in item;
          const course = (isRegistration ? item.course : item) as CourseWithCount | undefined;
          if (!course) return null;

          const registrationCount = course.registrationCount || 0;
          const maxParticipants = course.max_participants || 0;
          const remainingSpots = Math.max(0, maxParticipants - registrationCount);
          const isFull = remainingSpots === 0;
          const isRegistered = Boolean(options?.showRegisteredBadge && isRegistration && item.status === 'registered');

          return (
            <div
              key={course.id || index}
              className="overflow-hidden rounded-md border border-border bg-surface"
            >
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold leading-tight text-text">{course.title}</h3>
                    {course.description && (
                      <p className="mt-1 line-clamp-1 text-xs font-semibold text-textSubtle">
                        {course.description}
                      </p>
                    )}
                  </div>
                  {course.price != null && (
                    <span className="shrink-0 text-2xl font-bold text-brand tabular-nums">{formatPrice(course.price)}</span>
                  )}
                </div>

                <div className="mt-4 space-y-2 text-sm text-textMuted">
                  <div className="flex items-center gap-2 font-medium text-textMuted">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span className="tabular-nums">{formatDayLabel(course.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span className="tabular-nums">
                      {formatTimeRange(course.time, course.end_time)}
                      {course.duration != null ? ` (${formatDuration(course.duration)})` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {course.location}
                  </div>
                  {(isAdmin || isCourseLeader) && !isRegistration && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0" />
                      <span className="tabular-nums">{registrationCount}/{maxParticipants}</span> Teilnehmer
                    </div>
                  )}
                </div>

                {course.teacher && (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="text-xs font-semibold text-textSubtle">Kursleitung</p>
                    <p className="mt-1 text-sm font-semibold text-textMuted">
                      Lehrer: {course.teacher.first_name} {course.teacher.last_name}
                    </p>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <div className={`flex items-center gap-2 ${
                    isFull
                      ? 'rounded-sm bg-surfaceSunken px-3 py-1 text-textMuted'
                      : remainingSpots <= 2
                        ? 'rounded-sm bg-accentSoft px-3 py-1 text-accent'
                        : ''
                  }`}>
                    <div className={`h-2.5 w-2.5 rounded-full ${
                      isFull ? 'bg-textMuted' : (remainingSpots <= 2 ? 'bg-accent' : 'bg-sage-500')
                    }`} />
                    <span className={`text-sm font-medium ${
                      isFull ? 'text-textMuted' : (remainingSpots <= 2 ? 'text-accent' : 'text-textMuted')
                    }`}>
                      {isFull ? 'Leider schon ausgebucht' : (remainingSpots <= 2 ? `noch ${remainingSpots} ${remainingSpots === 1 ? 'Restplatz' : 'Restplätze'}` : 'Verfügbar')}
                    </span>
                  </div>

                  {isRegistered && (
                    <span className="inline-flex items-center rounded-full bg-sage-100 px-3 py-1 text-xs font-semibold text-sage-800">
                      Angemeldet
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  const statCards = getStatCards();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text">Dashboard</h1>
        <p className="text-textMuted">
          Überblick über Ihre Kurse.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const CardContent = () => (
            <div className="flex items-center">
              <div className={`${card.color} p-3 rounded-sm`}>
                <card.icon className="w-6 h-6 text-onBrand" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-textMuted">{card.title}</p>
                <p className="text-2xl font-bold text-text">{card.value}</p>
              </div>
            </div>
          );
          const path = card.path;
          if (path) {
            return (
              <Link
                key={index}
                to={path}
                className="block bg-surface rounded-md border border-border p-3.5 w-full text-left hover:border-sage-200 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 no-underline text-inherit"
              >
                <CardContent />
              </Link>
            );
          }
          return (
            <div key={index} className="bg-surface rounded-md border border-border p-3.5">
              <CardContent />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {(isCourseLeader && !isParticipantOnly) && (
            <div className="bg-surface rounded-md border border-border">
              <div className="p-3.5 border-b border-border">
                <h2 className="text-lg font-semibold text-text">
                  {isTeacher ? 'Kurse, die ich gebe' : 'Kommende Kurse'}
                </h2>
              </div>
              <div className="p-3.5">
                {renderCourseCards(
                  courses,
                  isTeacher
                    ? 'Sie haben noch keine Kurse erstellt.'
                    : 'Keine kommenden Kurse gefunden.'
                )}
              </div>
            </div>
          )}

          {(isParticipantOnly || isTeacher) && (
            <div className="bg-surface rounded-md border border-border">
              <div className="p-3.5 border-b border-border">
                <h2 className="text-lg font-semibold text-text">Meine kommenden Kurse</h2>
              </div>
              <div className="p-3.5">
                {renderCourseCards(
                  registrations,
                  'Sie sind noch nicht für Kurse angemeldet.',
                  { showRegisteredBadge: true }
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-surface rounded-md border border-border">
          <div className="p-3.5 border-b border-border">
            <h2 className="text-lg font-semibold text-text">Schnellzugriff</h2>
          </div>
          <div className="p-3.5">
            <div className="grid grid-cols-1 gap-4">
              {isTeacher && (
                <button
                  onClick={() => navigate('/courses')}
                  className="flex items-center p-3.5 bg-sage-100 hover:bg-sage-100 rounded-md transition-colors text-left"
                >
                  <Calendar className="w-5 h-5 text-brand mr-3" />
                  <span className="font-medium text-brand">Kurse durchsuchen</span>
                </button>
              )}

              {isCourseLeader && (
                <>
                  <button
                    onClick={() => navigate('/create-course')}
                    className="flex items-center p-3.5 bg-sage-100 hover:bg-sage-100 rounded-md transition-colors text-left"
                  >
                    <BookOpen className="w-5 h-5 text-brand mr-3" />
                    <span className="font-medium text-brand">Neuen Kurs erstellen</span>
                  </button>
                  <button
                    onClick={() => navigate('/participants')}
                    className="flex items-center p-3.5 bg-sage-100 hover:bg-sage-100 rounded-md transition-colors text-left"
                  >
                    <Users className="w-5 h-5 text-brand mr-3" />
                    <span className="font-medium text-brand">Teilnehmer verwalten</span>
                  </button>
                </>
              )}

              {isParticipantOnly && (
                <>
                  <button
                    onClick={() => navigate('/courses')}
                    className="flex items-center p-3.5 bg-sage-100 hover:bg-sage-100 rounded-md transition-colors text-left"
                  >
                    <Calendar className="w-5 h-5 text-brand mr-3" />
                    <span className="font-medium text-brand">Kurse durchsuchen</span>
                  </button>
                  <button
                    onClick={() => navigate('/my-registrations')}
                    className="flex items-center p-3.5 bg-sage-100 hover:bg-sage-100 rounded-md transition-colors text-left"
                  >
                    <BookOpen className="w-5 h-5 text-brand mr-3" />
                    <span className="font-medium text-brand">Meine Anmeldungen</span>
                  </button>
                </>
              )}

              {isAdmin && (
                <>
                  <button
                    onClick={() => navigate('/users')}
                    className="flex items-center p-3.5 bg-sage-100 hover:bg-sage-100 rounded-md transition-colors text-left"
                  >
                    <Users className="w-5 h-5 text-brand mr-3" />
                    <span className="font-medium text-brand">Benutzer verwalten</span>
                  </button>
                  <button
                    onClick={() => navigate('/settings')}
                    className="flex items-center p-3.5 bg-surfaceSunken hover:bg-surfaceSunken rounded-md transition-colors text-left"
                  >
                    <Settings className="w-5 h-5 text-textMuted mr-3" />
                    <span className="font-medium text-textMuted">System-Einstellungen</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
