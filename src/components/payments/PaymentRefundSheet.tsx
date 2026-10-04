import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { formatCents, formatDateTime } from '../../lib/format';
import {
  DISPUTE_OPEN_HINT,
  REFUND_FEE_HINT,
  REFUND_NOTE_MAX,
  REFUND_REASON_CHIPS,
  composeRefundNote,
  refundAmountError,
  refundErrorMessage,
  refundInputToCents,
  refundReasonError,
  refundReasonLabel,
  refundStatusLabel,
  refundSuccessMessage,
  type RefundAmountMode,
  type RefundReasonChip,
} from '../../lib/refundTexts';
import {
  fetchPaymentRefunds,
  requestPaymentRefund,
  type PaymentRefundDetail,
} from '../../lib/refunds';
import SegmentControl from '../ui/SegmentControl';

interface PaymentRefundSheetProps {
  /** null = geschlossen */
  paymentId: string | null;
  firstName: string;
  /** Kopf: Name · Kurs · Termin */
  subtitle?: string;
  onClose: () => void;
  /** Nach erfolgreichem Erstatten (Liste neu laden). */
  onChanged?: () => void;
}

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
  const [mode, setMode] = useState<RefundAmountMode>('all');
  const [amount, setAmount] = useState('');
  const [chip, setChip] = useState<RefundReasonChip | ''>('');
  const [extra, setExtra] = useState('');
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [successCents, setSuccessCents] = useState<number | null>(null);

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
    setMode('all');
    setAmount('');
    setChip('');
    setExtra('');
    setServerError('');
    setSuccessCents(null);
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

  useEffect(() => {
    if (successCents == null) return;
    const handle = window.setTimeout(() => {
      setSuccessCents(null);
    }, 2200);
    return () => window.clearTimeout(handle);
  }, [successCents]);

  if (!paymentId) return null;

  const refundable = detail?.refundable_cents ?? 0;
  const cents = mode === 'all' ? (refundable > 0 ? refundable : null) : refundInputToCents(amount);
  const amountProblem = refundAmountError(mode, amount, refundable);
  const reasonProblem = refundReasonError(chip, extra);
  const canSubmit =
    !busy &&
    refundable > 0 &&
    cents != null &&
    amountProblem == null &&
    reasonProblem == null;

  const submit = async () => {
    if (!canSubmit || cents == null) return;
    setBusy(true);
    setServerError('');
    const note = composeRefundNote(chip, extra);
    const result = await requestPaymentRefund(paymentId, cents, note);
    setBusy(false);
    if (!result.ok) {
      setServerError(refundErrorMessage(result.code, result.remainingCents));
      return;
    }
    setSuccessCents(result.amountCents);
    setMode('all');
    setAmount('');
    setChip('');
    setExtra('');
    await load();
    onChanged?.();
  };

  const heading = subtitle?.trim() || (firstName.trim() || 'Erstatten');
  const showForm = refundable > 0 && successCents == null;
  const amountInvalid = mode === 'partial' && amountProblem != null;

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
              {heading}
            </h3>
            {detail ? (
              <p className="mt-1 text-sm tabular-nums text-textMuted" data-testid="refundable">
                Bezahlt {formatCents(detail.amount_cents)} · noch erstattbar {formatCents(refundable)}
              </p>
            ) : null}
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
        ) : (
          <div className="mt-4 space-y-4">
            {detail.dispute_open ? (
              <p className="flex items-start gap-2 rounded-sm border border-accent bg-accentSoft p-3 text-sm text-text">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {DISPUTE_OPEN_HINT}
              </p>
            ) : null}

            {successCents != null ? (
              <p
                className="flex items-start gap-2 rounded-sm border border-border bg-successSoft p-3 text-[15px] text-text"
                data-testid="refund-success"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                {refundSuccessMessage(successCents)}
              </p>
            ) : null}

            {detail.refunds.length > 0 ? (
              <section>
                <h4 className="text-[15px] font-medium text-text">Erstattungen</h4>
                <ul className="mt-1 divide-y divide-border" data-testid="refund-list">
                  {detail.refunds.map((row) => (
                    <li key={row.id} className="py-2 text-sm">
                      <div className="flex items-baseline justify-between gap-3 tabular-nums">
                        <span className="text-text">
                          {formatCents(row.amount_cents)} · {refundReasonLabel(row.reason)}
                          {row.note ? ` · ${row.note}` : ''}
                        </span>
                        <span className={row.status === 'failed' ? 'font-medium text-text' : 'text-textMuted'}>
                          {refundStatusLabel(row.status)}
                        </span>
                      </div>
                      <p className="text-[13px] text-textMuted">{formatDateTime(row.created_at)}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {showForm ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-text">Betrag</p>
                  <SegmentControl
                    aria-label="Betrag"
                    value={mode}
                    onChange={(next) => {
                      setMode(next);
                      setServerError('');
                      if (next === 'all') setAmount('');
                    }}
                    className="mt-1"
                    options={[
                      { value: 'all', label: `Alles · ${formatCents(refundable)}` },
                      { value: 'partial', label: 'Teilbetrag' },
                    ]}
                  />
                  {mode === 'partial' ? (
                    <label className="mt-3 block">
                      <span className="sr-only">Teilbetrag</span>
                      <div className="flex items-center gap-2">
                        <input
                          inputMode="decimal"
                          autoComplete="off"
                          value={amount}
                          onChange={(event) => {
                            setAmount(event.target.value);
                            setServerError('');
                          }}
                          aria-invalid={amountInvalid}
                          aria-describedby={amountInvalid ? 'refund-amount-error' : undefined}
                          className={`h-11 w-32 rounded-md border bg-surface px-3 text-right text-[17px] tabular-nums text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                            amountInvalid ? 'border-danger' : 'border-border'
                          }`}
                        />
                        <span className="text-[17px] text-text">€</span>
                      </div>
                      {amountInvalid ? (
                        <span
                          id="refund-amount-error"
                          className="mt-1 flex items-start gap-1.5 text-[13px] text-danger"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                          {amountProblem}
                        </span>
                      ) : null}
                    </label>
                  ) : null}
                </div>

                <div>
                  <p className="text-sm font-medium text-text">Grund</p>
                  <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Grund">
                    {REFUND_REASON_CHIPS.map((item) => {
                      const selected = chip === item;
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setChip(item);
                            setServerError('');
                          }}
                          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-[15px] font-medium ${
                            selected
                              ? 'border-brand bg-brand text-onBrand'
                              : 'border-border bg-surface text-text active:bg-surfaceSunken'
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                  <label className="mt-3 block">
                    <span className="text-[13px] text-textMuted">
                      {chip === 'Sonstiges' ? 'Bitte den Grund angeben' : 'Zusatz (optional)'}
                    </span>
                    <textarea
                      value={extra}
                      maxLength={REFUND_NOTE_MAX}
                      rows={2}
                      onChange={(event) => {
                        setExtra(event.target.value);
                        setServerError('');
                      }}
                      className={`mt-1 w-full rounded-md border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        chip === 'Sonstiges' && reasonProblem ? 'border-danger' : 'border-border'
                      }`}
                    />
                    <span className="mt-1 flex justify-between text-[13px] text-textMuted">
                      <span>Nur für das Studio sichtbar.</span>
                      <span className="tabular-nums">
                        {extra.length} / {REFUND_NOTE_MAX}
                      </span>
                    </span>
                  </label>
                  {chip === 'Sonstiges' && reasonProblem ? (
                    <p className="mt-1 flex items-start gap-1.5 text-[13px] text-danger">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {reasonProblem}
                    </p>
                  ) : null}
                </div>

                {serverError ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-sm border border-danger bg-dangerSoft p-3 text-sm text-text"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
                    {serverError}
                  </div>
                ) : null}

                <div>
                  <button
                    type="button"
                    onClick={() => void submit()}
                    disabled={!canSubmit}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:bg-surfaceSunken disabled:text-textMuted"
                  >
                    {busy
                      ? 'Bitte warten…'
                      : `${formatCents(cents ?? refundable)} erstatten`}
                  </button>
                  <p className="mt-2 text-[13px] leading-5 text-textMuted">{REFUND_FEE_HINT}</p>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentRefundSheet;
