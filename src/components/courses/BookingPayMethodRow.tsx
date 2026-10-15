import { ChevronRight, Coins, CreditCard, Ticket } from 'lucide-react';
import type { BookingPayMethod } from '../../lib/bookingPaymentOptions';
import { bookingPayMethodFieldAppearance } from '../../lib/bookingBarLayout';
import {
  bookingMethodDetail,
  bookingMethodTitle,
  onlinePayHintUi,
} from '../../lib/bookingMethodTexts';

type Props = {
  method: BookingPayMethod;
  passLabel?: string | null;
  canChange: boolean;
  showOnlineHint?: boolean;
  onChange?: () => void;
  /** Z8: Tipp auf Switch-Hinweis → Auswahl Online. */
  onSwitchToOnline?: () => void;
  testId?: string;
};

function IconFor({ method }: { method: BookingPayMethod }) {
  if (method === 'pass') return <Ticket className="h-4 w-4" aria-hidden />;
  if (method === 'online') return <CreditCard className="h-4 w-4" aria-hidden />;
  return <Coins className="h-4 w-4" aria-hidden />;
}

/**
 * Zahlart als Auswahlfeld (UX-5): bei mehreren Wegen Rahmen + Chevron;
 * bei nur einem Weg reine Info ohne Rahmen.
 */
export default function BookingPayMethodRow({
  method,
  passLabel,
  canChange,
  showOnlineHint = false,
  onChange,
  onSwitchToOnline,
  testId = 'book-method-line',
}: Props) {
  const title = bookingMethodTitle(method, { label: passLabel });
  const detail = bookingMethodDetail(method);
  const appearance = bookingPayMethodFieldAppearance({
    method,
    canChange,
    showOnlineHint,
  });
  const hintUi = onlinePayHintUi({
    showOnlinePayHint: showOnlineHint,
    activeMethod: method,
  });

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
        </span>
      </span>
      {appearance.showNeuBadge ? (
        <span
          className="inline-flex shrink-0 items-center rounded-sm bg-accentSoft px-1.5 py-0.5 text-[11px] font-medium text-accentText"
          data-testid="book-online-pay-badge"
        >
          Neu
        </span>
      ) : null}
      {appearance.showChevron ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-textMuted" aria-hidden />
      ) : null}
    </>
  );

  const hint = hintUi.hintLine ? (
    hintUi.hintSwitchesToOnline && onSwitchToOnline ? (
      <button
        type="button"
        onClick={onSwitchToOnline}
        className="mt-1.5 block w-full text-left text-[12px] leading-snug text-accentText underline-offset-2 active:underline focus:outline-none focus-visible:underline"
        data-testid="book-online-pay-hint"
      >
        {hintUi.hintLine}
      </button>
    ) : (
      <span
        className="mt-1.5 block text-[12px] leading-snug text-textMuted"
        data-testid="book-online-pay-hint"
      >
        {hintUi.hintLine}
      </span>
    )
  ) : null;

  if (canChange && onChange) {
    return (
      <div data-testid={testId} data-bordered="1">
        <button
          type="button"
          onClick={onChange}
          className="flex h-12 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 text-left active:bg-surfaceSunken/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {body}
        </button>
        {hint}
      </div>
    );
  }

  return (
    <div data-testid={testId} data-bordered="0">
      <div className="flex h-12 w-full items-center gap-2 px-0">{body}</div>
      {hint}
    </div>
  );
}
