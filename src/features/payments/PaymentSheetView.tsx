/**
 * Präsentation Bezahl-Sheet (2.2b-2) — ohne Checkout-Logik.
 */
import React, { useEffect, useId, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Lock,
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
  paymentMessageForCode,
  paymentSecureHint,
} from '../../lib/paymentTexts';
import { formatCents } from '../../lib/format';
import BookingSummaryBlock, {
  type BookingSummaryData,
} from '../../components/payments/BookingSummaryBlock';

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
  return mins > 0 && mins < 2;
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
  holdMinutesLeft,
  holdExpired,
  canClose,
  courseBookable = false,
  onClose,
  onToCourse,
  formSlot,
}) => {
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      previousFocus.current?.focus?.();
      previousFocus.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!canClose) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, canClose, onClose]);

  if (!open) return null;

  const displayMessage = message ?? paymentMessageForCode(code);
  const amountLabel =
    amountCents != null && Number.isFinite(amountCents) ? formatCents(amountCents) : null;

  const showPreparing = phase === 'preparing' || phase === 'idle';
  const showHoldExpired =
    holdExpired || code === 'HOLD_EXPIRED';
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

  const holdTone = minutesUrgent(holdMinutesLeft) ? 'text-danger' : 'text-accentText';

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

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 transition-opacity duration-200 ${
        visible ? 'bg-text/45 opacity-100' : 'bg-text/0 opacity-0'
      }`}
      onClick={canClose ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-lg border border-border bg-surface shadow-lg transition-all duration-200 sm:max-h-[min(90vh,40rem)] sm:rounded-lg ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0 sm:translate-y-2'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-5">
          <h3
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
            className="text-[17px] font-medium text-text outline-none"
          >
            {PAYMENT_SHEET_TITLE}
          </h3>
          <button
            type="button"
            disabled={!canClose}
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-full px-3 text-[15px] font-medium text-textMuted disabled:opacity-50"
          >
            {PAYMENT_CLOSE_LABEL}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {bookingSummary && (showPreparing || showForm) ? (
            <BookingSummaryBlock data={bookingSummary} />
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

          {showForm ? (
            <div className="space-y-3">
              {holdHint && holdMinutesLeft > 0 ? (
                <p
                  className={`inline-flex items-start gap-1.5 text-[13px] font-medium leading-snug tabular-nums ${holdTone}`}
                >
                  <Clock
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                      minutesUrgent(holdMinutesLeft) ? 'text-danger' : 'text-accent'
                    }`}
                    aria-hidden
                  />
                  <span>{holdHint}</span>
                </p>
              ) : null}
              {formSlot}
            </div>
          ) : null}
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
      </div>
    </div>
  );
};

export default PaymentSheetView;
