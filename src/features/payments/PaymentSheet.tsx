/**
 * Bezahl-Sheet (Z1): mobil von unten, Desktop mittig.
 * L1: Reload erst beim Schließen. L2: Retry mit neuem prepare/attempt.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentsClientConfig } from '../../lib/paymentsClientConfig';
import {
  resolveOpenSheetHoldExpiry,
  shouldRefreshRegistrationsOnSheetClose,
} from '../../lib/checkoutPhaseMachine';
import {
  PAYMENT_RETRY_LABEL,
  paymentHoldHint,
  paymentMessageForCode,
  payAmountLabel,
} from '../../lib/paymentTexts';
import { formatBerlinDateTime } from '../../lib/courseDateTime';
import { formatCents } from '../../lib/format';
import {
  clearPaymentAttempt,
  storePaymentAttempt,
  usePaymentCheckout,
} from './usePaymentCheckout';
import StripePaymentForm, { handleStripeNextAction } from './StripePaymentForm';
import PaymentSheetView from './PaymentSheetView';

export type PaymentSheetOutcome = {
  phase: 'done' | 'error' | 'processing';
  code: string | null;
  message?: string | null;
};

type Props = {
  open: boolean;
  registrationId: string | null;
  studioName: string;
  /** Fallback-Frist, falls prepare noch läuft. */
  holdExpiresAt?: string | null;
  courseTitle?: string | null;
  courseWhen?: string | null;
  courseId?: string | null;
  /** HOLD_EXPIRED: „Zum Kurs“ nur wenn noch buchbar. */
  courseBookable?: boolean;
  /** Ergebnis nach 3-D-Secure-Return — kein prepare. */
  outcome?: PaymentSheetOutcome | null;
  onClose: () => void;
  /** L1: erst beim Schließen nach Endzustand — nicht schon bei Erfolg im Sheet. */
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
  const m = full.match(/(\d{1,2}:\d{2})\s*Uhr/);
  return m?.[1] ?? '';
}

