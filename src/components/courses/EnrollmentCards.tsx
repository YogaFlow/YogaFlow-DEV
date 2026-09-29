import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { Course, CoverageStatus, Registration } from '../../types';
import { isCourseCancelled, isCourseUpcoming } from '../../lib/courseDateTime';
import { coverageLabel } from '../../lib/courseCheckout';
import { formatTimeRange, formatTodayOrTomorrow } from '../../lib/format';
import {
  passRefundInfo,
  passRefundStatusLine,
} from '../../lib/passRefundInfo';
import {
  PAYMENT_PENDING_SHORT,
  RELEASE_SEAT_LABEL,
  paymentPendingLabel,
} from '../../lib/pendingPaymentLabel';
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
  /** Platz freigeben bei pending_payment (Meine Anmeldungen). */
  onReleaseSeat?: (registration: Registration) => void;
  releasingCourseId?: string | null;
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
  if (registration.status === 'pending_payment') {
    return null;
  }
  const refund = passRefundInfo(registration);
  if (refund) {
    return passRefundStatusLine(refund);
  }
  return coverageLabel(
    {
      status: registration.status,
      is_waitlist: registration.is_waitlist,
      coverage_status: registration.coverage_status as CoverageStatus | undefined,
      coverage_waived_reason: registration.coverage_waived_reason,
    },
    { audience: 'participant' },
  ) || null;
}

const EnrollmentCards: React.FC<EnrollmentCardsProps> = ({
  registrations,
  ownPasses = [],
  onCoverageChanged,
  onFeedback,
  onReleaseSeat,
  releasingCourseId = null,
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
        const paymentPending = registration.status === 'pending_payment';
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
          !paymentPending &&
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
        ) : paymentPending ? (
          <AccentPill>
            {PAYMENT_PENDING_SHORT}
          </AccentPill>
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

        const pendingHint = paymentPending && !courseCancelled
          ? paymentPendingLabel(registration.hold_expires_at)
          : null;

        const showFooter = Boolean(pay || usable || pendingHint);

        return (
          <div key={registration.id}>
            <CourseRow
              course={course}
              href={`/course/${course.id}`}
              leading="date"
              meta={meta}
              status={status}
            />
            {showFooter ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3.5 py-2.5 sm:px-4">
                {pendingHint ? (
                  <p className="text-[13px] text-textMuted tabular-nums">{pendingHint}</p>
                ) : pay ? (
                  <p className="text-[13px] text-textMuted tabular-nums">{pay}</p>
                ) : (
                  <span />
                )}
                {paymentPending && onReleaseSeat && !courseCancelled ? (
                  <button
                    type="button"
                    disabled={releasingCourseId === course.id}
                    onClick={() => onReleaseSeat(registration)}
                    className="inline-flex h-11 items-center rounded-full border border-borderStrong bg-surface px-4 text-[13px] font-medium text-danger active:bg-dangerSoft disabled:opacity-50"
                  >
                    {releasingCourseId === course.id ? '…' : RELEASE_SEAT_LABEL}
                  </button>
                ) : null}
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
