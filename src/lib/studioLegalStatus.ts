/**
 * RT-1 — reine Status-/Pillen-Logik (ohne Supabase, unit-testbar).
 */

export type StudioLegalPillStatus =
  | 'missing'
  | 'release'
  | 'current'
  | 'new_template'
  | 'change_release';

export type StudioLegalVersionTrigger = 'release' | 'settings_change' | 'profile_change';

/**
 * Freigabe-Pille für AGB (Abgleich mit get_studio_legal_status).
 * Vorlage neu → new_template; Weitere Regeln geändert → change_release;
 * nur Einstellung → current (keine neue Freigabe).
 */
export function computeTermsPillStatus(input: {
  imprintComplete: boolean;
  hasAcceptance: boolean;
  templateCurrent: boolean;
  extraRulesChangedSinceRelease: boolean;
}): StudioLegalPillStatus {
  if (!input.hasAcceptance) {
    return input.imprintComplete ? 'release' : 'missing';
  }
  if (!input.templateCurrent) return 'new_template';
  if (input.extraRulesChangedSinceRelease) return 'change_release';
  return 'current';
}

function formatPillDate(createdAt: string, withTime: boolean): string | null {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}

/** Übersichtszeile: Fehlt / Freigeben / Aktuell · Datum / Neue Vorlage / Änderung freigeben */
export function pillLabelShort(status: StudioLegalPillStatus, createdAt: string | null): string {
  switch (status) {
    case 'missing':
      return 'Fehlt';
    case 'release':
      return 'Freigeben';
    case 'change_release':
      return 'Änderung freigeben';
    case 'new_template':
      return 'Neue Vorlage';
    case 'current': {
      if (!createdAt) return 'Aktuell';
      const label = formatPillDate(createdAt, false);
      return label ? `Aktuell · ${label}` : 'Aktuell';
    }
    default:
      return 'Fehlt';
  }
}

/** Detail-Statuskarte / bisherige Pille */
export function pillLabel(status: StudioLegalPillStatus, createdAt: string | null): string {
  switch (status) {
    case 'missing':
      return 'Fehlt';
    case 'release':
      return 'Freigeben';
    case 'change_release':
      return 'Änderung freigeben';
    case 'new_template':
      return 'Neue Vorlage verfügbar';
    case 'current': {
      if (!createdAt) return 'Aktuell';
      const label = formatPillDate(createdAt, false);
      return label ? `Aktuell · Fassung vom ${label}` : 'Aktuell';
    }
    default:
      return 'Fehlt';
  }
}

/** Statuskarte Detail: „Aktuell · Fassung vom 5. Okt 2026, 14:12“ */
export function statusCardLabel(status: StudioLegalPillStatus, createdAt: string | null): string {
  if (status === 'current' && createdAt) {
    const label = formatPillDate(createdAt, true);
    return label ? `Aktuell · Fassung vom ${label}` : 'Aktuell';
  }
  return pillLabel(status, createdAt);
}

export function legalVersionTriggerLabel(
  trigger: StudioLegalVersionTrigger,
  values: Record<string, unknown>,
  prevValues: Record<string, unknown> | null,
): string {
  if (trigger === 'release') return 'Freigegeben';
  if (prevValues) {
    const extraNow = String(values.extra_rules ?? '');
    const extraPrev = String(prevValues.extra_rules ?? '');
    if (extraNow !== extraPrev) return 'Weitere Regeln geändert';
    const cancelNow = String(values.cancellation_hours ?? '');
    const cancelPrev = String(prevValues.cancellation_hours ?? '');
    if (cancelNow !== cancelPrev) return 'Stornofrist geändert';
  }
  if (trigger === 'profile_change') return 'Impressum geändert';
  return 'Einstellungen geändert';
}
