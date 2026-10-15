/** Liest public.booking_payment_options — Methodenliste + Default (ZW-1). */
import { supabase } from './supabase';

export type BookingPayMethod = 'pass' | 'online' | 'onsite';

export type BookingPayMethodOption = {
  method: BookingPayMethod;
  pass_id?: string;
  label?: string;
  remaining?: number;
  unavailable_reason?: string | null;
};

export type BookingPaymentOptions = {
  methods: BookingPayMethodOption[];
  defaultMethod: BookingPayMethod;
  onlineRequired: boolean;
  onlineReady: boolean;
  onlineUnavailableReason: string | null;
  /** N1: einmaliger Hinweis für Gewohnheits-Vor-Ort-Zahler */
  showOnlinePayHint: boolean;
};

function asMethod(raw: unknown): BookingPayMethod | null {
  if (raw === 'pass' || raw === 'online' || raw === 'onsite') return raw;
  return null;
}

export async function fetchBookingPaymentOptions(
  courseId: string,
): Promise<BookingPaymentOptions> {
  const fallback: BookingPaymentOptions = {
    methods: [{ method: 'onsite' }],
    defaultMethod: 'onsite',
    onlineRequired: false,
    onlineReady: false,
    onlineUnavailableReason: null,
    showOnlinePayHint: false,
  };

  const { data, error } = await supabase.rpc('booking_payment_options', {
    p_course_id: courseId,
  });
  if (error) {
    console.error('booking_payment_options', error);
    return fallback;
  }

  const row = data as {
    methods?: unknown;
    default?: unknown;
    online_required?: unknown;
    online_ready?: unknown;
    online_unavailable_reason?: unknown;
    reason?: unknown;
    show_online_pay_hint?: unknown;
  } | null;

  const methods: BookingPayMethodOption[] = [];
  if (Array.isArray(row?.methods)) {
    for (const item of row.methods) {
      if (!item || typeof item !== 'object') continue;
      const m = item as Record<string, unknown>;
      const method = asMethod(m.method);
      if (!method) continue;
      methods.push({
        method,
        pass_id: typeof m.pass_id === 'string' ? m.pass_id : undefined,
        label: typeof m.label === 'string' ? m.label : undefined,
        remaining: typeof m.remaining === 'number' ? m.remaining : undefined,
      });
    }
  }

  if (methods.length === 0) return fallback;

  const defaultMethod = asMethod(row?.default) ?? methods[0].method;
  const reason =
    typeof row?.online_unavailable_reason === 'string'
      ? row.online_unavailable_reason
      : typeof row?.reason === 'string'
        ? row.reason
        : null;

  return {
    methods,
    defaultMethod: methods.some((m) => m.method === defaultMethod)
      ? defaultMethod
      : methods[0].method,
    onlineRequired: row?.online_required === true,
    onlineReady: row?.online_ready === true,
    onlineUnavailableReason: reason,
    showOnlinePayHint: row?.show_online_pay_hint === true,
  };
}
