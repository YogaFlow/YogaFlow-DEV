import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Calendar, Users, BookOpen, TrendingUp, Clock, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, Registration } from '../types';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { de } from 'date-fns/locale';
import { isCourseUpcoming } from '../lib/courseDateTime';
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
          if (userProfile.role === 'user') {
            myCoursesCount = myRegistrationsCount;
          }
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

  const getStatCards = (): StatCard[] => {
    if (isTeacher) {
      return [
        {
          title: 'Meine Kurse',
          value: stats.myCourses,
          icon: BookOpen,
          color: 'bg-teal-500',
          path: '/my-courses'
        },
        {
          title: 'Meine Anmeldungen',
          value: stats.myRegistrations,
          icon: Calendar,
          color: 'bg-blue-500',
          path: '/my-courses#anmeldungen'
        },
        {
          title: 'Gesamt Teilnehmer',
          value: stats.totalParticipants,
          icon: Users,
          color: 'bg-green-500',
          path: '/participants'
        }
      ];
    }

    const baseCards: StatCard[] = [
      {
        title: 'Kommende Kurse',
        value: stats.upcomingCourses,
        icon: Calendar,
        color: 'bg-blue-500'
      },
      {
        title: 'Gesamt Teilnehmer',
        value: stats.totalParticipants,
        icon: Users,
        color: 'bg-green-500',
        path: '/participants'
      }
    ];

    if (isCourseLeader && !isParticipantOnly) {
      return [
        {
          title: 'Meine Kurse',
          value: stats.myCourses,
          icon: BookOpen,
          color: 'bg-teal-500',
          path: '/my-courses'
        },
        ...baseCards
      ];
    } else if (isParticipantOnly) {
      return [
        {
          title: 'Meine Anmeldungen',
          value: stats.myCourses,
          icon: BookOpen,
          color: 'bg-teal-500',
          path: '/my-courses'
        },
        {
          title: 'Alle Kurse',
          value: stats.totalCourses,
          icon: Calendar,
          color: 'bg-blue-500',
          path: '/courses'
        }
      ];
    }

    return [
      {
        title: 'Alle Kurse',
        value: stats.totalCourses,
        icon: BookOpen,
        color: 'bg-teal-500',
        path: '/courses'
      },
      ...baseCards,
      {
        title: 'Wachstum',
        value: '+12%',
        icon: TrendingUp,
        color: 'bg-gray-500'
      }
    ];
  };

  const renderCourseCards = (
    items: Array<CourseWithCount | Registration>,
    emptyMessage: string,
    options?: { showRegisteredBadge?: boolean }
  ) => {
    if (items.length === 0) {
      return <p className="text-gray-500 text-center py-8">{emptyMessage}</p>;
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
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold leading-tight text-gray-900">{course.title}</h3>
                    {course.description && (
                      <p className="mt-1 line-clamp-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {course.description}
                      </p>
                    )}
                  </div>
                  {course.price != null && (
                    <span className="shrink-0 text-2xl font-bold text-teal-600">€{course.price}</span>
                  )}
                </div>

                <div className="mt-4 space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2 font-medium text-gray-500">
                    <Calendar className="h-4 w-4 shrink-0" />
                    {formatDate(course.date)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    {course.time}{course.end_time && ` - ${course.end_time}`}
                    {course.duration && ` (${course.duration} Min.)`}
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    {course.location}
                  </div>
                  {(isAdmin || isCourseLeader) && !isRegistration && (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0" />
                      {registrationCount}/{maxParticipants} Teilnehmer
                    </div>
                  )}
                </div>

                {course.teacher && (
                  <div className="mt-5 border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Kursleitung</p>
                    <p className="mt-1 text-sm font-semibold text-gray-700">
                      Lehrer: {course.teacher.first_name} {course.teacher.last_name}
                    </p>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${
                      isFull ? 'bg-red-500' : (remainingSpots <= 2 ? 'bg-yellow-500' : 'bg-green-500')
                    }`} />
                    <span className="text-sm font-medium text-gray-600">
                      {isFull ? 'Leider schon ausgebucht' : (remainingSpots <= 2 ? `noch ${remainingSpots} ${remainingSpots === 1 ? 'Restplatz' : 'Restplätze'}` : 'Verfügbar')}
                    </span>
                  </div>

                  {isRegistered && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-700">
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  const statCards = getStatCards();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">
          Überblick über Ihre Kurse.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const CardContent = () => (
            <div className="flex items-center">
              <div className={`${card.color} p-3 rounded-lg`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          );
          const path = card.path;
          if (path) {
            return (
              <Link
                key={index}
                to={path}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-6 w-full text-left hover:border-teal-300 hover:shadow-md transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 no-underline text-inherit"
              >
                <CardContent />
              </Link>
            );
          }
          return (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <CardContent />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {(isParticipantOnly || isTeacher) && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Meine kommenden Kurse</h2>
              </div>
              <div className="p-6">
                {renderCourseCards(
                  registrations,
                  'Sie sind noch nicht für Kurse angemeldet.',
                  { showRegisteredBadge: true }
                )}
              </div>
            </div>
          )}

          {(isCourseLeader && !isParticipantOnly) && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">
                  {isTeacher ? 'Kurse, die ich gebe' : 'Kommende Kurse'}
                </h2>
              </div>
              <div className="p-6">
                {renderCourseCards(
                  courses,
                  isTeacher
                    ? 'Sie haben noch keine Kurse erstellt.'
                    : 'Keine kommenden Kurse gefunden.'
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Schnellzugriff</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 gap-4">
              {isTeacher && (
                <button
                  onClick={() => navigate('/courses')}
                  className="flex items-center p-4 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors text-left"
                >
                  <Calendar className="w-5 h-5 text-teal-600 mr-3" />
                  <span className="font-medium text-teal-700">Kurse durchsuchen</span>
                </button>
              )}

              {isCourseLeader && (
                <>
                  <button
                    onClick={() => navigate('/create-course')}
                    className="flex items-center p-4 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors text-left"
                  >
                    <BookOpen className="w-5 h-5 text-teal-600 mr-3" />
                    <span className="font-medium text-teal-700">Neuen Kurs erstellen</span>
                  </button>
                  <button
                    onClick={() => navigate('/participants')}
                    className="flex items-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-left"
                  >
                    <Users className="w-5 h-5 text-blue-600 mr-3" />
                    <span className="font-medium text-blue-700">Teilnehmer verwalten</span>
                  </button>
                </>
              )}

              {isParticipantOnly && (
                <>
                  <button
                    onClick={() => navigate('/courses')}
                    className="flex items-center p-4 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors text-left"
                  >
                    <Calendar className="w-5 h-5 text-teal-600 mr-3" />
                    <span className="font-medium text-teal-700">Kurse durchsuchen</span>
                  </button>
                  <button
                    onClick={() => navigate('/my-courses')}
                    className="flex items-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-left"
                  >
                    <BookOpen className="w-5 h-5 text-blue-600 mr-3" />
                    <span className="font-medium text-blue-700">Meine Anmeldungen</span>
                  </button>
                </>
              )}

              {isAdmin && (
                <>
                  <button
                    onClick={() => navigate('/users')}
                    className="flex items-center p-4 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors text-left"
                  >
                    <Users className="w-5 h-5 text-teal-600 mr-3" />
                    <span className="font-medium text-teal-700">Benutzer verwalten</span>
                  </button>
                  <button
                    onClick={() => navigate('/settings')}
                    className="flex items-center p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors text-left"
                  >
                    <TrendingUp className="w-5 h-5 text-gray-600 mr-3" />
                    <span className="font-medium text-gray-700">System-Einstellungen</span>
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
