/**
 * Präsentation Bezahl-Sheet (2.2b-2 / UX-2 A4) — ohne Checkout-Logik.
 */
import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Lock,
  X,
} from 'lucide-react';
import {
  PAYMENT_ACK_LABEL,
  PAYMENT_CLOSE_LABEL,
  PAYMENT_DONE_LABEL,
  PAYMENT_EMAIL_HINT,
  PAYMENT_HOLD_EXPIRED,
  PAYMENT_PROCESSING,
  PAYMENT_PROCESSING_TIMEOUT,
  PAYMENT_SHEET_TITLE,
  PAYMENT_SUCCESS_HEADLINE,
  PAYMENT_TO_COURSE_LABEL,
  paymentHoldPill,
  paymentMessageForCode,
  paymentSecureHint,
} from '../../lib/paymentTexts';
import { formatCents } from '../../lib/format';
import {
  BookingSummaryCompact,
  type BookingSummaryData,
} from '../../components/payments/BookingSummaryBlock';
import ModalBackdrop from '../../components/ui/ModalBackdrop';

export type PaymentSheetViewPhase =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'submitting'
  | 'action'
  | 'processing'
  | 'retrying'
  | 'done'
  | 'error';

export type PaymentSheetViewProps = {
  open: boolean;
  visible: boolean;
  phase: PaymentSheetViewPhase;
  code: string | null;
  message: string | null;
  studioName: string;
  courseTitle?: string | null;
  courseWhen?: string | null;
  amountCents?: number | null;
  bookingSummary?: BookingSummaryData | null;
  /** Fertige Fristzeile, z. B. paymentHoldHint(…). */
  holdHint?: string | null;
  /** Uhrzeit H:mm für Hold-Pille. */
  holdUntilHm?: string | null;
  holdMinutesLeft: number;
  holdExpired: boolean;
  canClose: boolean;
  courseBookable?: boolean;
  onClose: () => void;
  onToCourse?: () => void;
  formSlot?: React.ReactNode;
};

const FORM_PLACEHOLDER_CLASS =
  'min-h-[10rem] rounded-md border border-border bg-surfaceSunken/60';

export function PaymentFormPlaceholder({
  label = 'Formular wird geladen …',
}: {
  label?: string;
}) {
  return (
    <div
      className={`${FORM_PLACEHOLDER_CLASS} flex items-center justify-center px-3 text-[13px] text-textMuted`}
      aria-busy="true"
    >
      {label}
    </div>
  );
}

function isSuccessCode(code: string | null): boolean {
  return (
    code === 'COMPLETED' || code === 'ALREADY_COMPLETED' || code === 'RESTORED'
  );
}

function isRetryablePayError(code: string | null): boolean {
  return (
    code === 'CARD_DECLINED' ||
    code === 'AUTHENTICATION_REQUIRED' ||
    code === 'PROVIDER_UNAVAILABLE'
  );
}

function minutesUrgent(mins: number): boolean {
  return mins > 0 && mins < 3;
}

