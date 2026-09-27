import type { PassProduct, PassValidityRule } from '../types';
import { formatCents } from './format';
import { supabase } from './supabase';

export const PASS_UNITS_MIN = 1;
export const PASS_UNITS_MAX = 100;
export const PASS_YEARS_MIN = 1;
export const PASS_YEARS_MAX = 3;
export const PASS_MONTHS_MIN = 1;
export const PASS_MONTHS_MAX = 60;
export const PASS_NAME_MIN = 2;
export const PASS_NAME_MAX = 80;

const GENERIC_ERROR = 'Das hat nicht geklappt. Bitte versuche es erneut.';

type RpcResult = {
  success?: boolean;
  error?: string;
  id?: string;
  unchanged?: boolean;
};

export type PassProductFields = {
  name: string;
  units: number;
  price_cents: number;
  validity_rule: PassValidityRule;
  validity_value: number;
};

export type PassProductMutationResult =
  | { ok: true; id: string; unchanged?: boolean }
  | { ok: false; code: string; message: string };

function berlinYear(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric',
    }).format(now),
  );
}

/** Euro text with comma or dot → integer cents. Invalid → null. */
export function parseEuroToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, '').replace(/\u00A0/g, '');
  if (!trimmed) return null;
  const normalized = trimmed.replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const euros = Number(normalized);
  if (!Number.isFinite(euros)) return null;
  return Math.round(euros * 100);
}

export function centsPerUnit(priceCents: number, units: number): number | null {
  if (!Number.isFinite(priceCents) || !Number.isFinite(units) || units < 1) return null;
  return Math.round(priceCents / units);
}

export function formatPerUnitLabel(priceCents: number, units: number): string {
  const per = centsPerUnit(priceCents, units);
  if (per == null) return '';
  return `= ${formatCents(per)} pro Termin`;
}

export function formatUnitsLabel(units: number): string {
  return units === 1 ? '1 Termin' : `${units} Termine`;
}

/**
 * Klartext für Produktliste und Verkauf (A5).
 * years_to_year_end n → gültig bis 31.12. des n-ten Jahres nach dem Kaufjahr.
 * months n → n Monate ab Kauf.
 */
export function formatPassValidity(
  rule: PassValidityRule,
  value: number,
  now = new Date(),
): string {
  if (rule === 'years_to_year_end') {
    const years = Number.isFinite(value) ? value : 0;
    const untilYear = berlinYear(now) + years;
    const yearsWord = years === 1 ? '1 Jahr' : `${years} Jahre`;
    return `bis Jahresende + ${yearsWord} (Kauf heute → gültig bis 31.12.${untilYear})`;
  }
  if (rule === 'months') {
    return value === 1 ? '1 Monat ab Kauf' : `${value} Monate ab Kauf`;
  }
  return '';
}

export function passProductErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'INVALID_NAME':
      return 'Der Name muss 2 bis 80 Zeichen haben.';
    case 'INVALID_UNITS':
      return 'Wähle 1 bis 100 Termine.';
    case 'INVALID_PRICE':
      return 'Gib einen Preis über 0 € ein.';
    case 'INVALID_VALIDITY':
      return 'Diese Gültigkeit ist nicht möglich.';
    case 'DUPLICATE_NAME':
      return 'Es gibt schon eine Karte mit diesem Namen.';
    case 'ARCHIVED':
      return 'Diese Karte ist archiviert. Hole sie zuerst zurück.';
    case 'FORBIDDEN':
    case 'NOT_FOUND':
      return GENERIC_ERROR;
    default:
      return GENERIC_ERROR;
  }
}

function mapRpcResult(data: unknown, transportError: Error | null): PassProductMutationResult {
  if (transportError) {
    console.error(transportError);
    return { ok: false, code: 'TRANSPORT', message: GENERIC_ERROR };
  }
  const result = (data ?? {}) as RpcResult;
  if (result.success === false) {
    const code = result.error ?? 'UNKNOWN';
    return { ok: false, code, message: passProductErrorMessage(code) };
  }
  if (!result.id) {
    return { ok: false, code: 'UNKNOWN', message: GENERIC_ERROR };
  }
  return { ok: true, id: result.id, unchanged: result.unchanged === true };
}

export async function listPassProducts(): Promise<PassProduct[]> {
  const { data, error } = await supabase
    .from('pass_products')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error(error);
    throw error;
  }
  return (data ?? []) as PassProduct[];
}

export async function countActivePassProducts(): Promise<number> {
  const { count, error } = await supabase
    .from('pass_products')
    .select('id', { count: 'exact', head: true })
    .is('archived_at', null);

  if (error) {
    console.error(error);
    return 0;
  }
  return count ?? 0;
}

export async function createPassProduct(
  fields: PassProductFields,
): Promise<PassProductMutationResult> {
  const { data, error } = await supabase.rpc('create_pass_product', {
    p_name: fields.name,
    p_units: fields.units,
    p_price_cents: fields.price_cents,
    p_validity_rule: fields.validity_rule,
    p_validity_value: fields.validity_value,
  });
  return mapRpcResult(data, error);
}

export async function updatePassProduct(
  id: string,
  fields: PassProductFields,
): Promise<PassProductMutationResult> {
  const { data, error } = await supabase.rpc('update_pass_product', {
    p_id: id,
    p_name: fields.name,
    p_units: fields.units,
    p_price_cents: fields.price_cents,
    p_validity_rule: fields.validity_rule,
    p_validity_value: fields.validity_value,
  });
  return mapRpcResult(data, error);
}

export async function setPassProductArchived(
  id: string,
  archived: boolean,
): Promise<PassProductMutationResult> {
  const { data, error } = await supabase.rpc('set_pass_product_archived', {
    p_id: id,
    p_archived: archived,
  });
  return mapRpcResult(data, error);
}
