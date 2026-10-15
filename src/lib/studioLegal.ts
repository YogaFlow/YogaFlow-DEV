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
  findStudioLegalTemplateRelease,
  STUDIO_LEGAL_SUBPROCESSORS,
  STUDIO_LEGAL_TEMPLATE_VERSION,
  STUDIO_LEGAL_TEMPLATES,
  type StudioLegalTemplateKind,
} from '../generated/studioLegalTemplates';
import {
  loadStudioLegalProfile,
  saveStudioLegalProfile,
  type StudioLegalForm,
  type StudioLegalProfile,
} from './studioLegalProfile';
import { currentTenantSlug } from './tenantSlug';
import { asCivilIsoDate } from './courseDateTime';
import { listPassProducts } from './passProducts';
import { choiceFromSetting, loadTaxSettings } from './taxStatus';
import {
  computeTermsPillStatus,
  legalVersionTriggerLabel,
  pillLabel,
  pillLabelShort,
  statusCardLabel,
  type StudioLegalPillStatus,
  type StudioLegalVersionTrigger,
} from './studioLegalStatus';

export {
  computeTermsPillStatus,
  legalVersionTriggerLabel,
  pillLabel,
  pillLabelShort,
  statusCardLabel,
};
export type { StudioLegalPillStatus };

const DEFAULT_CANCELLATION_HOURS = 24;

export type StudioLegalKindStatus = {
  status: StudioLegalPillStatus;
  created_at: string | null;
  template_version: string | null;
  current_template_version?: string | null;
  accepted_version?: string | null;
  accepted_content_hash?: string | null;
};

