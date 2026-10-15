import { supabase } from './supabase';

export type ReceiptKind = 'receipt' | 'refund_receipt';

export type ReceiptSnapshot = {
  legal_name?: string;
  street?: string;
  house_number?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  contact_email?: string;
  phone?: string | null;
  tax_text?: string;
  regime?: string;
  service_text?: string;
  course_title?: string;
  course_date?: string;
  course_time?: string;
  original_number?: string;
  refund_reason?: string | null;
  amount_cents?: number;
};

export type ReceiptRecord = {
  id: string;
  number: string;
  kind: ReceiptKind;
  payment_id: string;
  refund_id: string | null;
  original_receipt_id: string | null;
  issued_at: string;
  amount_cents: number;
  snapshot: ReceiptSnapshot;
};

function parseReceipt(row: Record<string, unknown>): ReceiptRecord | null {
  if (row.success === false) return null;
  if (typeof row.id !== 'string' || typeof row.number !== 'string') return null;
  const kind = row.kind === 'refund_receipt' ? 'refund_receipt' : 'receipt';
  return {
    id: row.id,
    number: row.number,
    kind,
    payment_id: String(row.payment_id ?? ''),
    refund_id: row.refund_id == null ? null : String(row.refund_id),
    original_receipt_id: row.original_receipt_id == null ? null : String(row.original_receipt_id),
    issued_at: String(row.issued_at ?? ''),
    amount_cents: Number(row.amount_cents ?? 0),
    snapshot: (row.snapshot ?? {}) as ReceiptSnapshot,
  };
}

export async function loadReceipt(id: string): Promise<ReceiptRecord | null> {
  const { data, error } = await supabase.rpc('get_receipt', { p_id: id });
  if (error || !data || typeof data !== 'object') return null;
  return parseReceipt(data as Record<string, unknown>);
}

export async function loadReceiptByPayment(paymentId: string): Promise<ReceiptRecord | null> {
  const { data, error } = await supabase.rpc('get_receipt_by_payment', {
    p_payment_id: paymentId,
  });
  if (error || !data || typeof data !== 'object') return null;
  return parseReceipt(data as Record<string, unknown>);
}

export async function saleReceiptsByPayment(
  paymentIds: string[],
): Promise<Record<string, { id: string; number: string }>> {
  const rows = await listReceiptsForPayments(paymentIds);
  const out: Record<string, { id: string; number: string }> = {};
  for (const row of rows) {
    if (row.kind !== 'receipt' || out[row.payment_id]) continue;
    out[row.payment_id] = { id: row.id, number: row.number };
  }
  return out;
}

export async function listReceiptsForPayments(
  paymentIds: string[],
): Promise<ReceiptRecord[]> {
  const ids = paymentIds.filter(Boolean);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('receipts')
    .select('id, number, kind, payment_id, refund_id, original_receipt_id, issued_at, amount_cents, snapshot')
    .in('payment_id', ids);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => parseReceipt({ ...row, success: true }))
    .filter((row): row is ReceiptRecord => row != null);
}
