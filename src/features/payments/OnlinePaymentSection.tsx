/**
 * Abschnitt „Online-Zahlung“ in den Studio-Einstellungen (1.3b).
 * Owner: Aktionen. Admin: nur Lesen. Plattform aus → unsichtbar.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { formatDate } from '../../lib/format';
import { paymentsClientConfig } from '../../lib/paymentsClientConfig';
import AccentPill from '../../components/ui/AccentPill';
import { copy, STRIPE_DASHBOARD_URL } from './paymentSetupCopy';
import { readDevMockStatus } from './paymentSetupTypes';
import { usePaymentSetup } from './usePaymentSetup';

const StripeAccountOnboarding = lazy(() => import('./StripeAccountOnboarding'));

function publishableKeyOrNull(): string | null {
  const mock = readDevMockStatus();
  const config = paymentsClientConfig();
  if (config.enabled && config.publishableKey) return config.publishableKey;
  // DEV-Screenshot-Mock: Abschnitt nur mit Mock-Param zeigen, wenn Config sonst aus.
  if (mock && import.meta.env.DEV) {
    return config.publishableKey || 'pk_test_dev_mock';
  }
  return null;
}

function dueDateLabel(iso: string | null): string {
  if (!iso) return '';
  // requirements_due_at ist timestamptz — civil date in Europe/Berlin
  const dateOnly = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  return formatDate(dateOnly);
}

type Props = { isOwner: boolean };

export default function OnlinePaymentSection({ isOwner }: Props) {
  const [publishableKey] = useState(() => publishableKeyOrNull());
  const enabled = publishableKey != null;
  const {
    status,
    uiStatus,
    loading,
    error,
    busy,
    reload,
    refresh,
    setOnlineEnabled,
    setOnsiteAllowed,
  } = usePaymentSetup(enabled);

  const [showForm, setShowForm] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [taxLinkNeeded, setTaxLinkNeeded] = useState(false);
  const [legalLinkNeeded, setLegalLinkNeeded] = useState(false);
  const [avvLinkNeeded, setAvvLinkNeeded] = useState(false);
  const [studioLegalLinkNeeded, setStudioLegalLinkNeeded] = useState(false);
  const [hideForPlatform, setHideForPlatform] = useState(false);

  useEffect(() => {
    if (!status) return;
    if (status.platform_enabled === false) {
      setHideForPlatform(true);
    }
  }, [status]);

  if (!enabled || hideForPlatform) return null;

  if (loading && !status) {
    return (
      <section
        id="online-zahlung"
        className="mb-6 scroll-mt-24 rounded-md border border-border bg-surface p-3.5"
        aria-busy="true"
      >
        <h2 className="text-[19px] font-medium leading-snug text-text">{copy.sectionTitle}</h2>
        <p className="mt-3 text-[15px] text-textMuted">{copy.loading}</p>
      </section>
    );
  }

  if (error && !status) {
    return (
      <section id="online-zahlung" className="mb-6 scroll-mt-24 rounded-md border border-border bg-surface p-3.5">
        <h2 className="text-[19px] font-medium leading-snug text-text">{copy.sectionTitle}</h2>
        <p role="alert" className="mt-3 text-[15px] text-text">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="mt-3 min-h-11 rounded-sm bg-brand px-4 py-2 text-[15px] text-onBrand active:bg-brandPressed"
        >
          Erneut laden
        </button>
      </section>
    );
  }

  if (!status || !uiStatus) return null;
  if (!status.platform_enabled) return null;

  const openForm = () => setShowForm(true);
  const onFormExit = () => {
    setShowForm(false);
    void refresh();
  };

  const onToggleOnline = async (next: boolean) => {
    setSwitchError(null);
    setTaxLinkNeeded(false);
    setLegalLinkNeeded(false);
    setAvvLinkNeeded(false);
    setStudioLegalLinkNeeded(false);
    const result = await setOnlineEnabled(next);
    if (!result.ok) {
      if (result.code === 'PLATFORM_DISABLED') {
        setHideForPlatform(true);
        void reload();
        return;
      }
      setSwitchError(result.message);
      setTaxLinkNeeded(result.code === 'TAX_SETTING_MISSING');
      setLegalLinkNeeded(result.code === 'LEGAL_PROFILE_MISSING');
      setAvvLinkNeeded(result.code === 'AVV_MISSING');
      setStudioLegalLinkNeeded(result.code === 'STUDIO_LEGAL_TEXTS_MISSING');
    }
  };

  const onToggleOnsite = async (next: boolean) => {
    setSwitchError(null);
    setTaxLinkNeeded(false);
    setLegalLinkNeeded(false);
    setAvvLinkNeeded(false);
    setStudioLegalLinkNeeded(false);
    const result = await setOnsiteAllowed(next);
    if (!result.ok) {
      if (result.code === 'PLATFORM_DISABLED') {
        setHideForPlatform(true);
        void reload();
        return;
      }
      setSwitchError(result.message);
    }
  };

  return (
    <section id="online-zahlung" className="mb-6 scroll-mt-24 rounded-md border border-border bg-surface p-3.5">
      <h2 className="text-[19px] font-medium leading-snug text-text">{copy.sectionTitle}</h2>

      {uiStatus === 'not_started' ? (
        <div className="mt-3 space-y-3">
          <p className="text-[15px] leading-6 text-text">{copy.notStarted.lead}</p>
          <div>
            <p className="text-[15px] font-medium text-text">{copy.notStarted.needsTitle}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[15px] leading-6 text-text">
              {copy.notStarted.needs.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-2 text-[15px] leading-6 text-text">{copy.notStarted.stripeLoginNote}</p>
          </div>
          <p className="text-[15px] text-textMuted">{copy.notStarted.duration}</p>
          <div>
            <p className="text-[15px] font-medium text-text">{copy.notStarted.feesTitle}</p>
            <p className="mt-1 text-[15px] leading-6 text-text">{copy.notStarted.feesBody()}</p>
          </div>
          {isOwner && !showForm ? (
            <button
              type="button"
              disabled={busy}
              onClick={openForm}
              className="min-h-11 rounded-sm bg-brand px-4 py-2 text-[15px] text-onBrand active:bg-brandPressed disabled:bg-surfaceSunken disabled:text-textMuted"
            >
              {copy.notStarted.cta}
            </button>
          ) : null}
          {!isOwner ? (
            <p className="text-[15px] text-textMuted">Noch nicht eingerichtet.</p>
          ) : null}
        </div>
      ) : null}

      {uiStatus === 'in_progress' ? (
        <div className="mt-3 space-y-3">
          <p className="text-[15px] font-medium text-text">{copy.inProgress.lead}</p>
          <p className="text-[15px] leading-6 text-textMuted">{copy.inProgress.body}</p>
          {isOwner && !showForm ? (
            <button
              type="button"
              disabled={busy}
              onClick={openForm}
              className="min-h-11 rounded-sm bg-brand px-4 py-2 text-[15px] text-onBrand active:bg-brandPressed disabled:bg-surfaceSunken disabled:text-textMuted"
            >
              {copy.inProgress.cta}
            </button>
          ) : null}
        </div>
      ) : null}

      {uiStatus === 'in_review' ? (
        <div className="mt-3 space-y-3">
          <p className="text-[15px] font-medium text-text">{copy.inReview.lead}</p>
          <p className="text-[15px] leading-6 text-textMuted">{copy.inReview.body}</p>
          {isOwner ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              className="min-h-11 rounded-sm border border-borderStrong bg-surface px-4 py-2 text-[15px] text-text active:bg-surfaceSunken disabled:opacity-60"
            >
              {busy ? copy.refreshing : copy.inReview.cta}
            </button>
          ) : null}
        </div>
      ) : null}

      {uiStatus === 'active' ? (
        <div className="mt-3 space-y-4">
          <p className="text-[15px] font-medium text-text">{copy.active.lead}</p>

          {status.requirements_pending && status.requirements_due_at ? (
            <div
              role="status"
              className="rounded-sm border border-accent bg-accentSoft px-3 py-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <AccentPill>Frist</AccentPill>
                <p className="text-[15px] leading-6 text-accentText">
                  {copy.active.requirementsPending(dueDateLabel(status.requirements_due_at))}
                </p>
              </div>
              {isOwner && !showForm ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={openForm}
                  className="mt-2 min-h-11 rounded-sm border border-accent bg-surface px-4 py-2 text-[15px] text-accentText active:bg-accentSoft disabled:opacity-60"
                >
                  {copy.active.requirementsCta}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1" data-testid="payment-methods">
            <p className="text-[15px] font-medium text-text">{copy.active.methodsTitle}</p>
            <label
              className={`flex min-h-11 items-center gap-3 ${isOwner ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
            >
              <input
                type="checkbox"
                checked={status.online_payments_enabled}
                disabled={!isOwner || busy}
                onChange={(e) => void onToggleOnline(e.target.checked)}
                className="h-4 w-4 rounded-sm border-border text-brand focus:ring-brand"
                data-testid="toggle-online-method"
              />
              <span className="text-[15px] text-text">{copy.active.onlineLabel}</span>
            </label>
            <label
              className={`flex min-h-11 items-center gap-3 ${isOwner ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
            >
              <input
                type="checkbox"
                checked={status.allow_onsite_payment}
                disabled={!isOwner || busy}
                onChange={(e) => void onToggleOnsite(e.target.checked)}
                className="h-4 w-4 rounded-sm border-border text-brand focus:ring-brand"
                data-testid="toggle-onsite-method"
              />
              <span className="text-[15px] text-text">{copy.active.onsiteLabel}</span>
            </label>
            <p className="text-[13px] text-textMuted">{copy.active.lastMethodHint}</p>
            {status.online_payments_enabled &&
            (!status.tax_setting_present ||
              status.legal_profile_present === false ||
              status.avv_accepted === false ||
              status.studio_legal_texts_ready === false) ? (
              <p role="status" className="text-[15px] text-text" data-testid="online-not-ready">
                {copy.active.onlineNotReady(
                  !status.tax_setting_present
                    ? copy.onlineReadyReasons.TAX_SETTING_MISSING
                    : status.legal_profile_present === false
                      ? copy.onlineReadyReasons.LEGAL_PROFILE_MISSING
                      : status.avv_accepted === false
                        ? copy.onlineReadyReasons.AVV_MISSING
                        : copy.onlineReadyReasons.STUDIO_LEGAL_TEXTS_MISSING,
                )}{' '}
                {!status.tax_setting_present ? (
                  <a href="#steuern" className="underline text-brand">
                    {copy.switchErrors.TAX_SETTING_LINK}
                  </a>
                ) : (
                  <a href="/settings/rechtliches" className="underline text-brand">
                    {status.legal_profile_present === false
                      ? copy.switchErrors.LEGAL_PROFILE_LINK
                      : status.avv_accepted === false
                        ? copy.switchErrors.AVV_LINK
                        : copy.switchErrors.STUDIO_LEGAL_TEXTS_LINK}
                  </a>
                )}
              </p>
            ) : null}
          </div>

          {switchError ? (
            <p role="alert" className="text-[15px] text-text">
              {switchError}
              {taxLinkNeeded ? (
                <>
                  {' '}
                  <a href="#steuern" className="underline text-brand">
                    {copy.switchErrors.TAX_SETTING_LINK}
                  </a>
                </>
              ) : null}
              {legalLinkNeeded ? (
                <>
                  {' '}
                  <a href="/settings/rechtliches" className="underline text-brand">
                    {copy.switchErrors.LEGAL_PROFILE_LINK}
                  </a>
                </>
              ) : null}
              {avvLinkNeeded ? (
                <>
                  {' '}
                  <a href="/settings/rechtliches" className="underline text-brand">
                    {copy.switchErrors.AVV_LINK}
                  </a>
                </>
              ) : null}
              {studioLegalLinkNeeded ? (
                <>
                  {' '}
                  <a href="/settings/rechtliches" className="underline text-brand">
                    {copy.switchErrors.STUDIO_LEGAL_TEXTS_LINK}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}

          <a
            href={STRIPE_DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-[15px] text-brand underline"
          >
            {copy.active.dashboardLink}
          </a>
        </div>
      ) : null}

      {uiStatus === 'disconnected' ? (
        <div className="mt-3 space-y-2">
          <p className="text-[15px] font-medium text-text">{copy.disconnected.lead}</p>
          <p className="text-[15px] leading-6 text-textMuted">{copy.disconnected.body}</p>
        </div>
      ) : null}

      {showForm && isOwner && publishableKey ? (
        <div className="mt-4 border-t border-border pt-4">
          <Suspense fallback={<p className="text-[15px] text-textMuted">{copy.loading}</p>}>
            <StripeAccountOnboarding publishableKey={publishableKey} onExit={onFormExit} />
          </Suspense>
        </div>
      ) : null}
    </section>
  );
}
