import type {
  Pass,
  PassMovement,
  PassMovementKind,
  PassValidityRule,
  PaymentMethod,
} from '../types';
import { formatCents, formatDate, formatDateTime, formatTime } from './format';
import { methodWord, type ManualCheckoutMethod } from './courseCheckout';
import { formatUnitsLabel } from './passProducts';
import {
  mergePassHistory,
  type PassHistoryChange,
  type PassHistoryEntry,
} from './passHistory';
import { resolveStaffNames } from './staffNames';
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

/** Anzeige: hat die Person eine passende Karte? Nur UI — Server entscheidet. */
export type CoursePassContext = {
  date: string;
  price?: number | null;
  pass_eligible?: boolean | null;
};

export function findUsablePass(
  passes: MemberPassSummary[],
  course: CoursePassContext,
): MemberPassSummary | null {
  if (course.pass_eligible === false) return null;
  if (course.price != null && Number(course.price) <= 0) return null;
  const courseDate = course.date;
  if (!courseDate) return null;
  const candidates = passes.filter(
    (pass) => pass.remaining >= 1 && pass.valid_until >= courseDate,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (a.valid_until !== b.valid_until) return a.valid_until < b.valid_until ? -1 : 1;
    return a.pass_id.localeCompare(b.pass_id);
  });
  return candidates[0];
}

export function usablePassChoiceLabel(pass: MemberPassSummary): string {
  const after = Math.max(0, pass.remaining - 1);
  return `${pass.name}, noch ${pass.remaining} → danach ${after}`;
}

export type ApplyPassClientResult =
  | { ok: true; pass_id: string; remaining: number; movement_id: string }
  | { ok: false; code: string; message: string };

export type UndoPassClientResult =
  | { ok: true; coverage: 'open' }
  | { ok: false; code: string; message: string };

export function passRedeemErrorMessage(
  code: string | null | undefined,
  opts?: { personName?: string },
): string {
  const name = opts?.personName?.trim();
  switch (code) {
    case 'NO_VALID_PASS':
      return name
        ? `${name} hat keine gültige Karte für diesen Kurs.`
        : 'Du hast keine gültige Karte für diesen Kurs.';
    case 'NOT_OPEN':
      return 'Schon erledigt.';
    case 'WAITLIST_NO_PAYMENT':
      return 'Der Kurs ist voll. Zahlung vermerken geht erst, wenn die Person nachrückt.';
    case 'FORBIDDEN':
      return 'Dafür hast du keine Berechtigung.';
    case 'PASS_EMPTY':
    case 'PASS_EXPIRED':
    case 'NOT_PASS_ELIGIBLE':
      return 'Die Karte ist aufgebraucht bzw. gilt an diesem Tag nicht mehr.';
    case 'NOT_FOUND':
      return 'Nicht gefunden. Bitte neu laden.';
    default:
      return GENERIC_ERROR;
  }
}

export async function applyPassToRegistration(
  registrationId: string,
  opts?: { personName?: string },
): Promise<ApplyPassClientResult> {
  const { data, error } = await supabase.rpc('apply_pass_to_registration', {
    p_registration_id: registrationId,
  });
  if (error) {
    console.error(error);
    return { ok: false, code: 'TRANSPORT', message: GENERIC_ERROR };
  }
  const body = data as {
    success?: boolean;
    error?: string;
    pass_id?: string;
    remaining?: number;
    movement_id?: string;
  } | null;
  if (!body?.success || !body.pass_id || body.remaining == null || !body.movement_id) {
    const code = body?.error ?? 'UNKNOWN';
    return { ok: false, code, message: passRedeemErrorMessage(code, opts) };
  }
  return {
    ok: true,
    pass_id: body.pass_id,
    remaining: body.remaining,
    movement_id: body.movement_id,
  };
}

