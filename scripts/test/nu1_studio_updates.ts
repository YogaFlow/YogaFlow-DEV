/**
 * NU-1 — Platzhalter, showIf, Freigabe, Ungelesen, Zuklappen (ohne DB).
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
  isParticipantSendCollapsed,
  matchesShowIf,
  participantDraft,
  toggleExpandedUpdateId,
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

const allReleased = new Set(STUDIO_UPDATES.map((u) => u.id));

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
  const offline = visibleUpdates({ ...baseCtx, onlinePaymentsActive: false }, allReleased);
  assert.equal(
    offline.some((u) => u.id === '2026-10-online-bezahlen'),
    false,
  );
  const online = visibleUpdates({ ...baseCtx, onlinePaymentsActive: true }, allReleased);
  assert.equal(
    online.some((u) => u.id === '2026-10-online-bezahlen'),
    true,
  );
});

test('showIf always bleibt sichtbar (wenn freigegeben)', () => {
  assert.equal(matchesShowIf('always', baseCtx), true);
  const ids = visibleUpdates(baseCtx, allReleased).map((u) => u.id);
  assert.ok(ids.includes('2026-10-zahlungen-im-blick'));
  assert.ok(ids.includes('2026-10-kurskarten-verkaufen'));
  assert.ok(ids.includes('2026-10-rechtstexte'));
});

test('Freigabe × showIf: nur freigegebene IDs', () => {
  const one = new Set(['2026-10-zahlungen-im-blick']);
  const list = visibleUpdates(baseCtx, one);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, '2026-10-zahlungen-im-blick');

  const onlineOnly = new Set(['2026-10-online-bezahlen']);
  assert.equal(
    visibleUpdates({ ...baseCtx, onlinePaymentsActive: false }, onlineOnly).length,
    0,
  );
  assert.equal(
    visibleUpdates({ ...baseCtx, onlinePaymentsActive: true }, onlineOnly).length,
    1,
  );
});

test('Zahl 0 ohne Freigaben / bei Ladefehler', () => {
  assert.equal(visibleUpdates(baseCtx, new Set()).length, 0);
  assert.equal(visibleUpdates(baseCtx, null).length, 0);
  assert.equal(countUnreadUpdates('t', 'u', []), 0);
  assert.equal(settingsUpdatesBadge(0), null);
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

test('Ungelesen-Zählung nur sichtbare', () => {
  const visible = visibleUpdates({ ...baseCtx, onlinePaymentsActive: true }, allReleased);
  const n = countUnreadUpdates('tenant', 'user', visible);
  assert.equal(n, visible.length);
  assert.ok(n >= 3);
});

test('zugeklappt bei vorhandenem Versand', () => {
  assert.equal(
    isParticipantSendCollapsed({
      hasParticipantMessage: true,
      hasSend: true,
      manuallyExpanded: false,
    }),
    true,
  );
  assert.equal(
    isParticipantSendCollapsed({
      hasParticipantMessage: true,
      hasSend: true,
      manuallyExpanded: true,
    }),
    false,
  );
  assert.equal(
    isParticipantSendCollapsed({
      hasParticipantMessage: true,
      hasSend: false,
      manuallyExpanded: false,
    }),
    false,
  );
  assert.equal(
    isParticipantSendCollapsed({
      hasParticipantMessage: false,
      hasSend: true,
      manuallyExpanded: false,
    }),
    false,
  );
});

test('Auf → Zu → Auf', () => {
  const id = '2026-10-kurskarten-verkaufen';
  let expanded = new Set<string>();
  const collapsed = (manuallyExpanded: boolean) =>
    isParticipantSendCollapsed({
      hasParticipantMessage: true,
      hasSend: true,
      manuallyExpanded,
    });

  assert.equal(collapsed(expanded.has(id)), true);
  expanded = toggleExpandedUpdateId(expanded, id);
  assert.equal(collapsed(expanded.has(id)), false);
  expanded = toggleExpandedUpdateId(expanded, id);
  assert.equal(collapsed(expanded.has(id)), true);
  expanded = toggleExpandedUpdateId(expanded, id);
  assert.equal(collapsed(expanded.has(id)), false);
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
});

test('Badge auf Einstellungen = Zahlungen-Badge', () => {
  assert.equal(settingsUpdatesBadge(0), null);
  assert.equal(settingsUpdatesBadge(3), '3');
  assert.equal(settingsUpdatesBadge(10), '9+');
  assert.equal(settingsUpdatesBadge(3), openPaymentsBadge(3));
  assert.equal(updatesStatusLine(0), 'Neuigkeiten von Omlify');
});

test('Modal-Scroll-Lock: Overlay-Sperre weg nach Schließen', () => {
  const body = { style: { overflow: '' } };
  const unlock = lockBodyScroll(body);
  assert.equal(isBodyScrollLocked(body), true);
  unlock();
  assert.equal(isBodyScrollLocked(body), false);
});
