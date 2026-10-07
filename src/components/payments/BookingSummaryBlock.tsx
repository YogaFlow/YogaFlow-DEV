import { useEffect, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  cancelRuleLineCompact,
  checkoutTaxLineAlone,
  formatLegalCents,
  providerAddressBlock,
  WITHDRAWAL_NOTICE_COMPACT,
  type TaxRegime,
} from '../../lib/legalCheckoutTexts';
import {
  courseCancelReassurance,
  courseCheckoutMetaLine,
} from '../../lib/checkoutSummaryTexts';
import { loadPublicStudioLegal } from '../../lib/studioLegal';
import { useTenant } from '../../context/TenantContext';
import ModalBackdrop from '../ui/ModalBackdrop';

export type BookingSummaryData = {
  title: string;
  whenLabel: string;
  durationLabel: string | null;
  place: string | null;
  teacher: string | null;
  amountCents: number;
  regime: TaxRegime;
  vatRateBp: number;
  providerName: string;
  providerCity: string;
  providerStreet: string;
  providerHouseNumber: string;
  providerPostalCode: string;
  providerContactEmail: string | null;
  providerPhone: string | null;
  /** Formatiert, nur wenn Frist noch in der Zukunft; sonst null → „vorbei“. */
  cancelDeadlineLabel: string | null;
  termsUrl?: string | null;
  privacyUrl?: string | null;
};

/** UX-10: Titel, Meta-Zeile, Beruhigung — Preis nur im sticky Fuß. */
export function BookingSummaryCompact({ data }: { data: BookingSummaryData }) {
  const meta = courseCheckoutMetaLine({
    whenLabel: data.whenLabel,
    place: data.place,
    teacher: data.teacher,
  });
  const reassurance = courseCancelReassurance(data.cancelDeadlineLabel);
  return (
    <div className="mb-4" data-testid="booking-summary">
      <p className="text-[15px] font-medium leading-snug text-text">{data.title}</p>
      {meta ? (
        <p className="mt-1 text-[13px] leading-snug text-textMuted" data-testid="booking-summary-meta">
          {meta}
        </p>
      ) : null}
      <p
        className="mt-2 inline-flex items-start gap-1.5 text-[13px] leading-snug text-text"
        data-testid="booking-summary-reassurance"
      >
        {reassurance.withCheck ? (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
        ) : null}
        <span>{reassurance.text}</span>
      </p>
    </div>
  );
}

/** Fester Fuß: Gesamt, Steuer, Knopf-Slot, kompakte Rechtzeile. */
export function BookingCheckoutFooter({
  data,
  alertMessage,
  children,
}: {
  data: BookingSummaryData;
  alertMessage?: string | null;
  children: ReactNode;
}) {
  const { tenant } = useTenant();
  const [providerOpen, setProviderOpen] = useState(false);
  const [hasTerms, setHasTerms] = useState(false);
  const tax = checkoutTaxLineAlone(data.regime, data.vatRateBp);
  const studioName = tenant?.name?.trim() || data.providerName;
  const address = providerAddressBlock({
    legalName: data.providerName,
    street: data.providerStreet,
    houseNumber: data.providerHouseNumber,
    postalCode: data.providerPostalCode,
    city: data.providerCity,
    contactEmail: data.providerContactEmail,
    phone: data.providerPhone,
  });

  useEffect(() => {
    let active = true;
    void loadPublicStudioLegal('terms').then((doc) => {
      if (active) setHasTerms(Boolean(doc?.body_md));
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      className="sticky bottom-0 z-10 -mx-5 mt-4 border-t border-border bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      data-testid="checkout-sticky-footer"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="text-[22px] font-medium tabular-nums text-text"
          data-testid="checkout-price"
        >
          {formatLegalCents(data.amountCents)}
        </span>
        <span className="text-[12px] leading-snug text-textMuted" data-testid="checkout-tax">
          {tax}
        </span>
      </div>

      {alertMessage ? (
        <p role="alert" className="mb-3 text-[13px] leading-snug text-danger">
          {alertMessage}
        </p>
      ) : null}

      {children}

      <p className="mt-2 text-center text-[12px] leading-snug text-textMuted">
        {hasTerms ? (
          <>
            <Link to="/agb" className="text-brand underline underline-offset-2">
              AGB
            </Link>
            {' · '}
          </>
        ) : null}
        <Link to="/datenschutz" className="text-brand underline underline-offset-2">
          Datenschutz
        </Link>
        {' · '}
        <button
          type="button"
          className="text-brand underline underline-offset-2"
          onClick={() => setProviderOpen(true)}
          data-testid="provider-details-open"
        >
          Anbieter
        </button>
      </p>
      <p className="mt-1 text-center text-[11px] leading-snug text-textMuted">
        {cancelRuleLineCompact(data.cancelDeadlineLabel)}
        {' · '}
        {WITHDRAWAL_NOTICE_COMPACT}
        {studioName ? ` · ${studioName}` : ''}
      </p>

      <ModalBackdrop
        open={providerOpen}
        visible
        onDismiss={() => setProviderOpen(false)}
        variant="dialog"
        panelClassName="max-w-sm"
      >
        <div className="px-5 py-4">
          <h3 className="text-[17px] font-medium text-text">Anbieterangaben</h3>
          <p className="mt-3 text-[15px] leading-6 text-text" data-testid="provider-address">
            {address.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
          <button
            type="button"
            onClick={() => setProviderOpen(false)}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-borderStrong text-[15px] font-medium text-text active:bg-surfaceSunken"
          >
            Schließen
          </button>
        </div>
      </ModalBackdrop>
    </div>
  );
}

/** @deprecated Prefer BookingSummaryCompact + BookingCheckoutFooter */
export default function BookingSummaryBlock({ data }: { data: BookingSummaryData }) {
  return <BookingSummaryCompact data={data} />;
}
