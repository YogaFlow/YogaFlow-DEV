import { supabase } from './supabase';
import { countOpenCoveragePeople } from './paymentsTabs';

export async function fetchOpenPaymentsCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_open_coverage');
  if (error) return 0;
  const rows = (data ?? []) as Array<{ user_id?: string | null }>;
  return countOpenCoveragePeople(rows);
}
