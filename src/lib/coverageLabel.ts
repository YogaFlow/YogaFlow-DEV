import type {
  CoverageStatus,
  PaymentMethod,
  RegistrationStatus,
  WaivedReason,
} from '../types';

export type ManualCheckoutMethod = 'cash' | 'paypal_manual' | 'bank_transfer';

/** Audience for unified coverage wording (A8-2 / UX-6). */
export type CoverageLabelAudience = 'manager' | 'teacher' | 'participant' | 'csv';

export type CoverageLabelInput = {
  status?: RegistrationStatus | string | null;
  is_waitlist?: boolean | null;
  coverage_status?: CoverageStatus | null;
  coverage_waived_reason?: WaivedReason | null;
  method?: PaymentMethod | ManualCheckoutMethod | null;
  pass_remaining?: number | null;
};

export type CoverageLabelOptions = {
  audience: CoverageLabelAudience;
  /** Kursbeginn; ohne Zeitbezug (oder audience csv) bleibt open = „offen“. */
  courseStartsAt?: Date | number | null;
  now?: Date | number;
};

/** Anzeige-Ton für open mit Zeitbezug (nie Farbe allein). */
export type CoverageLabelTone = 'neutral' | 'warn' | 'muted';

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
    return method ? `Bezahlt · ${methodWord(method)}` : 'Bezahlt';
  }
  // teacher (E5) und participant: Methode nur bei Online für Teilnehmende
  if (audience === 'participant' && method === 'card') {
    return 'online bezahlt';
  }
  return 'Bezahlt';
}

function waivedLabel(
  audience: CoverageLabelAudience,
  reason: WaivedReason | null | undefined,
): string {
  if (audience === 'participant') return 'erledigt';
  if (reason === 'pre_omlify') return 'vor Omlify erledigt';
  if (audience === 'csv') return 'erlassen';
  return 'Erlassen';
}

function openLabel(
  audience: CoverageLabelAudience,
  courseStartsAt: Date | number | null | undefined,
  now: Date | number,
): string {
  if (audience === 'csv' || courseStartsAt == null) {
    return audience === 'participant' ? 'offen · vor Ort bezahlen' : 'offen';
  }
  const startMs = typeof courseStartsAt === 'number' ? courseStartsAt : courseStartsAt.getTime();
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const begun = startMs <= nowMs;
  if (audience === 'participant') {
    return begun ? 'Offen · bitte vor Ort bezahlen' : 'Bezahlung vor Ort';
  }
  return begun ? 'Offen' : 'Zahlt vor Ort';
}

/**
 * Einheitliche Deckungstexte für Kasse, Teilnehmerliste, CSV und Meine Anmeldungen.
 * Warteliste und Stornierte: „—“ (Staff/CSV) bzw. leer für Teilnehmende (Status statt Bezahlung).
 * UX-6 T3/T9: open mit courseStartsAt zeitbezogen; CSV ohne Zeitbezug.
 */
export function coverageLabel(
  registration: CoverageLabelInput,
  options: CoverageLabelOptions,
): string {
  const { audience, courseStartsAt = null, now = new Date() } = options;
  if (isWaitlistOrCancelled(registration)) {
    return audience === 'participant' ? '' : '—';
  }

  if (registration.status === 'pending_payment') {
    return 'Zahlung läuft';
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
      return audience === 'csv' ? 'kostenlos' : 'Kostenlos';
    case 'open':
    default:
      return openLabel(audience, courseStartsAt, now);
  }
}

/** Ton für Staff-Anzeige von open; sonst muted/neutral. */
export function coverageLabelTone(
  registration: CoverageLabelInput,
  options: Pick<CoverageLabelOptions, 'courseStartsAt' | 'now'>,
): CoverageLabelTone {
  if (isWaitlistOrCancelled(registration)) return 'muted';
  if (registration.status === 'pending_payment') return 'warn';
  const coverage = registration.coverage_status ?? 'open';
  if (coverage !== 'open') return 'neutral';
  const { courseStartsAt = null, now = new Date() } = options;
  if (courseStartsAt == null) return 'neutral';
  const startMs = typeof courseStartsAt === 'number' ? courseStartsAt : courseStartsAt.getTime();
  const nowMs = typeof now === 'number' ? now : now.getTime();
  return startMs <= nowMs ? 'warn' : 'neutral';
}
