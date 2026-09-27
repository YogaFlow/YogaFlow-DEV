import type { Pass, PassValidityRule, PaymentMethod } from '../types';
import { formatCents, formatDate, formatDateTime } from './format';
import { methodWord, type ManualCheckoutMethod } from './courseCheckout';
import { formatUnitsLabel } from './passProducts';
import { supabase } from './supabase';

const GENERIC_ERROR = 'Das hat nicht geklappt. Bitte versuche es noch einmal.';

export type SellablePassProduct = {
  id: string;
  name: string;
  units: number;
  price_cents: number;
  validity_rule: PassValidityRule;
  validity_value: number;
};

export type MemberPassSummary = {
  pass_id: string;
  name: string;
  remaining: number;
  units_total: number;
  valid_until: string;
};

export type SellPassResult =
  | { ok: true; pass_id: string; payment_id: string; valid_until: string }
  | { ok: false; code: string; message: string };

export type RevokePassResult =
  | { ok: true; pass_id: string; payment_id: string; amount_cents: number }
  | { ok: false; code: string; message: string };

export type ManagedPass = Pass & {
  remaining: number;
  method: PaymentMethod | null;
};

/** 31.12.2029 — Kaufende / Gültigkeit auf Karten. */
export function formatPassUntil(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${Number(m[3])}.${m[2]}.${m[1]}`;
}

export function formatSellableProductLabel(product: SellablePassProduct): string {
  return `${product.name} · ${formatUnitsLabel(product.units)} · ${formatCents(product.price_cents)}`;
}

export function passBadgeLabel(passes: MemberPassSummary[]): string | null {
  if (passes.length === 0) return null;
  const sorted = [...passes].sort((a, b) => {
    if (a.valid_until !== b.valid_until) return a.valid_until < b.valid_until ? -1 : 1;
    return a.name.localeCompare(b.name, 'de');
  });
  const first = sorted[0];
  const base = `Karte · noch ${first.remaining}`;
  if (sorted.length === 1) return base;
  const extra = sorted.length - 1;
  return `${base} · +${extra} weitere`;
}

export function sellPassErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'FORBIDDEN':
      return 'Das darfst du nicht.';
    case 'NOT_FOUND':
      return 'Nicht gefunden. Bitte neu laden.';
    case 'MEMBER_REMOVED':
      return 'Diese Person wurde entfernt.';
    case 'PRODUCT_ARCHIVED':
      return 'Diese Karte wird nicht mehr verkauft.';
    case 'INVALID_METHOD':
      return GENERIC_ERROR;
    default:
      return GENERIC_ERROR;
  }
}

export function revokePassErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'ALREADY_USED':
      return 'Die Karte wurde schon benutzt und kann nicht storniert werden.';
    case 'NOT_ACTIVE':
      return 'Die Karte ist nicht mehr aktiv.';
    case 'FORBIDDEN':
      return 'Stornieren kann nur die Studioleitung.';
    case 'NOT_FOUND':
      return 'Nicht gefunden. Bitte neu laden.';
    default:
      return GENERIC_ERROR;
  }
}

export function sellUndoText(
  productName: string,
  personName: string,
  method: ManualCheckoutMethod,
  validUntil: string,
): string {
  return `${productName} an ${personName} verkauft (${methodWord(method)}) · gültig bis ${formatPassUntil(validUntil)}`;
}

export async function fetchSellablePassProducts(): Promise<SellablePassProduct[]> {
  const { data, error } = await supabase.rpc('get_sellable_pass_products');
  if (error) {
    console.error(error);
    return [];
  }
  const body = data as { success?: boolean; products?: SellablePassProduct[]; error?: string } | null;
  if (!body?.success || !Array.isArray(body.products)) return [];
  return body.products;
}

export async function fetchMemberPasses(memberId: string): Promise<MemberPassSummary[]> {
  const { data, error } = await supabase.rpc('get_member_passes', { p_member_id: memberId });
  if (error) {
    console.error(error);
    return [];
  }
  const body = data as { success?: boolean; passes?: MemberPassSummary[] } | null;
  if (!body?.success || !Array.isArray(body.passes)) return [];
  return body.passes;
}

export async function fetchMemberPassesForMany(
  memberIds: string[],
): Promise<Record<string, MemberPassSummary[]>> {
  const unique = [...new Set(memberIds.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (id) => [id, await fetchMemberPasses(id)] as const),
  );
  return Object.fromEntries(entries);
}

export async function sellPass(
  memberId: string,
  productId: string,
  method: ManualCheckoutMethod,
): Promise<SellPassResult> {
  const { data, error } = await supabase.rpc('sell_pass', {
    p_member_id: memberId,
    p_product_id: productId,
    p_method: method,
  });
  if (error) {
    console.error(error);
    return { ok: false, code: 'TRANSPORT', message: GENERIC_ERROR };
  }
  const body = data as {
    success?: boolean;
    error?: string;
    pass_id?: string;
    payment_id?: string;
    valid_until?: string;
  } | null;
  if (!body?.success || !body.pass_id || !body.payment_id || !body.valid_until) {
    const code = body?.error ?? 'UNKNOWN';
    return { ok: false, code, message: sellPassErrorMessage(code) };
  }
  return {
    ok: true,
    pass_id: body.pass_id,
    payment_id: body.payment_id,
    valid_until: body.valid_until,
  };
}

export async function revokePass(
  passId: string,
  note?: string | null,
): Promise<RevokePassResult> {
  const { data, error } = await supabase.rpc('revoke_pass', {
    p_pass_id: passId,
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) {
    console.error(error);
    return { ok: false, code: 'TRANSPORT', message: GENERIC_ERROR };
  }
  const body = data as {
    success?: boolean;
    error?: string;
    pass_id?: string;
    payment_id?: string;
    amount_cents?: number;
  } | null;
  if (!body?.success || !body.pass_id || !body.payment_id) {
    const code = body?.error ?? 'UNKNOWN';
    return { ok: false, code, message: revokePassErrorMessage(code) };
  }
  return {
    ok: true,
    pass_id: body.pass_id,
    payment_id: body.payment_id,
    amount_cents: body.amount_cents ?? 0,
  };
}

/** Owner/Admin: Karten einer Person inkl. Rest, Preis und Zahlart. */
export async function fetchManagedPasses(memberId: string): Promise<{
  active: ManagedPass[];
  inactive: ManagedPass[];
}> {
  const { data: rows, error } = await supabase
    .from('passes')
    .select(
      `
      id,
      tenant_id,
      member_id,
      product_id,
      name,
      units_total,
      price_cents,
      validity_rule,
      validity_value,
      valid_from,
      valid_until,
      payment_id,
      status,
      revoked_at,
      created_at,
      payment:payments!passes_payment_id_fkey(method, amount_cents)
    `,
    )
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    throw error;
  }

  const passIds = (rows ?? []).map((row) => row.id as string);
  const remainingByPass = new Map<string, number>();
  if (passIds.length > 0) {
    const { data: moves, error: moveErr } = await supabase
      .from('pass_movements')
      .select('pass_id, delta')
      .in('pass_id', passIds);
    if (moveErr) {
      console.error(moveErr);
      throw moveErr;
    }
    for (const move of moves ?? []) {
      const id = move.pass_id as string;
      remainingByPass.set(id, (remainingByPass.get(id) ?? 0) + (move.delta as number));
    }
  }

  const mapped: ManagedPass[] = (rows ?? []).map((row) => {
    const payment = Array.isArray(row.payment) ? row.payment[0] : row.payment;
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      member_id: row.member_id,
      product_id: row.product_id,
      name: row.name,
      units_total: row.units_total,
      price_cents: row.price_cents,
      validity_rule: row.validity_rule,
      validity_value: row.validity_value,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      payment_id: row.payment_id,
      status: row.status,
      revoked_at: row.revoked_at,
      created_at: row.created_at,
      remaining: remainingByPass.get(row.id) ?? 0,
      method: (payment?.method as PaymentMethod | undefined) ?? null,
    };
  });

  const berlinToday = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const active: ManagedPass[] = [];
  const inactive: ManagedPass[] = [];
  for (const pass of mapped) {
    if (pass.status === 'active' && pass.valid_until >= berlinToday) {
      active.push(pass);
    } else {
      inactive.push(pass);
    }
  }
  return { active, inactive };
}

export function passPurchaseLabel(pass: ManagedPass): string {
  const price = formatCents(pass.price_cents);
  const method = methodWord(pass.method);
  return `${price} (${method})`;
}

export function passInactiveLabel(pass: ManagedPass): string {
  if (pass.status === 'revoked' && pass.revoked_at) {
    return `storniert am ${formatDateTime(pass.revoked_at)}`;
  }
  if (pass.status === 'expired' || pass.valid_until < new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())) {
    return `abgelaufen am ${formatPassUntil(pass.valid_until)}`;
  }
  return pass.status;
}

export function passActiveDetail(pass: ManagedPass): string {
  return `noch ${pass.remaining} von ${pass.units_total} · gültig bis ${formatPassUntil(pass.valid_until)} · gekauft ${formatDate(pass.valid_from)} · ${passPurchaseLabel(pass)}`;
}
