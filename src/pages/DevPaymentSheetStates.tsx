/**
 * DEV-only: PaymentSheet-Zustände für Screenshots (?paymentSheet=…).
 * Kein Stripe-Aufruf; bereit = gleich hoher Platzhalter statt Payment Element.
 */
import React, { useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Lock, Loader2 } from 'lucide-react';
import PaymentSheetView, {
  PaymentFormPlaceholder,
  type PaymentSheetViewPhase,
} from '../features/payments/PaymentSheetView';
import {
  PAYMENT_HOLD_EXPIRED,
  PAYMENT_REFUND_REQUIRED,
  PAYMENT_RETRY_LABEL,
  PAYMENT_SUBMITTING,
  payAmountLabel,
  paymentHoldHint,
  paymentMessageForCode,
  paymentSecureHint,
} from '../lib/paymentTexts';
import { formatCents } from '../lib/format';

const DEV_STATES = [
  'preparing',
  'ready',
  'submitting',
  'processing',
  'success',
  'refund_required',
  'hold_expired',
  'error',
  'online_disabled',
  'not_pending',
] as const;

type DevState = (typeof DEV_STATES)[number];

function readDevState(raw: string | null): DevState | null {
  if (!raw) return null;
  return (DEV_STATES as readonly string[]).includes(raw) ? (raw as DevState) : null;
}

function FakePayFooter({
  submitting,
  alert,
  studioName,
  label,
}: {
  submitting?: boolean;
  alert?: string | null;
  studioName: string;
  label: string;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-4 border-t border-border bg-surface px-5 pt-3 pb-3">
      {alert ? (
        <p role="alert" className="mb-3 text-[13px] leading-snug text-danger">
          {alert}
        </p>
      ) : null}
      <button
        type="button"
        disabled={submitting}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span>{PAYMENT_SUBMITTING}</span>
          </>
        ) : (
          label
        )}
      </button>
      <p className="mt-2 inline-flex items-start gap-1.5 text-[12px] leading-snug text-textMuted">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{paymentSecureHint(studioName)}</span>
      </p>
    </div>
  );
}

const STUDIO = 'YogaFlow Demo';
const TITLE = 'Abend-Flow';
const WHEN = 'Do, 1. Okt · 16:15';
const CENTS = 2400;

export default function DevPaymentSheetStates() {
  const [params] = useSearchParams();
  const [open, setOpen] = useState(true);
  const state = readDevState(params.get('paymentSheet'));
  const amountLabel = payAmountLabel(formatCents(CENTS));
  const holdHint = paymentHoldHint('16:12', 9);

  const view = useMemo(() => {
    if (!state) return null;

    const base = {
      open: true,
      visible: true,
      studioName: STUDIO,
      courseTitle: TITLE,
      courseWhen: WHEN,
      amountCents: CENTS as number | null,
      holdHint: holdHint as string | null,
      holdMinutesLeft: 9,
      holdExpired: false,
      canClose: true,
      courseBookable: true,
      onClose: () => setOpen(false),
      onToCourse: () => setOpen(false),
      message: null as string | null,
      code: null as string | null,
      phase: 'ready' as PaymentSheetViewPhase,
      formSlot: undefined as React.ReactNode,
    };

    switch (state) {
      case 'preparing':
        return { ...base, phase: 'preparing' as const, canClose: true };
      case 'ready':
        return {
          ...base,
          phase: 'ready' as const,
          formSlot: (
            <div>
              <PaymentFormPlaceholder label="Payment Element (DEV-Platzhalter)" />
              <FakePayFooter studioName={STUDIO} label={amountLabel} />
            </div>
          ),
        };
      case 'submitting':
        return {
          ...base,
          phase: 'submitting' as const,
          canClose: false,
          formSlot: (
            <div>
              <PaymentFormPlaceholder label="Payment Element (gesperrt)" />
              <FakePayFooter studioName={STUDIO} label={amountLabel} submitting />
            </div>
          ),
        };
      case 'processing':
        return {
          ...base,
          phase: 'processing' as const,
          canClose: false,
          code: null,
        };
      case 'success':
        return {
          ...base,
          phase: 'done' as const,
          code: 'COMPLETED',
          message: paymentMessageForCode('COMPLETED'),
        };
      case 'refund_required':
        return {
          ...base,
          phase: 'done' as const,
          code: 'REFUND_REQUIRED',
          message: PAYMENT_REFUND_REQUIRED,
        };
      case 'hold_expired':
        return {
          ...base,
          phase: 'error' as const,
          code: 'HOLD_EXPIRED',
          holdExpired: true,
          holdMinutesLeft: 0,
          holdHint: null,
          message: PAYMENT_HOLD_EXPIRED,
        };
      case 'error':
        return {
          ...base,
          phase: 'error' as const,
          code: 'CARD_DECLINED',
          message: paymentMessageForCode('CARD_DECLINED'),
          formSlot: (
            <div>
              <PaymentFormPlaceholder label="Payment Element (noch sichtbar)" />
              <FakePayFooter
                studioName={STUDIO}
                label={PAYMENT_RETRY_LABEL}
                alert={paymentMessageForCode('CARD_DECLINED')}
              />
            </div>
          ),
        };
      case 'online_disabled':
        return {
          ...base,
          phase: 'error' as const,
          code: 'ONLINE_DISABLED',
          message: paymentMessageForCode('ONLINE_DISABLED'),
          amountCents: null,
          holdHint: null,
        };
      case 'not_pending':
        return {
          ...base,
          phase: 'error' as const,
          code: 'NOT_PENDING',
          message: paymentMessageForCode('NOT_PENDING'),
          amountCents: null,
          holdHint: null,
        };
      default:
        return null;
    }
  }, [state, amountLabel, holdHint]);

  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-bg p-8 text-[15px] text-text">
        <p>
          DEV-Vorschau: setze{' '}
          <code className="text-brand">?paymentSheet=&lt;zustand&gt;</code>
        </p>
        <p className="mt-2 text-textMuted">Erlaubt: {DEV_STATES.join(', ')}</p>
      </div>
    );
  }

  if (!open || !view) {
    return (
      <div className="min-h-screen bg-bg p-8 text-[15px] text-textMuted">
        Sheet geschlossen ·{' '}
        <button
          type="button"
          className="text-brand underline"
          onClick={() => setOpen(true)}
        >
          erneut öffnen
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-4 md:p-8">
      <p className="mb-3 text-[13px] font-medium uppercase tracking-wide text-textSubtle">
        DEV · paymentSheet={state}
      </p>
      <PaymentSheetView {...view} />
    </div>
  );
}
