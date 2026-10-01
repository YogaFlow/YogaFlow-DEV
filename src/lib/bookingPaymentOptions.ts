/** Liest public.booking_payment_options() — nur { online_required }. */
import { supabase } from './supabase';

export async function fetchBookingPaymentOptions(): Promise<{
  onlineRequired: boolean;
}> {
  const { data, error } = await supabase.rpc('booking_payment_options');
  if (error) {
    console.error('booking_payment_options', error);
    return { onlineRequired: false };
  }
  const row = data as { online_required?: unknown } | null;
  return { onlineRequired: row?.online_required === true };
}
