import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  Calendar,
  ChevronRight,
  CreditCard,
  Scale,
  Users,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { withDevTenant } from '../context/TenantContext';
import BookingSettingsSection from '../components/settings/BookingSettingsSection';
import PassProductsSection from '../components/settings/PassProductsSection';
import StudioDesignSection from '../components/settings/StudioDesignSection';
import StudioLegalHub, { type LegalDocSlug } from '../components/settings/StudioLegalHub';
import TaxSettingsSection from '../components/settings/TaxSettingsSection';
import TeamSettingsSection from '../components/settings/TeamSettingsSection';
import { fetchStaffCount } from '../lib/settingsStaff';
import OnlinePaymentSection from '../features/payments/OnlinePaymentSection';
import { BOOKING_CANCELLATION_WINDOW_DEFAULT } from '../lib/bookingSettings';
import { listPassProducts } from '../lib/passProducts';
import { paymentsClientConfig } from '../lib/paymentsClientConfig';
import { supabase } from '../lib/supabase';
import { asCivilIsoDate } from '../lib/courseDateTime';
import { loadStudioLegalStatus } from '../lib/studioLegal';
import {
  bookingsStatusLine,
  cardsStatusLine,
  legalStatusLine,
  parseSettingsCategory,
  paymentsStatusLine,
  settingsAttentionItems,
  settingsCategoryTitle,
  studioStatusLine,
  teamStatusLine,
  visibleSettingsCategories,
  type SettingsAttention,
  type SettingsCategoryId,
} from '../lib/settingsOverview';
import { choiceShortLabel, loadTaxSettings, choiceFromSetting } from '../lib/taxStatus';
import { loadAvvStatus } from '../lib/legalAcceptances';
import { toUiStatus, type PaymentSetupStatus } from '../features/payments/paymentSetupTypes';

const ICONS: Record<SettingsCategoryId, typeof Building2> = {
  studio: Building2,
  buchungen: Calendar,
  zahlungen: Wallet,
  karten: CreditCard,
  team: Users,
  rechtliches: Scale,
};

type OverviewData = {
  lines: Record<SettingsCategoryId, string>;
  attention: SettingsAttention[];
};

const EMPTY_LINES: Record<SettingsCategoryId, string> = {
  studio: '',
  buchungen: '',
  zahlungen: '',
  karten: '',
  team: '',
  rechtliches: '',
};

async function loadPaymentSetup(): Promise<PaymentSetupStatus | null> {
  const config = paymentsClientConfig();
  if (!config.enabled) return null;
  const { data, error } = await supabase.rpc('get_payment_setup_status');
  if (error || !data || typeof data !== 'object') return null;
  const row = data as PaymentSetupStatus;
  if (row.success === false) return null;
  return row;
}

async function loadOverview(input: {
  studioName: string;
  hasLogo: boolean;
  cancellationWindowHours: number;
}): Promise<OverviewData> {
  const [taxRows, products, staffCount, setup, avv, studioLegal] = await Promise.all([
    loadTaxSettings().catch(() => []),
    listPassProducts().catch(() => []),
    fetchStaffCount(),
    loadPaymentSetup(),
    loadAvvStatus().catch(() => null),
    loadStudioLegalStatus().catch(() => null),
  ]);
  const today = new Date();
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(today);
  const current =
    taxRows
      .filter((row) => asCivilIsoDate(row.valid_from) <= todayIso)
      .sort((a, b) => asCivilIsoDate(b.valid_from).localeCompare(asCivilIsoDate(a.valid_from)))[0] ??
    null;
  const taxLabel = current ? choiceShortLabel(choiceFromSetting(current)) : null;
  const activeCards = products.filter((item) => item.archived_at == null).length;
  const onlineEnabled = setup?.online_payments_enabled === true;
  const ui = setup ? toUiStatus(setup.onboarding_status) : null;
  const stripeReady = ui === 'active';
  const legalPresent = setup?.legal_profile_present === true;
  const attention = settingsAttentionItems({
    onlineEnabled,
    taxPresent: Boolean(setup?.tax_setting_present ?? current),
    stripeReady,
    hasAccount: setup?.has_account === true,
    platformEnabled: setup?.platform_enabled === true,
    legalProfilePresent: setup ? legalPresent : undefined,
    avvAccepted: avv ? avv.accepted : undefined,
    imprintComplete: studioLegal ? studioLegal.imprint_complete : undefined,
    termsStatus: studioLegal?.terms.status,
    privacyStatus: studioLegal?.privacy.status,
  });
  const legalLine = studioLegal?.texts_ready
    ? 'Impressum · AGB · Datenschutz'
    : studioLegal?.imprint_complete
      ? 'Impressum ok · Texte freigeben'
      : legalStatusLine(legalPresent);
  return {
    lines: {
      studio: studioStatusLine({ name: input.studioName, hasLogo: input.hasLogo }),
      buchungen: bookingsStatusLine({ cancellationWindowHours: input.cancellationWindowHours }),
      zahlungen: paymentsStatusLine({ onlineEnabled, taxLabel }),
      karten: cardsStatusLine(activeCards),
      team: teamStatusLine(staffCount),
      rechtliches: legalLine,
    },
    attention,
  };
}

