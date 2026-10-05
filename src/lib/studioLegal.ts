/**
 * RT-1 — Client für Studio-Rechtstexte (Status, Freigabe, öffentliche Seiten).
 */
import { supabase } from './supabase';
import {
  formatCancellationHoursLabel,
  formatSubprocessorsList,
  renderStudioLegalTemplate,
  type StudioLegalKind,
  type StudioLegalValues,
} from './studioLegalRender';
import {
  STUDIO_LEGAL_SUBPROCESSORS,
  STUDIO_LEGAL_TEMPLATE_VERSION,
  STUDIO_LEGAL_TEMPLATES,
} from '../generated/studioLegalTemplates';
import type { StudioLegalForm, StudioLegalProfile } from './studioLegalProfile';
import { currentTenantSlug } from './tenantSlug';

export type StudioLegalPillStatus = 'missing' | 'release' | 'current' | 'new_template';

export type StudioLegalKindStatus = {
  status: StudioLegalPillStatus;
  created_at: string | null;
  template_version: string | null;
  current_template_version?: string | null;
  accepted_version?: string | null;
};

export type StudioLegalStatus = {
  imprint_complete: boolean;
  texts_ready: boolean;
  imprint: StudioLegalKindStatus;
  terms: StudioLegalKindStatus;
  privacy: StudioLegalKindStatus;
};

export type PublicStudioLegal = {
  kind: StudioLegalKind;
  studio_name: string;
  body_md: string | null;
  created_at: string | null;
  present?: boolean;
  minimal?: boolean;
  contact_email?: string;
  id?: string;
};

export const LEGAL_FORM_OPTIONS: { value: StudioLegalForm; label: string }[] = [
  { value: 'sole_trader', label: 'Einzelunternehmen' },
  { value: 'gbr', label: 'GbR' },
  { value: 'ug', label: 'UG' },
  { value: 'gmbh', label: 'GmbH' },
  { value: 'ev', label: 'e. V.' },
  { value: 'other', label: 'Sonstige' },
];

export function legalFormLabel(form: StudioLegalForm | ''): string {
  return LEGAL_FORM_OPTIONS.find((o) => o.value === form)?.label ?? '';
}

export function pillLabel(status: StudioLegalPillStatus, createdAt: string | null): string {
  switch (status) {
    case 'missing':
      return 'Fehlt';
    case 'release':
      return 'Freigeben';
    case 'new_template':
      return 'Neue Vorlage verfügbar';
    case 'current': {
      if (!createdAt) return 'Aktuell';
      const d = new Date(createdAt);
      if (Number.isNaN(d.getTime())) return 'Aktuell';
      const label = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(d);
      return `Aktuell · Fassung vom ${label}`;
    }
    default:
      return 'Fehlt';
  }
}

function normalizeLegalText(text: string): string {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '')
    .concat('\n');
}

export async function hashNormalizedLegalText(text: string): Promise<string> {
  const data = new TextEncoder().encode(normalizeLegalText(text));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildStudioLegalValues(input: {
  profile: StudioLegalProfile;
  studioName: string;
  studioSlug?: string | null;
  cancellationHours: number;
  taxSmallBusiness: boolean;
  payOnline: boolean;
  payOnsite: boolean;
  passesAny: boolean;
  passesOnline: boolean;
  standDate?: string;
}): StudioLegalValues {
  const slug = input.studioSlug ?? currentTenantSlug() ?? '';
  const studioUrl = slug ? `https://${slug}.omlify.de` : '';
  const stand =
    input.standDate ??
    new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());

  return {
    studio_name: input.studioName.trim() || input.profile.legal_name,
    legal_name: input.profile.legal_name,
    legal_form_label: legalFormLabel(input.profile.legal_form),
    representatives: input.profile.representatives,
    street: input.profile.street,
    house_number: input.profile.house_number,
    postal_code: input.profile.postal_code,
    city: input.profile.city,
    country: input.profile.country === 'DE' ? 'Deutschland' : input.profile.country,
    contact_email: input.profile.contact_email,
    phone: input.profile.phone,
    register_court: input.profile.register_court,
    register_number: input.profile.register_number,
    vat_id: input.profile.vat_id,
    economic_id: input.profile.economic_id,
    studio_url: studioUrl,
    cancellation_hours: formatCancellationHoursLabel(input.cancellationHours),
    tax_small_business: input.taxSmallBusiness,
    pay_online: input.payOnline,
    pay_onsite: input.payOnsite,
    passes_any: input.passesAny,
    passes_online: input.passesOnline,
    extra_rules: input.profile.extra_rules,
    stand_date: stand,
    subprocessors_list: formatSubprocessorsList(
      [...STUDIO_LEGAL_SUBPROCESSORS.items],
      STUDIO_LEGAL_SUBPROCESSORS.guarantee,
    ),
  };
}

