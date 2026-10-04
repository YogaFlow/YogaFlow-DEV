import { visibleMembers } from './visibleScope';

export async function fetchStaffCount(): Promise<number> {
  const { count, error } = await visibleMembers('id', { count: 'exact', head: true })
    .in('role', ['owner', 'admin', 'teacher'])
    .is('anonymized_at', null);
  if (error) return 0;
  return count ?? 0;
}
