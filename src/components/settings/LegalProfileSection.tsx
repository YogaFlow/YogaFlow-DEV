import { useEffect, useState } from 'react';
import {
  emptyLegalProfile,
  loadStudioLegalProfile,
  saveStudioLegalProfile,
  type StudioLegalProfile,
} from '../../lib/studioLegalProfile';
import {
  LEGAL_FORM_OPTIONS,
  buildStudioLegalValues,
  publishStudioLegalDocument,
  renderStudioLegalKind,
  resyncStudioLegalDocuments,
  studioLegalMarkdownToHtml,
} from '../../lib/studioLegal';
import { FormField } from '../ui/FormField';
import { useTenant } from '../../context/TenantContext';
import { BOOKING_CANCELLATION_WINDOW_DEFAULT } from '../../lib/bookingSettings';
import { listPassProducts } from '../../lib/passProducts';
import { loadTaxSettings, choiceFromSetting } from '../../lib/taxStatus';
import { asCivilIsoDate } from '../../lib/courseDateTime';
import { supabase } from '../../lib/supabase';

const FIELD_LABELS: Record<string, string> = {
  legal_name: 'Anbietername',
  street: 'Straße',
  house_number: 'Hausnummer',
  postal_code: 'PLZ',
  city: 'Ort',
  contact_email: 'Kontakt-E-Mail',
  phone: 'Telefon (optional, empfohlen)',
  tax_id: 'Steuernummer (optional, für Belege)',
  representatives: 'Vertretungsberechtigte',
  register_court: 'Registergericht',
  register_number: 'Registernummer',
  vat_id: 'USt-IdNr. (optional)',
  economic_id: 'Wirtschafts-ID (optional)',
};

type FieldKey = keyof Omit<StudioLegalProfile, 'present' | 'country' | 'legal_form' | 'imprint_complete' | 'extra_rules'>;

