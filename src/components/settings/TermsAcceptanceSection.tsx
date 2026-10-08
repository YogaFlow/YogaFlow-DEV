import { useCallback, useEffect, useState } from 'react';
import { TERMS_ACCEPT_LABEL, TERMS_VERSION } from '../../lib/legalVersions';
import {
  acceptTerms,
  loadTermsStatus,
  type LegalAcceptanceStatus,
} from '../../lib/legalAcceptances';
import { formatNumericDate } from '../../lib/format';
import { berlinIsoFromInstant } from '../../lib/courseDateTime';
import LegalDocumentSheet from '../legal/LegalDocumentSheet';
import { LEGAL_DOCUMENTS } from '../../generated/legalDocuments';

export default function TermsAcceptanceSection({ isOwner }: { isOwner: boolean }) {
  const [status, setStatus] = useState<LegalAcceptanceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);

  const reload = useCallback(async () => {
    setStatus(await loadTermsStatus());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onAccept = async () => {
    if (!isOwner || busy) return;
    setBusy(true);
    setError(null);
    const res = await acceptTerms();
    setBusy(false);
    if (!res.ok) {
      setError('Die Zustimmung konnte nicht gespeichert werden.');
      return;
    }
    await reload();
  };

  const acceptedLabel =
    status?.accepted && status.acceptedAt
      ? `Zugestimmt am ${formatNumericDate(berlinIsoFromInstant(status.acceptedAt)) || status.acceptedAt}${
          status.acceptedByName ? ` von ${status.acceptedByName}` : ''
        }, Version ${status.acceptedVersion ?? TERMS_VERSION}.`
      : null;

  const displayedHash = LEGAL_DOCUMENTS.agb.pageHash;

  return (
    <section className="mt-8 space-y-3" data-testid="terms-section">
      <h2 className="text-[17px] font-medium text-text">AGB (Omlify)</h2>
      <p className="text-[15px] text-textMuted">
        Version {status?.currentVersion ?? TERMS_VERSION}.{' '}
        <button
          type="button"
          onClick={() => setLegalOpen(true)}
          className="font-medium text-brand underline underline-offset-2"
          data-testid="terms-open-fulltext"
        >
          Volltext öffnen
        </button>
      </p>
      {acceptedLabel ? (
        <p className="text-[15px] text-text" data-testid="terms-completed">
          {acceptedLabel}
        </p>
      ) : isOwner ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAccept()}
          className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
          data-testid="terms-accept"
        >
          {busy ? 'Wird gespeichert…' : TERMS_ACCEPT_LABEL}
        </button>
      ) : (
        <p className="text-[15px] text-textMuted">Nur die Studioleitung kann den AGB zustimmen.</p>
      )}
      {error ? (
        <p role="alert" className="text-[15px] text-danger">
          {error}
        </p>
      ) : null}
      <span className="sr-only" data-testid="terms-display-hash">
        {displayedHash}
      </span>
      <LegalDocumentSheet
        slug={legalOpen ? 'agb' : null}
        onClose={() => setLegalOpen(false)}
      />
    </section>
  );
}