export async function undoPassRedemption(
  registrationId: string,
  opts?: { personName?: string },
): Promise<UndoPassClientResult> {
  const { data, error } = await supabase.rpc('undo_pass_redemption', {
    p_registration_id: registrationId,
  });
  if (error) {
    console.error(error);
    return { ok: false, code: 'TRANSPORT', message: GENERIC_ERROR };
  }
  const body = data as { success?: boolean; error?: string; coverage?: string } | null;
  if (!body?.success) {
    const code = body?.error ?? 'UNKNOWN';
    return { ok: false, code, message: passRedeemErrorMessage(code, opts) };
  }
  return { ok: true, coverage: 'open' };
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

/** Aktive Karten aller Angemeldeten eines Kurses (eine RPC, S7). */
export async function fetchCourseMemberPasses(
  courseId: string,
): Promise<Record<string, MemberPassSummary[]>> {
  const { data, error } = await supabase.rpc('get_course_member_passes', {
    p_course_id: courseId,
  });
  if (error) {
    console.error(error);
    return {};
  }
  const rows = (data ?? []) as Array<{
    user_id: string;
    pass_id: string;
    name: string;
    remaining: number;
    units_total: number;
    valid_until: string;
  }>;
  const map: Record<string, MemberPassSummary[]> = {};
  for (const row of rows) {
    const list = map[row.user_id] ?? [];
    list.push({
      pass_id: row.pass_id,
      name: row.name,
      remaining: row.remaining,
      units_total: row.units_total,
      valid_until: String(row.valid_until).slice(0, 10),
    });
    map[row.user_id] = list;
  }
  return map;
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

/** Berlin-Kalender heute als YYYY-MM-DD. */
export function berlinTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Läuft in ≤ 14 Kalendertagen ab (Europe/Berlin). */
export function passExpiresWithinDays(validUntil: string, days = 14): boolean {
  const today = berlinTodayIso();
  if (validUntil < today) return false;
  const [y, m, d] = today.split('-').map(Number);
  const limit = new Date(y, m - 1, d + days);
  const limitIso = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, '0')}-${String(limit.getDate()).padStart(2, '0')}`;
  return validUntil <= limitIso;
}

export type PassMovementCourse = {
  title: string;
  date: string;
  time: string;
};

export type PassMovementView = PassMovement & {
  course: PassMovementCourse | null;
};

/** Ein Select auf pass_movements, Kurse über registrations in einem zweiten Select. */
export async function fetchPassMovementsForPasses(
  passIds: string[],
): Promise<Record<string, PassMovementView[]>> {
  const unique = [...new Set(passIds.filter(Boolean))];
  const empty: Record<string, PassMovementView[]> = {};
  if (unique.length === 0) return empty;

  const { data: moves, error } = await supabase
    .from('pass_movements')
    .select('id, tenant_id, pass_id, delta, kind, registration_id, reason, actor_member_id, event_id, created_at')
    .in('pass_id', unique)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    throw error;
  }

  const regIds = [
    ...new Set(
      (moves ?? [])
        .map((m) => m.registration_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const courseByReg = new Map<string, PassMovementCourse>();
  if (regIds.length > 0) {
    const { data: regs, error: regErr } = await supabase
      .from('registrations')
      .select(
        `
        id,
        course:courses!registrations_course_id_fkey(title, date, time)
      `,
      )
      .in('id', regIds);
    if (regErr) {
      console.error(regErr);
      throw regErr;
    }
    for (const row of regs ?? []) {
      const courseRaw = row.course;
      const course = Array.isArray(courseRaw) ? courseRaw[0] : courseRaw;
      if (course?.title && course.date) {
        courseByReg.set(row.id as string, {
          title: course.title as string,
          date: course.date as string,
          time: (course.time as string) ?? '',
        });
      }
    }
  }

  const byPass: Record<string, PassMovementView[]> = {};
  for (const id of unique) byPass[id] = [];
  for (const move of moves ?? []) {
    const passId = move.pass_id as string;
    const regId = move.registration_id as string | null;
    const view: PassMovementView = {
      id: move.id,
      tenant_id: move.tenant_id,
      pass_id: passId,
      delta: move.delta,
      kind: move.kind as PassMovementKind,
      registration_id: regId,
      reason: move.reason,
      actor_member_id: move.actor_member_id,
      event_id: move.event_id,
      created_at: move.created_at,
      course: regId ? courseByReg.get(regId) ?? null : null,
    };
    (byPass[passId] ??= []).push(view);
  }
  return byPass;
}

/** Bewegungen plus Verlängerungen, neueste zuerst. */
export async function fetchPassHistoryForPasses(
  passIds: string[],
): Promise<{
  movementsByPass: Record<string, PassMovementView[]>;
  historyByPass: Record<string, PassHistoryEntry<PassMovementView>[]>;
}> {
  const unique = [...new Set(passIds.filter(Boolean))];
  const movementsByPass = await fetchPassMovementsForPasses(unique);
  const historyByPass: Record<string, PassHistoryEntry<PassMovementView>[]> = {};
  if (unique.length === 0) return { movementsByPass, historyByPass };

  const { data: changes, error } = await supabase
    .from('pass_validity_changes')
    .select('id, pass_id, new_valid_until, note, actor_member_id, created_at')
    .in('pass_id', unique)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    throw error;
  }

  const names = await resolveStaffNames(
    (changes ?? []).map((row) => row.actor_member_id as string),
  );
  const changesByPass: Record<string, PassHistoryChange[]> = {};
  for (const id of unique) changesByPass[id] = [];
  for (const row of changes ?? []) {
    const passId = row.pass_id as string;
    const staff = names.get(row.actor_member_id as string);
    const actorName = staff
      ? `${staff.first_name ?? ''} ${staff.last_name ?? ''}`.trim() || null
      : null;
    (changesByPass[passId] ??= []).push({
      id: row.id as string,
      created_at: row.created_at as string,
      new_valid_until: row.new_valid_until as string,
      note: row.note as string,
      actor_name: actorName,
    });
  }

  for (const id of unique) {
    historyByPass[id] = mergePassHistory(
      movementsByPass[id] ?? [],
      changesByPass[id] ?? [],
    );
  }
  return { movementsByPass, historyByPass };
}

/** Eigene Karten (RLS) inkl. Rest und Bewegungen — ein Select je Tabelle. */
export async function fetchOwnPassesWithHistory(): Promise<{
  active: ManagedPass[];
  inactive: ManagedPass[];
  movementsByPass: Record<string, PassMovementView[]>;
  historyByPass: Record<string, PassHistoryEntry<PassMovementView>[]>;
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
      created_at
    `,
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    throw error;
  }

  const passIds = (rows ?? []).map((row) => row.id as string);
  const remainingByPass = new Map<string, number>();
  const { movementsByPass, historyByPass } =
    passIds.length > 0
      ? await fetchPassHistoryForPasses(passIds)
      : { movementsByPass: {}, historyByPass: {} };

  for (const [passId, list] of Object.entries(movementsByPass)) {
    remainingByPass.set(
      passId,
      list.reduce((sum, m) => sum + m.delta, 0),
    );
  }

  const today = berlinTodayIso();
  const mapped: ManagedPass[] = (rows ?? []).map((row) => ({
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
    method: null,
  }));

  const active: ManagedPass[] = [];
  const inactive: ManagedPass[] = [];
  for (const pass of mapped) {
    if (pass.status === 'active' && pass.valid_until >= today) {
      active.push(pass);
    } else {
      inactive.push(pass);
    }
  }
  return { active, inactive, movementsByPass, historyByPass };
}

