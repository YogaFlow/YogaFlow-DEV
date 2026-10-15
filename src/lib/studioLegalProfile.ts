import { supabase } from './supabase';

export type StudioLegalForm = 'sole_trader' | 'gbr' | 'ug' | 'gmbh' | 'ev' | 'other';

export type StudioLegalProfile = {
  present: boolean;
  legal_name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  contact_email: string;
  phone: string;
  tax_id: string;
  legal_form: StudioLegalForm | '';
  representatives: string;
  register_court: string;
  register_number: string;
  vat_id: string;
  economic_id: string;
  extra_rules: string;
  imprint_complete?: boolean;
};

export type StudioProviderInfo = {
  present: boolean;
  legal_name: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  contact_email: string;
  phone: string | null;
  regime: 'regular' | 'small_business' | null;
  vat_rate_bp: number | null;
};

const EMPTY_PROFILE: StudioLegalProfile = {
  present: false,
  legal_name: '',
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
  country: 'DE',
  contact_email: '',
  phone: '',
  tax_id: '',
  legal_form: '',
  representatives: '',
  register_court: '',
  register_number: '',
  vat_id: '',
  economic_id: '',
  extra_rules: '',
  imprint_complete: false,
};

export function emptyLegalProfile(): StudioLegalProfile {
  return { ...EMPTY_PROFILE };
}

function asForm(raw: unknown): StudioLegalForm | '' {
  if (
    raw === 'sole_trader' ||
    raw === 'gbr' ||
    raw === 'ug' ||
    raw === 'gmbh' ||
    raw === 'ev' ||
    raw === 'other'
  ) {
    return raw;
  }
  return '';
}

export async function loadStudioLegalProfile(): Promise<StudioLegalProfile> {
  const { data, error } = await supabase.rpc('get_studio_legal_profile');
  if (error || !data || typeof data !== 'object') {
    throw new Error('Die Anbieterangaben konnten nicht geladen werden.');
  }
  const row = data as Record<string, unknown>;
  if (row.success === false) {
    throw new Error('Die Anbieterangaben konnten nicht geladen werden.');
  }
  if (row.present !== true) return emptyLegalProfile();
  return {
    present: true,
    legal_name: String(row.legal_name ?? ''),
    street: String(row.street ?? ''),
    house_number: String(row.house_number ?? ''),
    postal_code: String(row.postal_code ?? ''),
    city: String(row.city ?? ''),
    country: String(row.country ?? 'DE'),
    contact_email: String(row.contact_email ?? ''),
    phone: String(row.phone ?? ''),
    tax_id: String(row.tax_id ?? ''),
    legal_form: asForm(row.legal_form),
    representatives: String(row.representatives ?? ''),
    register_court: String(row.register_court ?? ''),
    register_number: String(row.register_number ?? ''),
    vat_id: String(row.vat_id ?? ''),
    economic_id: String(row.economic_id ?? ''),
    extra_rules: String(row.extra_rules ?? ''),
    imprint_complete: row.imprint_complete === true,
  };
}

export async function saveStudioLegalProfile(input: Omit<StudioLegalProfile, 'present' | 'imprint_complete'>): Promise<
  { ok: true; imprint_complete: boolean } | { ok: false; field?: string; message: string }
> {
  const { data, error } = await supabase.rpc('upsert_studio_legal_profile', {
    p_legal_name: input.legal_name,
    p_street: input.street,
    p_house_number: input.house_number,
    p_postal_code: input.postal_code,
    p_city: input.city,
    p_country: input.country || 'DE',
    p_contact_email: input.contact_email,
    p_phone: input.phone || null,
    p_tax_id: input.tax_id || null,
    p_legal_form: input.legal_form || null,
    p_representatives: input.representatives || null,
    p_register_court: input.register_court || null,
    p_register_number: input.register_number || null,
    p_vat_id: input.vat_id || null,
    p_economic_id: input.economic_id || null,
    p_extra_rules: input.extra_rules || null,
  });
  if (error) {
    return { ok: false, message: 'Speichern fehlgeschlagen. Bitte versuche es noch einmal.' };
  }
  const row = (data ?? {}) as {
    success?: boolean;
    error?: string;
    field?: string;
    imprint_complete?: boolean;
  };
  if (row.success === false) {
    if (row.error === 'FORBIDDEN') {
      return { ok: false, message: 'Nur die Inhaberin kann die Anbieterangaben ändern.' };
    }
    return {
      ok: false,
      field: row.field,
      message: validationMessage(row.field),
    };
  }
  return { ok: true, imprint_complete: row.imprint_complete === true };
}

export async function loadStudioProviderInfo(): Promise<StudioProviderInfo | null> {
  const { data, error } = await supabase.rpc('get_studio_provider_info');
  if (error || !data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (row.success === false) return null;
  if (row.present !== true) {
    return {
      present: false,
      legal_name: '',
      street: '',
      house_number: '',
      postal_code: '',
      city: '',
      country: 'DE',
      contact_email: '',
      phone: null,
      regime: null,
      vat_rate_bp: null,
    };
  }
  const regime = row.regime === 'regular' || row.regime === 'small_business' ? row.regime : null;
  return {
    present: true,
    legal_name: String(row.legal_name ?? ''),
    street: String(row.street ?? ''),
    house_number: String(row.house_number ?? ''),
    postal_code: String(row.postal_code ?? ''),
    city: String(row.city ?? ''),
    country: String(row.country ?? 'DE'),
    contact_email: String(row.contact_email ?? ''),
    phone: row.phone == null ? null : String(row.phone),
    regime,
    vat_rate_bp: typeof row.vat_rate_bp === 'number' ? row.vat_rate_bp : null,
  };
}

function validationMessage(field: string | undefined): string {
  switch (field) {
    case 'legal_name':
      return 'Bitte gib den Anbieternamen an.';
    case 'street':
      return 'Bitte gib die Straße an.';
    case 'house_number':
      return 'Bitte gib die Hausnummer an.';
    case 'postal_code':
      return 'Bitte gib eine gültige PLZ an (in DE fünf Ziffern).';
    case 'city':
      return 'Bitte gib den Ort an.';
    case 'contact_email':
      return 'Bitte gib eine gültige Kontakt-E-Mail an.';
    case 'legal_form':
      return 'Bitte wähle die Rechtsform.';
    case 'representatives':
      return 'Bitte gib die vertretungsberechtigte Person an.';
    case 'register_court':
      return 'Bitte gib das Registergericht an.';
    case 'register_number':
      return 'Bitte gib die Registernummer an.';
    case 'extra_rules':
      return 'Weitere Regeln: höchstens 1.500 Zeichen.';
    default:
      return 'Bitte prüfe die Angaben.';
  }
}
