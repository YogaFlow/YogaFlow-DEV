export type SettingsCategoryId = 'studio' | 'buchungen' | 'zahlungen' | 'karten' | 'team';

export type SettingsCategory = {
  id: SettingsCategoryId;
  title: string;
  to: string;
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'studio', title: 'Studio', to: '/settings/studio' },
  { id: 'buchungen', title: 'Buchungen', to: '/settings/buchungen' },
  { id: 'zahlungen', title: 'Zahlungen', to: '/settings/zahlungen' },
  { id: 'karten', title: 'Karten', to: '/settings/karten' },
  { id: 'team', title: 'Team', to: '/settings/team' },
];

export function parseSettingsCategory(raw: string | null | undefined): SettingsCategoryId | null {
  if (
    raw === 'studio' ||
    raw === 'buchungen' ||
    raw === 'zahlungen' ||
    raw === 'karten' ||
    raw === 'team'
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
  if (!Number.isFinite(count) || count <= 0) return 'Keine Karten im Angebot';
  return count === 1 ? '1 Karte im Angebot' : `${count} Karten im Angebot`;
}

export function teamStatusLine(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return 'Keine Personen';
  return count === 1 ? '1 Person' : `${count} Personen`;
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
  if ((input.hasAccount || input.onlineEnabled) && !input.stripeReady) {
    items.push({
      id: 'stripe',
      title: 'Stripe-Konto nicht bereit',
      to: '/settings/zahlungen',
    });
  }
  return items;
}

export function visibleSettingsCategories(isOwner: boolean): SettingsCategory[] {
  return SETTINGS_CATEGORIES.filter((item) => item.id !== 'studio' || isOwner);
}

export function settingsCategoryTitle(id: SettingsCategoryId): string {
  return SETTINGS_CATEGORIES.find((item) => item.id === id)?.title ?? 'Einstellungen';
}