export function renderStudioLegalKind(
  kind: StudioLegalKind,
  values: StudioLegalValues,
): string {
  return renderStudioLegalTemplate(STUDIO_LEGAL_TEMPLATES[kind], values);
}

export async function loadStudioLegalStatus(): Promise<StudioLegalStatus | null> {
  const { data, error } = await supabase.rpc('get_studio_legal_status');
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (row.success === false) return null;
  const asKind = (raw: unknown): StudioLegalKindStatus => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const status = o.status;
    return {
      status:
        status === 'release' || status === 'current' || status === 'new_template' || status === 'missing'
          ? status
          : 'missing',
      created_at: o.created_at == null ? null : String(o.created_at),
      template_version: o.template_version == null ? null : String(o.template_version),
      current_template_version:
        o.current_template_version == null ? null : String(o.current_template_version),
      accepted_version: o.accepted_version == null ? null : String(o.accepted_version),
    };
  };
  return {
    imprint_complete: row.imprint_complete === true,
    texts_ready: row.texts_ready === true,
    imprint: asKind(row.imprint),
    terms: asKind(row.terms),
    privacy: asKind(row.privacy),
  };
}

export async function publishStudioLegalDocument(input: {
  kind: StudioLegalKind;
  bodyMd: string;
  values: StudioLegalValues;
  trigger: 'release' | 'settings_change' | 'profile_change';
}): Promise<{ ok: true; id: string; changed: boolean } | { ok: false; message: string }> {
  const contentHash = await hashNormalizedLegalText(input.bodyMd);
  const { data, error } = await supabase.rpc('publish_studio_legal_document', {
    p_kind: input.kind,
    p_template_version: STUDIO_LEGAL_TEMPLATE_VERSION,
    p_body_md: input.bodyMd,
    p_values: input.values,
    p_content_hash: contentHash,
    p_trigger: input.trigger,
  });
  if (error) return { ok: false, message: 'Veröffentlichen fehlgeschlagen.' };
  const row = (data ?? {}) as { success?: boolean; error?: string; id?: string; changed?: boolean };
  if (row.success === false) {
    return { ok: false, message: publishErrorMessage(row.error) };
  }
  return { ok: true, id: String(row.id ?? ''), changed: row.changed === true };
}

export async function releaseStudioLegal(input: {
  kind: 'terms' | 'privacy';
  bodyMd: string;
  values: StudioLegalValues;
}): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const contentHash = await hashNormalizedLegalText(input.bodyMd);
  const { data, error } = await supabase.rpc('release_studio_legal', {
    p_kind: input.kind,
    p_template_version: STUDIO_LEGAL_TEMPLATE_VERSION,
    p_body_md: input.bodyMd,
    p_values: input.values,
    p_content_hash: contentHash,
  });
  if (error) return { ok: false, message: 'Freigabe fehlgeschlagen.' };
  const row = (data ?? {}) as {
    success?: boolean;
    error?: string;
    document_id?: string;
  };
  if (row.success === false) {
    return { ok: false, message: releaseErrorMessage(row.error) };
  }
  return { ok: true, id: String(row.document_id ?? '') };
}

export async function loadPublicStudioLegal(
  kind: StudioLegalKind,
): Promise<PublicStudioLegal | null> {
  const { data, error } = await supabase.rpc('get_public_studio_legal', { p_kind: kind });
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (row.success === false) return null;
  return {
    kind,
    studio_name: String(row.studio_name ?? ''),
    body_md: row.body_md == null ? null : String(row.body_md),
    created_at: row.created_at == null ? null : String(row.created_at),
    present: row.present === true,
    minimal: row.minimal === true,
    contact_email: row.contact_email == null ? undefined : String(row.contact_email),
    id: row.id == null ? undefined : String(row.id),
  };
}

function publishErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'HASH_MISMATCH':
      return 'Der Text konnte nicht geprüft werden. Bitte lade die Seite neu.';
    case 'FORBIDDEN':
      return 'Nur Inhaberin oder Admin können Rechtstexte veröffentlichen.';
    default:
      return 'Veröffentlichen fehlgeschlagen.';
  }
}

function releaseErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'IMPRINT_INCOMPLETE':
      return 'Bitte vervollständige zuerst das Impressum.';
    case 'VERSION_MISMATCH':
      return 'Die Vorlage hat sich geändert. Bitte lade die Seite neu.';
    case 'FORBIDDEN':
      return 'Nur Inhaberin oder Admin können freigeben.';
    default:
      return publishErrorMessage(code);
  }
}

/** Einfache Markdown→HTML-Anzeige (kein HTML aus Freitext). */
export function studioLegalMarkdownToHtml(md: string): string {
  const escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const lines = escaped.split('\n');
  const out: string[] = [];
  let inList = false;
  const flushList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  for (const line of lines) {
    if (line.startsWith('# ')) {
      flushList();
      out.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      flushList();
      out.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      flushList();
      out.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith('- ')) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  flushList();
  return out.join('\n');
}

function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
