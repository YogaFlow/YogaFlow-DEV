import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { formatCents, formatDateTime } from '../../lib/format';
import {
  DISPUTE_OPEN_HINT,
  REFUND_NOTE_MAX,
  centsToRefundInput,
  refundErrorMessage,
  refundFormError,
  refundInputToCents,
  refundReasonLabel,
  refundStatusLabel,
  refundSummary,
} from '../../lib/refundTexts';
import {
  fetchPaymentRefunds,
  requestPaymentRefund,
  type PaymentRefundDetail,
} from '../../lib/refunds';

interface PaymentRefundSheetProps {
  /** null = geschlossen */
  paymentId: string | null;
  firstName: string;
  /** Zeile unter dem Titel, z. B. „Anna Beispiel · Yin Yoga, Sa, 3. Okt“ */
  subtitle?: string;
  onClose: () => void;
  /** Nach erfolgreichem Erstatten (Liste neu laden). */
  onChanged?: () => void;
}

type Step = 'list' | 'form' | 'confirm';

const PaymentRefundSheet: React.FC<PaymentRefundSheetProps> = ({
  paymentId,
  firstName,
  subtitle,
  onClose,
  onChanged,
}) => {
  const [detail, setDetail] = useState<PaymentRefundDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState<Step>('list');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!paymentId) return;
    setLoading(true);
    setLoadError(false);
    const next = await fetchPaymentRefunds(paymentId);
    setDetail(next);
    setLoadError(next == null);
    setLoading(false);
  }, [paymentId]);

  useEffect(() => {
    if (!paymentId) return;
    setStep('list');
    setError('');
    setNote('');
    void load();
  }, [paymentId, load]);

  useEffect(() => {
    if (!paymentId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paymentId, busy, onClose]);

  if (!paymentId) return null;

  const refundable = detail?.refundable_cents ?? 0;
  const cents = refundInputToCents(amount);

  const openForm = () => {
    setAmount(centsToRefundInput(refundable));
    setNote('');
    setError('');
    setStep('form');
  };

  const toConfirm = () => {
    const problem = refundFormError(amount, note, refundable);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setStep('confirm');
  };

  const submit = async () => {
    if (cents == null || busy) return;
    setBusy(true);
    const result = await requestPaymentRefund(paymentId, cents, note);
    setBusy(false);
    if (!result.ok) {
      setError(refundErrorMessage(result.code, result.remainingCents));
      setStep('form');
      return;
    }
    setStep('list');
    await load();
    onChanged?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-text/45 sm:items-center sm:p-4"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-refund-title"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-lg border border-border bg-surface p-5 shadow-lg sm:max-w-md sm:rounded-lg sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="payment-refund-title" className="text-lg font-medium text-text">
              {step === 'list' ? 'Online-Zahlung' : 'Erstatten'}
            </h3>
            {subtitle ? <p className="mt-0.5 text-sm text-textMuted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Schließen"
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-textSubtle disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {loading && !detail ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand" />
          </div>
        ) : loadError || !detail ? (
          <p role="alert" className="mt-4 text-sm text-text">
            Die Zahlung konnte nicht geladen werden. Bitte lade die Seite neu.
          </p>
        ) : step === 'list' ? (
          <div className="mt-4 space-y-4">
            <dl className="grid grid-cols-2 gap-y-1 text-[15px] tabular-nums">
              <dt className="text-textMuted">Bezahlt</dt>
              <dd className="text-right text-text">{formatCents(detail.amount_cents)}</dd>
              <dt className="text-textMuted">Noch erstattbar</dt>
              <dd className="text-right text-text" data-testid="refundable">
                {formatCents(refundable)}
              </dd>
            </dl>

            {detail.dispute_open ? (
              <p className="flex items-start gap-2 rounded-sm border border-accent bg-accentSoft p-3 text-sm text-text">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {DISPUTE_OPEN_HINT}
              </p>
            ) : null}

            <section>
              <h4 className="text-[15px] font-medium text-text">Erstattungen</h4>
              {detail.refunds.length === 0 ? (
                <p className="mt-1 text-sm text-textMuted">Noch keine.</p>
              ) : (
                <ul className="mt-1 divide-y divide-border" data-testid="refund-list">
                  {detail.refunds.map((row) => (
                    <li key={row.id} className="py-2 text-sm">
                      <div className="flex items-baseline justify-between gap-3 tabular-nums">
                        <span className="text-text">
                          {formatCents(row.amount_cents)} · {refundReasonLabel(row.reason)}
                        </span>
                        <span className={row.status === 'failed' ? 'font-medium text-text' : 'text-textMuted'}>
                          {refundStatusLabel(row.status)}
                        </span>
                      </div>
                      <p className="text-[13px] text-textMuted">
                        {formatDateTime(row.created_at)}
                        {row.note ? ` · ${row.note}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {refundable > 0 ? (
              <div className="flex justify-end border-t border-border pt-4">
                <button
                  type="button"
                  onClick={openForm}
                  className="inline-flex min-h-11 items-center rounded-full border border-borderStrong px-5 text-[15px] font-medium text-text active:bg-surfaceSunken"
                >
                  Erstatten
                </button>
              </div>
            ) : null}
          </div>
        ) : step === 'form' ? (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-text">Betrag</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="h-11 w-32 rounded-md border border-border bg-surface px-3 text-right text-[17px] tabular-nums text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-describedby="refund-max"
                />
                <span className="text-[17px] text-text">€</span>
              </div>
              <span id="refund-max" className="mt-1 block text-[13px] text-textMuted tabular-nums">
                Höchstens {formatCents(refundable)}
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-text">Grund</span>
              <textarea
                value={note}
                maxLength={REFUND_NOTE_MAX}
                rows={2}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              <span className="mt-1 flex justify-between text-[13px] text-textMuted">
                <span>Nur für das Studio sichtbar.</span>
                <span className="tabular-nums">
                  {note.length} / {REFUND_NOTE_MAX}
                </span>
              </span>
            </label>
            {error ? (
              <p role="alert" className="text-sm text-text">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setStep('list')}
                className="inline-flex min-h-11 items-center rounded-full bg-surfaceSunken px-4 text-[15px] font-medium text-textMuted"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={toConfirm}
                className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed"
              >
                Weiter
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-[15px] leading-6 text-text" data-testid="refund-summary">
              {refundSummary(firstName, cents ?? 0, refundable)}
            </p>
            {error ? (
              <p role="alert" className="text-sm text-text">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setStep('form')}
                disabled={busy}
                className="inline-flex min-h-11 items-center rounded-full bg-surfaceSunken px-4 text-[15px] font-medium text-textMuted disabled:opacity-50"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
              >
                {busy ? 'Bitte warten…' : `${formatCents(cents ?? 0)} erstatten`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentRefundSheet;
