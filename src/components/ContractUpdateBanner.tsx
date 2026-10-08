import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  CONTRACT_ACCEPT_LABEL,
  CONTRACT_UPDATE_ATTENTION,
} from '../lib/legalVersions';
import {
  acceptLegalDocument,
  acceptOnboardingLegalBundle,
  loadLegalStatus,
  type LegalDocKey,
} from '../lib/legalAcceptances';
import LegalDocumentSheet, { LegalDocLink } from './legal/LegalDocumentSheet';
import type { LegalDocumentSlug } from '../generated/legalDocuments';

const PENDING_STORAGE = 'yogaflow_pending_legal_bundle';

type PendingDoc = {
  key: LegalDocKey;
  slug: LegalDocumentSlug;
  label: string;
  versionLabel: string;
};

/** RT-2: Owner-Banner für fehlende AGB- und/oder AVV-Zustimmung (nicht blockierend). */
export default function ContractUpdateBanner() {
  const { userProfile } = useAuth();
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<LegalDocumentSlug | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    const docs: PendingDoc[] = [];
    const terms = await loadLegalStatus('terms');
    if (terms != null && !terms.accepted) {
      docs.push({
        key: 'terms',
        slug: 'agb',
        label: 'AGB',
        versionLabel: 'v2',
      });
    }
    const avv = await loadLegalStatus('avv');
    if (avv != null && !avv.accepted) {
      docs.push({
        key: 'avv',
        slug: 'auftragsverarbeitung',
        label: 'AVV',
        versionLabel: 'v2',
      });
    }
    setPending(docs);
    setChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const d of docs) next[d.key] = prev[d.key] === true;
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    if (userProfile?.role !== 'owner') {
      setPending([]);
      return;
    }
    void (async () => {
      try {
        if (sessionStorage.getItem(PENDING_STORAGE) === '1') {
          const res = await acceptOnboardingLegalBundle();
          if (res.ok) sessionStorage.removeItem(PENDING_STORAGE);
        } else if (sessionStorage.getItem('yogaflow_pending_avv_accept') === '1') {
          // Rückwärtskompatibel: älteres Onboarding-Flag
          const res = await acceptLegalDocument('avv');
          if (res.ok) sessionStorage.removeItem('yogaflow_pending_avv_accept');
        }
      } catch {
        /* ignore */
      }
      if (!active) return;
      await reload();
    })();
    return () => {
      active = false;
    };
  }, [userProfile?.role, userProfile?.id]);

  if (pending.length === 0) return null;

  const titleParts = pending.map((d) => `${d.label} (${d.versionLabel})`);
  const allChecked = pending.every((d) => checked[d.key]);

  const onAccept = async () => {
    if (!allChecked || busy) return;
    setBusy(true);
    setError(null);
    for (const d of pending) {
      const res = await acceptLegalDocument(d.key);
      if (!res.ok) {
        setBusy(false);
        setError('Die Zustimmung konnte nicht gespeichert werden.');
        return;
      }
    }
    setBusy(false);
    await reload();
  };

  return (
    <div
      className="mb-4 rounded-md border border-accent/40 bg-accentSoft px-3 py-3 text-[15px] text-text"
      data-testid="contract-update-banner"
      role="status"
    >
      <p className="font-medium text-text">
        {CONTRACT_UPDATE_ATTENTION}: {titleParts.join(' · ')}
      </p>
      <ul className="mt-3 space-y-2">
        {pending.map((d) => (
          <li key={d.key}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checked[d.key] === true}
                onChange={(e) =>
                  setChecked((prev) => ({ ...prev, [d.key]: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded-sm border-border text-brand focus:ring-brand"
                data-testid={`contract-check-${d.key}`}
              />
              <span className="text-textMuted">
                Ich habe die{' '}
                <LegalDocLink
                  slug={d.slug}
                  onOpen={setSheet}
                  className="font-medium text-brand underline underline-offset-2"
                >
                  {d.label}
                </LegalDocLink>{' '}
                gelesen.
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={!allChecked || busy}
        onClick={() => void onAccept()}
        className="mt-3 inline-flex h-11 items-center rounded-full bg-brand px-4 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
        data-testid="contract-accept"
      >
        {busy ? 'Wird gespeichert…' : CONTRACT_ACCEPT_LABEL}
      </button>
      <LegalDocumentSheet slug={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}
