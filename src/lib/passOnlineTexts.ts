/**
 * K1 — Texte für Online-Kartenkauf, Ersparnis, Fristen, Wertersatz, Consent.
 */
import { formatCents } from './format';

export const PASS_IMMEDIATE_USE_TEXT =
  'Ich verlange ausdrücklich, dass ich die Karte sofort nutzen kann. Mir ist bekannt, dass ich bei einem Widerruf für bereits genutzte Termine anteilig Wertersatz leiste.';

export const PASS_WITHDRAWAL_INFO_TEXT =
  'Du hast ein 14-tägiges Widerrufsrecht. Widerrufsbelehrung.';

export const BINDING_BUY_PASS_LABEL = 'Zahlungspflichtig kaufen';

export const PASS_WITHDRAWAL_BELEHRUNG_BODY =
  'Du kannst den Vertrag innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen. ' +
  'Die Frist beginnt mit dem Kauf. Weil du der sofortigen Nutzung zustimmst, leistest du bei Widerruf ' +
  'anteilig Wertersatz für bereits genutzte Termine (Preis ÷ Termine × genutzte Termine). ' +
  'Ungenutzte Termine werden entwertet. Den Widerruf erklärst du über „Meine Karten“ oder die Seite Widerruf.';

export function passProductPreviewLine(input: {
  units: number;
  priceCents: number;
  validityRule: 'months' | 'years_to_year_end';
  validityValue: number;
}): string {
  const units = input.units === 1 ? '1 Termin' : `${input.units} Termine`;
  const per =
    input.units > 0 ? formatCents(Math.round(input.priceCents / input.units)) : '';
  const validity =
    input.validityRule === 'months'
      ? input.validityValue === 1
        ? '1 Monat gültig'
        : `${input.validityValue} Monate gültig`
      : input.validityValue === 1
        ? 'bis Jahresende + 1 Jahr'
        : `bis Jahresende + ${input.validityValue} Jahre`;
  return `${units} · ${formatCents(input.priceCents)} · ${per} pro Termin · ${validity}`;
}

/** Ersparnis gegenüber dem häufigsten Einzelpreis (Cent). */
export function passSavingsCents(
  units: number,
  passPriceCents: number,
  commonCoursePriceCents: number | null | undefined,
): number | null {
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
  const singleTotal = units * commonCoursePriceCents;
  const save = singleTotal - passPriceCents;
  return save > 0 ? save : null;
}

export function passBuyListLine(input: {
  units: number;
  priceCents: number;
  commonCoursePriceCents?: number | null;
}): { line: string; tooltip: string | null } {
  const units = input.units === 1 ? '1 Termin' : `${input.units} Termine`;
  const save = passSavingsCents(
    input.units,
    input.priceCents,
    input.commonCoursePriceCents,
  );
  if (save == null || input.commonCoursePriceCents == null) {
    return {
      line: `${units} · ${formatCents(input.priceCents)}`,
      tooltip: null,
    };
  }
  const single = input.commonCoursePriceCents;
  const total = input.units * single;
  return {
    line: `${units} · ${formatCents(input.priceCents)} · du sparst ${formatCents(save)}`,
    tooltip: `${input.units} × ${formatCents(single)} = ${formatCents(total)} − ${formatCents(input.priceCents)} = ${formatCents(save)}`,
  };
}

export function passCheckoutSummary(input: {
  name: string;
  units: number;
  validityRule: 'months' | 'years_to_year_end';
  validityValue: number;
}): string {
  const units = input.units === 1 ? '1 Termin' : `${input.units} Termine`;
  const validity =
    input.validityRule === 'months'
      ? input.validityValue === 1
        ? 'gültig 1 Monat ab heute'
        : `gültig ${input.validityValue} Monate ab heute`
      : input.validityValue === 1
        ? 'gültig bis Jahresende + 1 Jahr'
        : `gültig bis Jahresende + ${input.validityValue} Jahre`;
  return `${input.name} · ${units} · ${validity}`;
}

export function passSuccessHeadline(name: string): string {
  return `Deine ${name} ist bereit`;
}

/** Wertersatz kaufmännisch auf die Summe (wie SQL pass_wertersatz_cents). */
export function passWertersatzCents(
  priceCents: number,
  units: number,
  used: number,
): number {
  if (units <= 0 || used <= 0) return 0;
  if (used >= units) return Math.max(0, priceCents);
  return Math.round((priceCents * used) / units);
}

export function passWithdrawalCalcLine(input: {
  priceCents: number;
  unitsTotal: number;
  unitsUsed: number;
}): string {
  const wertersatz = passWertersatzCents(
    input.priceCents,
    input.unitsTotal,
    input.unitsUsed,
  );
  const refund = Math.max(input.priceCents - wertersatz, 0);
  const perUnit =
    input.unitsTotal > 0 ? Math.round(input.priceCents / input.unitsTotal) : 0;
  if (input.unitsUsed === 0) {
    return `Erstattung: ${formatCents(input.priceCents)} − 0 genutzte Termine = ${formatCents(refund)}`;
  }
  return (
    `Erstattung: ${formatCents(input.priceCents)} − ${input.unitsUsed} genutzte Termine × ` +
    `${formatCents(perUnit)} = ${formatCents(refund)}`
  );
}

export function passWithdrawalDeadlineLabel(deadlineIso: string): string {
  const d = new Date(deadlineIso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function passWithdrawalLinkHint(deadlineIso: string): string {
  const label = passWithdrawalDeadlineLabel(deadlineIso);
  return label ? `bis ${label} möglich` : 'innerhalb von 14 Tagen möglich';
}

export function coursePassSavingsHint(input: {
  passName: string;
  passPriceCents: number;
  passUnits: number;
  coursePriceEuros: number;
}): string | null {
  if (input.passUnits < 1) return null;
  const perPass = Math.round(input.passPriceCents / input.passUnits);
  const courseCents = Math.round(input.coursePriceEuros * 100);
  if (perPass >= courseCents) return null;
  return `Mit der ${input.passName} zahlst du ${formatCents(perPass)} statt ${formatCents(courseCents)} ›`;
}

export function onlinePassSwitchBlockReason(input: {
  onlineReady: boolean;
  priceCents: number | null;
  limitCents: number;
}): string | null {
  if (!input.onlineReady) {
    return 'Online-Zahlung ist noch nicht bereit.';
  }
  if (input.priceCents != null && input.priceCents > input.limitCents) {
    return 'Online kaufbar nur bis 250 €.';
  }
  return null;
}
