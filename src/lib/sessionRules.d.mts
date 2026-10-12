export const SIGNED_OUT_MESSAGE: string;

export const FORCED_SIGN_OUT_STORAGE_KEY: string;

export const FORCED_SIGN_OUT_LOOP_KEY: string;

export const FORCED_SIGN_OUT_TTL_MS: number;

export const FORCED_SIGN_OUT_LOOP_MS: number;

export type SessionErrorSource = 'auth_user' | 'function' | 'postgrest' | 'network' | 'unknown';

export type SessionErrorInput = {
  status?: number | null;
  code?: string | null;
  message?: string | null;
  source?: SessionErrorSource | string | null;
};

export type ForcedSignOutIntent = {
  next: string | null;
  sessionId: string | null;
  at: number;
};

export type ForcedSignOutAction =
  | 'none'
  | 'expired'
  | 'await_login'
  | 'clear_stale'
  | 'accept_new';

export function fieldsFromErrorBody(text: string): { code: string | null; message: string | null };

export function sessionFailureFromInvokeError(
  error: unknown,
  bodyText?: string | null,
): SessionErrorInput & { source: 'function' };

export function isSessionError(input: SessionErrorInput): boolean;

export function safeReturnPath(input: string | null | undefined): string | null;

export function loginSearchForReturn(currentPath: string): string;

export function forcedSignOutAuthPath(currentPath: string): string;

export function sessionIdFromAccessToken(token: string | null | undefined): string | null;

export function parseForcedSignOutIntent(
  raw: unknown,
  now?: number,
): ForcedSignOutIntent | null;

export function decideForcedSignOutAction(
  intent: ForcedSignOutIntent | null | undefined,
  currentSessionId: string | null | undefined,
  now?: number,
): ForcedSignOutAction;

export function persistForcedSignOut(
  payload: { next?: string | null; sessionId?: string | null },
  now?: number,
): void;

export function readForcedSignOutIntent(now?: number): ForcedSignOutIntent | null;

export function clearForcedSignOutStorage(): void;

export function recordForcedSignOutLoopClock(now?: number): void;

export function isForcedSignOutLoop(lastAt: number | null | undefined, now?: number): boolean;

export function shouldBlockForcedSignOutLoop(now?: number): boolean;

export function clearForcedSignOutLoopClock(): void;

export function markVoluntarySignOut(): void;

export function consumeVoluntarySignOut(): boolean;

export function isVoluntarySignOutPending(): boolean;

export function claimForcedSignOut(): boolean;

export function resetForcedSignOutForTests(): void;

export function runForcedSignOutOnce(action: () => void | Promise<void>): Promise<boolean>;
