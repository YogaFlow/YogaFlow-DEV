/**
 * UX-5: sichtbare Kurse/Mitglieder (archived_at IS NULL).
 * RLS spiegelt dasselbe ab Migration 20261004240000.
 * Ausnahme Anzeige mit Archiv: nur Zahlungen (get_studio_payments + Umschalter).
 *
 * Filter immer nach .select() — supabase-js erlaubt .is() erst am Filter-Builder.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultClient } from './supabase';

type Client = SupabaseClient;

type WithIs = { is: (column: string, value: null) => WithIs };

/** Nach .select()/.update() …: nur nicht-archivierte Zeilen. */
export function onlyVisible<T extends WithIs>(query: T): T {
  return query.is('archived_at', null) as T;
}

/** Kurs-SELECT mit Archiv-Filter (danach .eq/.gte/.order …). */
export function visibleCourses(
  columns = '*',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any,
  client: Client = defaultClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // columns als string verliert sonst den Supabase-Literaltyp → GenericStringError
  return onlyVisible(client.from('courses').select(columns as '*', options));
}

/** Mitglieder-SELECT mit Archiv-Filter. */
export function visibleMembers(
  columns = '*',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any,
  client: Client = defaultClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return onlyVisible(client.from('users').select(columns as '*', options));
}

export function isArchivedRow(row: { archived_at?: string | null } | null | undefined): boolean {
  return row?.archived_at != null && row.archived_at !== '';
}
