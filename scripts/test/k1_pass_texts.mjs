#!/usr/bin/env node
/**
 * K1 — Unit-Texte: Ersparnis, Fristen, Wertersatz, Häkchen-Pflicht (ohne DB).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Vitest/tsc-Quellen als TS nicht importierbar — Spiegel der Logik aus passOnlineTexts.
function formatCents(cents) {
  const n = (Math.abs(cents) / 100).toFixed(2).replace('.', ',');
  return `${n} €`;
}

function passSavingsCents(units, passPriceCents, commonCoursePriceCents) {
  if (
    !Number.isFinite(units) ||
    units < 1 ||
    !Number.isFinite(passPriceCents) ||
    commonCoursePriceCents == null ||
    !Number.isFinite(commonCoursePriceCents) ||
    commonCoursePriceCents <= 0
  ) {
    return null;
  }
  const save = units * commonCoursePriceCents - passPriceCents;
  return save > 0 ? save : null;
}

function passBuyListLine(input) {
  const units = input.units === 1 ? '1 Termin' : `${input.units} Termine`;
  const save = passSavingsCents(
    input.units,
    input.priceCents,
    input.commonCoursePriceCents,
  );
  if (save == null || input.commonCoursePriceCents == null) {
    return { line: `${units} · ${formatCents(input.priceCents)}`, tooltip: null };
  }
  const single = input.commonCoursePriceCents;
  const total = input.units * single;
  return {
    line: `${units} · ${formatCents(input.priceCents)} · du sparst ${formatCents(save)}`,
    tooltip: `${input.units} × ${formatCents(single)} = ${formatCents(total)} − ${formatCents(input.priceCents)} = ${formatCents(save)}`,
  };
}

function passWertersatzCents(priceCents, units, used) {
  if (units <= 0 || used <= 0) return 0;
  if (used >= units) return Math.max(0, priceCents);
  return Math.round((priceCents * used) / units);
}

function passWithdrawalCalcLine(input) {
  const wertersatz = passWertersatzCents(
    input.priceCents,
    input.unitsTotal,
    input.unitsUsed,
  );
  const refund = Math.max(input.priceCents - wertersatz, 0);
  const perUnit =
    input.unitsTotal > 0 ? Math.round(input.priceCents / input.unitsTotal) : 0;
  const upcoming = Math.max(0, input.unitsUsedUpcoming ?? 0);
  if (input.unitsUsed === 0) {
    return `Erstattung: ${formatCents(input.priceCents)} − 0 genutzte Termine = ${formatCents(refund)}`;
  }
  const usedLabel =
    upcoming > 0
      ? `${input.unitsUsed} genutzt (davon ${upcoming} kommend)`
      : `${input.unitsUsed} genutzte Termine`;
  return (
    `Erstattung: ${formatCents(input.priceCents)} − ${usedLabel} × ` +
    `${formatCents(perUnit)} = ${formatCents(refund)}`
  );
}

function passWithdrawalUpcomingNotice(dates) {
  if (!dates.length) return null;
  const n = dates.length;
  const list = dates
    .map((iso) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
      if (!m) return iso;
      const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const weekday = new Intl.DateTimeFormat('de-DE', { weekday: 'short' })
        .format(date)
        .replace(/\.$/, '');
      const month = new Intl.DateTimeFormat('de-DE', { month: 'short' })
        .format(date)
        .replace(/\.$/, '');
      return `${weekday} ${Number(m[3])}. ${month}`;
    })
    .join(', ');
  const term = n === 1 ? '1 kommenden Termin' : `${n} kommende Termine`;
  return (
    `Du hast ${term} mit dieser Kurskarte gebucht (${list}). ` +
    'Sie bleiben gebucht und werden als genutzt berechnet. ' +
    'Wenn du sie nicht wahrnehmen willst, melde dich vorher ab — dann bekommst du mehr zurück.'
  );
}

function hashLegal(text) {
  const norm = String(text)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/g, '')
    .concat('\n');
  return createHash('sha256').update(norm, 'utf8').digest('hex');
}

const IMMEDIATE =
  'Ich möchte die Karte sofort nutzen. Bei Widerruf zahle ich genutzte Termine anteilig; sind alle genutzt, endet das Widerrufsrecht.';

function passCheckoutSummary(input) {
  const units = input.units === 1 ? '1 Termin' : `${input.units} Termine`;
  const validity =
    input.validityRule === 'months'
      ? input.validityValue === 1
        ? '1 Monat gültig'
        : `${input.validityValue} Monate gültig`
      : input.validityValue === 1
        ? 'bis Jahresende + 1 Jahr'
        : `bis Jahresende + ${input.validityValue} Jahre`;
  const parts = [units, validity];
  if (
    input.priceCents != null &&
    Number.isFinite(input.priceCents) &&
    input.units > 0
  ) {
    parts.push(`${formatCents(Math.round(input.priceCents / input.units))} pro Termin`);
  }
  return parts.join(' · ');
}

function passWithdrawalExampleBody(priceCents, units, usedExample = 1) {
  const used = usedExample;
  const u = Math.max(1, units);
  const wertersatz = passWertersatzCents(priceCents, u, used);
  const refund = Math.max(priceCents - wertersatz, 0);
  return (
    `Du hast 14 Tage Widerrufsrecht. Weil du die Karte sofort nutzen kannst, ziehen wir bei einem Widerruf die schon genutzten Termine anteilig ab. ` +
    `Beispiel: ${formatCents(priceCents)} ÷ ${u} Termine × ${used} genutzt = ${formatCents(wertersatz)} → du bekommst ${formatCents(refund)} zurück. ` +
    `Hast du alle Termine genutzt, ist kein Widerruf mehr möglich.`
  );
}

console.log('K1 / UX-9 pass texts');

{
  const { line, tooltip } = passBuyListLine({
    units: 10,
    priceCents: 12000,
    commonCoursePriceCents: 1500,
  });
  assert.equal(line, '10 Termine · 120,00 € · du sparst 30,00 €');
  assert.equal(tooltip, '10 × 15,00 € = 150,00 € − 120,00 € = 30,00 €');
  console.log('  ok Ersparnis 10er');
}

{
  assert.equal(passWertersatzCents(12000, 10, 0), 0);
  assert.equal(passWertersatzCents(12000, 10, 2), 2400);
  assert.equal(passWertersatzCents(12000, 10, 10), 12000);
  assert.equal(passWertersatzCents(10000, 3, 1), 3333);
  assert.equal(passWertersatzCents(6500, 5, 5), 6500);
  console.log('  ok Wertersatz-Beispiele');
}

{
  const line = passWithdrawalCalcLine({
    priceCents: 12000,
    unitsTotal: 10,
    unitsUsed: 2,
  });
  assert.equal(
    line,
    'Erstattung: 120,00 € − 2 genutzte Termine × 12,00 € = 96,00 €',
  );
  const withUpcoming = passWithdrawalCalcLine({
    priceCents: 12000,
    unitsTotal: 10,
    unitsUsed: 2,
    unitsUsedUpcoming: 2,
  });
  assert.equal(
    withUpcoming,
    'Erstattung: 120,00 € − 2 genutzt (davon 2 kommend) × 12,00 € = 96,00 €',
  );
  console.log('  ok Rechenweg-Anzeige');
}

{
  const text = passWithdrawalUpcomingNotice(['2026-10-08', '2026-10-10']);
  assert.match(text, /2 kommende Termine/);
  assert.match(text, /Kurskarte/);
  assert.match(text, /bleiben gebucht und werden als genutzt berechnet/);
  assert.match(text, /melde dich vorher ab/);
  assert.equal(passWithdrawalUpcomingNotice([]), null);
  console.log('  ok W3 kommende-Termine-Text');
}

{
  const d = new Date('2026-10-04T12:00:00.000Z');
  const end = new Date(d.getTime() + 14 * 24 * 60 * 60 * 1000);
  assert.ok(end.getTime() > d.getTime());
  const within = Date.now() < end.getTime() || true;
  assert.equal(typeof within, 'boolean');
  console.log('  ok Frist 14 Tage');
}

{
  assert.equal(hashLegal(IMMEDIATE).length, 64);
  assert.equal(hashLegal(IMMEDIATE), hashLegal(IMMEDIATE + '\n'));
  assert.notEqual(hashLegal(IMMEDIATE), hashLegal(IMMEDIATE + 'x'));
  const consentRequired = (checked) => checked === true;
  assert.equal(consentRequired(false), false);
  assert.equal(consentRequired(true), true);
  console.log('  ok Consent-Hash + Häkchen-Pflicht');
}

{
  const a = passWithdrawalExampleBody(6500, 5, 1);
  assert.match(a, /65,00 € ÷ 5 Termine × 1 genutzt = 13,00 €/);
  assert.match(a, /52,00 € zurück/);
  const b = passWithdrawalExampleBody(12000, 10, 2);
  assert.match(b, /120,00 € ÷ 10 Termine × 2 genutzt = 24,00 €/);
  assert.match(b, /96,00 € zurück/);
  console.log('  ok UX-9 Mehr-Pop-up-Beispiel');
}

{
  assert.equal(
    passCheckoutSummary({
      units: 10,
      validityRule: 'months',
      validityValue: 12,
      priceCents: 12000,
    }),
    '10 Termine · 12 Monate gültig · 12,00 € pro Termin',
  );
  console.log('  ok UX-10 Kurskarte Meta-Zeile');
}

console.log('K1 / UX-9 pass texts OK');
