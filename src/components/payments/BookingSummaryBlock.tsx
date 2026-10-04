import { useState, type ReactNode } from 'react';
import {
  cancelRuleLineCompact,
  checkoutTaxLineAlone,
  formatLegalCents,
  providerAddressBlock,
  providerCityLine,
  WITHDRAWAL_NOTICE_COMPACT,
  type TaxRegime,
} from '../../lib/legalCheckoutTexts';
import LegalDocumentSheet, { LegalDocLink } from '../legal/LegalDocumentSheet';
import type { LegalDocumentSlug } from '../../generated/legalDocuments';
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
  cancelDeadlineLabel: string | null;
  termsUrl?: string | null;
  privacyUrl?: string | null;
};

/** Zwei-Zeilen-Zusammenfassung im Checkout-Scrollbereich (UX-2 A4). */
export function BookingSummaryCompact({ data }: { data: BookingSummaryData }) {
  const meta = [data.whenLabel, data.place].filter(Boolean).join(' · ');
  return (
    <div className="mb-4" data-testid="booking-summary">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium leading-snug text-text">{data.title}</p>
        <p
          className="shrink-0 text-[15px] font-medium tabular-nums text-text"
          data-testid="checkout-price-inline"
        >
          {formatLegalCents(data.amountCents)}
        </p>
      </div>
      {meta ? <p className="mt-1 text-[13px] leading-snug text-textMuted">{meta}</p> : null}
      {data.teacher ? (
        <p className="mt-0.5 text-[13px] leading-snug text-textMuted">{data.teacher}</p>
      ) : null}
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
  const [legalDoc, setLegalDoc] = useState<LegalDocumentSlug | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const tax = checkoutTaxLineAlone(data.regime, data.vatRateBp);
  const address = providerAddressBlock({
    legalName: data.providerName,
    street: data.providerStreet,
    houseNumber: data.providerHouseNumber,
    postalCode: data.providerPostalCode,
    city: data.providerCity,
    contactEmail: data.providerContactEmail,
    phone: data.providerPhone,
  });

  return (
    <div
      className="sticky bottom-0 z-10 -mx-5 mt-4 border-t border-border bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      data-testid="checkout-sticky-footer"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-medium text-text">Gesamt</span>
        <span
          className="text-[17px] font-medium tabular-nums text-text"
          data-testid="checkout-price"
        >
          {formatLegalCents(data.amountCents)}
        </span>
      </div>
      <p className="mb-3 text-[12px] leading-snug text-textMuted">{tax}</p>

      {alertMessage ? (
        <p role="alert" className="mb-3 text-[13px] leading-snug text-danger">
          {alertMessage}
        </p>
      ) : null}

      {children}

      <p className="mt-2 text-[12px] leading-snug text-textMuted">
        {cancelRuleLineCompact(data.cancelDeadlineLabel)}
        {' · '}
        {WITHDRAWAL_NOTICE_COMPACT}
        {' · '}
        Anbieter:{' '}
        <button
          type="button"
          className="text-brand underline underline-offset-2"
          onClick={() => setProviderOpen(true)}
          data-testid="provider-details-open"
        >
          {providerCityLine(data.providerName, data.providerCity)}
        </button>
        {' · '}
        <LegalDocLink slug="agb" onOpen={setLegalDoc} className="text-brand underline underline-offset-2">
          AGB
        </LegalDocLink>
        {' · '}
        <LegalDocLink
          slug="datenschutz"
          onOpen={setLegalDoc}
          className="text-brand underline underline-offset-2"
        >
          Datenschutz
        </LegalDocLink>
      </p>

      <LegalDocumentSheet slug={legalDoc} onClose={() => setLegalDoc(null)} />
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
