const STORAGE_PREFIX = 'yogaflow:hidden_conversations:';

type HiddenMap = Record<string, string>;

const storageKey = (userId: string) => `${STORAGE_PREFIX}${userId}`;

const readHiddenMap = (userId: string): HiddenMap => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (raw) return JSON.parse(raw) as HiddenMap;
  } catch {
    // ignore
  }
  return {};
};

const writeHiddenMap = (userId: string, map: HiddenMap) => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {
    // ignore
  }
};

/** Unterhaltung für diesen Nutzer ausblenden (z. B. nach Löschen). */
export function hideConversation(userId: string, conversationKey: string): void {
  if (!userId || !conversationKey) return;
  const map = readHiddenMap(userId);
  map[conversationKey] = new Date().toISOString();
  writeHiddenMap(userId, map);
}

/** Ausgeblendete Unterhaltung wieder anzeigen (z. B. bei neuer Nachricht). */
export function unhideConversation(userId: string, conversationKey: string): void {
  if (!userId || !conversationKey) return;
  const map = readHiddenMap(userId);
  if (!(conversationKey in map)) return;
  delete map[conversationKey];
  writeHiddenMap(userId, map);
}

export function isConversationHidden(
  userId: string,
  conversationKey: string,
  lastMessageAt: Date
): boolean {
  const map = readHiddenMap(userId);
  const hiddenAt = map[conversationKey];
  if (!hiddenAt) return false;
  return lastMessageAt.getTime() <= new Date(hiddenAt).getTime();
}

export function filterHiddenConversations<T extends { key: string; lastMessageAt: Date }>(
  userId: string,
  conversations: T[]
): T[] {
  if (!userId) return conversations;
  return conversations.filter(
    (c) => !isConversationHidden(userId, c.key, c.lastMessageAt)
  );
}