function CategoryContent({
  category,
  isOwner,
  legalDoc,
}: {
  category: SettingsCategoryId;
  isOwner: boolean;
  legalDoc: LegalDocSlug | null;
}) {
  if (category === 'studio') {
    return (
      <div className="space-y-6">
        {isOwner ? <StudioDesignSection /> : (
          <p className="text-[15px] text-textMuted">Name, Logo und Farben stellt die Inhaberin ein.</p>
        )}
        <div className="rounded-md border border-border bg-surface p-3.5">
          <h2 className="mb-4 text-xl font-semibold text-text">Systeminformationen</h2>
          <div className="space-y-2 text-sm text-textMuted">
            <div className="flex justify-between">
              <span>Anwendungsname:</span>
              <span className="font-medium text-text">Omlify</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Build:</span>
              <span className="font-medium text-text tabular-nums" data-testid="app-build-sha">
                {import.meta.env.VITE_BUILD_SHA || 'dev'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (category === 'buchungen') return <BookingSettingsSection />;
  if (category === 'zahlungen') {
    return (
      <div className="space-y-6">
        <OnlinePaymentSection isOwner={isOwner} />
        <TaxSettingsSection isOwner={isOwner} />
      </div>
    );
  }
  if (category === 'karten') return <PassProductsSection />;
  if (category === 'rechtliches') {
    return <StudioLegalHub canManage isOwner={isOwner} doc={legalDoc} />;
  }
  return <TeamSettingsSection />;
}

function OverviewList({
  lines,
  attention,
  isOwner,
}: {
  lines: Record<SettingsCategoryId, string>;
  attention: SettingsAttention[];
  isOwner: boolean;
}) {
  return (
    <div className="space-y-4">
      {attention.length > 0 ? (
        <section
          className="overflow-hidden rounded-md border border-accent bg-accentSoft"
          data-testid="settings-attention"
        >
          <h2 className="border-b border-accent/40 px-3.5 py-3 text-[15px] font-medium text-text">
            Braucht deine Aufmerksamkeit
          </h2>
          <ul>
            {attention.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.to}
                  className="flex min-h-11 items-center gap-3 px-3.5 py-3 text-left no-underline active:bg-surface/50"
                >
                  <AlertTriangle className="h-[18px] w-[18px] shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 text-[15px] text-text">{item.title}</span>
                  <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="overflow-hidden rounded-md border border-border bg-surface" data-testid="settings-categories">
        {visibleSettingsCategories(isOwner).map((item) => {
          const Icon = ICONS[item.id];
          return (
            <li key={item.id} className="border-b border-border last:border-b-0">
              <Link
                to={item.to}
                className="flex min-h-11 items-center gap-3 px-3.5 py-3 text-left no-underline active:bg-surfaceSunken"
                data-testid={`settings-cat-${item.id}`}
              >
                <Icon className="h-5 w-5 shrink-0 text-textMuted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-text">{item.title}</span>
                  <span className="mt-0.5 block text-[13px] text-textMuted">{lines[item.id]}</span>
                </span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Settings() {
  const { isAdmin, isOwner } = useAuth();
  const { tenant } = useTenant();
  const { category: rawCategory, legalDoc: rawLegalDoc } = useParams<{
    category?: string;
    legalDoc?: string;
  }>();
  const location = useLocation();
  const category = parseSettingsCategory(rawCategory);
  const legalDoc = parseLegalDoc(rawLegalDoc);
  const [overview, setOverview] = useState<OverviewData>({ lines: EMPTY_LINES, attention: [] });

  useEffect(() => {
    if (!isAdmin || !tenant) return;
    const windowHours =
      typeof tenant.cancellation_window_hours === 'number'
        ? tenant.cancellation_window_hours
        : BOOKING_CANCELLATION_WINDOW_DEFAULT;
    void loadOverview({
      studioName: tenant.name,
      hasLogo: Boolean(tenant.logo_path),
      cancellationWindowHours: windowHours,
    }).then(setOverview);
  }, [isAdmin, isOwner, tenant]);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="rounded-sm border border-danger bg-dangerSoft px-4 py-3 text-danger">
          Zugriff verweigert. Administratorrechte erforderlich.
        </div>
      </div>
    );
  }

  if (rawCategory && !category) {
    return <Navigate to={withDevTenant('/settings')} replace />;
  }

  if (category === 'rechtliches' && rawLegalDoc && !legalDoc) {
    return <Navigate to={withDevTenant('/settings/rechtliches')} replace />;
  }

  if (!rawCategory && (location.hash === '#steuern' || location.hash === '#online-zahlung')) {
    return <Navigate to={withDevTenant(`/settings/zahlungen${location.hash}`)} replace />;
  }

  if (category === 'studio' && !isOwner) {
    return <Navigate to={withDevTenant('/settings')} replace />;
  }

  const list = (
    <OverviewList lines={overview.lines} attention={overview.attention} isOwner={isOwner} />
  );

  const isLegalHub = category === 'rechtliches';
  const hideSettingsListOnMobile = Boolean(category);
  const hideSettingsListOnDesktopLegal = isLegalHub;

  return (
    <div className="lg:flex lg:items-start lg:gap-8">
      <aside
        className={`${hideSettingsListOnMobile ? 'hidden' : 'block'} ${
          hideSettingsListOnDesktopLegal ? 'lg:hidden' : 'lg:block'
        } lg:sticky lg:top-0 lg:w-80 lg:shrink-0`}
      >
        <h1 className="mb-4 text-[22px] font-medium text-text lg:sr-only">Einstellungen</h1>
        {list}
      </aside>
      {category ? (
        <div className="min-w-0 flex-1">
          {!isLegalHub || !legalDoc ? (
            <Link
              to={isLegalHub ? '/settings' : '/settings'}
              data-testid="settings-back"
              className={`mb-4 inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-text ${
                isLegalHub ? '' : 'lg:hidden'
              }`}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
              Einstellungen
            </Link>
          ) : null}
          {!isLegalHub ? (
            <h1 className="mb-4 hidden text-[22px] font-medium text-text lg:block">
              {settingsCategoryTitle(category)}
            </h1>
          ) : !legalDoc ? (
            <h1 className="mb-4 text-[22px] font-medium text-text">Rechtliches</h1>
          ) : null}
          <CategoryContent category={category} isOwner={isOwner} legalDoc={legalDoc} />
        </div>
      ) : (
        <div className="hidden min-w-0 flex-1 lg:block">
          <p className="text-[15px] text-textMuted">Wähle links eine Kategorie.</p>
        </div>
      )}
    </div>
  );
}

function parseLegalDoc(raw: string | null | undefined): LegalDocSlug | null {
  if (raw === 'impressum' || raw === 'agb' || raw === 'datenschutz') return raw;
  return null;
}
