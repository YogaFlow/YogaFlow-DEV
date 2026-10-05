import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTenant } from '../../context/TenantContext';
import {
  loadStudioLegalRenderContext,
  loadStudioLegalStatus,
  pillLabel,
  releaseStudioLegal,
  renderStudioLegalKind,
  studioLegalMarkdownToHtml,
  type StudioLegalStatus,
} from '../../lib/studioLegal';
import {
  loadStudioLegalProfile,
  saveStudioLegalProfile,
  type StudioLegalProfile,
} from '../../lib/studioLegalProfile';
import { useAuth } from '../../context/AuthContext';
import AccentPill from '../ui/AccentPill';
import ModalBackdrop from '../ui/ModalBackdrop';

type ReleaseKind = 'terms' | 'privacy';

export default function StudioLegalTextsSection({ canManage }: { canManage: boolean }) {
  const { tenant } = useTenant();
  const { isOwner } = useAuth();
  const [status, setStatus] = useState<StudioLegalStatus | null>(null);
  const [profile, setProfile] = useState<StudioLegalProfile | null>(null);
  const [preview, setPreview] = useState<{ terms: string; privacy: string }>({
    terms: '',
    privacy: '',
  });
  const [extraRules, setExtraRules] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [releaseKind, setReleaseKind] = useState<ReleaseKind | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [releaseError, setReleaseError] = useState('');

  const reload = async () => {
    const [s, p] = await Promise.all([
      loadStudioLegalStatus(),
      canManage ? loadStudioLegalProfile().catch(() => null) : Promise.resolve(null),
    ]);
    setStatus(s);
    if (p) {
      setProfile(p);
      setExtraRules(p.extra_rules);
    }
  };

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        await reload();
      } catch {
        if (active) setError('Rechtstexte konnten nicht geladen werden.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  useEffect(() => {
    if (!profile || !tenant) return;
    let active = true;
    void (async () => {
      try {
        const values = await loadStudioLegalRenderContext(
          { ...profile, extra_rules: extraRules },
          tenant,
        );
        const terms = renderStudioLegalKind('terms', values);
        const privacy = renderStudioLegalKind('privacy', values);
        if (active) setPreview({ terms, privacy });
      } catch (e) {
        if (active) {
          setPreview({
            terms: '',
            privacy: '',
          });
          setError(e instanceof Error ? e.message : 'Vorschau fehlgeschlagen.');
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [profile, extraRules, tenant]);

  const onRelease = async () => {
    if (!releaseKind || !profile || !tenant || !checked || busy) return;
    setBusy(true);
    setReleaseError('');
    const withExtra = { ...profile, extra_rules: extraRules };
    try {
      if (isOwner && releaseKind === 'terms' && extraRules !== profile.extra_rules) {
        const saved = await saveStudioLegalProfile(withExtra);
        if (!saved.ok) {
          setBusy(false);
          setReleaseError(saved.message);
          return;
        }
      }
      const values = await loadStudioLegalRenderContext(withExtra, tenant);
      const bodyMd = renderStudioLegalKind(releaseKind, values);
      const res = await releaseStudioLegal({ kind: releaseKind, bodyMd, values });
      setBusy(false);
      if (!res.ok) {
        setReleaseError(res.message);
        return;
      }
      setReleaseKind(null);
      setChecked(false);
      await reload();
    } catch (e) {
      setBusy(false);
      setReleaseError(e instanceof Error ? e.message : 'Freigabe fehlgeschlagen.');
    }
  };

  if (!canManage) return null;
  if (loading) {
    return <p className="text-[15px] text-textMuted">Rechtstexte werden geladen…</p>;
  }
  if (error && !status) {
    return (
      <p role="alert" className="text-[15px] text-danger">
        {error}
      </p>
    );
  }

  const releaseBody =
    releaseKind === 'terms' ? preview.terms : releaseKind === 'privacy' ? preview.privacy : '';

  return (
    <div className="space-y-4" data-testid="studio-legal-texts">
      <DocCard
        title="AGB"
        status={status?.terms.status ?? 'missing'}
        createdAt={status?.terms.created_at ?? null}
        previewMd={preview.terms}
        highlightFromSettings
        extraField={
          <label className="block">
            <span className="mb-1 block text-[13px] text-textMuted">
              Weitere Regeln (optional, max. 1.500 Zeichen)
            </span>
            <textarea
              value={extraRules}
              maxLength={1500}
              rows={4}
              onChange={(e) => setExtraRules(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </label>
        }
        actionLabel={
          status?.terms.status === 'current'
            ? null
            : status?.terms.status === 'new_template'
              ? 'Neue Vorlage prüfen und freigeben'
              : 'Prüfen und freigeben'
        }
        actionDisabled={!status?.imprint_complete || !preview.terms}
        onAction={() => {
          setReleaseKind('terms');
          setChecked(false);
          setReleaseError('');
        }}
      />

      <DocCard
        title="Datenschutz"
        status={status?.privacy.status ?? 'missing'}
        createdAt={status?.privacy.created_at ?? null}
        previewMd={preview.privacy}
        actionLabel={
          status?.privacy.status === 'current'
            ? null
            : status?.privacy.status === 'new_template'
              ? 'Neue Vorlage prüfen und freigeben'
              : 'Prüfen und freigeben'
        }
        actionDisabled={!status?.imprint_complete || !preview.privacy}
        onAction={() => {
          setReleaseKind('privacy');
          setChecked(false);
          setReleaseError('');
        }}
      />

      <ModalBackdrop
        open={releaseKind != null}
        visible
        canDismiss={!busy}
        onDismiss={() => {
          if (!busy) setReleaseKind(null);
        }}
        variant="sheet"
        panelClassName="max-w-xl sm:max-w-[720px]"
        labelledBy="studio-legal-release-title"
      >
        <div className="flex flex-col max-h-[85vh]">
          <div className="shrink-0 border-b border-border px-5 py-4">
            <h3 id="studio-legal-release-title" className="text-[17px] font-medium text-text">
              {releaseKind === 'terms' ? 'AGB freigeben' : 'Datenschutz freigeben'}
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-textMuted">
              Omlify liefert Vorlagen. Du prüfst und verwendest sie als deine eigenen. Keine
              Rechtsberatung.
            </p>
          </div>
          <div
            className="legal-sheet-body min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-6 text-text [&_h1]:mb-3 [&_h1]:text-[20px] [&_h1]:font-medium [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[16px] [&_h2]:font-medium [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: studioLegalMarkdownToHtml(releaseBody) }}
          />
          <div className="shrink-0 space-y-3 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <label className="flex min-h-11 items-start gap-3">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded-sm border-border text-brand focus:ring-brand"
              />
              <span className="text-[14px] leading-5 text-text">
                {releaseKind === 'terms'
                  ? 'Ich habe die AGB geprüft und verwende sie als meine eigenen.'
                  : 'Ich habe die Datenschutzerklärung geprüft und verwende sie als meine eigene.'}
              </span>
            </label>
            {releaseError ? (
              <p role="alert" className="text-[13px] text-danger">
                {releaseError}
              </p>
            ) : null}
            <button
              type="button"
              disabled={!checked || busy}
              onClick={() => void onRelease()}
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
            >
              {busy ? 'Wird freigegeben…' : 'Freigeben'}
            </button>
          </div>
        </div>
      </ModalBackdrop>
    </div>
  );
}

function DocCard({
  title,
  status,
  createdAt,
  previewMd,
  actionLabel,
  actionDisabled,
  onAction,
  extraField,
  highlightFromSettings,
}: {
  title: string;
  status: 'missing' | 'release' | 'current' | 'new_template';
  createdAt: string | null;
  previewMd: string;
  actionLabel: string | null;
  actionDisabled?: boolean;
  onAction: () => void;
  extraField?: React.ReactNode;
  highlightFromSettings?: boolean;
}) {
  return (
    <section className="rounded-md border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[19px] font-medium text-text">{title}</h2>
        <AccentPill>{pillLabel(status, createdAt)}</AccentPill>
      </div>
      {highlightFromSettings ? (
        <p className="mt-2 text-[13px] text-textMuted">
          Hervorgehobene Werte stammen aus{' '}
          <Link to="/settings/buchungen" className="text-brand underline underline-offset-2">
            Einstellungen › Buchungen
          </Link>{' '}
          und Zahlungen.
        </p>
      ) : null}
      {extraField ? <div className="mt-3">{extraField}</div> : null}
      <div
        className="legal-sheet-body mt-3 max-h-64 overflow-y-auto rounded-md border border-border bg-sand px-4 py-3 text-[14px] leading-6 text-text [&_h1]:mb-2 [&_h1]:text-[18px] [&_h1]:font-medium [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-medium [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{
          __html: previewMd
            ? studioLegalMarkdownToHtml(previewMd)
            : '<p class="text-textMuted">Vorschau erscheint, sobald das Impressum vollständig ist.</p>',
        }}
      />
      {actionLabel ? (
        <button
          type="button"
          disabled={actionDisabled}
          onClick={onAction}
          className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
        >
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

