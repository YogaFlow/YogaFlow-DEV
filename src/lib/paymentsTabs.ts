export type PaymentsTab = 'offen' | 'alle';

export function parsePaymentsTab(raw: string | null | undefined): PaymentsTab | null {
  if (raw === 'offen' || raw === 'alle') return raw;
  return null;
}

export function defaultPaymentsTab(openCount: number): PaymentsTab {
  return openCount > 0 ? 'offen' : 'alle';
}

/** URL-Tab, sonst Default aus der offenen Zahl. `payment` ohne Tab → Alle. */
export function resolvePaymentsTab(
  tabParam: string | null | undefined,
  paymentId: string | null | undefined,
  openCount: number,
): PaymentsTab {
  const parsed = parsePaymentsTab(tabParam);
  if (parsed) return parsed;
  if (paymentId) return 'alle';
  return defaultPaymentsTab(openCount);
}

/** Badge-Text: 1–9, danach 9+. null wenn nichts offen. */
export function openPaymentsBadge(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

/** F2: Offene Zahlung = eine Anmeldung (Zeile aus get_open_coverage), nicht Person. */
export function countOpenCoverageRows(rows: unknown[] | null | undefined): number {
  return Array.isArray(rows) ? rows.length : 0;
}

/** @deprecated F2 — Badge zählt Anmeldungen, nicht Personen. */
export function countOpenCoveragePeople(rows: Array<{ user_id?: string | null }>): number {
  return countOpenCoverageRows(rows);
}
