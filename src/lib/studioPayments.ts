import { supabase } from './supabase';
import type { PaymentKind, PaymentOverviewStatus, StudioPaymentRow } from './paymentOverview';

export type StudioPaymentsQuery = {
  month: string;
  kind: PaymentKind | '';
  status: PaymentOverviewStatus | '';
  search: string;
  page: number;
  /** UX-5: Standard false = ohne archivierte Kurse/Personen. */
  includeArchived?: boolean;
};

export type StudioPaymentsPage = {
  items: StudioPaymentRow[];
  total: number;
  page: number;
};

export async function fetchStudioPayments(query: StudioPaymentsQuery): Promise<StudioPaymentsPage> {
  const { data, error } = await supabase.rpc('get_studio_payments', {
    p_month: query.month,
    p_kind: query.kind || null,
    p_status: query.status || null,
    p_search: query.search.trim() || null,
    p_page: query.page,
    p_include_archived: Boolean(query.includeArchived),
  });
  if (error) throw error;
  const body = data as
    | { success?: boolean; error?: string; items?: StudioPaymentRow[]; total?: number; page?: number }
    | null;
  if (!body?.success) throw new Error(body?.error ?? 'UNKNOWN');
  return { items: body.items ?? [], total: body.total ?? 0, page: body.page ?? query.page };
}
