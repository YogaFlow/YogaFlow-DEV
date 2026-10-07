export type SettingsCategoryId = 'studio' | 'buchungen' | 'zahlungen' | 'karten' | 'team' | 'rechtliches';

export type SettingsCategory = {
  id: SettingsCategoryId;
  title: string;
  to: string;
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'studio', title: 'Studio', to: '/settings/studio' },
  { id: 'buchungen', title: 'Buchungen', to: '/settings/buchungen' },
  { id: 'zahlungen', title: 'Zahlungen', to: '/settings/zahlungen' },
  { id: 'karten', title: 'Mehrfachkarten', to: '/settings/karten' },
  { id: 'team', title: 'Team', to: '/settings/team' },
  { id: 'rechtliches', title: 'Rechtliches', to: '/settings/rechtliches' },
];

export function parseSettingsCategory(raw: string | null | undefined): SettingsCategoryId | null {
  if (
    raw === 'studio' ||
    raw === 'buchungen' ||
    raw === 'zahlungen' ||
    raw === 'karten' ||
    raw === 'team' ||
    raw === 'rechtliches'
  ) {
    return raw;
  }
  return null;
}

export function studioStatusLine(input: { name: string; hasLogo: boolean }): string {
  const name = input.name.trim() || 'Studio';
  return input.hasLogo ? `${name} · eigenes Logo` : `${name} · ohne Logo`;
}

export function bookingsStatusLine(input: { cancellationWindowHours: number }): string {
  const hours = Number.isFinite(input.cancellationWindowHours)
    ? input.cancellationWindowHours
    : 24;
  return `Stornofrist ${hours} h · Warteliste an`;
}

export function paymentsStatusLine(input: {
  onlineEnabled: boolean;
  taxLabel: string | null;
}): string {
  const online = input.onlineEnabled ? 'Online aktiv' : 'Online aus';
  return input.taxLabel ? `${online} · ${input.taxLabel}` : online;
}

export function cardsStatusLine(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return 'Keine Mehrfachkarten im Angebot';
  return count === 1 ? '1 Mehrfachkarte im Angebot' : `${count} Mehrfachkarten im Angebot`;
}

export function teamStatusLine(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return 'Keine Personen';
  return count === 1 ? '1 Person' : `${count} Personen`;
}

export function legalStatusLine(complete: boolean): string {
  return complete ? 'Anbieterangaben vollständig' : 'Anbieterangaben fehlen';
}

export type SettingsAttention = {
  id: string;
  title: string;
  to: string;
};

export function settingsAttentionItems(input: {
  onlineEnabled: boolean;
  taxPresent: boolean;
  stripeReady: boolean;
  hasAccount: boolean;
  platformEnabled?: boolean;
  legalProfilePresent?: boolean;
  avvAccepted?: boolean;
  imprintComplete?: boolean;
  termsStatus?: 'missing' | 'release' | 'current' | 'new_template' | 'change_release';
  privacyStatus?: 'missing' | 'release' | 'current' | 'new_template' | 'change_release';
}): SettingsAttention[] {
  const items: SettingsAttention[] = [];
  const onlineRelevant = input.onlineEnabled || input.platformEnabled === true;
  if (onlineRelevant && !input.taxPresent) {
    items.push({
      id: 'tax',
      title: 'Steuerstatus fehlt',
      to: '/settings/zahlungen',
    });
  }
  if (onlineRelevant && input.legalProfilePresent === false) {
    items.push({
      id: 'legal',
      title: 'Anbieterangaben fehlen – ohne sie ist keine Online-Zahlung möglich.',
      to: '/settings/rechtliches',
    });
  }
  if (input.imprintComplete === false) {
    items.push({
      id: 'imprint',
      title: 'Impressum unvollständig',
      to: '/settings/rechtliches/impressum',
    });
  }
  if (
    input.termsStatus === 'missing' ||
    input.termsStatus === 'release' ||
    input.termsStatus === 'new_template' ||
    input.termsStatus === 'change_release'
  ) {
    items.push({
      id: 'studio-terms',
      title:
        input.termsStatus === 'new_template'
          ? 'Neue AGB-Vorlage verfügbar'
          : input.termsStatus === 'change_release'
            ? 'AGB-Änderung freigeben'
            : 'AGB nicht freigegeben',
      to: '/settings/rechtliches/agb',
    });
  }
  if (
    input.privacyStatus === 'missing' ||
    input.privacyStatus === 'release' ||
    input.privacyStatus === 'new_template'
  ) {
    items.push({
      id: 'studio-privacy',
      title:
        input.privacyStatus === 'new_template'
          ? 'Neue Datenschutz-Vorlage verfügbar'
          : 'Datenschutz nicht freigegeben',
      to: '/settings/rechtliches/datenschutz',
    });
  }
  if (input.avvAccepted === false) {
    items.push({
      id: 'avv',
      title: 'Bitte bestätige den Vertrag zur Auftragsverarbeitung.',
      to: '/settings/rechtliches',
    });
  }
  if ((input.hasAccount || input.onlineEnabled) && !input.stripeReady) {
    items.push({
      id: 'stripe',
      title: 'Stripe-Konto nicht bereit',
      to: '/settings/zahlungen',
    });
  }
  return items;
}

/** Studio inkl. Kartenhinweis (UX-7) für Owner und Admin; Branding bleibt owner-only in der Sektion. */
export function visibleSettingsCategories(_isOwner: boolean): SettingsCategory[] {
  return SETTINGS_CATEGORIES;
}

export function settingsCategoryTitle(id: SettingsCategoryId): string {
  return SETTINGS_CATEGORIES.find((item) => item.id === id)?.title ?? 'Einstellungen';
}
