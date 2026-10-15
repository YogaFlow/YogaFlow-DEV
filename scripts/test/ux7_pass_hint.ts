/**
 * UX-7 — Platzhalter-Rendering und Frist-Umbruch (ohne DB).
 *
 *   node --experimental-strip-types --test scripts/test/ux7_pass_hint.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cancellationDeadlineLine,
  cancellationDeadlineParts,
} from '../../src/lib/cancellationDeadline.ts';
import {
  escapePassHintHtml,
  PASS_HINT_DEFAULT_TEMPLATE,
  pickCheapestPassProduct,
  renderPassHint,
  resolveCoursePassHint,
  validatePassHintTemplate,
} from '../../src/lib/passHint.ts';

const values = {
  passName: '5er-Karte',
  passPriceCents: 6500,
  passUnits: 5,
  coursePriceEuros: 18,
};

const NBSP = '\u00A0';

test('alle vier Platzhalter', () => {
  const r = renderPassHint(
    'Mit der {karte} zahlst du {preis_karte} statt {preis_einzel} (sparst {ersparnis}).',
    values,
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(
    r.text,
    `Mit der 5er-Karte zahlst du 13,00${NBSP}€ statt 18,00${NBSP}€ (sparst 5,00${NBSP}€).`,
  );
});

test('Vorbelegung bei leerer Vorlage', () => {
  const r = renderPassHint(null, values);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(
    r.text,
    `Mit der 5er-Karte zahlst du 13,00${NBSP}€ statt 18,00${NBSP}€.`,
  );
  assert.ok(PASS_HINT_DEFAULT_TEMPLATE.includes('{karte}'));
});

test('unbekannter Platzhalter → Fehler', () => {
  const v = validatePassHintTemplate('Hallo {foo}');
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.match(v.message, /\{foo\}/);
  const r = renderPassHint('Hallo {foo}', values);
  assert.equal(r.ok, false);
});

test('Escaping Freitext', () => {
  assert.equal(escapePassHintHtml('<b>&x</b>'), '&lt;b&gt;&amp;x&lt;/b&gt;');
  const r = renderPassHint('Spare <b>{ersparnis}</b>', values);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // Rohtext behält Zeichen; React escaped beim Rendern als Textkind
  assert.equal(r.text, `Spare <b>5,00${NBSP}€</b>`);
  assert.equal(
    escapePassHintHtml(r.text!),
    `Spare &lt;b&gt;5,00${NBSP}€&lt;/b&gt;`,
  );
});

test('Hinweis aus = nicht gerendert', () => {
  assert.equal(
    resolveCoursePassHint({
      enabled: false,
      template: null,
      passEligible: true,
      hasPassOption: false,
      products: [{ name: '5er-Karte', price_cents: 6500, units: 5 }],
      coursePriceEuros: 18,
    }),
    null,
  );
  assert.match(
    resolveCoursePassHint({
      enabled: true,
      template: null,
      passEligible: true,
      hasPassOption: false,
      products: [{ name: '5er-Karte', price_cents: 6500, units: 5 }],
      coursePriceEuros: 18,
    }) ?? '',
    /5er-Karte/,
  );
});

test('günstigstes Produkt pro Termin', () => {
  const pick = pickCheapestPassProduct([
    { name: '10er', price_cents: 12000, units: 10 }, // 12 €
    { name: '5er', price_cents: 6500, units: 5 }, // 13 €
  ]);
  assert.equal(pick?.name, '10er');
});

test('Frist: Umbruch vor bis, Datum nicht umbrechen', () => {
  const iso = '2026-10-06T16:30:00.000Z';
  const parts = cancellationDeadlineParts(iso, new Date('2026-10-01T10:00:00.000Z'));
  assert.equal(parts.kind, 'active');
  if (parts.kind !== 'active') return;
  assert.equal(parts.prefix, 'Kostenlos abmelden');
  assert.match(parts.untilDate, /^bis\u00A0/);
  assert.ok(!parts.untilDate.includes(' '), 'Datumsteil ohne normale Leerzeichen');
  assert.equal(
    cancellationDeadlineLine(iso, new Date('2026-10-01T10:00:00.000Z')),
    `${parts.prefix} ${parts.untilDate}`,
  );
});
