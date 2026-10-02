import type {
  CoverageStatus,
  PaymentMethod,
  RegistrationStatus,
  WaivedReason,
} from '../types';

export type ManualCheckoutMethod = 'cash' | 'paypal_manual' | 'bank_transfer';

/** Audience for unified coverage wording (A8-2). */
export type CoverageLabelAudience = 'manager' | 'teacher' | 'participant' | 'csv';

export type CoverageLabelInput = {
  status?: RegistrationStatus | string | null;
  is_waitlist?: boolean | null;
  coverage_status?: CoverageStatus | null;
  coverage_waived_reason?: WaivedReason | null;
  method?: PaymentMethod | ManualCheckoutMethod | null;
  pass_remaining?: number | null;
};

export function methodWord(method: PaymentMethod | ManualCheckoutMethod | null | undefined): string {
  if (method === 'cash') return 'bar';
  if (method === 'paypal_manual') return 'PayPal';
  if (method === 'bank_transfer') return 'Überweisung';
  // Z12: Stripe-Zahlung — Anzeige „online“; CSV behält „Karte“ in paidLabel.
  if (method === 'card') return 'online';
  return 'bezahlt';
}

function isWaitlistOrCancelled(registration: CoverageLabelInput): boolean {
  if (registration.is_waitlist) return true;
  const status = registration.status;
  return status === 'waitlist' || status === 'cancelled';
}

function passLabel(audience: CoverageLabelAudience, remaining: number | null | undefined): string {
  if (audience === 'participant') return 'mit Karte bezahlt';
  if (audience === 'csv' || remaining == null || !Number.isFinite(remaining)) return 'Karte';
  return `Karte · noch ${remaining}`;
}

function paidLabel(
  audience: CoverageLabelAudience,
  method: PaymentMethod | ManualCheckoutMethod | null | undefined,
): string {
  if (audience === 'csv') {
    // CSV unverändert: card → „Karte“
    if (method === 'card') return 'Karte';
    return method ? methodWord(method) : 'bezahlt';
  }
  if (audience === 'manager') {
    return method ? methodWord(method) : 'bezahlt';
  }
  if (audience === 'participant' && method === 'card') {
    return 'online bezahlt';
  }
  return 'bezahlt';
}

function waivedLabel(
  audience: CoverageLabelAudience,
  reason: WaivedReason | null | undefined,
): string {
  if (audience === 'participant') return 'erledigt';
  if (reason === 'pre_omlify') return 'vor Omlify erledigt';
  return 'erlassen';
}

/**
 * Einheitliche Deckungstexte für Kasse, Teilnehmerliste, CSV und Meine Anmeldungen.
 * Warteliste und Stornierte: „—“ (Staff/CSV) bzw. leer für Teilnehmende (Status statt Bezahlung).
 */
export function coverageLabel(
  registration: CoverageLabelInput,
  options: { audience: CoverageLabelAudience },
): string {
  const { audience } = options;
  if (isWaitlistOrCancelled(registration)) {
    return audience === 'participant' ? '' : '—';
  }

  if (registration.status === 'pending_payment') {
    return 'Zahlung ausstehend';
  }

  const coverage = registration.coverage_status ?? 'open';
  switch (coverage) {
    case 'paid':
      return paidLabel(audience, registration.method);
    case 'pass':
      return passLabel(audience, registration.pass_remaining);
    case 'waived':
      return waivedLabel(audience, registration.coverage_waived_reason);
    case 'not_required':
      return 'kostenlos';
    case 'open':
    default:
      return audience === 'participant' ? 'offen · vor Ort bezahlen' : 'offen';
  }
}
