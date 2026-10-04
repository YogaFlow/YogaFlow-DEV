import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { visibleMembers } from '../../lib/visibleScope';

type StaffRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Inhaberin/Inhaber',
  admin: 'Admin',
  teacher: 'Kursleitung',
};

export default function TeamSettingsSection() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await visibleMembers('id, first_name, last_name, role')
        .in('role', ['owner', 'admin', 'teacher'])
        .is('anonymized_at', null)
        .order('last_name', { ascending: true });
      if (!active) return;
      if (error) {
        setLoadError(true);
        setRows([]);
      } else {
        setRows((data as StaffRow[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface p-3.5">
      <h2 className="text-xl font-semibold text-text">Team</h2>
      {loading ? <p className="text-[15px] text-textMuted">Wird geladen…</p> : null}
      {loadError ? (
        <p role="alert" className="text-[15px] text-text">
          Das Team konnte nicht geladen werden.
        </p>
      ) : null}
      {!loading && !loadError ? (
        <ul className="divide-y divide-border" data-testid="settings-team-list">
          {rows.map((row) => {
            const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Ohne Namen';
            return (
              <li key={row.id} className="flex min-h-11 items-center justify-between gap-3 py-2">
                <span className="text-[15px] text-text">{name}</span>
                <span className="text-[13px] text-textMuted">{ROLE_LABELS[row.role] ?? row.role}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Link
        to="/users"
        className="inline-flex min-h-11 items-center text-[15px] font-medium text-brand"
      >
        Personen verwalten
      </Link>
    </div>
  );
}
