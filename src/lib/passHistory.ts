import { formatDate } from './format.ts';

/** Eine Verlängerung aus pass_validity_changes, für den Verlauf. */
export type PassHistoryChange = {
  id: string;
  created_at: string;
  new_valid_until: string;
  note: string;
  actor_name: string | null;
};

export type PassHistoryStamp = {
  id: string;
  created_at: string;
};

export type PassHistoryEntry<M extends PassHistoryStamp = PassHistoryStamp> =
  | { kind: 'movement'; at: string; id: string; movement: M }
  | { kind: 'extension'; at: string; id: string; change: PassHistoryChange };

/** Bewegungen und Verlängerungen, neueste zuerst. */
export function mergePassHistory<M extends PassHistoryStamp>(
  movements: M[],
  changes: PassHistoryChange[],
): PassHistoryEntry<M>[] {
  const entries: PassHistoryEntry<M>[] = [
    ...movements.map((movement) => ({
      kind: 'movement' as const,
      at: movement.created_at,
      id: `m:${movement.id}`,
      movement,
    })),
    ...changes.map((change) => ({
      kind: 'extension' as const,
      at: change.created_at,
      id: `e:${change.id}`,
      change,
    })),
  ];
  entries.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
  return entries;
}

/** „Verlängert bis … · Notiz · von …“ */
export function formatPassExtensionLabel(change: PassHistoryChange): string {
  const until = formatDate(change.new_valid_until);
  const note = change.note.trim();
  const by = change.actor_name?.trim() || 'Studio';
  return `Verlängert bis ${until} · ${note} · von ${by}`;
}
