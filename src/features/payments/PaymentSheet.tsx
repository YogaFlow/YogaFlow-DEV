/**
 * Bezahl-Sheet (Z1): mobil von unten, Desktop mittig — Muster PassBookChoiceDialog.
 * Logik schlicht; Feinschliff in 2.2b-2.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { paymentsClientConfig } from '../../lib/paymentsClientConfig';
import {
  PAYMENT_HOLD_EXPIRED,
  PAYMENT_PROCESSING,
  PAYMENT_SHEET_TITLE,
  paymentHoldHint,
  paymentMessageForCode,
  paymentSecureHint,
} from '../../lib/paymentTexts';
import { formatBerlinDateTime } from '../../lib/courseDateTime';
import {
  clearPaymentAttempt,
  storePaymentAttempt,
  usePaymentCheckout,
} from './usePaymentCheckout';
import StripePaymentForm, { handleStripeNextAction } from './StripePaymentForm';

type Props = {
  open: boolean;
  registrationId: string | null;
  studioName: string;
  /** Fallback-Frist, falls prepare noch läuft. */
  holdExpiresAt?: string | null;
  onClose: () => void;
  onFinished: () => void;
};

function minutesUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil(ms / 60_000));
}

function clockHm(iso: string | null | undefined): string {
  const full = formatBerlinDateTime(iso);
  // formatBerlinDateTime → z. B. „Mi., 01.10., 16:00 Uhr“ — Uhrzeit extrahieren
  const m = full.match(/(\d{1,2}:\d{2})\s*Uhr/);
  return m?.[1] ?? '';
}

const PaymentSheet: React.FC<Props> = ({
  open,
  registrationId,
  studioName,
  holdExpiresAt,
  onClose,
  onFinished,
}) => {
  const config = useMemo(() => paymentsClientConfig(), []);
  const checkout = usePaymentCheckout();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 180);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !registrationId) return;
    if (!config.enabled || !config.publishableKey) {
      checkout.fail('ONLINE_DISABLED');
      return;
    }
    void checkout.runPrepare(registrationId);
    return () => {
      checkout.reset();
    };
    // Nur bei Öffnen / neuer Buchung neu vorbereiten
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, registrationId]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, [open]);

  const holdIso = checkout.prepare?.holdExpiresAt ?? holdExpiresAt ?? null;
  void tick;
  const mins = minutesUntil(holdIso);
  const holdExpired = Boolean(holdIso) && mins <= 0;
  const timeHm = clockHm(holdIso);

  const canClose =
    !checkout.busy ||
    checkout.phase === 'done' ||
    checkout.phase === 'error' ||
    checkout.code === 'PROCESSING_TIMEOUT';

  const requestClose = () => {
    if (!canClose) return;
    if (registrationId) clearPaymentAttempt(registrationId);
    const wasDone = checkout.phase === 'done';
    checkout.reset();
    onClose();
    if (wasDone) onFinished();
  };

  const onSubmitToken = async (tokenId: string) => {
    if (!registrationId || !checkout.prepare || !config.publishableKey) return;
    if (holdExpired) {
      checkout.fail('HOLD_EXPIRED');
      return;
    }
    storePaymentAttempt(registrationId, checkout.prepare.attemptId);
    const result = await checkout.runConfirm(checkout.prepare.attemptId, tokenId);
    if (result.kind === 'error') return;
    if (result.kind === 'requires_action') {
      const next = await handleStripeNextAction(
        config.publishableKey,
        checkout.prepare.accountRef,
        result.clientSecret,
      );
      if (!next.ok) {
        checkout.markAuthFailed();
        return;
      }
      await checkout.pollUntilDone(checkout.prepare.attemptId);
    }
    clearPaymentAttempt(registrationId);
    onFinished();
  };

  if (!mounted || !open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 transition-opacity duration-200 ${
        visible ? 'bg-text/45 opacity-100' : 'bg-text/0 opacity-0'
      }`}
      onClick={canClose ? requestClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-sheet-title"
        className={`flex max-h-[min(92vh,40rem)] w-full max-w-md flex-col overflow-hidden rounded-t-lg border border-border bg-surface p-5 shadow-lg transition-all duration-200 sm:rounded-lg ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0 sm:translate-y-2'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 id="payment-sheet-title" className="text-[17px] font-medium text-text">
            {PAYMENT_SHEET_TITLE}
          </h3>
          <button
            type="button"
            disabled={!canClose}
            onClick={requestClose}
            className="inline-flex h-11 items-center rounded-full px-3 text-[15px] font-medium text-textMuted disabled:opacity-50"
          >
            Schließen
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {holdIso && !holdExpired && timeHm ? (
            <p className="text-[13px] leading-snug text-textMuted tabular-nums">
              {paymentHoldHint(timeHm, mins)}
            </p>
          ) : null}
          {holdExpired ? (
            <p role="alert" className="text-[15px] text-text">
              {PAYMENT_HOLD_EXPIRED}
            </p>
          ) : null}

          <p className="text-[13px] leading-snug text-textMuted">
            {paymentSecureHint(studioName)}
          </p>

          {checkout.phase === 'preparing' || checkout.phase === 'idle' ? (
            <p className="text-[15px] text-textMuted">Wird vorbereitet …</p>
          ) : null}

          {checkout.phase === 'processing' ? (
            <p className="text-[15px] text-text">{PAYMENT_PROCESSING}</p>
          ) : null}

          {checkout.phase === 'done' || checkout.phase === 'error' ? (
            <p
              role={checkout.phase === 'error' ? 'alert' : 'status'}
              className="text-[15px] text-text"
            >
              {checkout.message ?? paymentMessageForCode(checkout.code)}
            </p>
          ) : null}

          {checkout.phase === 'ready' ||
          checkout.phase === 'submitting' ||
          checkout.phase === 'action' ? (
            checkout.prepare && config.publishableKey && !holdExpired ? (
              <StripePaymentForm
                publishableKey={config.publishableKey}
                accountRef={checkout.prepare.accountRef}
                amountCents={checkout.prepare.amountCents}
                currency={checkout.prepare.currency || 'eur'}
                disabled={checkout.busy}
                holdExpired={holdExpired}
                onSubmitToken={onSubmitToken}
              />
            ) : null
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PaymentSheet;
