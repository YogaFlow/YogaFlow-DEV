import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { Course, CoverageStatus, Registration } from '../../types';
import { isCourseCancelled, isCourseUpcoming } from '../../lib/courseDateTime';
import { coveragePaymentPhrase } from '../../lib/courseCheckout';
import { formatTimeRange, formatTodayOrTomorrow } from '../../lib/format';
import {
  applyPassToRegistration,
  findUsablePass,
  type MemberPassSummary,
} from '../../lib/passes';
import { formatStaffName } from '../../lib/staffNames';
import AccentPill from '../ui/AccentPill';
import CourseRow from './CourseRow';

interface EnrollmentCardsProps {
  registrations: Registration[];
  ownPasses?: MemberPassSummary[];
  onCoverageChanged?: () => void;
  onFeedback?: (message: string, type: 'success' | 'error') => void;
}

function paymentLine(
  registration: Registration,
  courseCancelled: boolean,
): string | null {
  if (courseCancelled || registration.is_waitlist) {
    if (registration.is_waitlist && registration.coverage_intent === 'pass') {
      return 'Mit Karte beim Nachrücken';
    }
    return null;
  }
  return coveragePaymentPhrase(registration.coverage_status as CoverageStatus | undefined);
}

const EnrollmentCards: React.FC<EnrollmentCardsProps> = ({
  registrations,
  ownPasses = [],
  onCoverageChanged,
  onFeedback,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const applyPass = async (registration: Registration) => {
    if (busyId) return;
    setBusyId(registration.id);
    const result = await applyPassToRegistration(registration.id);
    setBusyId(null);
    if (!result.ok) {
      onFeedback?.(result.message, 'error');
      if (result.code === 'NOT_OPEN' || result.code === 'NO_VALID_PASS') {
        onCoverageChanged?.();
      }
      return;
    }
    onFeedback?.(
      `Mit Karte bezahlt (noch ${result.remaining})`,
      'success',
    );
    onCoverageChanged?.();
  };

  return (
    <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
      {registrations.map((registration) => {
        const course = registration.course as Course | undefined;
        if (!course) return null;

        const isWaitlist = registration.is_waitlist;
        const teacherName = formatStaffName(course.teacher);
        const meta = [
          formatTodayOrTomorrow(course.date),
          formatTimeRange(course.time, course.end_time),
          teacherName,
          course.location,
        ]
          .filter(Boolean)
          .join(' · ');

        const courseCancelled =
          registration.cancel_reason === 'course_cancelled' || isCourseCancelled(course.status);
        const pay = paymentLine(registration, courseCancelled);
        const usable =
          !courseCancelled &&
          !isWaitlist &&
          registration.coverage_status === 'open' &&
          isCourseUpcoming(course)
            ? findUsablePass(ownPasses, {
                date: course.date,
                price: course.price,
                pass_eligible: course.pass_eligible,
              })
            : null;

        const status = courseCancelled ? (
          <span className="text-[13px] font-medium text-text">Kurs fällt aus</span>
        ) : isWaitlist ? (
          <AccentPill>
            {registration.waitlist_position
              ? `Warteliste (Pos. ${registration.waitlist_position})`
              : 'Warteliste'}
          </AccentPill>
        ) : (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium text-success">
            <Check className="h-4 w-4" aria-hidden />
            Angemeldet
          </span>
        );

        return (
          <div key={registration.id}>
            <CourseRow
              course={course}
              href={`/course/${course.id}`}
              leading="date"
              meta={meta}
              status={status}
            />
            {pay || usable ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3.5 py-2.5 sm:px-4">
                {pay ? (
                  <p className="text-[13px] text-textMuted">{pay}</p>
                ) : (
                  <span />
                )}
                {usable ? (
                  <button
                    type="button"
                    disabled={busyId === registration.id}
                    onClick={() => void applyPass(registration)}
                    className="inline-flex h-11 items-center rounded-full border border-borderStrong bg-surface px-4 text-[13px] font-medium text-brand active:bg-surfaceSunken disabled:opacity-50"
                  >
                    {busyId === registration.id
                      ? '…'
                      : `Mit Karte bezahlen (noch ${usable.remaining})`}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default EnrollmentCards;
