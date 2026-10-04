import { useState } from 'react';
import {
  checkoutPriceLine,
  cancelRuleLine,
  providerAddressBlock,
  providerCityLine,
  WITHDRAWAL_NOTICE,
  type TaxRegime,
} from '../../lib/legalCheckoutTexts';

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

export default function BookingSummaryBlock({ data }: { data: BookingSummaryData }) {
  const [open, setOpen] = useState(false);
  const price = checkoutPriceLine(data.amountCents, data.regime, data.vatRateBp);
  const details = [
    data.title,
    data.whenLabel,
    data.durationLabel,
    data.place,
    data.teacher,
  ].filter(Boolean);
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
    <div className="mb-4 space-y-3" data-testid="booking-summary">
      <div>
        <p className="text-[13px] font-medium text-textMuted">Deine Buchung</p>
        <p className="mt-1 text-[15px] leading-snug text-text">{details.join(' · ')}</p>
      </div>
      <p className="text-[22px] font-medium leading-tight text-text tabular-nums" data-testid="checkout-price">
        {price}
      </p>
      <p className="text-[13px] leading-snug text-text">
        Anbieter: {providerCityLine(data.providerName, data.providerCity)}{' '}
        <button
          type="button"
          className="text-brand underline"
          onClick={() => setOpen((value) => !value)}
        >
          Anbieterangaben
        </button>
      </p>
      {open ? (
        <p className="text-[13px] leading-snug text-textMuted" data-testid="provider-address">
          {address.join(', ')}
        </p>
      ) : null}
      <p className="text-[13px] leading-snug text-text">{cancelRuleLine(data.cancelDeadlineLabel)}</p>
      <p className="text-[13px] leading-snug text-text">{WITHDRAWAL_NOTICE}</p>
      {data.termsUrl || data.privacyUrl ? (
        <p className="text-[13px] text-textMuted">
          {data.termsUrl ? (
            <a href={data.termsUrl} className="text-brand underline">
              AGB
            </a>
          ) : null}
          {data.termsUrl && data.privacyUrl ? ' · ' : null}
          {data.privacyUrl ? (
            <a href={data.privacyUrl} className="text-brand underline">
              Datenschutz
            </a>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
