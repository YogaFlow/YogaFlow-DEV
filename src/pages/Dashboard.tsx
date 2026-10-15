import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  CornerDownLeft,
  Euro,
  Users,
  BookOpen,
  Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Course, PaymentMethod, Registration } from '../types';
import {
  berlinIsoDate,
  berlinIsoFromInstant,
  isCourseCancelled,
  isCourseRunning,
  isCourseUpcoming,
  isRegistrationVisible,
} from '../lib/courseDateTime';
import {
  formatDayLabel,
  formatTime,
  formatTimeRange,
  formatTodayOrTomorrow,
  monthStartIso,
} from '../lib/format';
import {
  isDevPendingPaymentMock,
  resolveHoldExpiresAt,
} from '../lib/devPendingPaymentMock';
import PaymentPendingStatus from '../components/ui/PaymentPendingStatus';
import { fetchCourseParticipantCounts } from '../lib/courseParticipantCounts';
import { isParticipantOnlyRole, isTeacherOnly } from '../lib/userRoles';
import { formatStaffName, withCourseTeachers } from '../lib/staffNames';
import { latestUnreversedPayment } from '../lib/courseCheckout';
import {
  buildTodoItems,
  isOnsiteReturnMethod,
  todoEmptyLabel,
  todoItemCount,
  type TodoFailedRefund,
  type TodoItem,
  type TodoOpenCourse,
  type TodoReturnRow,
  type TodoRole,
} from '../lib/buildTodoItems';
import { fetchStudioPayments } from '../lib/studioPayments';
import { loadTaxSettings, studioHasPayment } from '../lib/taxStatus';
import LedgerWaitingNotice from '../components/tax/LedgerWaitingNotice';
import AccentPill from '../components/ui/AccentPill';
import CourseRow from '../components/courses/CourseRow';
import { isArchivedRow, visibleCourses as coursesVisible } from '../lib/visibleScope';

type StatCard = {
  title: string;
  value: string | number;
  path?: string;
};

type CourseWithCount = Course & { registrationCount?: number };

function todoIcon(kind: TodoItem['kind']) {
  switch (kind) {
    case 'refund_failed':
      return AlertTriangle;
    case 'return_onsite':
      return CornerDownLeft;
    case 'payment_open':
    case 'older_open':
      return Euro;
    case 'pay_onsite':
      return Clock;
    default:
      return ChevronRight;
  }
}