export type StudioLegalVersionRow = {
  id: string;
  created_at: string;
  trigger: StudioLegalVersionTrigger;
  pdf_path: string | null;
  values: Record<string, unknown>;
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

/** Rendert eine Vorlagen-Version. Ohne opts = aktuelle (neueste) Vorlage. */
export function renderStudioLegalKind(
  kind: StudioLegalKind,
  values: StudioLegalValues,
  opts?: { version?: string | null; contentHash?: string | null },
): string {
  const body =
    opts?.version || opts?.contentHash
      ? findStudioLegalTemplateRelease(kind as StudioLegalTemplateKind, opts).body
      : STUDIO_LEGAL_TEMPLATES[kind];
  return renderStudioLegalTemplate(body, values);
}

/** Vorlage der zuletzt freigegebenen Version (L3) — für Resync/Anzeige, nicht für Freigabe-Preview. */
export function renderAcceptedStudioLegalKind(
  kind: StudioLegalKind,
  values: StudioLegalValues,
  status: StudioLegalKindStatus | null | undefined,
): string {
  return renderStudioLegalKind(kind, values, {
    version: status?.accepted_version,
    contentHash: status?.accepted_content_hash,
  });
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
        status === 'release' ||
        status === 'current' ||
        status === 'new_template' ||
        status === 'change_release' ||
        status === 'missing'
          ? status
          : 'missing',
      created_at: o.created_at == null ? null : String(o.created_at),
      template_version: o.template_version == null ? null : String(o.template_version),
      current_template_version:
        o.current_template_version == null ? null : String(o.current_template_version),
      accepted_version: o.accepted_version == null ? null : String(o.accepted_version),
      accepted_content_hash:
        o.accepted_content_hash == null ? null : String(o.accepted_content_hash),
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
  /** L3: bei Resync die freigegebene Vorlagen-Version, sonst aktuell. */
  templateVersion?: string | null;
}): Promise<{ ok: true; id: string; changed: boolean } | { ok: false; message: string }> {
  const contentHash = await hashNormalizedLegalText(input.bodyMd);
  const defaultVersion =
    input.kind === 'imprint'
      ? findStudioLegalTemplateRelease('imprint').version
      : STUDIO_LEGAL_TEMPLATE_VERSION;
  const { data, error } = await supabase.rpc('publish_studio_legal_document', {
    p_kind: input.kind,
    p_template_version: input.templateVersion || defaultVersion,
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

/** Kontext für Render/Publish aus aktuellen Studio-Einstellungen. */
export async function loadStudioLegalRenderContext(
  profile: StudioLegalProfile,
  tenant: { name?: string; cancellation_window_hours?: number },
): Promise<StudioLegalValues> {
  const [taxRows, products, setup] = await Promise.all([
    loadTaxSettings().catch(() => []),
    listPassProducts().catch(() => []),
    supabase.rpc('get_payment_setup_status').then((r) => r.data as Record<string, unknown> | null),
  ]);
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const current =
    taxRows
      .filter((row) => asCivilIsoDate(row.valid_from) <= todayIso)
      .sort((a, b) => asCivilIsoDate(b.valid_from).localeCompare(asCivilIsoDate(a.valid_from)))[0] ??
    null;
  const choice = current ? choiceFromSetting(current) : null;
  const active = products.filter((p) => p.archived_at == null);
  return buildStudioLegalValues({
    profile,
    studioName: tenant.name ?? profile.legal_name,
    studioSlug: currentTenantSlug(),
    cancellationHours:
      typeof tenant.cancellation_window_hours === 'number'
        ? tenant.cancellation_window_hours
        : DEFAULT_CANCELLATION_HOURS,
    taxSmallBusiness: choice === 'small_business',
    payOnline: setup?.online_payments_enabled === true,
    payOnsite: setup?.allow_onsite_payment !== false,
    passesAny: active.length > 0,
    passesOnline: active.some((p) => p.online_purchasable === true),
  });
}

/**
 * Nach Settings-Änderung: freigegebene Arten mit der zuletzt freigegebenen
 * Vorlagen-Version neu rendern (L3 — nicht die neueste unfreigegebene).
 */
export async function resyncStudioLegalDocuments(tenant: {
  name?: string;
  cancellation_window_hours?: number;
}): Promise<{ ok: true; published: StudioLegalKind[] } | { ok: false; message: string }> {
  try {
    const [status, profile] = await Promise.all([
      loadStudioLegalStatus(),
      loadStudioLegalProfile(),
    ]);
    if (!status || !profile.imprint_complete) {
      return { ok: true, published: [] };
    }
    const values = await loadStudioLegalRenderContext(profile, tenant);
    const kinds: StudioLegalKind[] = [];
    if (status.imprint.status === 'current' || status.imprint.status === 'new_template') {
      kinds.push('imprint');
    }
    // terms/privacy: nur wenn schon freigegeben (current | new_template | change_release)
    if (
      status.terms.status === 'current' ||
      status.terms.status === 'new_template' ||
      status.terms.status === 'change_release'
    ) {
      kinds.push('terms');
    }
    if (
      status.privacy.status === 'current' ||
      status.privacy.status === 'new_template' ||
      status.privacy.status === 'change_release'
    ) {
      kinds.push('privacy');
    }
    if (kinds.length === 0 && profile.imprint_complete) {
      kinds.push('imprint');
    }
    const published: StudioLegalKind[] = [];
    for (const kind of kinds) {
      const kindStatus =
        kind === 'terms' ? status.terms : kind === 'privacy' ? status.privacy : status.imprint;
      const bodyMd =
        kind === 'imprint'
          ? renderStudioLegalKind(kind, values)
          : renderAcceptedStudioLegalKind(kind, values, kindStatus);
      const templateVersion =
        kind === 'imprint'
          ? findStudioLegalTemplateRelease('imprint').version
          : kindStatus.accepted_version || STUDIO_LEGAL_TEMPLATE_VERSION;
      const res = await publishStudioLegalDocument({
        kind,
        bodyMd,
        values,
        trigger: 'settings_change',
        templateVersion,
      });
      if (res.ok) published.push(kind);
    }
    return { ok: true, published };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Rechtstexte konnten nicht aktualisiert werden.',
    };
  }
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

/** Fassungen einer Art (neueste zuerst) — nur Owner/Admin via RLS. */
export async function loadStudioLegalVersions(
  kind: StudioLegalKind,
): Promise<StudioLegalVersionRow[]> {
  const { data, error } = await supabase
    .from('studio_legal_documents')
    .select('id, created_at, trigger, pdf_path, values')
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => {
    const trigger = row.trigger;
    return {
      id: String(row.id),
      created_at: String(row.created_at),
      trigger:
        trigger === 'release' || trigger === 'settings_change' || trigger === 'profile_change'
          ? trigger
          : 'settings_change',
      pdf_path: row.pdf_path == null ? null : String(row.pdf_path),
      values:
        row.values && typeof row.values === 'object' && !Array.isArray(row.values)
          ? (row.values as Record<string, unknown>)
          : {},
    };
  });
}

/**
 * Weitere Regeln speichern und AGB-Fassung neu veröffentlichen (wenn schon freigegeben).
 * Löst change_release aus, bis erneut freigegeben wird.
 */
export async function saveExtraRulesAndResync(input: {
  profile: StudioLegalProfile;
  extraRules: string;
  tenant: { name?: string; cancellation_window_hours?: number };
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const withExtra = { ...input.profile, extra_rules: input.extraRules };
  const saved = await saveStudioLegalProfile(withExtra);
  if (!saved.ok) return { ok: false, message: saved.message };
  const status = await loadStudioLegalStatus();
  if (
    status &&
    (status.terms.status === 'current' ||
      status.terms.status === 'change_release' ||
      status.terms.status === 'new_template')
  ) {
    const values = await loadStudioLegalRenderContext(withExtra, input.tenant);
    const bodyMd = renderAcceptedStudioLegalKind('terms', values, status.terms);
    const pub = await publishStudioLegalDocument({
      kind: 'terms',
      bodyMd,
      values,
      trigger: 'profile_change',
      templateVersion: status.terms.accepted_version || STUDIO_LEGAL_TEMPLATE_VERSION,
    });
    if (!pub.ok) return { ok: false, message: pub.message };
  }
  return { ok: true };
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
