/**
 * RT-1 Nachtrag — „Das steht drin“-Zeilen aus Render-Werten.
 */
import type { StudioLegalValues } from './studioLegalRender';
import { STUDIO_LEGAL_SUBPROCESSORS } from '../generated/studioLegalTemplates';

export type StudioLegalFactRow = {
  id: string;
  label: string;
  to: string;
};

export function termsFactRows(values: StudioLegalValues): StudioLegalFactRow[] {
  const payParts: string[] = [];
  if (values.pay_online) payParts.push('online');
  if (values.pay_onsite) payParts.push('vor Ort');
  const payLabel =
    payParts.length === 0
      ? 'Bezahlen: nicht eingerichtet'
      : payParts.length === 2
        ? 'Bezahlen: online und vor Ort'
        : `Bezahlen: ${payParts[0]}`;

  const rows: StudioLegalFactRow[] = [
    {
      id: 'cancel',
      label: `Kostenlos abmelden bis ${values.cancellation_hours} vor Beginn`,
      to: '/settings/buchungen',
    },
    {
      id: 'pay',
      label: payLabel,
      to: '/settings/zahlungen',
    },
  ];

  if (values.passes_any) {
    rows.push({
      id: 'passes',
      label: values.passes_online
        ? 'Kurskarten online kaufbar'
        : 'Kurskarten nur vor Ort',
      to: '/settings/karten',
    });
  }

  rows.push({
    id: 'tax',
    label: values.tax_small_business
      ? 'Steuer: Kleinunternehmer (§ 19 UStG)'
      : 'Steuer: Regelbesteuerung',
    to: '/settings/zahlungen',
  });

  return rows;
}

export function privacyFactRows(values: StudioLegalValues): {
  rows: StudioLegalFactRow[];
  subprocessors: { name: string; purpose: string; location: string }[];
  subprocessorCount: number;
} {
  const rows: StudioLegalFactRow[] = [
    {
      id: 'stripe',
      label: values.pay_online
        ? 'Zahlungsdienst Stripe: ja'
        : 'Zahlungsdienst Stripe: nein',
      to: '/settings/zahlungen',
    },
    {
      id: 'passes',
      label: values.passes_any ? 'Kurskarten: ja' : 'Kurskarten: nein',
      to: '/settings/karten',
    },
  ];
  const items = [...STUDIO_LEGAL_SUBPROCESSORS.items];
  return {
    rows,
    subprocessors: items,
    subprocessorCount: items.length,
  };
}
