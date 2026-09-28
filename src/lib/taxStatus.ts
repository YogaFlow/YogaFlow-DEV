import {
  asCivilIsoDate,
  berlinIsoDate,
  berlinIsoFromInstant,
  clampCivilIsoDate,
} from './courseDateTime';
import { formatNumericDate, shiftIsoDate } from './format';
import { supabase } from './supabase';

export type TaxRegime = 'small_business' | 'regular';

export type TaxChoice = 'small_business' | 'regular_19' | 'regular_7';

export type TaxSettingRow = {
  id: string;
  regime: TaxRegime;
  vat_rate_bp: number;
  valid_from: string;
};

export const TAX_CHOICES: { value: TaxChoice; title: string; detail: string }[] = [
  {
    value: 'small_business',
    title: 'Kleinunternehmer (§ 19 UStG)',
    detail: 'Du weist keine Umsatzsteuer aus.',
  },
  {
    value: 'regular_19',
    title: 'Regelbesteuert, 19 %',
    detail: 'Du weist 19 % Umsatzsteuer aus.',
  },
  {
    value: 'regular_7',
    title: 'Regelbesteuert, 7 %',
    detail: 'Du weist 7 % Umsatzsteuer aus.',
  },
];

export const TAX_DIALOG_NOTE =
  'Bist du unsicher, frag deine Steuerberatung. Eine Änderung gilt nur ab dem gewählten Datum, frühere Buchungen bleiben unverändert.';

export function choiceFromSetting(row: TaxSettingRow | null): TaxChoice {
  if (!row || row.regime === 'small_business') return 'small_business';
  return row.vat_rate_bp === 700 ? 'regular_7' : 'regular_19';
}

export function choicePayload(choice: TaxChoice): { regime: TaxRegime; vat_rate_bp: number } {
  if (choice === 'small_business') return { regime: 'small_business', vat_rate_bp: 0 };
  if (choice === 'regular_7') return { regime: 'regular', vat_rate_bp: 700 };
  return { regime: 'regular', vat_rate_bp: 1900 };
}

export function choiceShortLabel(choice: TaxChoice): string {
  if (choice === 'small_business') return 'Kleinunternehmer';
  if (choice === 'regular_7') return 'Regelbesteuert, 7 %';
  return 'Regelbesteuert, 19 %';
}

function rateWord(vatRateBp: number): string {
  return vatRateBp === 700 ? '7 %' : '19 %';
}

function rowValidFrom(row: TaxSettingRow): string {
  return asCivilIsoDate(row.valid_from);
}

export function taxStatusSentence(row: TaxSettingRow): string {
  const since = formatNumericDate(rowValidFrom(row));
  if (row.regime === 'small_business') {
    return `Kleinunternehmer (keine Umsatzsteuer) seit ${since}`;
  }
  return `Regelbesteuert, ${rateWord(row.vat_rate_bp)} seit ${since}`;
}

export function taxHistoryLine(row: TaxSettingRow): string {
  const from = formatNumericDate(rowValidFrom(row));
  if (row.regime === 'small_business') {
    return `ab ${from}: Kleinunternehmer (keine Umsatzsteuer)`;
  }
  return `ab ${from}: Regelbesteuert, ${rateWord(row.vat_rate_bp)}`;
}

export type TaxDateSuggestion = {
  date: string;
  hint: string;
  maxDate: string | null;
  minDate: string | null;
};

export async function loadTaxSettings(): Promise<TaxSettingRow[]> {
  const { data, error } = await supabase
    .from('tenant_tax_settings')
    .select('id, regime, vat_rate_bp, valid_from')
    .order('valid_from', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as TaxSettingRow[]).map((row) => ({
    ...row,
    valid_from: asCivilIsoDate(row.valid_from),
  }));
}

