import React, { useEffect, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { adjustPassUnits } from '../../lib/passes';

type Props = {
  open: boolean;
  passName: string;
  remaining: number;
  passId: string;
  onClose: () => void;
  onAdjusted: (remaining: number) => void;
};

const AdjustPassDialog: React.FC<Props> = ({
  open,
  passName,
  remaining,
  passId,
  onClose,
  onAdjusted,
}) => {
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDelta(1);
    setReason('');
    setBusy(false);
    setError('');
  }, [open, passId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const after = remaining + delta;
  const reasonLen = reason.trim().length;
  const reasonOk = reasonLen >= 3 && reasonLen <= 200;
  const canSubmit = !busy && delta !== 0 && reasonOk && after >= 0;

  const bump = (step: number) => {
    setDelta((current) => {
      const next = Math.min(10, Math.max(-10, current + step));
      return next === 0 ? (step > 0 ? 1 : -1) : next;
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    const result = await adjustPassUnits(passId, delta, reason.trim());
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onAdjusted(result.remaining);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/45 p-4"
      onClick={busy ? undefined : onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-pass-title"
        className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="adjust-pass-title" className="text-lg font-semibold text-text">
              Karte korrigieren
            </h3>
            <p className="mt-1 text-sm text-textMuted">{passName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-textSubtle disabled:opacity-50"
            aria-label="Schließen"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => bump(-1)}
            disabled={busy || delta <= -10}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border text-text active:bg-surfaceSunken disabled:opacity-40"
            aria-label="Weniger"
          >
            <Minus className="h-5 w-5" aria-hidden />
          </button>
          <p className="min-w-[4rem] text-center text-[22px] font-medium tabular-nums text-text">
            {delta > 0 ? `+${delta}` : delta}
          </p>
          <button
            type="button"
            onClick={() => bump(1)}
            disabled={busy || delta >= 10}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border text-text active:bg-surfaceSunken disabled:opacity-40"
            aria-label="Mehr"
          >
            <Plus className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <p className="mt-3 text-center text-[15px] tabular-nums text-textMuted">
          danach: noch {after}
        </p>

        <label className="mt-5 block">
          <span className="text-xs text-textMuted">
            Grund · {reason.length}/200
          </span>
          <textarea
            value={reason}
            maxLength={200}
            rows={3}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-sm border border-borderStrong px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
        <p className="mt-1 text-[13px] text-textSubtle">
          Der Grund ist nur für die Studioleitung sichtbar.
        </p>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-text">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-6 py-2 text-sm font-semibold text-textMuted hover:bg-surfaceSunken disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-full bg-brand px-6 py-2 text-sm font-semibold text-onBrand active:bg-brandPressed disabled:opacity-50"
          >
            {busy ? 'Bitte warten…' : 'Korrigieren'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdjustPassDialog;