const PaymentSheetView: React.FC<PaymentSheetViewProps> = ({
  open,
  visible,
  phase,
  code,
  message,
  studioName,
  courseTitle,
  courseWhen,
  amountCents,
  bookingSummary = null,
  holdHint,
  holdUntilHm,
  holdMinutesLeft,
  holdExpired,
  canClose,
  courseBookable = false,
  onClose,
  onToCourse,
  formSlot,
}) => {
  const titleId = 'payment-sheet-title';

  if (!open) return null;

  const displayMessage = message ?? paymentMessageForCode(code);
  const amountLabel =
    amountCents != null && Number.isFinite(amountCents) ? formatCents(amountCents) : null;

  const showPreparing = phase === 'preparing' || phase === 'idle';
  const showHoldExpired = holdExpired || code === 'HOLD_EXPIRED';
  const showForm =
    Boolean(formSlot) &&
    !showHoldExpired &&
    (phase === 'ready' ||
      phase === 'submitting' ||
      phase === 'action' ||
      phase === 'retrying' ||
      (phase === 'error' && isRetryablePayError(code)));

  const showQuietError =
    phase === 'error' &&
    !showForm &&
    !showHoldExpired &&
    !isSuccessCode(code);

  const showSuccess = phase === 'done' && isSuccessCode(code);
  const showRefund = phase === 'done' && code === 'REFUND_REQUIRED';
  const showProcessing = phase === 'processing';

  const primaryCloseLabel = showRefund
    ? PAYMENT_ACK_LABEL
    : showSuccess
      ? PAYMENT_DONE_LABEL
      : PAYMENT_CLOSE_LABEL;

  const showFooterActions =
    !showForm &&
    !showPreparing &&
    phase !== 'submitting' &&
    phase !== 'action' &&
    phase !== 'retrying' &&
    (showSuccess ||
      showRefund ||
      showQuietError ||
      showHoldExpired ||
      (showProcessing && canClose) ||
      code === 'PROCESSING_TIMEOUT');

  const holdPillText =
    holdUntilHm && holdMinutesLeft > 0
      ? paymentHoldPill(holdUntilHm)
      : holdHint && holdMinutesLeft > 0
        ? holdHint
        : null;
  const holdWarn = minutesUrgent(holdMinutesLeft);

  return (
    <ModalBackdrop
      open={open}
      visible={visible}
      canDismiss={canClose}
      onDismiss={onClose}
      variant="sheet"
      panelClassName="max-w-md sm:max-w-[480px]"
      labelledBy={titleId}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h3 id={titleId} tabIndex={-1} className="text-[17px] font-medium text-text outline-none">
            {PAYMENT_SHEET_TITLE}
          </h3>
          {holdPillText && (showPreparing || showForm) ? (
            <p
              className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium tabular-nums ${
                holdWarn
                  ? 'bg-dangerSoft text-danger'
                  : 'bg-surfaceSunken text-textMuted'
              }`}
              data-testid="hold-pill"
            >
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{holdPillText}</span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={!canClose}
          onClick={onClose}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-textMuted disabled:opacity-50"
          aria-label={PAYMENT_CLOSE_LABEL}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {bookingSummary && (showPreparing || showForm) ? (
          <BookingSummaryCompact data={bookingSummary} />
        ) : (courseTitle || amountLabel) &&
          (showPreparing || showForm || showSuccess || showProcessing) ? (
          <div className="mb-4 space-y-1">
            {courseTitle ? (
              <p className="text-[15px] font-medium text-text">{courseTitle}</p>
            ) : null}
            {courseWhen ? (
              <p className="text-[13px] text-textMuted tabular-nums">{courseWhen}</p>
            ) : null}
            {amountLabel && !showSuccess ? (
              <p className="pt-1 text-[22px] font-medium leading-tight text-text tabular-nums">
                {amountLabel}
              </p>
            ) : null}
          </div>
        ) : null}

        {showPreparing ? (
          <>
            <PaymentFormPlaceholder label="Wird vorbereitet …" />
            <p className="mt-3 inline-flex items-start gap-1.5 text-[13px] leading-snug text-textMuted">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{paymentSecureHint(studioName)}</span>
            </p>
          </>
        ) : null}

        {showProcessing ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-brand" aria-hidden />
            <p className="text-[15px] font-medium text-text">{PAYMENT_PROCESSING}</p>
            {code === 'PROCESSING_TIMEOUT' ? (
              <p className="text-[13px] text-textMuted">{PAYMENT_PROCESSING_TIMEOUT}</p>
            ) : null}
          </div>
        ) : null}

        {showSuccess ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
            <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
            <p className="text-[17px] font-medium text-text">{PAYMENT_SUCCESS_HEADLINE}</p>
            {courseTitle ? (
              <p className="text-[13px] text-textMuted">
                {courseTitle}
                {courseWhen ? ` · ${courseWhen}` : ''}
              </p>
            ) : null}
            <p className="text-[13px] text-textMuted">{PAYMENT_EMAIL_HINT}</p>
          </div>
        ) : null}

        {showRefund ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" role="status">
            <Info className="h-10 w-10 text-textMuted" aria-hidden />
            <p className="text-[15px] leading-snug text-text">{displayMessage}</p>
          </div>
        ) : null}

        {showHoldExpired && !showSuccess && !showRefund ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Clock className="h-10 w-10 text-accent" aria-hidden />
            <p className="text-[15px] leading-snug text-text">{PAYMENT_HOLD_EXPIRED}</p>
          </div>
        ) : null}

        {showQuietError ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertCircle className="h-10 w-10 text-textMuted" aria-hidden />
            <p className="text-[15px] leading-snug text-text">{displayMessage}</p>
          </div>
        ) : null}

        {showForm ? <div className="space-y-3">{formSlot}</div> : null}
      </div>

      {showFooterActions ? (
        <div className="shrink-0 border-t border-border bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-2">
            {showHoldExpired && courseBookable && onToCourse ? (
              <button
                type="button"
                onClick={onToCourse}
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed"
              >
                {PAYMENT_TO_COURSE_LABEL}
              </button>
            ) : null}
            {canClose ? (
              <button
                type="button"
                onClick={onClose}
                className={`inline-flex h-11 w-full items-center justify-center rounded-full px-5 text-[15px] font-medium ${
                  showSuccess
                    ? 'bg-brand text-onBrand active:bg-brandPressed'
                    : 'border border-borderStrong bg-surface text-text active:bg-surfaceSunken'
                }`}
              >
                {primaryCloseLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ModalBackdrop>
  );
};

export default PaymentSheetView;
