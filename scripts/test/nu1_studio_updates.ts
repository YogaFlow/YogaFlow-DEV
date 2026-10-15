/**
 * NU-1 — Platzhalter, showIf, Ungelesen, Badge, Modal-Scroll-Lock (ohne DB).
 *
 *   node --experimental-strip-types --test scripts/test/nu1_studio_updates.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STUDIO_UPDATES } from '../../src/content/updates.ts';
import {
  applyStudioPlaceholder,
  canOfferParticipantSend,
  countUnreadUpdates,
  matchesShowIf,
  participantDraft,
  visibleUpdates,
  type StudioUpdateContext,
} from '../../src/lib/studioUpdates.ts';
import {
  SETTINGS_CATEGORIES,
  settingsUpdatesBadge,
  updatesStatusLine,
} from '../../src/lib/settingsOverview.ts';
import { openPaymentsBadge } from '../../src/lib/paymentsTabs.ts';
import { isBodyScrollLocked, lockBodyScroll } from '../../src/lib/bodyScrollLock.ts';

const baseCtx: StudioUpdateContext = {
  onlinePaymentsActive: false,
  hasPassProducts: false,
  allowOnsitePayment: true,
  studioName: 'Demo Alpha',
};

test('Platzhalter {studio}', () => {
  assert.equal(
    applyStudioPlaceholder('Neu bei {studio}: Test', 'Yoga Fluss'),
    'Neu bei Yoga Fluss: Test',
  );
  assert.equal(
    applyStudioPlaceholder('{studio} und wieder {studio}', 'S'),
    'S und wieder S',
  );
});

test('showIf: Online aus → Online-Neuigkeit unsichtbar', () => {
  const offline = visibleUpdates({ ...baseCtx, onlinePaymentsActive: false });
  assert.equal(
    offline.some((u) => u.id === '2026-10-online-bezahlen'),
    false,
  );
  const online = visibleUpdates({ ...baseCtx, onlinePaymentsActive: true });
  assert.equal(
    online.some((u) => u.id === '2026-10-online-bezahlen'),
    true,
  );
});

test('showIf always bleibt sichtbar', () => {
  assert.equal(matchesShowIf('always', baseCtx), true);
  const ids = visibleUpdates(baseCtx).map((u) => u.id);
  assert.ok(ids.includes('2026-10-zahlungen-im-blick'));
  assert.ok(ids.includes('2026-10-kurskarten-verkaufen'));
  assert.ok(ids.includes('2026-10-rechtstexte'));
});

test('Kurskarten-Nachricht nur mit hasPassProducts', () => {
  const update = STUDIO_UPDATES.find((u) => u.id === '2026-10-kurskarten-verkaufen')!;
  assert.equal(canOfferParticipantSend(update, baseCtx), false);
  assert.equal(
    canOfferParticipantSend(update, { ...baseCtx, hasPassProducts: true }),
    true,
  );
});

test('Online-Nachricht: Onsite-Suffix nur wenn vor Ort aktiv', () => {
  const update = STUDIO_UPDATES.find((u) => u.id === '2026-10-online-bezahlen')!;
  const withOnsite = participantDraft(update, {
    ...baseCtx,
    onlinePaymentsActive: true,
    allowOnsitePayment: true,
  });
  assert.ok(withOnsite?.body.includes('Bar vor Ort'));
  const without = participantDraft(update, {
    ...baseCtx,
    onlinePaymentsActive: true,
    allowOnsitePayment: false,
  });
  assert.equal(without?.body.includes('Bar vor Ort'), false);
  assert.ok(without?.title.includes('Demo Alpha'));
});

test('Ungelesen-Zählung', () => {
  const visible = visibleUpdates({ ...baseCtx, onlinePaymentsActive: true });
  // Ohne localStorage (Node): alle ungelesen
  const n = countUnreadUpdates('tenant', 'user', visible);
  assert.equal(n, visible.length);
  assert.ok(n >= 3);
});

test('Update-IDs eindeutig und stabil', () => {
  const ids = STUDIO_UPDATES.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('Einstellungen: Neu für dich als Unterpunkt auf /updates', () => {
  const item = SETTINGS_CATEGORIES.find((c) => c.id === 'updates');
  assert.ok(item);
  assert.equal(item!.title, 'Neu für dich');
  assert.equal(item!.to, '/updates');
  assert.equal(
    SETTINGS_CATEGORIES.some((c) => c.to === '/updates' && c.id !== 'updates'),
    false,
  );
});

test('Badge auf Einstellungen = Zahlungen-Badge', () => {
  assert.equal(settingsUpdatesBadge(0), null);
  assert.equal(settingsUpdatesBadge(3), '3');
  assert.equal(settingsUpdatesBadge(10), '9+');
  assert.equal(settingsUpdatesBadge(3), openPaymentsBadge(3));
  assert.equal(settingsUpdatesBadge(10), openPaymentsBadge(10));
  assert.equal(updatesStatusLine(0), 'Neuigkeiten von Omlify');
  assert.equal(updatesStatusLine(1), '1 ungelesen');
  assert.equal(updatesStatusLine(4), '4 ungelesen');
});

test('Modal-Scroll-Lock: Overlay-Sperre weg nach Schließen', () => {
  const body = { style: { overflow: '' } };
  assert.equal(isBodyScrollLocked(body), false);
  const unlock = lockBodyScroll(body);
  assert.equal(body.style.overflow, 'hidden');
  assert.equal(isBodyScrollLocked(body), true);
  unlock();
  assert.equal(body.style.overflow, '');
  assert.equal(isBodyScrollLocked(body), false);

  const bodyPrev = { style: { overflow: 'auto' } };
  const unlock2 = lockBodyScroll(bodyPrev);
  assert.equal(isBodyScrollLocked(bodyPrev), true);
  unlock2();
  assert.equal(bodyPrev.style.overflow, 'auto');
  assert.equal(isBodyScrollLocked(bodyPrev), false);
});