const PaymentSheet: React.FC<Props> = ({
  open,
  registrationId,
  studioName,
  holdExpiresAt,
  courseTitle,
  courseWhen,
  courseId,
  courseBookable = false,
  outcome = null,
  onClose,
  onFinished,
}) => {
  const navigate = useNavigate();
  const config = useMemo(() => paymentsClientConfig(), []);
  const checkout = usePaymentCheckout();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);

  const outcomeMode = outcome != null;

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
    if (!open || !registrationId || outcomeMode) return;
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
  }, [open, registrationId, outcomeMode]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [open]);

  const holdIso = checkout.prepare?.holdExpiresAt ?? holdExpiresAt ?? null;
  void tick;
  const expiry = resolveOpenSheetHoldExpiry({
    sheetOpen: open && !outcomeMode,
    phase: checkout.phase,
    code: checkout.code,
    holdExpiresAt: holdIso,
    nowMs: Date.now(),
  });
  const mins = minutesUntil(holdIso);
  const holdExpired = expiry.code === 'HOLD_EXPIRED';

  useEffect(() => {
    if (!open || outcomeMode || !holdIso) return;
    const ms = new Date(holdIso).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return;
    const t = window.setTimeout(() => setTick((n) => n + 1), ms);
    return () => window.clearTimeout(t);
  }, [open, outcomeMode, holdIso]);

  useEffect(() => {
    if (!open || outcomeMode) return;
    if (expiry.code !== 'HOLD_EXPIRED') return;
    if (checkout.code === 'HOLD_EXPIRED') return;
    checkout.fail('HOLD_EXPIRED');
  }, [open, outcomeMode, expiry.code, checkout.code, checkout.fail]);

  const timeHm = clockHm(holdIso);
  const holdHint =
    holdIso && !holdExpired && timeHm ? paymentHoldHint(timeHm, mins) : null;

  const phase = outcomeMode ? outcome.phase : checkout.phase;
  const code = outcomeMode ? outcome.code : checkout.code;
  const message = outcomeMode
    ? outcome.message ?? paymentMessageForCode(outcome.code)
    : checkout.message;

  const busy = outcomeMode ? phase === 'processing' : checkout.busy;
  const canClose =
    !busy ||
    phase === 'done' ||
    phase === 'error' ||
    code === 'PROCESSING_TIMEOUT';

  const requestClose = useCallback(() => {
    if (!canClose) return;
    if (registrationId && !outcomeMode) clearPaymentAttempt(registrationId);
    const shouldRefresh = shouldRefreshRegistrationsOnSheetClose(
      phase === 'processing' && code === 'PROCESSING_TIMEOUT' ? 'done' : phase,
      true,
    );
    if (!outcomeMode) checkout.reset();
    onClose();
    if (shouldRefresh) onFinished();
  }, [
    canClose,
    registrationId,
    outcomeMode,
    phase,
    code,
    checkout,
    onClose,
    onFinished,
  ]);

  const onRetry = async () => {
    if (!registrationId) return;
    clearPaymentAttempt(registrationId);
    await checkout.runRetryPrepare(registrationId);
  };

  const onSubmitToken = async (tokenId: string) => {
    if (!registrationId || !checkout.prepare || !config.publishableKey) return;
    if (holdExpired) {
      checkout.fail('HOLD_EXPIRED');
      return;
    }
    // L2: nie confirm mit failed/canceled attempt — prepare muss ready sein.
    if (checkout.phase !== 'ready') return;
    storePaymentAttempt(registrationId, checkout.prepare.attemptId);
    const attemptId = checkout.prepare.attemptId;
    const result = await checkout.runConfirm(attemptId, tokenId);
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
      await checkout.pollUntilDone(attemptId);
    }
    clearPaymentAttempt(registrationId);
    // L1: kein onFinished hier — Reload erst beim Schließen.
  };

  const amountCents = checkout.prepare?.amountCents ?? null;
  const showLiveForm =
    !outcomeMode &&
    (phase === 'ready' ||
      phase === 'submitting' ||
      phase === 'action' ||
      phase === 'retrying' ||
      (phase === 'error' &&
        (code === 'CARD_DECLINED' ||
          code === 'AUTHENTICATION_REQUIRED' ||
          code === 'PROVIDER_UNAVAILABLE'))) &&
    checkout.prepare &&
    config.publishableKey &&
    !holdExpired &&
    code !== 'HOLD_EXPIRED';

  const formAlert =
    phase === 'error' &&
    (code === 'CARD_DECLINED' ||
      code === 'AUTHENTICATION_REQUIRED' ||
      code === 'PROVIDER_UNAVAILABLE')
      ? message ?? paymentMessageForCode(code)
      : null;

  const submitLabel =
    phase === 'error' && formAlert
      ? PAYMENT_RETRY_LABEL
      : amountCents != null
        ? payAmountLabel(formatCents(amountCents))
        : undefined;

  if (!mounted || !open) return null;

  return (
    <PaymentSheetView
      open
      visible={visible}
      phase={phase}
      code={code}
      message={message}
      studioName={studioName}
      courseTitle={courseTitle}
      courseWhen={courseWhen}
      amountCents={amountCents}
      holdHint={holdHint}
      holdMinutesLeft={mins}
      holdExpired={holdExpired || code === 'HOLD_EXPIRED'}
      canClose={canClose}
      courseBookable={courseBookable}
      onClose={requestClose}
      onToCourse={
        courseId
          ? () => {
              requestClose();
              navigate(`/course/${courseId}`);
            }
          : undefined
      }
      formSlot={
        showLiveForm && checkout.prepare && config.publishableKey ? (
          <StripePaymentForm
            publishableKey={config.publishableKey}
            accountRef={checkout.prepare.accountRef}
            amountCents={checkout.prepare.amountCents}
            currency={checkout.prepare.currency || 'eur'}
            disabled={checkout.busy}
            holdExpired={holdExpired}
            studioName={studioName}
            alertMessage={formAlert}
            submitLabel={submitLabel}
            onRetry={formAlert ? onRetry : undefined}
            onSubmitToken={onSubmitToken}
          />
        ) : undefined
      }
    />
  );
};

export default PaymentSheet;
