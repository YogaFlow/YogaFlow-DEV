import type { Tenant } from '../types';
import { supabase } from './supabase';
import { validatePassHintTemplate } from './passHint';

type RpcResult = {
  success?: boolean;
  message?: string;
  tenant?: Partial<Tenant>;
};

type SaveOk = { ok: true; patch: Partial<Tenant> };
type SaveFail = { ok: false; message: string };
export type SavePassHintSettingsResult = SaveOk | SaveFail;

/**
 * Speichert Kartenhinweis. Unveränderte Felder weglassen / null.
 * Leere Vorlage → null (Vorbelegung).
 */
export async function savePassHintSettings(opts: {
  enabled?: boolean | null;
  template?: string | null;
}): Promise<SavePassHintSettingsResult> {
  if (opts.template !== undefined && opts.template !== null) {
    const check = validatePassHintTemplate(opts.template);
    if (!check.ok) return { ok: false, message: check.message };
  }

  const { data, error } = await supabase.rpc('update_pass_hint_settings', {
    p_enabled: opts.enabled ?? null,
    p_template: opts.template === undefined ? null : opts.template,
  });

  if (error) {
    console.error(error);
    return { ok: false, message: 'Speichern fehlgeschlagen. Bitte versuche es erneut.' };
  }

  const result = (data ?? {}) as RpcResult;
  if (result.success === false) {
    return {
      ok: false,
      message: result.message ?? 'Speichern fehlgeschlagen. Bitte versuche es erneut.',
    };
  }

  return { ok: true, patch: result.tenant ?? {} };
}
