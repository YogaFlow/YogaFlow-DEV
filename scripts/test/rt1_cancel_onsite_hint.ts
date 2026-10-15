/**
 * RT-1 L12 — Abmelde-Hinweis Vor Ort nach Frist.
 */
import assert from 'node:assert/strict';
import { onsiteLateCancelHint } from '../../src/lib/cancellationDeadline.ts';

const now = new Date('2026-10-06T12:00:00.000Z');

const before = onsiteLateCancelHint({
  studioName: 'Yoga Mitte',
  deadlineIso: '2026-10-07T16:00:00.000Z',
  priceCents: 1600,
  now,
});
assert.equal(before, null, 'vor der Frist kein Hinweis');

const after = onsiteLateCancelHint({
  studioName: 'Yoga Mitte',
  deadlineIso: '2026-10-05T16:00:00.000Z',
  priceCents: 1600,
  now,
});
assert.ok(after, 'nach der Frist Hinweis');
assert.match(after!, /Die kostenlose Abmeldefrist ist vorbei/);
assert.match(after!, /Yoga Mitte kann den Kurspreis von 16,00 € trotzdem verlangen/);

console.log('rt1_cancel_onsite_hint OK');
