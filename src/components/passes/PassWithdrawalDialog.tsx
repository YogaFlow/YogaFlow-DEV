import React, { useEffect, useState } from 'react';
import type { ManagedPass } from '../../lib/passes';
import { formatCents } from '../../lib/format';
import {
  passWithdrawalCalcLine,
  passWithdrawalUpcomingNotice,
} from '../../lib/passOnlineTexts';
import { supabase } from '../../lib/supabase';

type Preview = {
  refund_cents: number;
  wertersatz_cents: number;
  units_used: number;
  units_used_upcoming?: number;
  upcoming_dates?: string[];
  units_total: number;
  price_cents: number;
  within_window: boolean;
  withdrawal_deadline_at: string;
  name: string;
};

type Props = {
  open: boolean;
  pass: ManagedPass | null;
  onClose: () => void;
  onDone: () => void;
};

const PassWithdrawalDialog: React.FC<Props> = ({ open, pass, onClose, onDone }) => {
  const [step, setStep] = useState<'form' | 'summary'>('form');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  useEffect(() => {
    if (!open || !pass) return;
    setStep('form');
    setPreview(null);
    setError('');
    setDoneMsg('');
    setBusy(false);
    void supabase
      .rpc('get_pass_withdrawal_preview', { p_pass_id: pass.id })
      .then(({ data, error: err }) => {
        if (err) {
          setError('Widerruf konnte nicht geladen werden.');
          return;
        }
        const body = (data ?? {}) as Preview & { success?: boolean; error?: string };
        if (body.success === false) {
          setError(
            body.error === 'WINDOW_EXPIRED'
              ? 'Die Widerrufsfrist für diesen Kauf ist abgelaufen.'
              : 'Widerruf ist für diese Karte nicht möglich.',
          );
          return;
        }
        setPreview(body as Preview);
      });
  }, [open, pass]);

  if (!open || !pass) return null;

  const upcomingDates = Array.isArray(preview?.upcoming_dates)
    ? preview.upcoming_dates.map(String)
    : [];
  const upcomingNotice = passWithdrawalUpcomingNotice(upcomingDates);
  const calc =
    preview != null
      ? passWithdrawalCalcLine({
          priceCents: preview.price_cents,
          unitsTotal: preview.units_total,
          unitsUsed: preview.units_used,
          unitsUsedUpcoming: preview.units_used_upcoming ?? 0,
        })
      : '';

  const confirm = async () => {
    if (!pass || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('confirm_pass_withdrawal', {
        p_pass_id: pass.id,
      });
      if (err) {
        setError('Widerruf fehlgeschlagen. Bitte versuche es erneut.');
        return;
      }
      const body = (data ?? {}) as {
        success?: boolean;
        error?: string;
        refund_cents?: number;
      };
      if (body.success !== true) {
        setError(
          body.error === 'WINDOW_EXPIRED'
            ? 'Die Widerrufsfrist für diesen Kauf ist abgelaufen.'
            : body.error === 'ALREADY_WITHDRAWN'
              ? 'Dieser Vertrag wurde bereits widerrufen.'
              : 'Widerruf fehlgeschlagen.',
        );
        return;
      }
      setDoneMsg(
        `Widerruf bestätigt. ${formatCents(body.refund_cents ?? 0)} werden erstattet. Du erhältst eine Eingangsbestätigung per E-Mail.`,
      );
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/45 p-0 sm:items-center sm:p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-lg border border-border bg-surface p-5 sm:rounded-lg"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-wd-title"
        data-testid="pass-withdrawal-dialog"
      >
        <h3 id="pass-wd-title" className="text-lg font-semibold text-text">
          Vertrag widerrufen
        </h3>

        {doneMsg ? (
          <p className="mt-4 text-[15px] text-text">{doneMsg}</p>
        ) : error && !preview ? (
          <p className="mt-4 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : step === 'form' ? (
          <div className="mt-4 space-y-3">
            <p className="text-[15px] text-text">
              Du widerrufst den Kauf von „{pass.name}“.
            </p>
            {preview && !preview.within_window ? (
              <p className="text-sm text-danger">
                Die Widerrufsfrist für diesen Kauf ist abgelaufen.
              </p>
            ) : (
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand"
                onClick={() => setStep('summary')}
                disabled={!preview?.within_window}
              >
                Weiter zur Zusammenfassung
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {upcomingNotice ? (
              <p className="text-sm text-text" data-testid="pass-withdrawal-upcoming">
                {upcomingNotice}
              </p>
            ) : null}
            <p className="text-[15px] tabular-nums text-text" data-testid="pass-withdrawal-calc">
              {calc}
            </p>
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-danger px-5 text-[15px] font-medium text-onBrand disabled:opacity-50"
              onClick={() => void confirm()}
              data-testid="pass-withdrawal-confirm"
            >
              {busy ? 'Wird bestätigt…' : 'Widerruf bestätigen'}
            </button>
          </div>
        )}

        <button
          type="button"
          className="mt-4 inline-flex min-h-11 items-center text-[15px] text-textMuted"
          onClick={onClose}
          disabled={busy}
        >
          {doneMsg ? 'Schließen' : 'Abbrechen'}
        </button>
      </div>
    </div>
  );
};

export default PassWithdrawalDialog;
