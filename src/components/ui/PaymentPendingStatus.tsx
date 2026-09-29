import React from 'react';
import { Clock } from 'lucide-react';
import {
  PAYMENT_PENDING_SHORT,
  paymentPendingDeadlinePhrase,
} from '../../lib/pendingPaymentLabel';
import AccentPill from '../ui/AccentPill';

type Props = {
  holdExpiresAt?: string | null;
  /** Nur Pill, ohne Fristzeile (enge Listen). */
  compact?: boolean;
  className?: string;
};

/**
 * Safran-Status „Zahlung ausstehend“ — immer Pill (Text) + optional Frist mit Uhr-Icon.
 * Nie Farbe allein.
 */
const PaymentPendingStatus: React.FC<Props> = ({
  holdExpiresAt,
  compact = false,
  className,
}) => {
  const deadline = paymentPendingDeadlinePhrase(holdExpiresAt);
  return (
    <span
      className={`inline-flex flex-col items-end gap-0.5${className ? ` ${className}` : ''}`}
    >
      <AccentPill>{PAYMENT_PENDING_SHORT}</AccentPill>
      {!compact && deadline ? (
        <span className="inline-flex max-w-[16rem] items-center gap-1 text-left text-[13px] font-medium leading-snug text-accentText tabular-nums">
          <Clock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span>{deadline}</span>
        </span>
      ) : null}
    </span>
  );
};

export default PaymentPendingStatus;
