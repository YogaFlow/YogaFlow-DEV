import type { StudioUpdate, UpdateShowIf } from '../content/updates.ts';
import { STUDIO_UPDATES } from '../content/updates.ts';

export type StudioUpdateContext = {
  onlinePaymentsActive: boolean;
  hasPassProducts: boolean;
  allowOnsitePayment: boolean;
  studioName: string;
};

const READ_PREFIX = 'omlify:updates_read:';
const SENT_PREFIX = 'omlify:updates_sent:';

export type SentHint = { at: string; count: number };

function readKey(tenantId: string, userId: string): string {
  return `${READ_PREFIX}${tenantId}:${userId}`;
}

function sentKey(tenantId: string, userId: string): string {
  return `${SENT_PREFIX}${tenantId}:${userId}`;
}

/** Ersetzt nur `{studio}` — keine Vornamen in Rundnachrichten. */
export function applyStudioPlaceholder(text: string, studioName: string): string {
  return text.split('{studio}').join(studioName);
}

export function matchesShowIf(showIf: UpdateShowIf, ctx: StudioUpdateContext): boolean {
  if (showIf === 'always') return true;
  if (showIf === 'onlinePaymentsActive') return ctx.onlinePaymentsActive;
  if (showIf === 'hasPassProducts') return ctx.hasPassProducts;
  return false;
}

export function visibleUpdates(ctx: StudioUpdateContext): StudioUpdate[] {
  return STUDIO_UPDATES.filter((u) => matchesShowIf(u.showIf, ctx)).slice().sort((a, b) => {
    if (a.date === b.date) return b.id.localeCompare(a.id);
    return b.date.localeCompare(a.date);
  });
}

export function participantDraft(
  update: StudioUpdate,
  ctx: StudioUpdateContext,
): { title: string; body: string } | null {
  if (!update.participantMessage) return null;
  if (update.participantMessageIf === 'hasPassProducts' && !ctx.hasPassProducts) {
    return null;
  }
  const title = applyStudioPlaceholder(update.participantMessage.title, ctx.studioName);
  let body = applyStudioPlaceholder(update.participantMessage.body, ctx.studioName);
  if (update.participantMessage.onsiteSuffix && ctx.allowOnsitePayment) {
    body += update.participantMessage.onsiteSuffix;
  }
  return { title, body };
}

export function canOfferParticipantSend(
  update: StudioUpdate,
  ctx: StudioUpdateContext,
): boolean {
  return participantDraft(update, ctx) != null;
}

export function readReadIds(tenantId: string, userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(readKey(tenantId, userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function writeReadIds(tenantId: string, userId: string, ids: Iterable<string>): void {
  try {
    localStorage.setItem(readKey(tenantId, userId), JSON.stringify([...ids]));
  } catch {
    // private mode / quota
  }
}

export function markUpdatesRead(
  tenantId: string,
  userId: string,
  visibleIds: string[],
): void {
  const next = readReadIds(tenantId, userId);
  for (const id of visibleIds) next.add(id);
  writeReadIds(tenantId, userId, next);
}

export function countUnreadUpdates(
  tenantId: string,
  userId: string,
  visible: StudioUpdate[],
): number {
  const read = readReadIds(tenantId, userId);
  return visible.filter((u) => !read.has(u.id)).length;
}

export function readSentHints(
  tenantId: string,
  userId: string,
): Record<string, SentHint> {
  try {
    const raw = localStorage.getItem(sentKey(tenantId, userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SentHint>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export function writeSentHint(
  tenantId: string,
  userId: string,
  updateId: string,
  count: number,
): void {
  try {
    const map = readSentHints(tenantId, userId);
    map[updateId] = { at: new Date().toISOString(), count };
    localStorage.setItem(sentKey(tenantId, userId), JSON.stringify(map));
  } catch {
    // ignore
  }
}

export const BODY_MAX_LEN = 2000;
export const TITLE_MAX_LEN = 120;
