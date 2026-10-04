import { Coins, CreditCard, Ticket } from 'lucide-react';
import type { BookingPayMethod } from '../../lib/bookingPaymentOptions';
import {
  bookingMethodDetail,
  bookingMethodTitle,
  CHANGE_PAY_METHOD_LABEL,
  ONLINE_PAY_HINT_LINE,
} from '../../lib/bookingMethodTexts';

type Props = {
  method: BookingPayMethod;
  passLabel?: string | null;
  canChange: boolean;
  showOnlineHint?: boolean;
  onChange?: () => void;
  testId?: string;
};

function IconFor({ method }: { method: BookingPayMethod }) {
  if (method === 'pass') return <Ticket className="h-4 w-4" aria-hidden />;
  if (method === 'online') return <CreditCard className="h-4 w-4" aria-hidden />;
  return <Coins className="h-4 w-4" aria-hidden />;
}

/**
 * Zahlart-Zeile über dem Buchungsknopf (ZW-1 N1).
 * Bei mehreren Wegen antippbar → öffnet Auswahl-Sheet.
 */
export default function BookingPayMethodRow({
  method,
  passLabel,
  canChange,
  showOnlineHint = false,
  onChange,
  testId = 'book-method-line',
}: Props) {
  const title = bookingMethodTitle(method, { label: passLabel });
  const detail = bookingMethodDetail(method);
  const hint = showOnlineHint && method === 'online';

  const body = (
    <>
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surfaceSunken text-textMuted"
        aria-hidden
      >
        <IconFor method={method} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="text-[13px] font-medium text-text">{title}</span>
          {detail ? (
            <span className="text-[13px] text-textMuted">· {detail}</span>
          ) : null}
          {hint ? (
            <span
              className="inline-flex items-center rounded-sm bg-accentSoft px-1.5 py-0.5 text-[11px] font-medium text-accentText"
              data-testid="book-online-pay-badge"
            >
              Neu
            </span>
          ) : null}
          {canChange ? (
            <span className="text-[13px] font-medium text-brand">
              {CHANGE_PAY_METHOD_LABEL} ›
            </span>
          ) : null}
        </span>
        {hint ? (
          <span
            className="mt-0.5 block text-[12px] leading-snug text-textMuted"
            data-testid="book-online-pay-hint"
          >
            {ONLINE_PAY_HINT_LINE}
          </span>
        ) : null}
      </span>
    </>
  );

  if (canChange && onChange) {
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={onChange}
        className="flex w-full min-h-11 items-start gap-2 rounded-md text-left active:bg-surfaceSunken/60"
      >
        {body}
      </button>
    );
  }

  return (
    <div data-testid={testId} className="flex w-full items-start gap-2">
      {body}
    </div>
  );
}
