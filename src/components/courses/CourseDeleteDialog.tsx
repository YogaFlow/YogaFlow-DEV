import React, { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type { CourseDeleteScope } from '../../lib/useCourseDeletion';

interface CourseDeleteDialogProps {
  open: boolean;
  courseTitle: string;
  upcomingCount: number;
  scope: CourseDeleteScope;
  onScopeChange: (scope: CourseDeleteScope) => void;
  personCount: number;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const CourseDeleteDialog: React.FC<CourseDeleteDialogProps> = ({
  open,
  courseTitle,
  upcomingCount,
  scope,
  onScopeChange,
  personCount,
  deleting,
  onCancel,
  onConfirm,
}) => {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) {
        onCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, deleting, onCancel]);

  if (!open) return null;

  const showSeriesChoice = upcomingCount > 1;
  const confirmLabel =
    scope === 'series' && showSeriesChoice
      ? `${upcomingCount} Termine löschen`
      : 'Kurs löschen';
  const personLine =
    personCount === 1
      ? '1 Person ist angemeldet oder auf der Warteliste.'
      : `${personCount} Personen sind angemeldet oder auf der Warteliste.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text/50"
      onClick={deleting ? undefined : onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-delete-title"
        className="bg-surface rounded-lg border border-border shadow-lg max-w-lg w-full mx-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start">
              <AlertCircle className="w-6 h-6 text-danger mr-3 flex-shrink-0 mt-0.5" aria-hidden />
              <div>
                <h3 id="course-delete-title" className="text-lg font-medium text-text mb-1">
                  Kurs löschen
                </h3>
                <p className="text-sm text-textMuted">{courseTitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-textSubtle hover:text-textMuted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
              aria-label="Abbrechen"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <div className="space-y-4">
            {showSeriesChoice ? (
              <div className="space-y-2">
                <label className="flex items-start p-3.5 border border-border rounded-md cursor-pointer hover:bg-surfaceSunken transition-colors">
                  <input
                    type="radio"
                    value="single"
                    checked={scope === 'single'}
                    disabled={deleting}
                    onChange={() => onScopeChange('single')}
                    className="w-4 h-4 text-danger border-border focus:ring-danger mt-0.5"
                  />
                  <div className="ml-3">
                    <span className="block text-sm font-medium text-text">Nur diesen Termin löschen</span>
                    <span className="block text-sm text-textMuted mt-1">
                      Die anderen Termine der Serie bleiben bestehen.
                    </span>
                  </div>
                </label>

                <label className="flex items-start p-3.5 border border-border rounded-md cursor-pointer hover:bg-surfaceSunken transition-colors">
                  <input
                    type="radio"
                    value="series"
                    checked={scope === 'series'}
                    disabled={deleting}
                    onChange={() => onScopeChange('series')}
                    className="w-4 h-4 text-danger border-border focus:ring-danger mt-0.5"
                  />
                  <div className="ml-3">
                    <span className="block text-sm font-medium text-text">
                      Alle {upcomingCount} kommenden Termine löschen
                    </span>
                    <span className="block text-sm text-textMuted mt-1">
                      Vergangene Termine der Serie bleiben erhalten.
                    </span>
                  </div>
                </label>
              </div>
            ) : null}

            {personCount > 0 ? (
              <div className="p-4 bg-accentSoft border border-accent rounded-sm">
                <p className="text-sm font-medium text-accentText">{personLine}</p>
                <p className="text-sm text-accentText mt-1">
                  Die Anmeldungen werden gelöscht. Es wird niemand benachrichtigt.
                </p>
              </div>
            ) : null}

            <div className="p-4 bg-dangerSoft border border-danger rounded-sm">
              <p className="text-sm font-medium text-danger">Das kann nicht rückgängig gemacht werden.</p>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-border">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="inline-flex min-h-11 items-center px-4 text-[15px] font-medium text-textMuted bg-surfaceSunken rounded-sm hover:bg-borderStrong transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="inline-flex min-h-11 items-center px-4 text-[15px] font-medium bg-danger text-onBrand rounded-sm active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {deleting ? 'Wird gelöscht …' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CourseDeleteDialog;
