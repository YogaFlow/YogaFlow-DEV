import type { RegistrationRefundState } from './refundTexts';
import { supabase } from './supabase';

type RpcBody<T> = ({ success: true } & T) | { success: false; error?: string; remaining_cents?: number };

function body<T>(data: unknown): RpcBody<T> | null {
  if (data == null) return null;
  return (typeof data === 'string' ? JSON.parse(data) : data) as RpcBody<T>;
}

/** Online-Zahlung und Erstattungsstand je Buchung; fremde IDs fehlen still. */
export async function fetchRegistrationRefundStates(
  registrationIds: string[],
): Promise<Record<string, RegistrationRefundState>> {
  const ids = [...new Set(registrationIds)].slice(0, 200);
  if (ids.length === 0) return {};
  const { data, error } = await supabase.rpc('get_registration_refund_states', {
    p_registration_ids: ids,
  });
  const parsed = body<{ items: RegistrationRefundState[] }>(data);
  if (error || !parsed?.success) return {};
  return Object.fromEntries(parsed.items.map((item) => [item.registration_id, item]));
}

export type PaymentRefundRow = {
  id: string;
  amount_cents: number;
  reason: string;
  note: string | null;
  status: 'pending' | 'succeeded' | 'failed';
  created_at: string;
};

export type PaymentRefundDetail = {
  payment_id: string;
  amount_cents: number;
  refundable_cents: number;
  dispute_open: boolean;
  state: string | null;
  refunds: PaymentRefundRow[];
};

export async function fetchPaymentRefunds(paymentId: string): Promise<PaymentRefundDetail | null> {
  const { data, error } = await supabase.rpc('get_payment_refunds', { p_payment_id: paymentId });
  const parsed = body<PaymentRefundDetail>(data);
  if (error || !parsed?.success) return null;
  return parsed;
}

export type RequestRefundResult =
  | { ok: true; amountCents: number; remainingCents: number }
  | { ok: false; code: string; remainingCents?: number };

export async function requestPaymentRefund(
  paymentId: string,
  amountCents: number,
  note: string,
): Promise<RequestRefundResult> {
  const { data, error } = await supabase.rpc('request_payment_refund', {
    p_payment_id: paymentId,
    p_amount_cents: amountCents,
    p_note: note.trim(),
  });
  const parsed = body<{ code?: string; amount_cents?: number; remaining_cents?: number }>(data);
  if (error || !parsed) return { ok: false, code: 'UNKNOWN' };
  if (!parsed.success) {
    return { ok: false, code: parsed.error ?? 'UNKNOWN', remainingCents: parsed.remaining_cents };
  }
  if (parsed.code === 'NOTHING_TO_REFUND') return { ok: false, code: 'NOTHING_TO_REFUND' };
  return {
    ok: true,
    amountCents: parsed.amount_cents ?? amountCents,
    remainingCents: parsed.remaining_cents ?? 0,
  };
}

export type CourseRefundPreview = { course_id: string; paid_count: number; refund_cents: number };

/** Nur Owner/Admin; null bei Fehler oder fehlenden Rechten. */
export async function previewCourseCancelRefunds(
  courseIds: string[],
): Promise<Record<string, CourseRefundPreview> | null> {
  if (courseIds.length === 0) return {};
  const { data, error } = await supabase.rpc('preview_course_cancel_refunds', {
    p_course_ids: courseIds.slice(0, 200),
  });
  const parsed = body<{ courses: CourseRefundPreview[] }>(data);
  if (error || !parsed?.success) return null;
  return Object.fromEntries(parsed.courses.map((row) => [row.course_id, row]));
}

export async function previewMemberRemovalRefunds(
  memberId: string,
): Promise<{ paidCount: number; refundCents: number } | null> {
  const { data, error } = await supabase.rpc('preview_member_removal_refunds', {
    p_member_id: memberId,
  });
  const parsed = body<{ paid_count: number; refund_cents: number }>(data);
  if (error || !parsed?.success) return null;
  return { paidCount: parsed.paid_count, refundCents: parsed.refund_cents };
}
