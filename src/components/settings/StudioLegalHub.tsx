import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Scale } from 'lucide-react';
import { useTenant } from '../../context/TenantContext';
import { useAuth } from '../../context/AuthContext';
import {
  legalVersionTriggerLabel,
  loadStudioLegalRenderContext,
  loadStudioLegalStatus,
  loadStudioLegalVersions,
  pillLabelShort,
  releaseStudioLegal,
  renderStudioLegalKind,
  saveExtraRulesAndResync,
  statusCardLabel,
  studioLegalMarkdownToHtml,
  type StudioLegalPillStatus,
  type StudioLegalStatus,
  type StudioLegalVersionRow,
} from '../../lib/studioLegal';
import {
  loadStudioLegalProfile,
  type StudioLegalProfile,
} from '../../lib/studioLegalProfile';
import { privacyFactRows, termsFactRows } from '../../lib/studioLegalFacts';
import AccentPill from '../ui/AccentPill';
import ModalBackdrop from '../ui/ModalBackdrop';
import StudioLegalFullTextSheet from '../legal/StudioLegalFullTextSheet';
import LegalProfileSection from './LegalProfileSection';
import AvvAcceptanceSection from './AvvAcceptanceSection';

export type LegalDocSlug = 'impressum' | 'agb' | 'datenschutz';

type Props = {
  canManage: boolean;
  isOwner: boolean;
  doc: LegalDocSlug | null;
};

const DOC_META: {
  slug: LegalDocSlug;
  title: string;
  statusKey: 'imprint' | 'terms' | 'privacy';
}[] = [
  { slug: 'impressum', title: 'Impressum', statusKey: 'imprint' },
  { slug: 'agb', title: 'AGB', statusKey: 'terms' },
  { slug: 'datenschutz', title: 'Datenschutz', statusKey: 'privacy' },
];

