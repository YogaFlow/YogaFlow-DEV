/**
 * Texte und Gebühren-Konstanten für Online-Zahlung (1.3b, U5).
 * Preise: Stripe-Listenpreis, Stand 09/2026 — nicht dynamisch nachgeladen.
 */
import { formatPrice } from '../../lib/format';

/** Beispielbetrag für die Gebührenrechnung in der UI. */
export const FEE_EXAMPLE_EUR = 15;

/** Standardkarte EWR: Anteil in Prozent. Stand 09/2026, Stripe-Listenpreis. */
export const FEE_CARD_PERCENT = 1.5;
/** Fester Anteil in Euro je Kartenzahlung. Stand 09/2026, Stripe-Listenpreis. */
export const FEE_FIXED_EUR = 0.25;
/** Premium-/Firmenkarten: Anteil in Prozent. Stand 09/2026, Stripe-Listenpreis. */
export const FEE_PREMIUM_PERCENT = 2.8;

export function feeForPercent(amountEur: number, percent: number): number {
  return Math.round((amountEur * (percent / 100) + FEE_FIXED_EUR) * 100) / 100;
}

export const FEE_EXAMPLE_CARD_EUR = feeForPercent(FEE_EXAMPLE_EUR, FEE_CARD_PERCENT);
export const FEE_EXAMPLE_PREMIUM_EUR = feeForPercent(FEE_EXAMPLE_EUR, FEE_PREMIUM_PERCENT);

export const STRIPE_DASHBOARD_URL = 'https://dashboard.stripe.com';

export const copy = {
  sectionTitle: 'Online-Zahlung',
  loading: 'Wird geladen…',
  loadError: 'Der Stand der Online-Zahlung konnte nicht geladen werden.',
  genericError: 'Das hat nicht geklappt. Bitte versuche es noch einmal.',
  keyMissing:
    'Online-Zahlung ist lokal nicht eingerichtet (Publishable Key fehlt oder ist kein Test-Key).',

  notStarted: {
    lead:
      'Damit Teilnehmende Kurse online bezahlen können, richtest du ein Stripe-Konto für dein Studio ein.',
    needsTitle: 'Was du brauchst',
    needs: [
      'Ausweis oder Reisepass',
      'Bankverbindung (IBAN)',
      'Angaben zu deinem Unternehmen bzw. zur Selbstständigkeit',
      'Steuernummer',
    ],
    duration: 'Das dauert etwa 10 Minuten.',
    feesTitle: 'Kosten',
    feesBody: () =>
      [
        `Kartenzahlung (Standardkarte EWR): 1,5 % + ${formatPrice(FEE_FIXED_EUR)} je Zahlung.`,
        `Beispiel ${formatPrice(FEE_EXAMPLE_EUR)}: 1,5 % × ${formatPrice(FEE_EXAMPLE_EUR)} = 0,225 € + ${formatPrice(FEE_FIXED_EUR)} = 0,475 €, also rund ${formatPrice(FEE_EXAMPLE_CARD_EUR)}.`,
        `Premium- und Firmenkarten: 2,8 % + ${formatPrice(FEE_FIXED_EUR)}, bei ${formatPrice(FEE_EXAMPLE_EUR)} also ${formatPrice(FEE_EXAMPLE_PREMIUM_EUR)}.`,
        'Die Gebühr zahlt dein Studio direkt an Stripe. Omlify verlangt nichts zusätzlich.',
        'Stand 09/2026, Stripe-Listenpreis.',
      ].join(' '),
    cta: 'Online-Zahlung einrichten',
  },

  inProgress: {
    lead: 'Einrichtung noch nicht abgeschlossen',
    body: 'Du kannst jederzeit weitermachen, wo du aufgehört hast.',
    cta: 'Einrichtung fortsetzen',
  },

  inReview: {
    lead: 'Stripe prüft deine Angaben',
    body: 'Das dauert meist nur Minuten, selten ein paar Tage.',
    cta: 'Status aktualisieren',
  },

  active: {
    lead: 'Online-Zahlung ist bereit.',
    onlineLabel: 'Online-Zahlung für Buchungen anbieten',
    onsiteLabel: 'Zahlung vor Ort weiterhin erlauben',
    requirementsPending: (dateLabel: string) =>
      `Stripe braucht bis ${dateLabel} weitere Angaben, sonst wird die Online-Zahlung pausiert.`,
    requirementsCta: 'Angaben ergänzen',
    dashboardLink: 'Zum Stripe-Dashboard',
  },

  disconnected: {
    lead: 'Die Verbindung zu Stripe wurde getrennt. Online-Zahlung ist aus.',
    body: 'Ein neues Verbinden ist noch nicht möglich.',
  },

  switchErrors: {
    TAX_SETTING_MISSING: 'Bitte hinterlege zuerst deinen Steuerstatus',
    TAX_SETTING_LINK: 'Zu den Steuern',
    PROVIDER_NOT_READY: 'Dein Stripe-Konto ist noch nicht bereit.',
    PLATFORM_DISABLED: 'Online-Zahlung ist auf der Plattform noch nicht freigeschaltet.',
  },

  formError: 'Das Formular konnte nicht geladen werden. Bitte versuche es noch einmal.',
  refreshing: 'Status wird aktualisiert…',
} as const;
