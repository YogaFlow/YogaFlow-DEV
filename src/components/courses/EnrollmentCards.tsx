import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { Course, CoverageStatus, Registration } from '../../types';
import { isCourseCancelled, isCourseUpcoming, toCourseStart } from '../../lib/courseDateTime';
import { coverageLabel } from '../../lib/courseCheckout';
import {
  isDevPendingPaymentMock,
  resolveHoldExpiresAt,
} from '../../lib/devPendingPaymentMock';
import { formatTimeRange, formatTodayOrTomorrow } from '../../lib/format';
import {
  passRefundInfo,
  passRefundStatusLine,
} from '../../lib/passRefundInfo';
import { RELEASE_SEAT_LABEL } from '../../lib/pendingPaymentLabel';
import { PAY_NOW_LABEL } from '../../lib/paymentTexts';
import ReceiptSeeLink from '../payments/ReceiptSeeLink';
import { paymentsClientConfig } from '../../lib/paymentsClientConfig';
import {
  applyPassToRegistration,
  findUsablePass,
  type MemberPassSummary,
} from '../../lib/passes';
import {
  onlinePaidStatusLine,
  onlineRefundInfo,
  refundProgress,
  type RegistrationRefundState,
} from '../../lib/refundTexts';
import { formatStaffName } from '../../lib/staffNames';
import AccentPill from '../ui/AccentPill';
import PaymentPendingStatus from '../ui/PaymentPendingStatus';
import RefundProgressLine from '../ui/RefundProgressLine';
import CourseRow from './CourseRow';

interface EnrollmentCardsProps {
  registrations: Registration[];
  ownPasses?: MemberPassSummary[];
  onCoverageChanged?: () => void;
  onFeedback?: (message: string, type: 'success' | 'error') => void;
  /** Platz freigeben bei pending_payment (Meine Anmeldungen). */
  onReleaseSeat?: (registration: Registration) => void;
  /** Online bezahlen bei pending_payment. */
  onPayNow?: (registration: Registration) => void;
  releasingCourseId?: string | null;
  /** get_registration_refund_states je Buchung */
  refundStates?: Record<string, RegistrationRefundState>;
  /** Beleg-ID je Anmeldung (K12) */
  receiptIds?: Record<string, string>;
  /** Belegnummer je Anmeldung */
  receiptNumbers?: Record<string, string>;
}

function isOwnCancellation(registration: Registration): boolean {
  return registration.status === 'cancelled' && registration.cancel_reason !== 'course_cancelled';
}

function paymentLine(
  registration: Registration,
  course: Course | undefined,
  courseCancelled: boolean,
  refundState: RegistrationRefundState | undefined,
): string | null {
  if (courseCancelled || registration.is_waitlist || isOwnCancellation(registration)) {
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
    return passRefundStatusLine();
  }
  const online = onlineRefundInfo(registration, refundState);
  if (online) {
    return onlinePaidStatusLine();
  }
  return coverageLabel(
    {
      status: registration.status,
      is_waitlist: registration.is_waitlist,
      coverage_status: registration.coverage_status as CoverageStatus | undefined,
      coverage_waived_reason: registration.coverage_waived_reason,
    },
    {
      audience: 'participant',
      courseStartsAt: course ? toCourseStart(course) : null,
    },
  ) || null;
}

const EnrollmentCards: React.FC<EnrollmentCardsProps> = ({
  registrations,
  ownPasses = [],
  onCoverageChanged,
  onFeedback,
  onReleaseSeat,
  onPayNow,
  releasingCourseId = null,
  refundStates = {},
  receiptIds = {},
  receiptNumbers = {},
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const forcePending = isDevPendingPaymentMock();
  const canPayOnline = paymentsClientConfig().enabled;

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
      {registrations.map((registration, index) => {
        const course = registration.course as Course | undefined;
        if (!course) return null;

        const isWaitlist = registration.is_waitlist;
        const paymentPending =
          registration.status === 'pending_payment' ||
          (forcePending && index === 0);
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
        const ownCancelled = isOwnCancellation(registration);
        const refundState = refundStates[registration.id];
        const pay = paymentLine(registration, course, courseCancelled, refundState);
        const progress = refundProgress(refundState);
        const usable =
          !courseCancelled &&
          !ownCancelled &&
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
        ) : ownCancelled ? (
          <span className="text-[13px] font-medium text-textMuted">Abgemeldet</span>
        ) : paymentPending ? (
          <PaymentPendingStatus
            holdExpiresAt={resolveHoldExpiresAt(registration.hold_expires_at)}
          />
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

        const receiptId = receiptIds[registration.id];
        const showFooter = Boolean(
          progress || pay || usable || receiptId || (paymentPending && !courseCancelled),
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
            {showFooter ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3.5 py-2.5 sm:px-4">
                {progress ? (
                  <RefundProgressLine progress={progress} />
                ) : paymentPending && !courseCancelled ? (
                  <p className="text-[13px] text-textMuted">
                    Platz reserviert — bitte online bezahlen.
                  </p>
                ) : pay ? (
                  <p className="text-[13px] text-textMuted tabular-nums">{pay}</p>
                ) : (
                  <span />
                )}
                {paymentPending && !courseCancelled ? (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                    {canPayOnline && onPayNow ? (
                      <button
                        type="button"
                        onClick={() => onPayNow(registration)}
                        className="inline-flex h-11 items-center justify-center rounded-full bg-brand px-4 text-[13px] font-medium text-onBrand active:bg-brandPressed"
                      >
                        {PAY_NOW_LABEL}
                      </button>
                    ) : null}
                    {onReleaseSeat ? (
                      <button
                        type="button"
                        disabled={releasingCourseId === course.id}
                        onClick={() => onReleaseSeat(registration)}
                        className="inline-flex h-11 items-center justify-center rounded-full border border-borderStrong bg-surface px-4 text-[13px] font-medium text-textMuted active:bg-surfaceSunken disabled:opacity-50"
                      >
                        {releasingCourseId === course.id ? '…' : RELEASE_SEAT_LABEL}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {receiptId && receiptNumbers[registration.id] ? (
                  <ReceiptSeeLink
                    receiptId={receiptId}
                    number={receiptNumbers[registration.id]}
                  />
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
