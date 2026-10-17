/**
 * Texte und Gebühren-Konstanten für Online-Zahlung (1.3b, U5, FS-1).
 * Preise: Stripe-Listenpreis, Stand 10/2026 — nicht dynamisch nachgeladen.
 */
import {
  estimateStripeFeeCents,
  STRIPE_CARD_FEE_FIXED_CENTS,
  STRIPE_CARD_FEE_PERCENT,
} from '../../lib/stripeFee.ts';

/** Beispielbetrag für die Gebührenrechnung in der UI. */
export const FEE_EXAMPLE_EUR = 15;

/** Standardkarte EWR: Anteil in Prozent. Stand 10/2026, Stripe-Listenpreis. */
export const FEE_CARD_PERCENT = STRIPE_CARD_FEE_PERCENT;
/** Fester Anteil in Euro je Kartenzahlung. Stand 10/2026, Stripe-Listenpreis. */
export const FEE_FIXED_EUR = STRIPE_CARD_FEE_FIXED_CENTS / 100;

export function feeForPercent(amountEur: number, percent: number): number {
  const cents = Math.round(amountEur * 100);
  if (percent === FEE_CARD_PERCENT) {
    return estimateStripeFeeCents(cents) / 100;
  }
  return Math.round((amountEur * (percent / 100) + FEE_FIXED_EUR) * 100) / 100;
}

export const FEE_EXAMPLE_CARD_EUR = feeForPercent(FEE_EXAMPLE_EUR, FEE_CARD_PERCENT);

/** FS-1 Kosten-Absatz (Einstellungen › Zahlungen › Online-Zahlung). */
export const FEES_BODY_TEXT =
  'Zahlung mit Kreditkarte, Apple Pay oder Google Pay: 1,5 % + 0,25 € je Zahlung (Standardkarten aus dem EWR). ' +
  'Beispiel 15 €: 1,5 % × 15 € = 0,225 € + 0,25 € = 0,475 €, also rund 0,48 €. ' +
  'Für einzelne Karten (z. B. Firmenkarten) kann Stripe etwas mehr berechnen. ' +
  'Die Gebühr zahlt dein Studio direkt an Stripe. Omlify verlangt nichts zusätzlich. ' +
  'Bei einer Erstattung behält Stripe die Gebühr. Stand 10/2026, Stripe-Listenpreis.';

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
      'Dein Smartphone, falls Stripe ein Foto deines Ausweises verlangt',
    ],
    stripeLoginNote:
      'Stripe fragt zu Beginn nach deiner E-Mail-Adresse und legt dafür ein eigenes Stripe-Login an.',
    duration: 'Das dauert etwa 10 Minuten.',
    feesTitle: 'Kosten',
    feesBody: () => FEES_BODY_TEXT,
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
    methodsTitle: 'Wie können Teilnehmende bezahlen?',
    onlineLabel: 'Online (Kreditkarte, Apple Pay, Google Pay)',
    onsiteLabel: 'Vor Ort (bar, PayPal, Überweisung)',
    lastMethodHint: 'Mindestens ein Zahlungsweg muss an bleiben.',
    onlineNotReady: (reason: string) => `Online ist noch nicht bereit: ${reason}`,
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
    LEGAL_PROFILE_MISSING: 'Bitte hinterlege zuerst die Anbieterangaben',
    LEGAL_PROFILE_LINK: 'Zu den Anbieterangaben',
    AVV_MISSING: 'Bitte bestätige zuerst den Vertrag zur Auftragsverarbeitung.',
    AVV_LINK: 'Zur AVV',
    STUDIO_LEGAL_TEXTS_MISSING:
      'Bitte gib zuerst Impressum, AGB und Datenschutz unter Rechtliches frei.',
    STUDIO_LEGAL_TEXTS_LINK: 'Zu den Rechtstexten',
    PROVIDER_NOT_READY: 'Dein Stripe-Konto ist noch nicht bereit.',
    PLATFORM_DISABLED: 'Online-Zahlung ist auf der Plattform noch nicht freigeschaltet.',
    LAST_METHOD: 'Mindestens ein Zahlungsweg muss an bleiben.',
  },

  onlineReadyReasons: {
    TAX_SETTING_MISSING: 'Steuerstatus fehlt',
    LEGAL_PROFILE_MISSING: 'Anbieterangaben fehlen',
    AVV_MISSING: 'AVV fehlt',
    STUDIO_LEGAL_TEXTS_MISSING: 'Studio-Rechtstexte fehlen',
    PROVIDER_NOT_READY: 'Stripe-Konto ist noch nicht bereit',
    PLATFORM_DISABLED: 'auf der Plattform noch nicht freigeschaltet',
    AMOUNT_ABOVE_RECEIPT_LIMIT: 'Preis über 250 €',
    ONLINE_DISABLED: 'ausgeschaltet',
  } as Record<string, string>,

  formError: 'Das Formular konnte nicht geladen werden. Bitte versuche es noch einmal.',
  refreshing: 'Status wird aktualisiert…',
} as const;
