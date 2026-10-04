import { supabase } from './supabase';

export async function fetchStaffCount(): Promise<number> {
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .in('role', ['owner', 'admin', 'teacher'])
    .is('anonymized_at', null);
  if (error) return 0;
  return count ?? 0;
}
