/** UX-5: Erscheinungsbild der Zahlart-Zeile / Buchungsleiste (unit-testbar). */

export type BookingPayMethodFieldKind = 'pass' | 'online' | 'onsite';

export type BookingPayMethodFieldAppearance = {
  kind: BookingPayMethodFieldKind;
  /** Rahmen + Chevron nur bei mehreren Wegen. */
  bordered: boolean;
  showChevron: boolean;
  showNeuBadge: boolean;
  /** Hinweistext unter dem Feld. */
  showNeuHint: boolean;
  heightPx: 48;
};

/**
 * Vier Zustände für Snapshots: drei Zahlarten (mehrere Wege) + nur ein Weg.
 */
export function bookingPayMethodFieldAppearance(opts: {
  method: BookingPayMethodFieldKind;
  canChange: boolean;
  showOnlineHint?: boolean;
}): BookingPayMethodFieldAppearance {
  const showNeu = Boolean(opts.showOnlineHint && opts.method === 'online');
  return {
    kind: opts.method,
    bordered: opts.canChange,
    showChevron: opts.canChange,
    showNeuBadge: showNeu,
    showNeuHint: showNeu,
    heightPx: 48,
  };
}

/** Reihenfolge der Buchungsleiste mobil / Karte (Preis+Frist → Zahlart → Knopf). */
export const BOOKING_BAR_STACK_ORDER = ['priceDeadline', 'payMethod', 'primary'] as const;

export type BookingBarStackSlot = (typeof BOOKING_BAR_STACK_ORDER)[number];
