import { supabase } from './supabase';
import { countOpenCoverageRows } from './paymentsTabs';

/** F2: Anzahl offener Zahlungen = Zeilen aus get_open_coverage (Anmeldungen). */
export async function fetchOpenPaymentsCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_open_coverage');
  if (error) return 0;
  return countOpenCoverageRows(data as unknown[]);
}
