/**
 * K1-2: Verlängerung im Kartenverlauf, chronologisch mit den Bewegungen.
 *   node --experimental-strip-types --test scripts/test/k1_pass_history.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatDate } from '../../src/lib/format.ts';
import {
  formatPassExtensionLabel,
  mergePassHistory,
} from '../../src/lib/passHistory.ts';

test('Verlängerung: Verlängert bis · Notiz · von', () => {
  const change = {
    id: 'c1',
    created_at: '2026-10-05T08:00:00.000Z',
    new_valid_until: '2027-10-04',
    note: 'Kulanz nach Krankheit',
    actor_name: 'Anna Beispiel',
  };
  assert.equal(
    formatPassExtensionLabel(change),
    `Verlängert bis ${formatDate('2027-10-04')} · Kulanz nach Krankheit · von Anna Beispiel`,
  );
});

test('Verlängerung ohne Namen: von Studio', () => {
  assert.match(
    formatPassExtensionLabel({
      id: 'c2',
      created_at: '2026-10-05T08:00:00.000Z',
      new_valid_until: '2027-01-01',
      note: 'Notiz',
      actor_name: null,
    }),
    / · Notiz · von Studio$/,
  );
});

test('Verlauf mischt Verlängerung chronologisch zwischen Bewegungen', () => {
  const entries = mergePassHistory(
    [
      { id: 'buy', created_at: '2026-10-01T10:00:00.000Z', kind: 'purchase' },
      { id: 'use', created_at: '2026-10-08T10:00:00.000Z', kind: 'redeem' },
    ],
    [
      {
        id: 'ext',
        created_at: '2026-10-05T10:00:00.000Z',
        new_valid_until: '2027-10-04',
        note: 'verlängert',
        actor_name: 'Owner',
      },
    ],
  );
  assert.deepEqual(
    entries.map((entry) => entry.kind === 'extension' ? 'extension' : entry.movement.id),
    ['use', 'extension', 'buy'],
  );
});
