import { useEffect, useState } from 'react';
import {
  emptyLegalProfile,
  loadStudioLegalProfile,
  saveStudioLegalProfile,
  type StudioLegalProfile,
} from '../../lib/studioLegalProfile';

const fieldClass =
  'h-11 w-full rounded-sm border border-borderStrong bg-surface px-3 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';

const FIELD_LABELS: Record<string, string> = {
  legal_name: 'Anbietername',
  street: 'Straße',
  house_number: 'Hausnummer',
  postal_code: 'PLZ',
  city: 'Ort',
  contact_email: 'Kontakt-E-Mail',
  phone: 'Telefon (optional)',
  tax_id: 'Steuernummer oder USt-IdNr. (optional)',
};

export default function LegalProfileSection({ isOwner }: { isOwner: boolean }) {
  const [form, setForm] = useState<StudioLegalProfile>(emptyLegalProfile);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const next = await loadStudioLegalProfile();
        if (!active) return;
        setForm(next);
      } catch {
        if (active) setLoadError('Die Anbieterangaben konnten nicht geladen werden.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isOwner]);

  const setField = (key: keyof StudioLegalProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveError('');
    setSavedNote('');
  };

  const onSave = async () => {
    if (!isOwner || busy) return;
    setBusy(true);
    setSaveError('');
    setSavedNote('');
    const result = await saveStudioLegalProfile(form);
    setBusy(false);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }
    setForm((prev) => ({ ...prev, present: true }));
    setSavedNote('Gespeichert.');
  };

  return (
    <section
      id="anbieterangaben"
      className="scroll-mt-24 rounded-md border border-border bg-surface p-3.5"
      data-testid="legal-profile"
    >
      <h2 className="text-[19px] font-medium leading-snug text-text">Anbieterangaben</h2>
      <p className="mt-2 text-[15px] leading-6 text-textMuted">
        Diese Angaben stehen auf der Bestätigung und auf dem Beleg. Verkäuferin ist dein Studio.
      </p>

      {loading ? <p className="mt-3 text-[15px] text-textMuted">Wird geladen…</p> : null}
      {loadError ? (
        <p role="alert" className="mt-3 text-[15px] text-text">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave();
          }}
        >
          {(
            [
              ['legal_name', 'text', 120],
              ['street', 'text', 120],
              ['house_number', 'text', 16],
              ['postal_code', 'text', 10],
              ['city', 'text', 80],
              ['contact_email', 'email', 120],
              ['phone', 'tel', 40],
              ['tax_id', 'text', 40],
            ] as const
          ).map(([key, type, max]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-[13px] text-textMuted">{FIELD_LABELS[key]}</span>
              <input
                type={type}
                className={fieldClass}
                value={form[key]}
                maxLength={max}
                disabled={!isOwner || busy}
                onChange={(event) => setField(key, event.target.value)}
                autoComplete="off"
              />
            </label>
          ))}

          {saveError ? (
            <p role="alert" className="text-[15px] text-text">
              {saveError}
            </p>
          ) : null}
          {savedNote ? <p className="text-[15px] text-text">{savedNote}</p> : null}

          {isOwner ? (
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
            >
              {busy ? 'Speichert…' : 'Speichern'}
            </button>
          ) : (
            <p className="text-[15px] text-textMuted">Nur die Inhaberin kann die Angaben ändern.</p>
          )}
        </form>
      ) : null}
    </section>
  );
}
