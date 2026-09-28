import { useEffect, useState } from 'react';
import { asCivilIsoDate, clampCivilIsoDate } from '../../lib/courseDateTime';
import { formatNumericDate } from '../../lib/format';
import {
  TAX_CHOICES,
  TAX_DIALOG_NOTE,
  type TaxChoice,
  type TaxDateSuggestion,
  choiceShortLabel,
  loadTaxDateSuggestion,
  setTaxSetting,
} from '../../lib/taxStatus';

type Props = {
  open: boolean;
  hasSetting: boolean;
  initialChoice: TaxChoice;
  onClose: () => void;
  onSaved: () => void;
};

export default function TaxStatusDialog({
  open,
  hasSetting,
  initialChoice,
  onClose,
  onSaved,
}: Props) {
  const [choice, setChoice] = useState<TaxChoice>(initialChoice);
  const [date, setDate] = useState('');
  const [suggestion, setSuggestion] = useState<TaxDateSuggestion | null>(null);
  const [hint, setHint] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [errorText, setErrorText] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setChoice(initialChoice);
    setStep('form');
    setErrorText('');
    setSuggestion(null);
    setHint('');
    setDate('');
    setLoading(true);
    void (async () => {
      const next = await loadTaxDateSuggestion(hasSetting);
      if (!active) return;
      const clamped = clampCivilIsoDate(next.date, next.minDate, next.maxDate);
      setSuggestion(next);
      setDate(clamped);
      setHint(next.hint);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [open, hasSetting, initialChoice]);

  if (!open) return null;

  const applySuggestionDate = (nextDate: string, nextHint: string) => {
    const minDate = hasSetting ? nextDate : suggestion?.minDate ?? null;
    const maxDate = hasSetting ? suggestion?.maxDate ?? null : nextDate;
    const clamped = clampCivilIsoDate(nextDate, minDate, maxDate);
    setDate(clamped);
    setHint(nextHint);
    setSuggestion((current) =>
      current
        ? {
            ...current,
            date: clamped,
            hint: nextHint,
            minDate,
            maxDate,
          }
        : current,
    );
  };

  const resolvedDate = clampCivilIsoDate(date, suggestion?.minDate, suggestion?.maxDate);

  const save = async () => {
    if (busy || !resolvedDate) return;
    setBusy(true);
    setErrorText('');
    setDate(resolvedDate);
    try {
      const result = await setTaxSetting(choice, resolvedDate);
      if (!result.ok) {
        setStep('form');
        setErrorText(result.message);
        if (result.suggestDate) applySuggestionDate(result.suggestDate, result.message);
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tax-status-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg"
      >
        <h3 id="tax-status-title" className="text-[19px] font-medium text-text">
          Steuerstatus angeben
        </h3>

        {step === 'form' ? (
          <>
            <fieldset className="mt-4" disabled={loading || busy}>
              <legend className="text-[13px] text-textMuted">Steuerstatus</legend>
              <div className="mt-1 space-y-1">
                {TAX_CHOICES.map((item) => (
                  <label key={item.value} className="flex min-h-11 items-start gap-3 py-1">
                    <input
                      type="radio"
                      name="tax-choice"
                      className="mt-1"
                      checked={choice === item.value}
                      onChange={() => setChoice(item.value)}
                    />
                    <span>
                      <span className="block text-[15px] text-text">{item.title}</span>
                      <span className="block text-[13px] leading-snug text-textMuted">{item.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-4 block text-[13px] text-textMuted" htmlFor="tax-valid-from">
              Gültig ab
            </label>
            <input
              id="tax-valid-from"
              type="date"
              value={resolvedDate}
              min={suggestion?.minDate ?? undefined}
              max={suggestion?.maxDate ?? undefined}
              disabled={loading || busy}
              onChange={(event) =>
                setDate(
                  clampCivilIsoDate(
                    asCivilIsoDate(event.target.value),
                    suggestion?.minDate,
                    suggestion?.maxDate,
                  ),
                )
              }
              className="mt-1 w-full min-h-11 rounded-sm border border-border px-3 text-[15px] text-text focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand"
            />
            {errorText ? (
              <p role="alert" className="mt-2 text-[15px] text-text">
                {errorText}
              </p>
            ) : hint ? (
              <p className="mt-2 text-[13px] leading-snug text-textMuted">{hint}</p>
            ) : null}

            <p className="mt-4 text-[13px] leading-snug text-textMuted">{TAX_DIALOG_NOTE}</p>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-medium text-textMuted active:bg-surfaceSunken"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!resolvedDate) return;
                  setDate(resolvedDate);
                  setErrorText('');
                  setStep('confirm');
                }}
                disabled={loading || busy || !resolvedDate}
                className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
              >
                Weiter
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-[17px] text-text">
              Ab {formatNumericDate(resolvedDate)}: {choiceShortLabel(choice)}. Richtig?
            </p>
            <p className="mt-3 text-[13px] leading-snug text-textMuted">{TAX_DIALOG_NOTE}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep('form')}
                disabled={busy}
                className="inline-flex min-h-11 items-center rounded-full px-5 text-[15px] font-medium text-textMuted active:bg-surfaceSunken"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={busy}
                className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
              >
                {busy ? 'Wird gespeichert…' : 'Speichern'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
