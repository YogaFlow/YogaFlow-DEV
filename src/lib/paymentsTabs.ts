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

export function countOpenCoveragePeople(rows: Array<{ user_id?: string | null }>): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.user_id) ids.add(row.user_id);
  }
  return ids.size;
}
