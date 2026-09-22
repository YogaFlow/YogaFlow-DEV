import React, { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { formatDate, formatTime } from '../../lib/format';
import type { BlockedSession, CourseDeleteScope } from '../../lib/useCourseDeletion';

interface CourseDeleteDialogProps {
  open: boolean;
  courseTitle: string;
  upcomingCount: number;
  scope: CourseDeleteScope;
  onScopeChange: (scope: CourseDeleteScope) => void;
  personCount: number;
  singleHasRegistrations: boolean;
  blockedSessions: BlockedSession[];
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function sessionLabel(session: BlockedSession, sessions: BlockedSession[]): string {
  const date = formatDate(session.date);
  const sameDate = sessions.filter((other) => other.date === session.date).length > 1;
  return sameDate ? `${date}, ${formatTime(session.time)}` : date;
}

function blockedSessionsHint(sessions: BlockedSession[]): string {
  const labels = sessions.map((session) => sessionLabel(session, sessions));
  if (labels.length === 0) return '';
  if (labels.length === 1) return `${labels[0]} hat Anmeldungen.`;
  if (labels.length === 2) return `${labels[0]} und ${labels[1]} haben Anmeldungen.`;
  return `${labels.slice(0, -1).join(', ')} und ${labels[labels.length - 1]} haben Anmeldungen.`;
}

const CourseDeleteDialog: React.FC<CourseDeleteDialogProps> = ({
  open,
  courseTitle,
  upcomingCount,
  scope,
  onScopeChange,
  personCount,
  singleHasRegistrations,
  blockedSessions,
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
  const seriesBlocked = blockedSessions.length > 0;
  const confirmBlocked = showSeriesChoice
    ? scope === 'series'
      ? seriesBlocked
      : singleHasRegistrations
    : singleHasRegistrations;
  const nothingDeletable = showSeriesChoice
    ? singleHasRegistrations && seriesBlocked
    : singleHasRegistrations;
  const cancelLabel = nothingDeletable ? 'Schließen' : 'Abbrechen';
  const confirmLabel =
    scope === 'series' && showSeriesChoice
      ? `${upcomingCount} Termine löschen`
      : 'Kurs löschen';
  const personLine =
    personCount === 1
      ? '1 Person ist angemeldet oder auf der Warteliste.'
      : `${personCount} Personen sind angemeldet oder auf der Warteliste.`;
  const seriesHint = blockedSessionsHint(blockedSessions);

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
              className="inline-flex min-h-11 min-w-11 items-center justify-center text-textSubtle hover:text-textMuted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={cancelLabel}
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <div className="space-y-4">
            {showSeriesChoice ? (
              <div className="space-y-2">
                <label
                  className={`flex items-start p-3.5 border border-border rounded-md transition-colors ${
                    singleHasRegistrations
                      ? 'bg-surfaceSunken cursor-not-allowed'
                      : 'cursor-pointer hover:bg-surfaceSunken'
                  }`}
                >
                  <input
                    type="radio"
                    name="course-delete-scope"
                    value="single"
                    checked={scope === 'single'}
                    disabled={deleting || singleHasRegistrations}
                    onChange={() => onScopeChange('single')}
                    className="w-4 h-4 text-danger border-border focus:ring-danger mt-0.5 disabled:cursor-not-allowed"
                  />
                  <div className="ml-3">
                    <span
                      className={`block text-sm font-medium ${
                        singleHasRegistrations ? 'text-textSubtle' : 'text-text'
                      }`}
                    >
                      Nur diesen Termin löschen
                    </span>
                    <span className="block text-sm text-textMuted mt-1">
                      {singleHasRegistrations
                        ? 'Dieser Termin hat Anmeldungen.'
                        : 'Die anderen Termine der Serie bleiben bestehen.'}
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start p-3.5 border border-border rounded-md transition-colors ${
                    seriesBlocked
                      ? 'bg-surfaceSunken cursor-not-allowed'
                      : 'cursor-pointer hover:bg-surfaceSunken'
                  }`}
                >
                  <input
                    type="radio"
                    name="course-delete-scope"
                    value="series"
                    checked={scope === 'series'}
                    disabled={deleting || seriesBlocked}
                    onChange={() => onScopeChange('series')}
                    aria-describedby={seriesBlocked ? 'course-delete-series-block' : undefined}
                    className="w-4 h-4 text-danger border-border focus:ring-danger mt-0.5 disabled:cursor-not-allowed"
                  />
                  <div className="ml-3">
                    <span
                      className={`block text-sm font-medium ${
                        seriesBlocked ? 'text-textSubtle' : 'text-text'
                      }`}
                    >
                      Alle {upcomingCount} kommenden Termine löschen
                    </span>
                    <span className="block text-sm text-textMuted mt-1">
                      Vergangene Termine der Serie bleiben erhalten.
                    </span>
                    {seriesBlocked ? (
                      <span id="course-delete-series-block" className="block text-sm text-accentText mt-1">
                        {seriesHint}
                      </span>
                    ) : null}
                  </div>
                </label>
              </div>
            ) : null}

            {personCount > 0 ? (
              <div className="p-4 bg-accentSoft border border-accent rounded-sm">
                <p className="text-sm font-medium text-accentText">{personLine}</p>
                <p className="text-sm text-accentText mt-1">
                  Melde erst die Teilnehmenden ab. Solange Anmeldungen bestehen, bleibt der Kurs.
                </p>
              </div>
            ) : null}

            {confirmBlocked ? null : (
              <div className="p-4 bg-dangerSoft border border-danger rounded-sm">
                <p className="text-sm font-medium text-danger">Das kann nicht rückgängig gemacht werden.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-border">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="inline-flex min-h-11 items-center px-4 text-[15px] font-medium text-textMuted bg-surfaceSunken rounded-sm hover:bg-borderStrong transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmBlocked || deleting) return;
                onConfirm();
              }}
              disabled={deleting || confirmBlocked}
              aria-disabled={deleting || confirmBlocked}
              className={
                confirmBlocked
                  ? 'inline-flex min-h-11 items-center px-4 text-[15px] font-medium rounded-sm border border-border bg-surfaceSunken text-textSubtle cursor-not-allowed'
                  : 'inline-flex min-h-11 items-center px-4 text-[15px] font-medium bg-danger text-onBrand rounded-sm active:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
              }
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
