import type { Tenant } from '../types';
import { supabase } from './supabase';

export const STUDIO_BRANDING_BUCKET = 'studio-branding';
export const LOGO_MAX_BYTES = 1_048_576;
export const LOGO_EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
} as const;

export const STUDIO_NAME_MIN = 2;
export const STUDIO_NAME_MAX = 60;
export const TAGLINE_MAX = 140;

export type StudioBrandingInput = {
  tenantId: string;
  name: string;
  brandColor: string | null;
  tagline: string;
  logoInSidebar: boolean;
  logoOnAuth: boolean;
  sidebarShowName: boolean;
  newLogoFile: File | null;
  removeLogo: boolean;
};

type SaveOk = { ok: true; patch: Partial<Tenant> };
type SaveFail = { ok: false; message: string; patch?: Partial<Tenant> };
export type SaveStudioBrandingResult = SaveOk | SaveFail;

type BrandingRpcResult = {
  success?: boolean;
  message?: string;
  tenant?: Partial<Tenant>;
  previous_logo_path?: string | null;
};

function isKnownLogoMime(type: string): type is keyof typeof LOGO_EXT_BY_MIME {
  return type in LOGO_EXT_BY_MIME;
}

export function validateLogoFile(file: File): string | null {
  if (!isKnownLogoMime(file.type)) {
    return 'Bitte wähle eine PNG-, JPG- oder WebP-Datei.';
  }
  if (file.size > LOGO_MAX_BYTES) {
    return 'Das Logo darf höchstens 1 MB groß sein.';
  }
  return null;
}

export function getStudioLogoUrl(logoPath: string | null | undefined): string | null {
  if (!logoPath) return null;
  const { data } = supabase.storage.from(STUDIO_BRANDING_BUCKET).getPublicUrl(logoPath);
  return data.publicUrl || null;
}

async function removeLogoObject(path: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.storage.from(STUDIO_BRANDING_BUCKET).remove([path]);
  return { error: error ? new Error(error.message) : null };
}

export async function saveStudioBranding(input: StudioBrandingInput): Promise<SaveStudioBrandingResult> {
  const { data, error } = await supabase.rpc('update_studio_branding', {
    p_name: input.name,
    p_brand_color: input.brandColor,
    p_tagline: input.tagline,
    p_logo_in_sidebar: input.logoInSidebar,
    p_logo_on_auth: input.logoOnAuth,
    p_sidebar_show_name: input.sidebarShowName,
  });

  if (error) {
    console.error(error);
    return { ok: false, message: 'Speichern fehlgeschlagen. Bitte versuche es erneut.' };
  }

  const branding = (data ?? {}) as BrandingRpcResult;
  if (branding.success === false) {
    return { ok: false, message: branding.message ?? 'Speichern fehlgeschlagen. Bitte versuche es erneut.' };
  }

  let patch: Partial<Tenant> = branding.tenant ?? {};

  if (input.newLogoFile) {
    const validationMessage = validateLogoFile(input.newLogoFile);
    if (validationMessage) {
      return {
        ok: false,
        patch,
        message: `Name und Design sind gespeichert, das Logo nicht: ${validationMessage}`,
      };
    }

    const ext = LOGO_EXT_BY_MIME[input.newLogoFile.type as keyof typeof LOGO_EXT_BY_MIME];
    const path = `${input.tenantId}/logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(STUDIO_BRANDING_BUCKET)
      .upload(path, input.newLogoFile, {
        contentType: input.newLogoFile.type,
        upsert: false,
        cacheControl: '31536000',
      });

    if (uploadError) {
      console.error(uploadError);
      return {
        ok: false,
        patch,
        message: 'Name und Design sind gespeichert, das Logo nicht: Hochladen fehlgeschlagen.',
      };
    }

    const { data: logoData, error: logoError } = await supabase.rpc('set_studio_logo', {
      p_logo_path: path,
    });
    const logoResult = (logoData ?? {}) as BrandingRpcResult;

    if (logoError || logoResult.success === false) {
      if (logoError) console.error(logoError);
      const { error: cleanupError } = await removeLogoObject(path);
      if (cleanupError) console.warn(cleanupError);
      return {
        ok: false,
        patch,
        message:
          'Name und Design sind gespeichert, das Logo nicht: ' +
          (logoResult.message ?? 'Speichern fehlgeschlagen.'),
      };
    }

    patch = { ...patch, ...logoResult.tenant };
    const previous = logoResult.previous_logo_path;
    if (previous && previous !== path) {
      const { error: previousError } = await removeLogoObject(previous);
      if (previousError) console.warn(previousError);
    }

    return { ok: true, patch };
  }

  if (input.removeLogo) {
    const { data: logoData, error: logoError } = await supabase.rpc('set_studio_logo', {
      p_logo_path: null,
    });
    const logoResult = (logoData ?? {}) as BrandingRpcResult;

    if (logoError || logoResult.success === false) {
      if (logoError) console.error(logoError);
      return {
        ok: false,
        patch,
        message:
          'Name und Design sind gespeichert, das Logo nicht: ' +
          (logoResult.message ?? 'Speichern fehlgeschlagen.'),
      };
    }

    patch = { ...patch, ...logoResult.tenant };
    const previous = logoResult.previous_logo_path;
    if (previous) {
      const { error: previousError } = await removeLogoObject(previous);
      if (previousError) console.warn(previousError);
    }
  }

  return { ok: true, patch };
}
