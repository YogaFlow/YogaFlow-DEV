import { useCallback, useEffect, useState } from 'react';
import { AVV_ACCEPT_LABEL, AVV_VERSION } from '../../lib/legalVersions';
import { acceptAvv, loadAvvStatus, type LegalAcceptanceStatus } from '../../lib/legalAcceptances';
import { formatNumericDate } from '../../lib/format';
import { berlinIsoFromInstant } from '../../lib/courseDateTime';
import LegalDocumentSheet from '../legal/LegalDocumentSheet';
import { LEGAL_DOCUMENTS } from '../../generated/legalDocuments';

export default function AvvAcceptanceSection({ isOwner }: { isOwner: boolean }) {
  const [status, setStatus] = useState<LegalAcceptanceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);

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

  const displayedHash = LEGAL_DOCUMENTS.auftragsverarbeitung.pageHash;

  return (
    <section className="mt-8 space-y-3" data-testid="avv-section">
      <h2 className="text-[17px] font-medium text-text">Auftragsverarbeitung (AVV)</h2>
      <p className="text-[15px] text-textMuted">
        Version {status?.currentVersion ?? AVV_VERSION}.{' '}
        <button
          type="button"
          onClick={() => setLegalOpen(true)}
          className="font-medium text-brand underline underline-offset-2"
          data-testid="avv-open-fulltext"
        >
          Volltext öffnen
        </button>
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
          className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
          data-testid="avv-accept"
        >
          {busy ? 'Wird gespeichert…' : AVV_ACCEPT_LABEL}
        </button>
      ) : (
        <p className="text-[15px] text-textMuted">Nur die Studioleitung kann die AVV abschließen.</p>
      )}
      {error ? (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      <span className="sr-only" data-testid="avv-display-hash">
        {displayedHash}
      </span>
      <LegalDocumentSheet
        slug={legalOpen ? 'auftragsverarbeitung' : null}
        onClose={() => setLegalOpen(false)}
        showAvvAccept={isOwner && !status?.accepted}
        onAvvAccepted={() => void reload()}
      />
    </section>
  );
}
