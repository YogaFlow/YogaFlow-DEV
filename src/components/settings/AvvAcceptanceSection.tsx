import { useCallback, useEffect, useState } from 'react';
import { AVV_ACCEPT_LABEL, AVV_VERSION } from '../../lib/legalVersions';
import { acceptAvv, loadAvvStatus, type LegalAcceptanceStatus } from '../../lib/legalAcceptances';
import { formatNumericDate } from '../../lib/format';
import { berlinIsoFromInstant } from '../../lib/courseDateTime';

export default function AvvAcceptanceSection({ isOwner }: { isOwner: boolean }) {
  const [status, setStatus] = useState<LegalAcceptanceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus(await loadAvvStatus());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onAccept = async () => {
    if (!isOwner || busy) return;
    setBusy(true);
    setError(null);
    const res = await acceptAvv();
    setBusy(false);
    if (!res.ok) {
      setError('Die Zustimmung konnte nicht gespeichert werden.');
      return;
    }
    await reload();
  };

  const acceptedLabel =
    status?.accepted && status.acceptedAt
      ? `Abgeschlossen am ${formatNumericDate(berlinIsoFromInstant(status.acceptedAt)) || status.acceptedAt}${
          status.acceptedByName ? ` von ${status.acceptedByName}` : ''
        }, Version ${status.acceptedVersion ?? AVV_VERSION}.`
      : null;

  return (
    <section className="mt-8 space-y-3" data-testid="avv-section">
      <h2 className="text-[17px] font-medium text-text">Auftragsverarbeitung (AVV)</h2>
      <p className="text-[15px] text-textMuted">
        Version {status?.currentVersion ?? AVV_VERSION}.{' '}
        <a
          href="/legal/auftragsverarbeitung"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-brand"
        >
          Volltext öffnen
        </a>
      </p>
      {acceptedLabel ? (
        <p className="text-[15px] text-text" data-testid="avv-completed">
          {acceptedLabel}
        </p>
      ) : isOwner ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAccept()}
          className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-[15px] font-medium text-brandFg active:opacity-90 disabled:opacity-50"
          data-testid="avv-accept"
        >
          {busy ? 'Wird gespeichert…' : AVV_ACCEPT_LABEL}
        </button>
      ) : (
        <p className="text-[15px] text-textMuted">Nur die Studioleitung kann die AVV abschließen.</p>
      )}
      {error ? (
        <p role="alert" className="text-[15px] text-text">
          {error}
        </p>
      ) : null}
    </section>
  );
}
