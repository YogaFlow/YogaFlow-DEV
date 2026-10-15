import React, { useState } from 'react';
import type { ManagedPass } from '../../lib/passes';
import { formatPassUntil } from '../../lib/passes';
import { supabase } from '../../lib/supabase';

type Props = {
  open: boolean;
  pass: ManagedPass | null;
  onClose: () => void;
  onSaved: () => void;
};

const ExtendPassDialog: React.FC<Props> = ({ open, pass, onClose, onSaved }) => {
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!open || !pass) return;
    setUntil(pass.valid_until);
    setNote('');
    setError('');
    setBusy(false);
  }, [open, pass]);

  if (!open || !pass) return null;

  const submit = async () => {
    if (busy) return;
    if (!note.trim()) {
      setError('Notiz ist Pflicht.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      setError('Bitte ein Datum im Format JJJJ-MM-TT wählen.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data, error: err } = await supabase.rpc('extend_pass', {
        p_pass_id: pass.id,
        p_new_valid_until: until,
        p_note: note.trim(),
      });
      if (err) {
        setError('Verlängern fehlgeschlagen.');
        return;
      }
      const body = (data ?? {}) as { success?: boolean; error?: string };
      if (body.success !== true) {
        setError(
          body.error === 'INVALID_DATE'
            ? 'Das neue Datum muss nach dem bisherigen liegen.'
            : 'Verlängern fehlgeschlagen.',
        );
        return;
      }
      onSaved();
      onClose();
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
        className="w-full max-w-md rounded-t-lg border border-border bg-surface p-5 sm:rounded-lg"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-labelledby="extend-pass-title"
        data-testid="extend-pass-dialog"
      >
        <h3 id="extend-pass-title" className="text-lg font-semibold text-text">
          Kurskarte verlängern
        </h3>
        <p className="mt-1 text-sm text-textMuted">
          {pass.name} · bisher gültig bis {formatPassUntil(pass.valid_until)}
        </p>
        <label className="mt-4 block text-sm text-textMuted" htmlFor="extend-until">
          Neues Ablaufdatum
        </label>
        <input
          id="extend-until"
          type="date"
          value={until}
          onChange={(ev) => setUntil(ev.target.value)}
          className="mt-1 w-full rounded-sm border border-borderStrong px-3 py-2.5 tabular-nums"
        />
        <label className="mt-3 block text-sm text-textMuted" htmlFor="extend-note">
          Notiz (Pflicht)
        </label>
        <textarea
          id="extend-note"
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          rows={3}
          className="mt-1 w-full rounded-sm border border-borderStrong px-3 py-2.5"
          data-testid="extend-pass-note"
        />
        {error ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 items-center px-4 text-[15px] text-textMuted"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand disabled:opacity-50"
            data-testid="extend-pass-submit"
          >
            {busy ? 'Speichern…' : 'Verlängern'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExtendPassDialog;