/** True when the studio has at least one payment row. Errors count as none. */
export async function studioHasPayment(): Promise<boolean> {
  const { data, error } = await supabase.from('payments').select('id').limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

export async function loadTaxDateSuggestion(hasSetting: boolean): Promise<TaxDateSuggestion> {
  const today = berlinIsoDate(0);
  if (!hasSetting) {
    const { data, error } = await supabase
      .from('payments')
      .select('received_at')
      .is('reverses_payment_id', null)
      .order('received_at', { ascending: true })
      .limit(1);
    if (error || !data?.[0]?.received_at) {
      return { date: today, hint: '', maxDate: null, minDate: null };
    }
    const earliest = berlinIsoFromInstant(data[0].received_at);
    if (!earliest) return { date: today, hint: '', maxDate: null, minDate: null };
    return {
      date: earliest,
      hint: `Deine erste Zahlung war am ${formatNumericDate(earliest)}, der Status muss spätestens ab dann gelten.`,
      maxDate: earliest,
      minDate: null,
    };
  }

  const { data, error } = await supabase
    .from('ledger_entries')
    .select('booking_date')
    .order('booking_date', { ascending: false })
    .limit(1);
  const lastRaw = data?.[0]?.booking_date;
  if (error || !lastRaw) {
    return { date: today, hint: '', maxDate: null, minDate: null };
  }
  const last = asCivilIsoDate(String(lastRaw));
  if (!last) return { date: today, hint: '', maxDate: null, minDate: null };
  const next = shiftIsoDate(last, 1);
  const date = clampCivilIsoDate(next || today, next || null, null);
  return {
    date,
    hint: `Bis zum ${formatNumericDate(last)} ist schon verbucht. Wähle ein späteres Datum.`,
    maxDate: null,
    minDate: next || null,
  };
}

export function taxSettingErrorMessage(
  code: string | undefined,
  earliest?: string | null,
  last?: string | null,
): string {
  switch (code) {
    case 'BEFORE_FIRST_PAYMENT':
      return `Deine erste Zahlung war am ${formatNumericDate(asCivilIsoDate(earliest))}, der Status muss spätestens ab dann gelten.`;
    case 'ALREADY_BOOKED':
      return `Bis zum ${formatNumericDate(asCivilIsoDate(last))} ist schon verbucht. Wähle ein späteres Datum.`;
    case 'DUPLICATE_DATE':
      return 'Für dieses Datum gibt es schon eine Angabe.';
    case 'FORBIDDEN':
      return 'Nur die Inhaberin kann den Steuerstatus ändern.';
    case 'INVALID_TAX_SETTING':
      return 'Diese Angabe ist so nicht möglich.';
    default:
      return 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
  }
}

type SetBody = {
  success?: boolean;
  error?: string;
  earliest_booking_date?: string;
  last_booking_date?: string;
};

export type SetTaxResult =
  | { ok: true }
  | { ok: false; code: string; message: string; suggestDate: string | null };

export async function setTaxSetting(choice: TaxChoice, validFrom: string): Promise<SetTaxResult> {
  const civilFrom = asCivilIsoDate(validFrom);
  if (!civilFrom) {
    return {
      ok: false,
      code: 'INVALID_TAX_SETTING',
      message: taxSettingErrorMessage('INVALID_TAX_SETTING'),
      suggestDate: null,
    };
  }
  const payload = choicePayload(choice);
  const { data, error } = await supabase.rpc('set_tax_setting', {
    p_regime: payload.regime,
    p_vat_rate_bp: payload.vat_rate_bp,
    p_valid_from: civilFrom,
  });
  if (error) {
    return {
      ok: false,
      code: 'TRANSPORT',
      message: taxSettingErrorMessage(undefined),
      suggestDate: null,
    };
  }
  const body = (typeof data === 'string' ? JSON.parse(data) : data) as SetBody | null;
  if (!body?.success) {
    const code = body?.error ?? 'INVALID_TAX_SETTING';
    const earliest = asCivilIsoDate(body?.earliest_booking_date);
    const last = asCivilIsoDate(body?.last_booking_date);
    let suggestDate: string | null = null;
    if (code === 'BEFORE_FIRST_PAYMENT' && earliest) suggestDate = earliest;
    if (code === 'ALREADY_BOOKED' && last) suggestDate = shiftIsoDate(last, 1) || null;
    return {
      ok: false,
      code,
      message: taxSettingErrorMessage(code, earliest, last),
      suggestDate,
    };
  }
  return { ok: true };
}