export default function StudioLegalHub({ canManage, isOwner, doc }: Props) {
  const { tenant } = useTenant();
  const [status, setStatus] = useState<StudioLegalStatus | null>(null);
  const [profile, setProfile] = useState<StudioLegalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const [s, p] = await Promise.all([
      loadStudioLegalStatus(),
      canManage ? loadStudioLegalProfile().catch(() => null) : Promise.resolve(null),
    ]);
    setStatus(s);
    if (p) setProfile(p);
  }, [canManage]);

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
  }, [canManage, reload]);

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

  const list = (
    <LegalOverviewList status={status} />
  );

  const detail =
    doc === 'impressum' ? (
      <LegalProfileSection isOwner={isOwner} collapsiblePreview />
    ) : doc === 'agb' ? (
      <TermsDetail
        status={status}
        profile={profile}
        tenant={tenant}
        onReload={reload}
      />
    ) : doc === 'datenschutz' ? (
      <PrivacyDetail status={status} profile={profile} tenant={tenant} onReload={reload} />
    ) : null;

  return (
    <div data-testid="studio-legal-texts">
      {/* Desktop: Liste links, Detail rechts */}
      <div className="lg:flex lg:items-start lg:gap-8">
        <div
          className={`${doc ? 'hidden lg:block' : 'block'} lg:max-w-[560px] lg:w-full lg:shrink-0`}
        >
          <p className="mb-3 text-[15px] leading-6 text-textMuted">
            Deine Texte für Teilnehmende. Sie entstehen aus deinen Angaben und Einstellungen.
          </p>
          {list}
          {!doc ? (
            <div className="mt-6">
              <AvvAcceptanceSection isOwner={isOwner} />
            </div>
          ) : null}
        </div>
        {doc ? (
          <div className="min-w-0 flex-1">
            <Link
              to="/settings/rechtliches"
              className="mb-4 inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-text lg:hidden"
              data-testid="legal-back"
            >
              ‹ Rechtliches
            </Link>
            {detail}
          </div>
        ) : (
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="text-[15px] text-textMuted">Wähle links einen Text.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LegalOverviewList({ status }: { status: StudioLegalStatus | null }) {
  return (
    <ul
      className="overflow-hidden rounded-md border border-border bg-surface"
      data-testid="studio-legal-overview"
    >
      {DOC_META.map((item) => {
        const kindStatus = status?.[item.statusKey];
        const pill = pillLabelShort(
          (kindStatus?.status as StudioLegalPillStatus) ?? 'missing',
          kindStatus?.created_at ?? null,
        );
        return (
          <li key={item.slug} className="border-b border-border last:border-b-0">
            <Link
              to={`/settings/rechtliches/${item.slug}`}
              className="flex min-h-14 items-center gap-3 px-3.5 py-3 text-left no-underline active:bg-surfaceSunken"
              data-testid={`legal-row-${item.slug}`}
            >
              <Scale className="h-5 w-5 shrink-0 text-textMuted" aria-hidden />
              <span className="min-w-0 flex-1 text-[15px] font-medium text-text">
                {item.title}
              </span>
              <AccentPill>{pill}</AccentPill>
              <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TermsDetail({
  status,
  profile,
  tenant,
  onReload,
}: {
  status: StudioLegalStatus | null;
  profile: StudioLegalProfile | null;
  tenant: { name?: string; cancellation_window_hours?: number } | null;
  onReload: () => Promise<void>;
}) {
  return (
    <DocDetail
      kind="terms"
      title="AGB"
      status={status?.terms.status ?? 'missing'}
      createdAt={status?.terms.created_at ?? null}
      imprintComplete={status?.imprint_complete === true}
      profile={profile}
      tenant={tenant}
      onReload={onReload}
      showExtraRules
    />
  );
}

function PrivacyDetail({
  status,
  profile,
  tenant,
  onReload,
}: {
  status: StudioLegalStatus | null;
  profile: StudioLegalProfile | null;
  tenant: { name?: string; cancellation_window_hours?: number } | null;
  onReload: () => Promise<void>;
}) {
  return (
    <DocDetail
      kind="privacy"
      title="Datenschutz"
      status={status?.privacy.status ?? 'missing'}
      createdAt={status?.privacy.created_at ?? null}
      imprintComplete={status?.imprint_complete === true}
      profile={profile}
      tenant={tenant}
      onReload={onReload}
      showExtraRules={false}
    />
  );
}

function DocDetail({
  kind,
  title,
  status,
  createdAt,
  imprintComplete,
  profile,
  tenant,
  onReload,
  showExtraRules,
}: {
  kind: 'terms' | 'privacy';
  title: string;
  status: StudioLegalPillStatus;
  createdAt: string | null;
  imprintComplete: boolean;
  profile: StudioLegalProfile | null;
  tenant: { name?: string; cancellation_window_hours?: number } | null;
  onReload: () => Promise<void>;
  showExtraRules: boolean;
}) {
  const { isOwner } = useAuth();
  const [previewMd, setPreviewMd] = useState('');
  const [valuesLabel, setValuesLabel] = useState<ReturnType<typeof termsFactRows>>([]);
  const [privacyExtra, setPrivacyExtra] = useState<ReturnType<typeof privacyFactRows> | null>(
    null,
  );
  const [extraRules, setExtraRules] = useState(profile?.extra_rules ?? '');
  const [versions, setVersions] = useState<StudioLegalVersionRow[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const savedExtra = profile?.extra_rules ?? '';
  const extraDirty = showExtraRules && extraRules !== savedExtra;

  useEffect(() => {
    setExtraRules(profile?.extra_rules ?? '');
  }, [profile?.extra_rules]);

  useEffect(() => {
    if (!profile || !tenant) return;
    let active = true;
    void (async () => {
      try {
        const values = await loadStudioLegalRenderContext(
          { ...profile, extra_rules: extraRules },
          tenant,
        );
        const md = renderStudioLegalKind(kind, values);
        if (!active) return;
        setPreviewMd(md);
        if (kind === 'terms') setValuesLabel(termsFactRows(values));
        else setPrivacyExtra(privacyFactRows(values));
      } catch {
        if (active) setPreviewMd('');
      }
    })();
    return () => {
      active = false;
    };
  }, [profile, tenant, extraRules, kind]);

  useEffect(() => {
    let active = true;
    void loadStudioLegalVersions(kind).then((rows) => {
      if (active) setVersions(rows);
    });
    return () => {
      active = false;
    };
  }, [kind, status, createdAt]);

  const needsRelease =
    status === 'release' || status === 'new_template' || status === 'change_release';

  const onSaveExtra = async () => {
    if (!profile || !tenant || !isOwner || !extraDirty || saveBusy) return;
    setSaveBusy(true);
    setErr('');
    setMsg('');
    const res = await saveExtraRulesAndResync({
      profile,
      extraRules,
      tenant,
    });
    setSaveBusy(false);
    if (!res.ok) {
      setErr(res.message);
      return;
    }
    setMsg('Gespeichert.');
    await onReload();
  };

  const onRelease = async () => {
    if (!profile || !tenant || !checked || busy) return;
    setBusy(true);
    setErr('');
    try {
      let working = { ...profile, extra_rules: extraRules };
      if (showExtraRules && isOwner && extraDirty) {
        const saved = await saveExtraRulesAndResync({
          profile,
          extraRules,
          tenant,
        });
        if (!saved.ok) {
          setBusy(false);
          setErr(saved.message);
          return;
        }
        working = { ...profile, extra_rules: extraRules };
      }
      const values = await loadStudioLegalRenderContext(working, tenant);
      const bodyMd = renderStudioLegalKind(kind, values);
      const res = await releaseStudioLegal({ kind, bodyMd, values });
      setBusy(false);
      if (!res.ok) {
        setErr(res.message);
        return;
      }
      setReleaseOpen(false);
      setChecked(false);
      await onReload();
    } catch (e) {
      setBusy(false);
      setErr(e instanceof Error ? e.message : 'Freigabe fehlgeschlagen.');
    }
  };

  return (
    <div className="space-y-4" data-testid={`legal-detail-${kind}`}>
      <h2 className="text-[22px] font-medium text-text">{title}</h2>

      <section className="rounded-md border border-border bg-surface p-3.5">
        <p className="text-[15px] text-text">{statusCardLabel(status, createdAt)}</p>
        {needsRelease ? (
          <button
            type="button"
            disabled={!imprintComplete || !previewMd}
            onClick={() => {
              setReleaseOpen(true);
              setChecked(false);
              setErr('');
            }}
            className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50 sm:w-auto"
          >
            Prüfen und freigeben
          </button>
        ) : null}
        {!imprintComplete ? (
          <p className="mt-2 text-[13px] text-textMuted">
            Zuerst das{' '}
            <Link to="/settings/rechtliches/impressum" className="text-brand underline">
              Impressum
            </Link>{' '}
            vervollständigen.
          </p>
        ) : null}
      </section>

      <section className="rounded-md border border-border bg-surface p-3.5">
        <h3 className="text-[15px] font-medium text-text">Das steht drin</h3>
        <p className="mt-1 text-[13px] text-textMuted">
          Werte aus deinen Einstellungen — ändern geht jederzeit.
        </p>
        <ul className="mt-3 divide-y divide-border">
          {(kind === 'terms' ? valuesLabel : privacyExtra?.rows ?? []).map((row) => (
            <li key={row.id}>
              <Link
                to={row.to}
                className="flex min-h-14 items-center justify-between gap-3 py-2 text-left no-underline active:bg-surfaceSunken"
              >
                <span className="text-[15px] text-text">{row.label}</span>
                <span className="shrink-0 text-[13px] text-brand">Ändern ›</span>
              </Link>
            </li>
          ))}
          {kind === 'privacy' && privacyExtra ? (
            <li>
              <button
                type="button"
                onClick={() => setSubOpen((v) => !v)}
                className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left"
                aria-expanded={subOpen}
              >
                <span className="text-[15px] text-text">
                  Dienstleister ({privacyExtra.subprocessorCount})
                </span>
                <span className="text-[13px] text-textMuted">{subOpen ? '−' : '+'}</span>
              </button>
              {subOpen ? (
                <ul className="mb-3 space-y-2 pl-1 text-[13px] leading-5 text-textMuted">
                  {privacyExtra.subprocessors.map((s) => (
                    <li key={s.name}>
                      {s.name} — {s.purpose} — {s.location}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ) : null}
        </ul>
      </section>

      {showExtraRules ? (
        <section className="rounded-md border border-border bg-surface p-3.5">
          <label className="block">
            <span className="mb-1 block text-[15px] font-medium text-text">Weitere Regeln</span>
            <span className="mb-2 block text-[13px] text-textMuted">
              Optional, eigener Text in den AGB (z. B. Hausordnung). Nach dem Speichern bitte erneut
              freigeben.
            </span>
            <textarea
              value={extraRules}
              maxLength={1500}
              rows={5}
              onChange={(e) => {
                setExtraRules(e.target.value);
                setMsg('');
                setErr('');
              }}
              disabled={!isOwner}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-[15px] text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
              data-testid="extra-rules-field"
            />
            <span className="mt-1 block text-right text-[12px] tabular-nums text-textMuted">
              {extraRules.length}/1500
            </span>
          </label>
          {extraDirty && isOwner ? (
            <button
              type="button"
              disabled={saveBusy}
              onClick={() => void onSaveExtra()}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
              data-testid="extra-rules-save"
            >
              {saveBusy ? 'Speichern…' : 'Speichern'}
            </button>
          ) : null}
          {msg ? <p className="mt-2 text-[13px] text-textMuted">{msg}</p> : null}
          {err && !releaseOpen ? (
            <p role="alert" className="mt-2 text-[13px] text-danger">
              {err}
            </p>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        disabled={!previewMd}
        onClick={() => setFullOpen(true)}
        className="inline-flex min-h-11 items-center text-[15px] font-medium text-brand disabled:opacity-50"
        data-testid="legal-full-text"
      >
        Ganzen Text ansehen
      </button>

      <section className="rounded-md border border-border bg-surface">
        <button
          type="button"
          onClick={() => setVersionsOpen((v) => !v)}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-3.5 text-left"
          aria-expanded={versionsOpen}
        >
          <span className="text-[15px] font-medium text-text">Frühere Fassungen</span>
          <span className="text-[13px] text-textMuted">{versionsOpen ? '−' : '+'}</span>
        </button>
        {versionsOpen ? (
          <ul className="border-t border-border px-3.5 pb-3" data-testid="legal-versions">
            {versions.length === 0 ? (
              <li className="py-3 text-[13px] text-textMuted">Noch keine Fassungen.</li>
            ) : (
              versions.map((row, i) => {
                const prev = versions[i + 1] ?? null;
                const when = new Intl.DateTimeFormat('de-DE', {
                  timeZone: 'Europe/Berlin',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date(row.created_at));
                const reason = legalVersionTriggerLabel(
                  row.trigger,
                  row.values,
                  prev?.values ?? null,
                );
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border py-3 text-[13px] last:border-b-0"
                  >
                    <span className="tabular-nums text-text">{when}</span>
                    <span className="text-textMuted">· {reason}</span>
                    {row.pdf_path ? (
                      <span className="text-textMuted">· PDF</span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </section>

      <StudioLegalFullTextSheet
        open={fullOpen}
        title={title}
        bodyMd={previewMd}
        onClose={() => setFullOpen(false)}
      />

      <ModalBackdrop
        open={releaseOpen}
        visible
        canDismiss={!busy}
        onDismiss={() => {
          if (!busy) setReleaseOpen(false);
        }}
        variant="sheet"
        panelClassName="max-w-xl sm:max-w-[720px]"
        labelledBy="studio-legal-release-title"
      >
        <div className="flex max-h-[85vh] flex-col">
          <div className="shrink-0 border-b border-border px-5 py-4">
            <h3 id="studio-legal-release-title" className="text-[17px] font-medium text-text">
              {kind === 'terms' ? 'AGB freigeben' : 'Datenschutz freigeben'}
            </h3>
            <p className="mt-2 text-[13px] leading-5 text-textMuted">
              Omlify liefert Vorlagen. Du prüfst und verwendest sie als deine eigenen. Keine
              Rechtsberatung.
            </p>
          </div>
          <div
            className="legal-sheet-body min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-6 text-text [&_h1]:mb-3 [&_h1]:text-[20px] [&_h1]:font-medium [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-[16px] [&_h2]:font-medium [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{
              __html: previewMd ? studioLegalMarkdownToHtml(previewMd) : '',
            }}
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
                {kind === 'terms'
                  ? 'Ich habe die AGB geprüft und verwende sie als meine eigenen.'
                  : 'Ich habe die Datenschutzerklärung geprüft und verwende sie als meine eigene.'}
              </span>
            </label>
            {err ? (
              <p role="alert" className="text-[13px] text-danger">
                {err}
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
