import { supabase } from './supabase';
import { AVV_CONTENT_HASH, AVV_VERSION } from './legalVersions';

export type LegalAcceptanceStatus = {
  accepted: boolean;
  currentVersion: string;
  currentHash: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  acceptedVersion: string | null;
};

export async function loadAvvStatus(): Promise<LegalAcceptanceStatus | null> {
  const { data, error } = await supabase.rpc('get_legal_acceptance_status', {
    p_document: 'avv',
  });
  if (error || !data || data.success === false) return null;
  return {
    accepted: data.accepted === true,
    currentVersion: String(data.current_version ?? AVV_VERSION),
    currentHash: String(data.current_hash ?? AVV_CONTENT_HASH),
    acceptedAt: data.accepted_at ? String(data.accepted_at) : null,
    acceptedByName: data.accepted_by_name ? String(data.accepted_by_name) : null,
    acceptedVersion: data.accepted_version ? String(data.accepted_version) : null,
  };
}

export async function acceptAvv(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('accept_legal_document', {
    p_document: 'avv',
    p_version: AVV_VERSION,
    p_content_hash: AVV_CONTENT_HASH,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.success) return { ok: false, error: String(data?.error ?? 'ERROR') };
  return { ok: true };
}

export async function acceptOnboardingLegalBundle(): Promise<void> {
  await acceptAvv();
  // AGB/Datenschutz: Versionen folgen in Block 2; AVV ist Pflicht jetzt.
}
