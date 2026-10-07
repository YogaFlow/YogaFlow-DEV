import React, { useEffect, useState } from 'react';
import type { MemberPassSummary } from '../../lib/passes';
import { usablePassChoiceLabel } from '../../lib/passes';

export type PassBookChoiceMode = 'seat' | 'waitlist';

type PassBookChoiceDialogProps = {
  open: boolean;
  mode: PassBookChoiceMode;
  pass: MemberPassSummary;
  /** Z10: Online-Pflicht — „Vor Ort“ entfällt, „Online bezahlen“ statt dessen. */
  onlineRequired?: boolean;
  /** Betrag für „Online bezahlen“, z. B. „24,00 €“. */
  onlineAmountLabel?: string | null;
  busy?: boolean;
  onConfirm: (usePass: boolean) => void;
  onCancel: () => void;
};

/**
 * Auswahl vor Selbstanmeldung: mit Karte oder vor Ort (Platz),
 * bzw. bei Online-Pflicht mit Karte oder online bezahlen;
 * Warteliste: Intent „mit Karte beim Nachrücken“.
 */
const PassBookChoiceDialog: React.FC<PassBookChoiceDialogProps> = ({
  open,
  mode,
  pass,
  onlineRequired = false,
  onlineAmountLabel = null,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const [usePass, setUsePass] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setUsePass(true);
      setMounted(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMounted(false), 180);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!mounted || !open) return null;

  const title = mode === 'waitlist' ? 'Auf die Warteliste' : 'Anmelden';
  const confirmLabel = mode === 'waitlist' ? 'Auf die Warteliste' : 'Anmelden';
  const seatOnline = mode === 'seat' && onlineRequired;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 transition-opacity duration-200 ${
        visible ? 'bg-text/45 opacity-100' : 'bg-text/0 opacity-0'
      }`}
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-book-choice-title"
        className={`w-full max-w-md rounded-t-lg border border-border bg-surface p-5 shadow-lg transition-all duration-200 sm:rounded-lg ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0 sm:translate-y-2'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="pass-book-choice-title" className="text-[17px] font-medium text-text">
          {title}
        </h3>

        {mode === 'seat' ? (
          <fieldset className="mt-4 space-y-2" disabled={busy}>
            <legend className="sr-only">Zahlungsart</legend>
            <label
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border bg-surface px-3 py-2.5 ${
                usePass ? 'border-brand' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="pass-book-choice"
                checked={usePass}
                onChange={() => setUsePass(true)}
                className="mt-1 h-4 w-4 accent-[color:var(--color-brand)]"
              />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-text">
                  {seatOnline
                    ? `Mit ${pass.name.trim() || 'Mehrfachkarte'}`
                    : `Mit ${pass.name.trim() || 'Mehrfachkarte'}`}
                </span>
                <span className="mt-0.5 block text-[13px] text-textMuted tabular-nums">
                  {usablePassChoiceLabel(pass)}
                </span>
              </span>
            </label>
            <label
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-md border bg-surface px-3 py-2.5 ${
                !usePass ? 'border-brand' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="pass-book-choice"
                checked={!usePass}
                onChange={() => setUsePass(false)}
                className="mt-1 h-4 w-4 accent-[color:var(--color-brand)]"
              />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-text">
                  {seatOnline ? 'Online bezahlen' : 'Vor Ort bezahlen'}
                </span>
                {seatOnline && onlineAmountLabel ? (
                  <span className="mt-0.5 block text-[13px] text-textMuted tabular-nums">
                    {onlineAmountLabel}
                  </span>
                ) : null}
              </span>
            </label>
          </fieldset>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="flex min-h-11 cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={usePass}
                onChange={(e) => setUsePass(e.target.checked)}
                disabled={busy}
                className="mt-1 h-4 w-4 accent-[color:var(--color-brand)]"
              />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-text">
                  Mit Mehrfachkarte bezahlen, falls ich nachrücke
                </span>
                <span className="mt-0.5 block text-[13px] text-textMuted tabular-nums">
                  {usablePassChoiceLabel(pass)}
                </span>
              </span>
            </label>
            <p className="text-[13px] leading-snug text-textMuted">
              Die Einheit wird erst abgebucht, wenn du einen Platz bekommst.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-11 items-center rounded-full px-5 text-[15px] font-medium text-textMuted disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onConfirm(usePass)}
            disabled={busy}
            className="inline-flex h-11 min-w-[7rem] items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PassBookChoiceDialog;
