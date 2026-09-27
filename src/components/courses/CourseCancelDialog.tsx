import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { CourseCancelDialogModel, CourseCancelScope } from '../../lib/useCourseCancellation';

interface CourseCancelDialogProps {
  dialog: CourseCancelDialogModel;
  onScopeChange: (scope: CourseCancelScope) => void;
  onNoteChange: (note: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function peopleLine(count: number, one: string, many: string): string {
  return count === 1 ? one : many.replace('%n', String(count));
}

const CourseCancelDialog: React.FC<CourseCancelDialogProps> = ({
  dialog,
  onScopeChange,
  onNoteChange,
  onCancel,
  onConfirm,
}) => {
  useEffect(() => {
    if (!dialog.open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !dialog.busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog.open, dialog.busy, onCancel]);

  if (!dialog.open) return null;

  const cancelling = dialog.mode === 'cancel';
  const showSeries = dialog.seriesCount > 1;
  const enrolled = peopleLine(
    dialog.registered,
    '1 Person ist angemeldet',
    '%n Personen sind angemeldet',
  );
  const waiting = peopleLine(
    dialog.waitlist,
    '1 auf der Warteliste',
    '%n auf der Warteliste',
  );
  const paidLine =
    dialog.paid == null || dialog.paid < 1
      ? null
      : `${peopleLine(
          dialog.paid,
          '1 Person hat bereits bezahlt',
          '%n haben bereits bezahlt',
        )}. Die Rückgaben vermerkst du danach unter Rückgaben.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/50 p-4"
      onClick={dialog.busy ? undefined : onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-cancel-title"
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 id="course-cancel-title" className="text-lg font-medium text-text">
                {cancelling ? 'Kurs absagen' : 'Absage zurücknehmen'}
              </h3>
              <p className="mt-1 text-sm text-textMuted">{dialog.courseTitle}</p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={dialog.busy}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-textSubtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              aria-label="Schließen"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {showSeries ? (
            <div className="space-y-2">
              <label className="flex cursor-pointer items-start rounded-md border border-border p-3.5">
                <input
                  type="radio"
                  name="course-cancel-scope"
                  checked={dialog.scope === 'single'}
                  disabled={dialog.busy}
                  onChange={() => onScopeChange('single')}
                  className="mt-0.5 h-4 w-4 border-border text-brand focus:ring-brand"
                />
                <span className="ml-3 block text-sm font-medium text-text">Nur dieser Termin</span>
              </label>
              <label className="flex cursor-pointer items-start rounded-md border border-border p-3.5">
                <input
                  type="radio"
                  name="course-cancel-scope"
                  checked={dialog.scope === 'series_from_here'}
                  disabled={dialog.busy}
                  onChange={() => onScopeChange('series_from_here')}
                  className="mt-0.5 h-4 w-4 border-border text-brand focus:ring-brand"
                />
                <span className="ml-3 block text-sm font-medium text-text">
                  Dieser und alle folgenden Termine ({dialog.seriesCount})
                </span>
              </label>
            </div>
          ) : null}

          {cancelling ? (
            <label className="mt-4 block">
              <span className="text-sm font-medium text-text">
                Grund (optional, erscheint in der Benachrichtigung)
              </span>
              <textarea
                value={dialog.note}
                maxLength={200}
                rows={3}
                disabled={dialog.busy}
                onChange={(event) => onNoteChange(event.target.value)}
                className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              <span className="mt-1 block text-right text-[13px] tabular-nums text-textMuted">
                {dialog.note.length} / 200
              </span>
            </label>
          ) : (
            <p className="mt-4 text-sm leading-6 text-textMuted">
              Alle, die durch die Absage abgemeldet wurden, sind danach wieder angemeldet bzw. auf
              der Warteliste. Wer sich vorher selbst abgemeldet hatte, bleibt abgemeldet.
            </p>
          )}

          {cancelling ? (
            <div className="mt-4 rounded-sm border border-border bg-surfaceSunken p-4">
              <p className="text-sm text-text">
                {enrolled}, {waiting}. Alle bekommen eine Benachrichtigung.
              </p>
              {paidLine ? <p className="mt-2 text-sm text-text">{paidLine}</p> : null}
            </div>
          ) : null}

          {dialog.error ? (
            <p role="alert" className="mt-4 text-sm text-text">
              {dialog.error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={dialog.busy}
              className="inline-flex min-h-11 items-center rounded-sm bg-surfaceSunken px-4 text-[15px] font-medium text-textMuted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={dialog.busy}
              className={
                cancelling
                  ? 'inline-flex min-h-11 items-center rounded-sm px-4 text-[15px] font-medium text-danger hover:bg-dangerSoft focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 disabled:opacity-50'
                  : 'inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-[15px] font-medium text-onBrand active:bg-brandPressed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50'
              }
            >
              {dialog.busy
                ? 'Bitte warten…'
                : cancelling
                  ? 'Kurs absagen'
                  : 'Absage zurücknehmen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseCancelDialog;
