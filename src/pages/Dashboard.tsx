import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, BookOpen, TrendingUp, Clock, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, Registration } from '../types';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { de } from 'date-fns/locale';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, isAdmin, isCourseLeader } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats, setStats] = useState({
    totalCourses: 0,
    upcomingCourses: 0,
    totalParticipants: 0,
    myCourses: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchDashboardData = async () => {
      if (!userProfile) return;

      try {
        let coursesQuery = supabase
          .from('courses')
          .select(`
            *,
            teacher:users!courses_teacher_id_fkey(first_name, last_name)
          `)
          .gte('date', new Date().toISOString().split('T')[0])
          .order('date', { ascending: true })
          .order('time', { ascending: true });

        if (userProfile.roles?.includes('course_leader') && !userProfile.roles?.includes('admin')) {
          coursesQuery = coursesQuery.eq('teacher_id', userProfile.id);
        }

        const { data: coursesData, error: coursesError } = await coursesQuery.limit(5);

        if (coursesError) throw coursesError;
        if (!isMounted) return;

        const coursesWithCounts = await Promise.all(
          (coursesData || []).map(async (course) => {
            try {
              const { count } = await supabase
                .from('registrations')
                .select('*', { count: 'exact', head: true })
                .eq('course_id', course.id)
                .eq('status', 'registered');
              return { ...course, registrationCount: count || 0 };
            } catch {
              return { ...course, registrationCount: 0 };
            }
          })
        );

        if (!isMounted) return;
        setCourses(coursesWithCounts);

        if (userProfile.roles?.includes('participant')) {
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
            .eq('status', 'registered');

          if (regError) throw regError;
          if (!isMounted) return;

          const today = new Date().toISOString().split('T')[0];
          const futureRegistrations = (regData || []).filter(
            registration => registration.course && registration.course.date >= today
          );

          const registrationsWithCounts = await Promise.all(
            futureRegistrations.map(async (registration) => {
              if (!registration.course) return registration;
              try {
                const { count } = await supabase
                  .from('registrations')
                  .select('*', { count: 'exact', head: true })
                  .eq('course_id', registration.course.id)
                  .eq('status', 'registered');
                return {
                  ...registration,
                  course: { ...registration.course, registrationCount: count || 0 }
                };
              } catch {
                return { ...registration, course: { ...registration.course, registrationCount: 0 } };
              }
            })
          );

          if (!isMounted) return;
          setRegistrations(registrationsWithCounts);
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
        const { count: totalCoursesCount } = await supabase
          .from('courses')
          .select('*', { count: 'exact', head: true });

        const { count: upcomingCoursesCount } = await supabase
          .from('courses')
          .select('*', { count: 'exact', head: true })
          .gte('date', new Date().toISOString().split('T')[0]);

        const { count: totalParticipantsCount } = await supabase
          .from('registrations')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'registered');

        let myCoursesCount = 0;
        if (userProfile.roles?.includes('course_leader')) {
          const { count } = await supabase
            .from('courses')
            .select('*', { count: 'exact', head: true })
            .eq('teacher_id', userProfile.id);
          myCoursesCount = count || 0;
        } else if (userProfile.roles?.includes('participant')) {
          const { count } = await supabase
            .from('registrations')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userProfile.id)
            .eq('status', 'registered');
          myCoursesCount = count || 0;
        }

        if (!isMounted) return;
        setStats({
          totalCourses: totalCoursesCount || 0,
          upcomingCourses: upcomingCoursesCount || 0,
          totalParticipants: totalParticipantsCount || 0,
          myCourses: myCoursesCount
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

  const isParticipantOnly = userProfile?.roles?.includes('participant') &&
    !userProfile?.roles?.includes('admin') &&
    !userProfile?.roles?.includes('course_leader');

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

  const getStatCards = () => {
    const baseCards = [
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
        color: 'bg-green-500'
      }
    ];

    if (userProfile?.roles?.includes('course_leader')) {
      return [
        {
          title: 'Meine Kurse',
          value: stats.myCourses,
          icon: BookOpen,
          color: 'bg-teal-500'
        },
        ...baseCards
      ];
    } else if (isParticipantOnly) {
      return [
        {
          title: 'Meine Anmeldungen',
          value: stats.myCourses,
          icon: BookOpen,
          color: 'bg-teal-500'
        },
        {
          title: 'Alle Kurse',
          value: stats.totalCourses,
          icon: Calendar,
          color: 'bg-blue-500'
        }
      ];
    } else {
      return [
        {
          title: 'Alle Kurse',
          value: stats.totalCourses,
          icon: BookOpen,
          color: 'bg-teal-500'
        },
        ...baseCards,
        {
          title: 'Wachstum',
          value: '+12%',
          icon: TrendingUp,
          color: 'bg-gray-500'
        }
      ];
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  const statCards = getStatCards();
  const displayItems = isParticipantOnly ? registrations : courses;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">
          Willkommen zurück, {userProfile?.first_name || 'Benutzer'}! Hier ist Ihre Übersicht.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className={`${card.color} p-3 rounded-lg`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {isParticipantOnly ? 'Meine kommenden Kurse' : 'Kommende Kurse'}
            </h2>
          </div>
          <div className="p-6">
            {displayItems.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                {isParticipantOnly
                  ? 'Sie sind noch nicht für Kurse angemeldet.'
                  : 'Keine kommenden Kurse gefunden.'}
              </p>
            ) : (
              <div className="space-y-4">
                {displayItems.map((item, index) => {
                  const course = 'course' in item ? item.course : item;
                  if (!course) return null;

                  const registrationCount = 'registrationCount' in course ? (course.registrationCount || 0) : 0;
                  const maxParticipants = course.max_participants || 0;
                  const remainingSpots = Math.max(0, maxParticipants - registrationCount);

                  return (
                    <div key={course.id || index} className="flex items-center p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{course.title}</h3>
                        <div className="flex items-center mt-1 text-sm text-gray-600">
                          <Calendar className="w-4 h-4 mr-1" />
                          {formatDate(course.date)}
                          <Clock className="w-4 h-4 ml-3 mr-1" />
                          {course.time}{course.end_time && ` - ${course.end_time}`}
                        </div>
                        <div className="flex items-center mt-1 text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mr-1" />
                          {course.location}
                        </div>
                        {(isAdmin || isCourseLeader) && (
                          <div className="flex items-center mt-1 text-sm text-gray-600">
                            <Users className="w-4 h-4 mr-1" />
                            {registrationCount}/{maxParticipants} Teilnehmer
                          </div>
                        )}
                        {course.teacher && (
                          <p className="text-xs text-gray-500 mt-1">
                            Lehrer: {course.teacher.first_name} {course.teacher.last_name}
                          </p>
                        )}
                        <div className="flex items-center mt-2">
                          <div className={`w-3 h-3 rounded-full mr-2 ${
                            remainingSpots === 0 ? 'bg-red-500' : (remainingSpots <= 2 ? 'bg-yellow-500' : 'bg-green-500')
                          }`}></div>
                          <span className="text-xs text-gray-600">
                            {remainingSpots === 0 ? 'Leider schon ausgebucht' : (remainingSpots <= 2 ? `noch ${remainingSpots} ${remainingSpots === 1 ? 'Restplatz' : 'Restplätze'}` : 'Verfügbar')}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-teal-600">
                          {course.price != null ? `€${course.price}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Schnellzugriff</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 gap-4">
              {userProfile?.roles?.includes('course_leader') && (
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

              {userProfile?.roles?.includes('admin') && (
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
