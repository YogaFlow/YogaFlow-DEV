import { supabase } from './supabase';
import {
  AVV_CONTENT_HASH,
  AVV_VERSION,
  PRIVACY_CONTENT_HASH,
  PRIVACY_VERSION,
  TERMS_CONTENT_HASH,
  TERMS_VERSION,
} from './legalVersions';

export type LegalDocKey = 'avv' | 'terms' | 'privacy';

export type LegalAcceptanceStatus = {
  accepted: boolean;
  currentVersion: string;
  currentHash: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  acceptedVersion: string | null;
};

const DOC_META: Record<
  LegalDocKey,
  { version: string; hash: string }
> = {
  avv: { version: AVV_VERSION, hash: AVV_CONTENT_HASH },
  terms: { version: TERMS_VERSION, hash: TERMS_CONTENT_HASH },
  privacy: { version: PRIVACY_VERSION, hash: PRIVACY_CONTENT_HASH },
};

export async function loadLegalStatus(
  document: LegalDocKey,
): Promise<LegalAcceptanceStatus | null> {
  const meta = DOC_META[document];
  const { data, error } = await supabase.rpc('get_legal_acceptance_status', {
    p_document: document,
  });
  if (error || !data || data.success === false) return null;
  const currentHash = String(data.current_hash ?? '');
  const hashMatches = currentHash === meta.hash && data.accepted === true;
  return {
    accepted: hashMatches,
    currentVersion: String(data.current_version ?? meta.version),
    currentHash: currentHash || meta.hash,
    acceptedAt: hashMatches && data.accepted_at ? String(data.accepted_at) : null,
    acceptedByName:
      hashMatches && data.accepted_by_name ? String(data.accepted_by_name) : null,
    acceptedVersion:
      hashMatches && data.accepted_version ? String(data.accepted_version) : null,
  };
}

export async function loadAvvStatus(): Promise<LegalAcceptanceStatus | null> {
  return loadLegalStatus('avv');
}

export async function loadTermsStatus(): Promise<LegalAcceptanceStatus | null> {
  return loadLegalStatus('terms');
}

export async function acceptLegalDocument(
  document: LegalDocKey,
): Promise<{ ok: boolean; error?: string }> {
  const meta = DOC_META[document];
  const { data, error } = await supabase.rpc('accept_legal_document', {
    p_document: document,
    p_version: meta.version,
    p_content_hash: meta.hash,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.success) return { ok: false, error: String(data?.error ?? 'ERROR') };
  return { ok: true };
}

export async function acceptAvv(): Promise<{ ok: boolean; error?: string }> {
  return acceptLegalDocument('avv');
}

export async function acceptTerms(): Promise<{ ok: boolean; error?: string }> {
  return acceptLegalDocument('terms');
}

export async function acceptPrivacy(): Promise<{ ok: boolean; error?: string }> {
  return acceptLegalDocument('privacy');
}

/** Onboarding: AGB + Datenschutz + AVV (nach Login via Banner/Pending-Flag). */
export async function acceptOnboardingLegalBundle(): Promise<{
  ok: boolean;
  error?: string;
}> {
  for (const doc of ['terms', 'privacy', 'avv'] as const) {
    const res = await acceptLegalDocument(doc);
    if (!res.ok) return res;
  }
  return { ok: true };
}