function berlinTimeFromInstant(value: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(value)).map((p) => [p.type, p.value]));
  return `${parts.hour ?? '00'}:${parts.minute ?? '00'}:00`;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, isAdmin, isOwner, isCourseLeader } = useAuth();
  const [courses, setCourses] = useState<CourseWithCount[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats, setStats] = useState({
    upcomingCourses: 0,
    totalParticipants: 0,
    myCourses: 0,
    myRegistrations: 0,
  });
  const [loading, setLoading] = useState(true);
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [todoReady, setTodoReady] = useState(false);
  const [ledgerWaiting, setLedgerWaiting] = useState(false);

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
        let participantCourseCandidates: Course[] = [];

        if (userProfile.role !== 'user') {
          let coursesQuery = coursesVisible('*')
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date', { ascending: true })
            .order('time', { ascending: true });

          if (userProfile.role === 'teacher') {
            coursesQuery = coursesQuery.eq('teacher_id', userProfile.id);
          }

          const { data: coursesData, error: coursesError } = await coursesQuery.limit(20);

          if (coursesError) throw coursesError;
          if (!isMounted) return;

          const visibleCourses = await withCourseTeachers(
            ((coursesData || []) as Course[])
              .filter((course) => isCourseUpcoming(course))
              .slice(0, 5),
          );
          setCourses(await attachCounts(visibleCourses as Course[]));
        } else if (isMounted) {
          const { data: participantCoursesData, error: participantCoursesError } = await coursesVisible('*')
            .gte('date', new Date().toISOString().split('T')[0])
            .order('date', { ascending: true })
            .order('time', { ascending: true })
            .limit(30);

          if (participantCoursesError) throw participantCoursesError;
          participantCourseCandidates = await withCourseTeachers(
            (participantCoursesData || []) as Course[],
          );
        }

        let myRegistrationsFromList = 0;

        if (userProfile.role === 'user' || userProfile.role === 'teacher') {
          const { data: regData, error: regError } = await supabase
            .from('registrations')
            .select(`
              *,
              course:courses(*)
            `)
            .eq('user_id', userProfile.id)
            .in('status', ['registered', 'waitlist', 'pending_payment'])
            .is('cancellation_timestamp', null);

          if (regError) throw regError;
          if (!isMounted) return;

          const visibleRegistrations = (regData || []).filter((registration) =>
            isRegistrationVisible(registration)
          );

          const coursesFromRegs = await withCourseTeachers(
            visibleRegistrations
              .map((registration) => registration.course)
              .filter((course): course is Course => Boolean(course))
          );
          const countedCourses = await attachCounts(coursesFromRegs);
          const countsById = Object.fromEntries(
            countedCourses.map((course) => [course.id, course.registrationCount ?? 0])
          );
          const teacherById = Object.fromEntries(
            countedCourses.map((course) => [course.id, course.teacher])
          );

          if (!isMounted) return;
          const registrationsWithCounts = visibleRegistrations.map((registration) => ({
            ...registration,
            course: registration.course
              ? {
                  ...registration.course,
                  teacher: teacherById[registration.course.id],
                  registrationCount: countsById[registration.course.id] ?? 0,
                }
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

        if (userProfile.role === 'user') {
          if (isMounted) {
            setTodoItems([]);
            setTodoReady(true);
          }
        } else {
          const todoRole: TodoRole =
            userProfile.role === 'teacher'
              ? 'teacher'
              : userProfile.role === 'admin'
                ? 'admin'
                : 'owner';
          const isManager = todoRole === 'owner' || todoRole === 'admin';

          const returns: TodoReturnRow[] = [];
          if (isManager || todoRole === 'teacher') {
            const { data: paidRows, error: paidError } = await supabase
              .from('registrations')
              .select(
                'id, course:courses(id, title, date, time, status, archived_at, teacher_id), user:users!registrations_user_id_fkey(first_name, last_name, archived_at)',
              )
              .eq('cancel_reason', 'course_cancelled')
              .eq('coverage_status', 'paid');
            if (paidError) throw paidError;
            const paidList = (paidRows ?? []).filter((row) => {
              const course = Array.isArray(row.course) ? row.course[0] : row.course;
              const person = Array.isArray(row.user) ? row.user[0] : row.user;
              if (!course || isArchivedRow(course) || !isCourseCancelled(course.status)) return false;
              if (person?.archived_at) return false;
              if (todoRole === 'teacher' && course.teacher_id !== userProfile.id) return false;
              return true;
            });
            if (paidList.length > 0) {
              const { data: paymentRows, error: paymentError } = await supabase
                .from('payments')
                .select(
                  'id, registration_id, method, amount_cents, reverses_payment_id, received_at',
                )
                .in(
                  'registration_id',
                  paidList.map((row) => row.id),
                );
              if (paymentError) throw paymentError;
              const openPayment = latestUnreversedPayment(paymentRows ?? []);
              for (const row of paidList) {
                const payment = openPayment.get(row.id);
                if (!payment || !isOnsiteReturnMethod(payment.method as PaymentMethod)) continue;
                const course = Array.isArray(row.course) ? row.course[0] : row.course;
                const person = Array.isArray(row.user) ? row.user[0] : row.user;
                if (!course) continue;
                returns.push({
                  registrationId: row.id,
                  courseId: course.id,
                  courseTitle: course.title,
                  courseDate: course.date,
                  courseTime: course.time,
                  teacherId: course.teacher_id ?? null,
                  courseArchived: Boolean(course.archived_at),
                  firstName: person?.first_name ?? '',
                  lastName: person?.last_name ?? '',
                  method: payment.method as PaymentMethod,
                  amountCents: payment.amount_cents,
                });
              }
            }
          }

          const openCourses: TodoOpenCourse[] = [];
          if (isManager) {
            const { data: overdue, error: overdueErr } = await supabase.rpc('get_open_coverage');
            if (overdueErr) throw overdueErr;
            const { data: upcoming, error: upErr } = await supabase.rpc(
              'get_upcoming_open_coverage',
            );
            if (upErr) throw upErr;
            type CovRow = {
              course_id: string;
              course_title: string;
              course_starts_at: string;
            };
            const openRows = [
              ...((overdue ?? []) as CovRow[]),
              ...((upcoming ?? []) as CovRow[]),
            ];
            const byCourse = new Map<string, TodoOpenCourse>();
            for (const row of openRows) {
              const date = berlinIsoFromInstant(row.course_starts_at);
              const time = berlinTimeFromInstant(row.course_starts_at);
              const existing = byCourse.get(row.course_id);
              if (existing) {
                existing.openCount += 1;
              } else {
                byCourse.set(row.course_id, {
                  courseId: row.course_id,
                  title: row.course_title,
                  date,
                  time,
                  teacherId: null,
                  openCount: 1,
                  courseArchived: false,
                });
              }
            }
            openCourses.push(...byCourse.values());
          } else {
            const yesterday = berlinIsoDate(-1);
            const todayBerlin = berlinIsoDate(0);
            const { data: checkoutCourses, error: checkoutError } = await coursesVisible(
              'id, title, date, time, teacher_id, status',
            )
              .in('date', [yesterday, todayBerlin])
              .eq('teacher_id', userProfile.id)
              .order('date', { ascending: true })
              .order('time', { ascending: true });
            if (checkoutError) throw checkoutError;
            const list = (checkoutCourses ?? []) as Array<{
              id: string;
              title: string;
              date: string;
              time: string;
              teacher_id: string;
              status: string | null;
            }>;
            const ids = list.filter((c) => !isCourseCancelled(c.status)).map((c) => c.id);
            const openByCourse = new Map<string, number>();
            if (ids.length > 0) {
              const { data: openRows, error: openError } = await supabase
                .from('registrations')
                .select('course_id')
                .in('course_id', ids)
                .eq('status', 'registered')
                .eq('coverage_status', 'open');
              if (openError) throw openError;
              for (const row of openRows ?? []) {
                openByCourse.set(row.course_id, (openByCourse.get(row.course_id) ?? 0) + 1);
              }
            }
            for (const course of list) {
              if (isCourseCancelled(course.status)) continue;
              const n = openByCourse.get(course.id) ?? 0;
              if (n <= 0) continue;
              openCourses.push({
                courseId: course.id,
                title: course.title,
                date: course.date,
                time: course.time,
                teacherId: course.teacher_id,
                openCount: n,
                courseArchived: false,
              });
            }
          }

          const failedRefunds: TodoFailedRefund[] = [];
          if (isManager) {
            const todayBerlin = berlinIsoDate(0);
            const months = [monthStartIso(todayBerlin, 0), monthStartIso(todayBerlin, 1)];
            for (const month of months) {
              try {
                const page = await fetchStudioPayments({
                  month,
                  kind: '',
                  status: 'refund_failed',
                  search: '',
                  page: 1,
                  includeArchived: false,
                });
                for (const row of page.items) {
                  if (failedRefunds.some((f) => f.paymentId === row.payment_id)) continue;
                  failedRefunds.push({
                    paymentId: row.payment_id,
                    amountCents: row.amount_cents,
                    firstName: row.first_name ?? '',
                    lastName: row.last_name ?? '',
                    courseTitle: row.course_title,
                    courseDate: row.course_date,
                    courseArchived: false,
                    personArchived: false,
                  });
                }
              } catch (err) {
                console.error(err);
              }
            }
          }

          if (!isMounted) return;
          setTodoItems(
            buildTodoItems(
              { failedRefunds, returns, openCourses },
              new Date(),
              todoRole,
              { teacherId: userProfile.id },
            ),
          );
          setTodoReady(true);
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
        const { data: upcomingCoursesData } = await coursesVisible('id, date, time, teacher_id, status')
          .gte('date', today);

        const upcomingCourses = ((upcomingCoursesData || []) as Course[]).filter(
          (course) => isCourseUpcoming(course) && !isCourseCancelled(course.status),
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
          const { data: seatRows } = await supabase
            .from('registrations')
            .select('id, user:users!registrations_user_id_fkey(anonymized_at, archived_at)')
            .eq('status', 'registered')
            .is('cancellation_timestamp', null)
            .in('course_id', participantCourseIds);
          totalParticipantsCount = (seatRows ?? []).filter((row) => {
            const person = Array.isArray(row.user) ? row.user[0] : row.user;
            return !person?.anonymized_at && !person?.archived_at;
          }).length;
        }

        let myCoursesCount = 0;
        let myRegistrationsCount = 0;

        if (userProfile.role !== 'user') {
          const { data } = await coursesVisible('id, date, time, status')
            .eq('teacher_id', userProfile.id)
            .gte('date', today);
          myCoursesCount = ((data || []) as Course[]).filter(
            (course) => isCourseUpcoming(course) && !isCourseCancelled(course.status),
          ).length;
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

  useEffect(() => {
    if (!isOwner) {
      setLedgerWaiting(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const settings = await loadTaxSettings();
        if (!active) return;
        if (settings.length > 0) {
          setLedgerWaiting(false);
          return;
        }
        const hasPayment = await studioHasPayment();
        if (active) setLedgerWaiting(hasPayment);
      } catch {
        if (active) setLedgerWaiting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOwner, userProfile?.id]);

  const isParticipantOnly = isParticipantOnlyRole(userProfile);
  const isTeacher = isTeacherOnly(userProfile);
  const showTodoCard = todoReady && !isParticipantOnly;
  const todoCount = useMemo(() => todoItemCount(todoItems), [todoItems]);


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
          title: 'Anmeldungen',
          value: stats.totalParticipants,
          path: '/participants'
        }
      ];
    }

    // totalParticipants = belegte Plätze in kommenden Kursen (Anmeldungen), nicht Studio-Mitgliederzahl.
    const baseCards: StatCard[] = [
      {
        title: 'Kommende Kurse',
        value: stats.upcomingCourses,
      },
      {
        title: 'Anmeldungen',
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
    options?: { showRegisteredBadge?: boolean }
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
          const isPaymentPending = Boolean(
            isRegistration && item.status === 'pending_payment',
          );
          const isWaitlist = Boolean(
            isRegistration && (item.status === 'waitlist' || item.is_waitlist)
          );
          const teacherName =
            course.teacher_id !== userProfile?.id ? formatStaffName(course.teacher) : '';
          const running = isCourseRunning(course);
          const meta = [
            formatTodayOrTomorrow(course.date),
            formatTimeRange(course.time, course.end_time),
            running ? 'läuft gerade' : '',
            teacherName,
            course.location,
          ]
            .filter(Boolean)
            .join(' · ');

          let status: React.ReactNode = null;
          if (isCourseCancelled(course.status)) {
            status = <span className="text-[13px] font-medium text-text">Abgesagt</span>;
          } else if (isPaymentPending || (isDevPendingPaymentMock() && isRegistered)) {
            status = (
              <PaymentPendingStatus
                holdExpiresAt={resolveHoldExpiresAt(
                  isRegistration ? item.hold_expires_at : null,
                )}
              />
            );
          } else if (isRegistered) {
            status = (
              <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
                <Check className="h-4 w-4" aria-hidden />
                Angemeldet
              </span>
            );
          } else if (isRegistration && isWaitlist) {
            const waitlistLabel = item.waitlist_position
              ? `Warteliste Pos. ${item.waitlist_position}`
              : 'Warteliste';
            status = (
              <AccentPill>
                {waitlistLabel}
              </AccentPill>
            );
          } else if (isFull) {
            status = (
              <span className="text-[13px] font-medium text-textMuted">Ausgebucht</span>
            );
          } else if (remainingSpots <= 2) {
            status = (
              <AccentPill>
                {remainingSpots === 1 ? 'noch 1\u00A0Platz' : `noch ${remainingSpots}\u00A0Plätze`}
              </AccentPill>
            );
          }

          return (
            <CourseRow
              key={course.id || index}
              course={course}
              href={`/course/${course.id}`}
              leading="date"
              meta={meta}
              status={status}
            />
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
    ? registrations.find(
        (item) => item.status === 'registered' || item.status === 'pending_payment',
      )
    : undefined;
  const danachAll = isParticipantOnly
    ? registrations.filter((item) => item.id !== heroRegistration?.id)
    : [];
  const danach = danachAll.slice(0, 3);
  const heroCourse = heroRegistration?.course;
  const heroRunning = heroCourse ? isCourseRunning(heroCourse) : false;
  const heroTeacherName = heroCourse ? formatStaffName(heroCourse.teacher) : '';
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

      {ledgerWaiting ? <LedgerWaitingNotice variant="dashboard" /> : null}

      {showTodoCard ? (
        <section
          className="overflow-hidden rounded-md border border-border bg-surface"
          data-testid="todo-card"
        >
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-3.5 py-3">
            <h2 className="text-[17px] font-medium text-text">Zu erledigen</h2>
            {todoItems.length > 0 ? (
              <span className="tabular-nums text-[15px] text-textMuted">{todoCount}</span>
            ) : null}
          </div>
          {todoItems.length === 0 ? (
            <p className="px-3.5 py-4 text-[15px] text-textMuted" data-testid="todo-empty">
              {todoEmptyLabel()}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {todoItems.map((item) => {
                const Icon = todoIcon(item.kind);
                return (
                  <Link
                    key={`${item.kind}:${item.href}:${item.title}`}
                    to={item.href}
                    data-testid={`todo-${item.kind}`}
                    className="flex min-h-14 items-center gap-3 px-3.5 py-3 text-text no-underline active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                  >
                    <Icon className="h-5 w-5 shrink-0 text-textMuted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[17px] font-medium tabular-nums">{item.title}</span>
                      {item.subtitle ? (
                        <span className="mt-0.5 block text-[15px] font-normal text-textMuted tabular-nums">
                          {item.subtitle}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {isParticipantOnly && heroCourse && (
        <Link
          to={`/course/${heroCourse.id}`}
          className="block min-h-11 rounded-lg bg-brand p-5 text-onBrand no-underline active:bg-brandPressed focus:outline-none focus-visible:ring-2 focus-visible:ring-onBrand focus-visible:ring-offset-2"
        >
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
                      ? 'Du hast noch keine Kurse erstellt.'
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
                    'Du bist noch nicht für Kurse angemeldet.',
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
                'Gerade ist nichts frei — oder du bist überall schon dabei.'
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
                    className="flex items-center p-3.5 bg-brandSoft hover:bg-brandSoft rounded-md transition-colors text-left"
                  >
                    <Calendar className="w-5 h-5 text-brandOnSoft mr-3" />
                    <span className="font-medium text-brandOnSoft">Kurse durchsuchen</span>
                  </button>
                )}

                {isCourseLeader && (
                  <>
                    <button
                      onClick={() => navigate('/create-course')}
                      className="flex items-center p-3.5 bg-brandSoft hover:bg-brandSoft rounded-md transition-colors text-left"
                    >
                      <BookOpen className="w-5 h-5 text-brandOnSoft mr-3" />
                      <span className="font-medium text-brandOnSoft">Neuen Kurs erstellen</span>
                    </button>
                    <button
                      onClick={() => navigate('/participants')}
                      className="flex items-center p-3.5 bg-brandSoft hover:bg-brandSoft rounded-md transition-colors text-left"
                    >
                      <Users className="w-5 h-5 text-brandOnSoft mr-3" />
                      <span className="font-medium text-brandOnSoft">Teilnehmer verwalten</span>
                    </button>
                  </>
                )}

                {isAdmin && (
                  <>
                    <button
                      onClick={() => navigate('/users')}
                      className="flex items-center p-3.5 bg-brandSoft hover:bg-brandSoft rounded-md transition-colors text-left"
                    >
                      <Users className="w-5 h-5 text-brandOnSoft mr-3" />
                      <span className="font-medium text-brandOnSoft">Benutzer verwalten</span>
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
