import { supabase } from './supabase';

export type SendStudioUpdateResult =
  | { ok: true; sent: number; skipped: number }
  | { ok: false; error: string };

/**
 * Owner/Admin: Glocken-Nachricht an Teilnehmende (RPC send_studio_update).
 * p_recipient_ids null = alle aktiven Teilnehmenden des Studios.
 */
export async function sendStudioUpdate(input: {
  recipientIds: string[] | null;
  title: string;
  body: string;
  updateId: string;
}): Promise<SendStudioUpdateResult> {
  const { data, error } = await supabase.rpc('send_studio_update', {
    p_recipient_ids: input.recipientIds,
    p_title: input.title,
    p_body: input.body,
    p_update_id: input.updateId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as {
    success?: boolean;
    sent?: number;
    skipped?: number;
    error?: string;
  } | null;

  if (!row?.success) {
    return { ok: false, error: row?.error ?? 'UNKNOWN' };
  }

  return {
    ok: true,
    sent: Number(row.sent ?? 0),
    skipped: Number(row.skipped ?? 0),
  };
}
