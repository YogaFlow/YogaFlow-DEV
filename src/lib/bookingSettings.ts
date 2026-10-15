import type { Tenant } from '../types';
import { supabase } from './supabase';
import { resyncStudioLegalDocuments } from './studioLegal';

export const BOOKING_MAX_PARTICIPANTS_MIN = 1;
export const BOOKING_MAX_PARTICIPANTS_MAX = 50;
export const BOOKING_CANCELLATION_WINDOW_MIN = 0;
export const BOOKING_CANCELLATION_WINDOW_MAX = 72;
export const BOOKING_CANCELLATION_WINDOW_DEFAULT = 24;

type BookingRpcResult = {
  success?: boolean;
  message?: string;
  tenant?: Partial<Tenant>;
};

type SaveOk = { ok: true; patch: Partial<Tenant> };
type SaveFail = { ok: false; message: string };
export type SaveBookingSettingsResult = SaveOk | SaveFail;

/**
 * Speichert Buchungseinstellungen. Unveränderte Felder als null übergeben
 * (RPC: NULL = nicht ändern).
 */
export async function saveBookingSettings(opts: {
  defaultMaxParticipants?: number | null;
  cancellationWindowHours?: number | null;
}): Promise<SaveBookingSettingsResult> {
  const { data, error } = await supabase.rpc('update_booking_settings', {
    p_default_max_participants: opts.defaultMaxParticipants ?? null,
    p_cancellation_window_hours: opts.cancellationWindowHours ?? null,
  });

  if (error) {
    console.error(error);
    return { ok: false, message: 'Speichern fehlgeschlagen. Bitte versuche es erneut.' };
  }

  const result = (data ?? {}) as BookingRpcResult;
  if (result.success === false) {
    return { ok: false, message: result.message ?? 'Speichern fehlgeschlagen. Bitte versuche es erneut.' };
  }

  const patch = result.tenant ?? {};
  if (opts.cancellationWindowHours != null) {
    void resyncStudioLegalDocuments({
      name: typeof patch.name === 'string' ? patch.name : undefined,
      cancellation_window_hours:
        typeof patch.cancellation_window_hours === 'number'
          ? patch.cancellation_window_hours
          : opts.cancellationWindowHours,
    });
  }

  return { ok: true, patch };
}
