import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Calendar, Check, Users, BookOpen, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, Registration } from '../types';
import { isCourseCancelled, isCourseRunning, isCourseUpcoming, isRegistrationVisible } from '../lib/courseDateTime';
import { formatDayLabel, formatPrice, formatTime, formatTimeRange } from '../lib/format';
import { runPastRegistrationCleanup } from '../lib/registrationMaintenance';
import { fetchCourseParticipantCounts } from '../lib/courseParticipantCounts';
import { isParticipantOnlyRole, isTeacherOnly } from '../lib/userRoles';

type StatCard = {
  title: string;
  value: string | number;
  path?: string;
};

type CourseWithCount = Course & { registrationCount?: number };

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, isAdmin, isCourseLeader } = useAuth();
  const [courses, setCourses] = useState<CourseWithCount[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats, setStats] = useState({
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

        let participantCourseCandidates: Course[] = [];

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
          const { data: participantCoursesData, error: participantCoursesError } = await supabase
            .from('courses')
            .select(`
              *,
              teacher:users!courses_teacher_id_fkey(first_name, last_name)
            `)
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date', { ascending: true })
            .order('time', { ascending: true })
            .limit(30);

          if (participantCoursesError) throw participantCoursesError;
          participantCourseCandidates = participantCoursesData || [];
        }

        let myRegistrationsFromList = 0;

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
            .in('status', ['registered', 'waitlist'])
            .is('cancellation_timestamp', null);

          if (regError) throw regError;
          if (!isMounted) return;

          const visibleRegistrations = (regData || []).filter((registration) =>
            isRegistrationVisible(registration)
          );

          const countedCourses = await attachCounts(
            visibleRegistrations
              .map((registration) => registration.course)
              .filter((course): course is Course => Boolean(course))
          );
          const countsById = Object.fromEntries(
            countedCourses.map((course) => [course.id, course.registrationCount ?? 0])
          );

          if (!isMounted) return;
          const registrationsWithCounts = visibleRegistrations.map((registration) => ({
            ...registration,
            course: registration.course
              ? { ...registration.course, registrationCount: countsById[registration.course.id] ?? 0 }
              : registration.course,
          }));

          const sortedRegistrations = registrationsWithCounts.sort((a, b) => {
            const keyA = `${a.course?.date ?? ''}T${a.course?.time ?? ''}`;
            const keyB = `${b.course?.date ?? ''}T${b.course?.time ?? ''}`;
            return keyA.localeCompare(keyB);
          });
          setRegistrations(sortedRegistrations);
          myRegistrationsFromList = sortedRegistrations.length;

          if (userProfile.role === 'user') {
            const enrolledCourseIds = new Set(
              sortedRegistrations.map((registration) => registration.course_id)
            );
            const eligible = participantCourseCandidates.filter(
              (course) =>
                isCourseUpcoming(course) &&
                !isCourseCancelled(course.status) &&
                !enrolledCourseIds.has(course.id) &&
                course.teacher_id !== userProfile.id
            );
            const counted = await attachCounts(eligible);
            if (!isMounted) return;
            setCourses(
              counted
                .filter((course) => {
                  const maxParticipants = course.max_participants;
                  if (maxParticipants == null) return false;
                  return (course.registrationCount ?? 0) < maxParticipants;
                })
                .slice(0, 3)
            );
          }
        } else if (isMounted) {
          setRegistrations([]);
        }

        await fetchStats(myRegistrationsFromList);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const fetchStats = async (myRegistrationsFromList = 0) => {
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

        const upcomingCoursesCount = upcomingCourseIds.length;

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
          myRegistrationsCount = myRegistrationsFromList;
        }

        if (!isMounted) return;
        setStats({
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
          title: 'Meine Kurse',
          value: stats.myCourses,
          path: '/my-courses'
        },
        {
          title: 'Meine Anmeldungen',
          value: stats.myRegistrations,
          path: '/my-registrations'
        },
        {
          title: 'Teilnehmer',
          value: stats.totalParticipants,
          path: '/participants'
        }
      ];
    }

    const baseCards: StatCard[] = [
      {
        title: 'Kommende Kurse',
        value: stats.upcomingCourses,
      },
      {
        title: 'Teilnehmer',
        value: stats.totalParticipants,
        path: '/participants'
      }
    ];

    if (isCourseLeader && !isParticipantOnly) {
      return [
        {
          title: 'Meine Kurse',
          value: stats.myCourses,
          path: '/my-courses'
        },
        ...baseCards
      ];
    }

    if (isParticipantOnly) {
      return [
        {
          title: 'Meine Anmeldungen',
          value: stats.myRegistrations,
          path: '/my-registrations'
        },
        {
          title: 'Kommende Kurse',
          value: stats.upcomingCourses,
          path: '/courses'
        }
      ];
    }

    return [];
  };

  const renderCourseCards = (
    items: Array<CourseWithCount | Registration>,
    emptyMessage: string,
    options?: { showRegisteredBadge?: boolean; rowLink?: string }
  ) => {
    if (items.length === 0) {
      return <p className="px-3.5 py-8 text-center text-textMuted">{emptyMessage}</p>;
    }

    return (
      <div className="divide-y divide-border">
        {items.map((item, index) => {
          const isRegistration = 'course' in item;
          const course = (isRegistration ? item.course : item) as CourseWithCount | undefined;
          if (!course) return null;

          const registrationCount = course.registrationCount || 0;
          const maxParticipants = course.max_participants || 0;
          const remainingSpots = Math.max(0, maxParticipants - registrationCount);
          const isFull = remainingSpots === 0;
          const isRegistered = Boolean(options?.showRegisteredBadge && isRegistration && item.status === 'registered');
          const isWaitlist = Boolean(
            isRegistration && (item.status === 'waitlist' || item.is_waitlist)
          );
          const description = course.description?.trim() ?? '';
          const teacherName =
            course.teacher && course.teacher_id !== userProfile?.id
              ? `${course.teacher.first_name} ${course.teacher.last_name}`.trim()
              : '';
          const occupancy =
            (isAdmin || isCourseLeader) && !isRegistration
              ? `${registrationCount}/${maxParticipants}\u00A0Plätze`
              : '';
          const running = isCourseRunning(course);
          const meta = [
            formatDayLabel(course.date),
            formatTime(course.time),
            running ? 'läuft gerade' : '',
            teacherName,
            course.location,
            occupancy,
          ]
            .filter(Boolean)
            .join(' · ');

          let status: React.ReactNode = null;
          if (isRegistered) {
            status = (
              <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
                <Check className="h-4 w-4" aria-hidden />
                Angemeldet
              </span>
            );
          } else if (isWaitlist) {
            const waitlistLabel = item.waitlist_position
              ? `Warteliste Pos. ${item.waitlist_position}`
              : 'Warteliste';
            status = (
              <span className="inline-flex rounded-full bg-accentSoft px-2.5 py-0.5 text-[13px] font-medium text-accentText">
                {waitlistLabel}
              </span>
            );
          } else if (isFull) {
            status = (
              <span className="text-[13px] font-medium text-textMuted">Ausgebucht</span>
            );
          } else if (remainingSpots <= 2) {
            status = (
              <span className="text-[13px] font-medium text-accentText">
                {remainingSpots === 1 ? 'noch 1\u00A0Platz' : `noch ${remainingSpots}\u00A0Plätze`}
              </span>
            );
          }

          const rowInner = (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[17px] font-medium text-text">{course.title}</h3>
                {meta ? (
                  <p className="text-[13px] text-textMuted tabular-nums">{meta}</p>
                ) : null}
                {description ? (
                  <p className="line-clamp-1 text-[13px] text-textSubtle">{description}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {status}
                {course.price != null && (
                  <span className="text-[17px] font-medium text-text tabular-nums">
                    {formatPrice(course.price)}
                  </span>
                )}
              </div>
            </div>
          );

          if (options?.rowLink) {
            return (
              <Link
                key={course.id || index}
                to={options.rowLink}
                className="block min-h-11 px-3.5 py-3 no-underline text-inherit active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                {/* Künftig öffnet ein Tipp ein Kurs-Infofenster statt des Links. */}
                {rowInner}
              </Link>
            );
          }

          return (
            <div key={course.id || index} className="px-3.5 py-3">
              {rowInner}
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
  const heroRegistration = isParticipantOnly
    ? registrations.find((item) => item.status === 'registered')
    : undefined;
  const danachAll = isParticipantOnly
    ? registrations.filter((item) => item.id !== heroRegistration?.id)
    : [];
  const danach = danachAll.slice(0, 3);
  const heroCourse = heroRegistration?.course;
  const heroRunning = heroCourse ? isCourseRunning(heroCourse) : false;
  const heroTeacherName = heroCourse?.teacher
    ? `${heroCourse.teacher.first_name} ${heroCourse.teacher.last_name}`.trim()
    : '';
  const heroPlaceLine = heroCourse
    ? [heroCourse.location, heroTeacherName].filter(Boolean).join(' · ')
    : '';
  const hasWaitlistOnly = isParticipantOnly && !heroRegistration && danachAll.length > 0;
  const hasLeftColumn =
    (isCourseLeader && !isParticipantOnly) ||
    isTeacher ||
    (isParticipantOnly && danach.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[17px] font-normal text-text">
          {userProfile?.first_name
            ? `Willkommen zurück, ${userProfile.first_name}!`
            : 'Willkommen zurück!'}
        </p>
      </div>

      {isParticipantOnly && heroCourse && (
        <Link
          to="/my-registrations"
          className="block min-h-11 rounded-lg bg-brand p-5 text-onBrand no-underline active:bg-brandPressed focus:outline-none focus-visible:ring-2 focus-visible:ring-onBrand focus-visible:ring-offset-2"
        >
          {/* Künftig öffnet ein Tipp ein Kurs-Infofenster statt des Links. */}
          <p className="text-[13px] font-normal">
            {heroRunning
              ? `Läuft gerade · bis ${formatTime(heroCourse.end_time)}`
              : 'Deine nächste Stunde'}
          </p>
          <h2 className="mt-1 text-[22px] font-medium">{heroCourse.title}</h2>
          <p className="mt-1 text-[17px] font-normal tabular-nums">
            {[formatDayLabel(heroCourse.date), formatTimeRange(heroCourse.time, heroCourse.end_time)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {heroPlaceLine ? (
            <p className="mt-0.5 text-[13px] font-normal">{heroPlaceLine}</p>
          ) : null}
        </Link>
      )}

      {isParticipantOnly && !heroRegistration && (
        <div className="rounded-lg bg-brand p-5 text-onBrand">
          <h2 className="text-[22px] font-medium">
            {hasWaitlistOnly ? 'Noch keine feste Anmeldung' : 'Noch nichts gebucht'}
          </h2>
          <p className="mt-1 text-[17px] font-normal">
            {hasWaitlistOnly
              ? 'Du stehst auf der Warteliste — oder finde eine andere Stunde.'
              : 'Finde deine nächste Stunde.'}
          </p>
          <Link
            to="/courses"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-surface px-5 text-[17px] font-medium text-brand no-underline"
          >
            Kurse ansehen
          </Link>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-surface">
        <div className="flex divide-x divide-border">
          {statCards.map((card, index) => {
            const content = (
              <>
                <p className="text-[22px] font-medium text-text tabular-nums">{card.value}</p>
                <p className="mt-0.5 text-[13px] text-textMuted">{card.title}</p>
              </>
            );
            const path = card.path;
            if (path) {
              return (
                <Link
                  key={index}
                  to={path}
                  className="min-w-0 flex-1 px-3.5 py-3 hover:bg-surfaceSunken transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 no-underline text-inherit"
                >
                  {content}
                </Link>
              );
            }
            return (
              <div key={index} className="min-w-0 flex-1 px-3.5 py-3">
                {content}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {hasLeftColumn && (
          <div className="space-y-6">
            {(isCourseLeader && !isParticipantOnly) && (
              <div className="bg-surface rounded-md border border-border">
                <div className="p-3.5 border-b border-border">
                  <h2 className="text-lg font-medium text-text">
                    {isTeacher ? 'Kurse, die ich gebe' : 'Kommende Kurse'}
                  </h2>
                </div>
                <div>
                  {renderCourseCards(
                    courses,
                    isTeacher
                      ? 'Sie haben noch keine Kurse erstellt.'
                      : 'Keine kommenden Kurse gefunden.'
                  )}
                </div>
              </div>
            )}

            {isTeacher && (
              <div className="bg-surface rounded-md border border-border">
                <div className="p-3.5 border-b border-border">
                  <h2 className="text-lg font-medium text-text">Meine kommenden Kurse</h2>
                </div>
                <div>
                  {renderCourseCards(
                    registrations,
                    'Sie sind noch nicht für Kurse angemeldet.',
                    { showRegisteredBadge: true }
                  )}
                </div>
              </div>
            )}

            {isParticipantOnly && danach.length > 0 && (
              <div className="bg-surface rounded-md border border-border">
                <div className="p-3.5 border-b border-border">
                  <h2 className="text-lg font-medium text-text">Danach</h2>
                </div>
                <div>
                  {renderCourseCards(danach, '', { showRegisteredBadge: true })}
                </div>
                {danachAll.length > 3 && (
                  <div className="border-t border-border px-3.5 py-2">
                    <Link
                      to="/my-registrations"
                      className="inline-flex min-h-11 items-center text-[13px] font-medium text-brand no-underline"
                    >
                      Alle Anmeldungen
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isParticipantOnly ? (
          <div className={`bg-surface rounded-md border border-border${hasLeftColumn ? '' : ' lg:col-span-2'}`}>
            <div className="p-3.5 border-b border-border">
              <h2 className="text-lg font-medium text-text">Noch Plätze frei</h2>
            </div>
            <div>
              {renderCourseCards(
                courses,
                'Gerade ist nichts frei — oder du bist überall schon dabei.',
                { rowLink: '/courses' }
              )}
            </div>
            <div className="border-t border-border px-3.5 py-2">
              <Link
                to="/courses"
                className="inline-flex min-h-11 items-center text-[13px] font-medium text-brand no-underline"
              >
                Alle Kurse ansehen
              </Link>
            </div>
          </div>
        ) : (
          <div className={`bg-surface rounded-md border border-border${hasLeftColumn ? '' : ' lg:col-span-2'}`}>
            <div className="p-3.5 border-b border-border">
              <h2 className="text-lg font-medium text-text">Schnellzugriff</h2>
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
        )}
      </div>
    </div>
  );
};

export default Dashboard;
