import { supabase } from './supabase';
import type { StudioUpdateSend } from './studioUpdates';

/**
 * Freigegebene update_ids. null = Ladefehler (nichts anzeigen).
 * Leeres Set = keine Freigaben.
 */
export async function fetchReleasedUpdateIds(): Promise<Set<string> | null> {
  const { data, error } = await supabase.rpc('list_released_updates');
  if (error) return null;
  if (!Array.isArray(data)) return null;
  return new Set(
    data.filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
}

/** Letzter Versand je update_id im eigenen Tenant. null = Ladefehler. */
export async function fetchStudioUpdateSends(): Promise<
  Record<string, StudioUpdateSend> | null
> {
  const { data, error } = await supabase.rpc('list_studio_update_sends');
  if (error) return null;
  if (!Array.isArray(data)) return null;
  const out: Record<string, StudioUpdateSend> = {};
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as {
      update_id?: unknown;
      last_sent_at?: unknown;
      recipient_count?: unknown;
    };
    if (typeof r.update_id !== 'string' || !r.update_id) continue;
    if (typeof r.last_sent_at !== 'string' || !r.last_sent_at) continue;
    const count = Number(r.recipient_count);
    out[r.update_id] = {
      updateId: r.update_id,
      lastSentAt: r.last_sent_at,
      recipientCount: Number.isFinite(count) ? count : 0,
    };
  }
  return out;
}
