import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export type RemovePersonTarget = {
  firstName: string;
  lastName: string;
  upcoming: number;
  openBookings: number;
  openCourseId: string | null;
};

interface RemovePersonDialogProps {
  target: RemovePersonTarget | null;
  busy: boolean;
  error: string | null;
  errorCode: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function upcomingLine(count: number): string {
  if (count === 1) {
    return 'Ihre kommende Anmeldung wird storniert. Wer auf der Warteliste steht, rückt nach.';
  }
  return `Ihre ${count} kommenden Anmeldungen werden storniert. Wer auf der Warteliste steht, rückt nach.`;
}

function openLine(firstName: string, count: number): string {
  const buchung = count === 1 ? '1 offene Buchung' : `${count} offene Buchungen`;
  return `${firstName} hat noch ${buchung}. Nach dem Entfernen kannst du sie ihr nicht mehr zuordnen. Kassiere oder erlasse sie vorher.`;
}

const RemovePersonDialog: React.FC<RemovePersonDialogProps> = ({
  target,
  busy,
  error,
  errorCode,
  onCancel,
  onConfirm,
}) => {
  useEffect(() => {
    if (!target) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, busy, onCancel]);

  if (!target) return null;

  const name = `${target.firstName} ${target.lastName}`.trim();
  const openHref = target.openBookings === 1 && target.openCourseId
    ? `/course/${target.openCourseId}/kassieren`
    : '/participants';
  const openLabel = target.openBookings === 1 && target.openCourseId
    ? 'Zur Kasse'
    : 'Zur Teilnehmerliste';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-text/45 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-person-title"
        className="my-auto w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="remove-person-title" className="text-lg font-semibold text-text">
          {name} entfernen?
        </h3>
        <div className="mt-3 space-y-3 text-sm leading-6 text-text">
          <p>
            {target.firstName} kann sich danach nicht mehr anmelden. Ihre Kontaktdaten und Nachrichten werden gelöscht.
          </p>
          {target.upcoming > 0 ? <p>{upcomingLine(target.upcoming)}</p> : null}
          {target.openBookings > 0 ? (
            <div className="rounded-lg border border-danger bg-dangerSoft p-3 text-text">
              <p>{openLine(target.firstName, target.openBookings)}</p>
              <Link
                to={openHref}
                className="mt-2 inline-flex min-h-11 items-center text-[15px] font-medium text-brand"
              >
                {openLabel}
              </Link>
            </div>
          ) : null}
          <p className="text-textMuted">
            Bezahlte oder erlassene Buchungen bleiben für deine Unterlagen erhalten, ohne Namen.
          </p>
          {error ? <p className="text-danger">{error}</p> : null}
          {errorCode === 'HAS_UPCOMING_COURSES' ? (
            <Link
              to="/courses"
              className="inline-flex min-h-11 items-center text-[15px] font-medium text-brand"
            >
              Zu den Kursen
            </Link>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-full px-6 text-sm font-semibold text-textMuted hover:bg-surfaceSunken disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-full bg-danger px-6 text-sm font-semibold text-onBrand disabled:opacity-50"
          >
            {busy ? 'Wird entfernt …' : 'Endgültig entfernen'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RemovePersonDialog;