function formatMovementCourseStamp(course: PassMovementCourse): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(course.date);
  const weekday = m
    ? new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
        .format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
        .replace(/\.$/, '')
    : '';
  const dayMonth = m ? `${m[3]}.${m[2]}.` : course.date;
  const time = formatTime(course.time);
  return `${course.title}, ${weekday} ${dayMonth}${time ? `, ${time}` : ''}`;
}

export type MovementLabelOptions = {
  /** Owner/Admin: Zahlart bei Kauf, Korrekturgrund sichtbar */
  studioView?: boolean;
  method?: PaymentMethod | null;
};

/** Feste Übersetzung der Bewegungs-Codes — keine Freitexte für Teilnehmende. */
export function formatPassMovementLabel(
  move: PassMovementView,
  opts?: MovementLabelOptions,
): string {
  const when = formatDateTime(move.created_at);
  const studio = opts?.studioView === true;

  switch (move.kind) {
    case 'purchase': {
      const base = `Gekauft am ${when}`;
      if (studio && opts?.method) {
        return `${base} (${methodWord(opts.method)})`;
      }
      return base;
    }
    case 'redeem': {
      if (move.course) {
        return `Eingelöst: ${formatMovementCourseStamp(move.course)}`;
      }
      return `Eingelöst am ${when}`;
    }
    case 'redeem_reversal': {
      switch (move.reason) {
        case 'self_in_window':
          return 'Zurückgebucht: rechtzeitig abgemeldet';
        case 'studio_unregister':
          return 'Zurückgebucht: vom Studio abgemeldet';
        case 'course_cancelled':
          return 'Zurückgebucht: Kurs abgesagt';
        default:
          return 'Zurückgebucht';
      }
    }
    case 'manual_adjustment': {
      const signed = move.delta > 0 ? `+${move.delta}` : String(move.delta);
      const base = `Korrektur durch das Studio (${signed})`;
      if (studio && move.reason) {
        return `${base}: ${move.reason}`;
      }
      return base;
    }
    case 'expire':
      return `Verfallen am ${when}`;
    case 'revoke':
      return `Storniert am ${when}`;
    default:
      return when;
  }
}

export type AdjustPassResult =
  | { ok: true; remaining: number; movement_id: string }
  | { ok: false; code: string; message: string };

export function adjustPassErrorMessage(code: string | null | undefined): string {
  switch (code) {
    case 'REASON_REQUIRED':
      return 'Bitte gib einen Grund an.';
    case 'NEGATIVE_BALANCE':
      return 'So viele Einheiten hat die Karte nicht.';
    case 'PASS_EXPIRED':
      return 'Die Karte ist abgelaufen. Korrigiere auf einer gültigen Karte.';
    case 'NOT_ACTIVE':
      return 'Die Karte ist nicht mehr aktiv.';
    case 'INVALID_DELTA':
    case 'FORBIDDEN':
    case 'NOT_FOUND':
      return GENERIC_ERROR;
    default:
      return GENERIC_ERROR;
  }
}

export async function adjustPassUnits(
  passId: string,
  delta: number,
  reason: string,
): Promise<AdjustPassResult> {
  const { data, error } = await supabase.rpc('adjust_pass_units', {
    p_pass_id: passId,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) {
    console.error(error);
    return { ok: false, code: 'TRANSPORT', message: GENERIC_ERROR };
  }
  const body = data as {
    success?: boolean;
    error?: string;
    remaining?: number;
    movement_id?: string;
  } | null;
  if (!body?.success || body.remaining == null || !body.movement_id) {
    const code = body?.error ?? 'UNKNOWN';
    return { ok: false, code, message: adjustPassErrorMessage(code) };
  }
  return { ok: true, remaining: body.remaining, movement_id: body.movement_id };
}