export default function LegalProfileSection({
  isOwner,
  collapsiblePreview = false,
}: {
  isOwner: boolean;
  /** RT-1 Nachtrag: Vorschau als einklappbare Karte „So sieht es aus“ (mobil zu). */
  collapsiblePreview?: boolean;
}) {
  const { tenant } = useTenant();
  const [form, setForm] = useState<StudioLegalProfile>(emptyLegalProfile);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [fieldError, setFieldError] = useState<{ field?: string; message: string } | null>(null);
  const [savedNote, setSavedNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewOpen, setPreviewOpen] = useState(() => {
    if (!collapsiblePreview) return true;
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });

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

  useEffect(() => {
    if (!form.legal_name || !form.legal_form) {
      setPreviewHtml('');
      return;
    }
    let active = true;
    void (async () => {
      try {
        const values = await buildPreviewValues(form, tenant);
        const md = renderStudioLegalKind('imprint', values);
        if (active) setPreviewHtml(studioLegalMarkdownToHtml(md));
      } catch {
        if (active) setPreviewHtml('<p class="text-textMuted">Vorschau noch nicht möglich.</p>');
      }
    })();
    return () => {
      active = false;
    };
  }, [form, tenant]);

  const setField = (key: keyof StudioLegalProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldError(null);
    setSavedNote('');
  };

  const needsRepresentatives = form.legal_form && form.legal_form !== 'sole_trader';
  const needsRegister =
    form.legal_form === 'ug' || form.legal_form === 'gmbh' || form.legal_form === 'ev';

  const onSave = async () => {
    if (!isOwner || busy) return;
    setBusy(true);
    setFieldError(null);
    setSavedNote('');
    const result = await saveStudioLegalProfile(form);
    if (!result.ok) {
      setBusy(false);
      setFieldError({ field: result.field, message: result.message });
      return;
    }
    setForm((prev) => ({ ...prev, present: true, imprint_complete: result.imprint_complete }));
    if (result.imprint_complete && tenant) {
      try {
        const values = await buildPreviewValues({ ...form, present: true }, tenant);
        const bodyMd = renderStudioLegalKind('imprint', values);
        await publishStudioLegalDocument({
          kind: 'imprint',
          bodyMd,
          values,
          trigger: 'profile_change',
        });
        // AGB/Datenschutz neu fassen wenn schon freigegeben (Platzhalter aus Profil).
        await resyncStudioLegalDocuments(tenant);
      } catch {
        /* Speichern ok; Veröffentlichung kann später nachgeholt werden */
      }
    }
    setBusy(false);
    setSavedNote('Gespeichert.');
  };

  const textFields = [
    ['legal_name', 'text', 120],
    ['street', 'text', 120],
    ['house_number', 'text', 16],
    ['postal_code', 'text', 10],
    ['city', 'text', 80],
    ['contact_email', 'email', 120],
    ['phone', 'tel', 40],
    ['tax_id', 'text', 40],
  ] as const;

  return (
    <section
      id="anbieterangaben"
      className="scroll-mt-24 rounded-md border border-border bg-surface p-3.5"
      data-testid="legal-profile"
    >
      <h2 className="text-[19px] font-medium leading-snug text-text">Impressum</h2>
      <p className="mt-2 text-[15px] leading-6 text-textMuted">
        Diese Angaben stehen im Impressum, auf der Bestätigung und auf dem Beleg.
      </p>

      {loading ? <p className="mt-3 text-[15px] text-textMuted">Wird geladen…</p> : null}
      {loadError ? (
        <p role="alert" className="mt-3 text-[15px] text-danger">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError ? (
        <div className="mt-4 lg:grid lg:grid-cols-2 lg:gap-6">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void onSave();
            }}
          >
            {textFields.slice(0, 5).map(([key, type, max]) => (
              <FormField
                key={key}
                id={`legal-${key}`}
                label={FIELD_LABELS[key]}
                type={type}
                value={form[key as FieldKey]}
                maxLength={max}
                disabled={!isOwner || busy}
                onChange={(event) => setField(key, event.target.value)}
                autoComplete="off"
                error={fieldError?.field === key ? fieldError.message : null}
              />
            ))}
            <p className="text-[13px] leading-5 text-textMuted">
              Es muss eine ladungsfähige Anschrift sein — kein Postfach.
            </p>

            <label className="block" htmlFor="legal-legal_form">
              <span className="mb-1 block text-[13px] text-textMuted">Rechtsform</span>
              <select
                id="legal-legal_form"
                value={form.legal_form}
                disabled={!isOwner || busy}
                onChange={(e) => setField('legal_form', e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <option value="">Bitte wählen</option>
                {LEGAL_FORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {fieldError?.field === 'legal_form' ? (
                <span className="mt-1 block text-[13px] text-danger">{fieldError.message}</span>
              ) : null}
            </label>

            {needsRepresentatives ? (
              <FormField
                id="legal-representatives"
                label={FIELD_LABELS.representatives}
                type="text"
                value={form.representatives}
                maxLength={500}
                disabled={!isOwner || busy}
                onChange={(event) => setField('representatives', event.target.value)}
                autoComplete="off"
                error={fieldError?.field === 'representatives' ? fieldError.message : null}
              />
            ) : null}

            {needsRegister ? (
              <>
                <FormField
                  id="legal-register_court"
                  label={FIELD_LABELS.register_court}
                  type="text"
                  value={form.register_court}
                  maxLength={120}
                  disabled={!isOwner || busy}
                  onChange={(event) => setField('register_court', event.target.value)}
                  autoComplete="off"
                  error={fieldError?.field === 'register_court' ? fieldError.message : null}
                />
                <FormField
                  id="legal-register_number"
                  label={FIELD_LABELS.register_number}
                  type="text"
                  value={form.register_number}
                  maxLength={40}
                  disabled={!isOwner || busy}
                  onChange={(event) => setField('register_number', event.target.value)}
                  autoComplete="off"
                  error={fieldError?.field === 'register_number' ? fieldError.message : null}
                />
              </>
            ) : (
              <>
                <FormField
                  id="legal-register_court"
                  label={`${FIELD_LABELS.register_court} (optional)`}
                  type="text"
                  value={form.register_court}
                  maxLength={120}
                  disabled={!isOwner || busy}
                  onChange={(event) => setField('register_court', event.target.value)}
                  autoComplete="off"
                />
                <FormField
                  id="legal-register_number"
                  label={`${FIELD_LABELS.register_number} (optional)`}
                  type="text"
                  value={form.register_number}
                  maxLength={40}
                  disabled={!isOwner || busy}
                  onChange={(event) => setField('register_number', event.target.value)}
                  autoComplete="off"
                />
              </>
            )}

            {textFields.slice(5).map(([key, type, max]) => (
              <FormField
                key={key}
                id={`legal-${key}`}
                label={FIELD_LABELS[key]}
                type={type}
                value={form[key as FieldKey]}
                maxLength={max}
                disabled={!isOwner || busy}
                onChange={(event) => setField(key, event.target.value)}
                autoComplete="off"
                error={fieldError?.field === key ? fieldError.message : null}
              />
            ))}

            <FormField
              id="legal-vat_id"
              label={FIELD_LABELS.vat_id}
              type="text"
              value={form.vat_id}
              maxLength={40}
              disabled={!isOwner || busy}
              onChange={(event) => setField('vat_id', event.target.value)}
              autoComplete="off"
            />
            <FormField
              id="legal-economic_id"
              label={FIELD_LABELS.economic_id}
              type="text"
              value={form.economic_id}
              maxLength={40}
              disabled={!isOwner || busy}
              onChange={(event) => setField('economic_id', event.target.value)}
              autoComplete="off"
            />

            {fieldError && !fieldError.field ? (
              <p role="alert" className="text-[15px] text-danger">
                {fieldError.message}
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

          <div className="mt-6 lg:mt-0">
            {collapsiblePreview ? (
              <div className="overflow-hidden rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setPreviewOpen((v) => !v)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-3.5 text-left"
                  aria-expanded={previewOpen}
                >
                  <span className="text-[15px] font-medium text-text">So sieht es aus</span>
                  <span className="text-[13px] text-textMuted">{previewOpen ? '−' : '+'}</span>
                </button>
                {previewOpen ? (
                  <div
                    className="legal-sheet-body border-t border-border bg-sand px-4 py-3 text-[14px] leading-6 text-text [&_h1]:mb-2 [&_h1]:text-[18px] [&_h1]:font-medium [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-medium [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
                    data-testid="imprint-preview"
                    dangerouslySetInnerHTML={{
                      __html:
                        previewHtml ||
                        '<p class="text-textMuted">Fülle die Pflichtfelder für die Vorschau.</p>',
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <>
                <h3 className="text-[15px] font-medium text-text">Vorschau Impressum</h3>
                <div
                  className="legal-sheet-body mt-3 max-h-[28rem] overflow-y-auto rounded-md border border-border bg-sand px-4 py-3 text-[14px] leading-6 text-text [&_h1]:mb-2 [&_h1]:text-[18px] [&_h1]:font-medium [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-medium [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
                  data-testid="imprint-preview"
                  dangerouslySetInnerHTML={{
                    __html:
                      previewHtml ||
                      '<p class="text-textMuted">Fülle die Pflichtfelder für die Vorschau.</p>',
                  }}
                />
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

async function buildPreviewValues(
  form: StudioLegalProfile,
  tenant: { name?: string; cancellation_window_hours?: number; slug?: string } | null,
) {
  const [taxRows, products, setup] = await Promise.all([
    loadTaxSettings().catch(() => []),
    listPassProducts().catch(() => []),
    supabase.rpc('get_payment_setup_status').then((r) => r.data as Record<string, unknown> | null),
  ]);
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const current =
    taxRows
      .filter((row) => asCivilIsoDate(row.valid_from) <= todayIso)
      .sort((a, b) => asCivilIsoDate(b.valid_from).localeCompare(asCivilIsoDate(a.valid_from)))[0] ??
    null;
  const choice = current ? choiceFromSetting(current) : null;
  const active = products.filter((p) => p.archived_at == null);
  return buildStudioLegalValues({
    profile: form,
    studioName: tenant?.name ?? form.legal_name,
    studioSlug: tenant && 'slug' in tenant ? String(tenant.slug ?? '') : undefined,
    cancellationHours:
      typeof tenant?.cancellation_window_hours === 'number'
        ? tenant.cancellation_window_hours
        : BOOKING_CANCELLATION_WINDOW_DEFAULT,
    taxSmallBusiness: choice === 'small_business',
    payOnline: setup?.online_payments_enabled === true,
    payOnsite: setup?.allow_onsite_payment !== false,
    passesAny: active.length > 0,
    passesOnline: active.some((p) => p.online_purchasable === true),
  });
}
