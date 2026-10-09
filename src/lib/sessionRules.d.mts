export const SIGNED_OUT_MESSAGE: string;

export type SessionErrorSource = 'auth_user' | 'function' | 'postgrest' | 'network' | 'unknown';

export type SessionErrorInput = {
  status?: number | null;
  code?: string | null;
  message?: string | null;
  source?: SessionErrorSource | string | null;
};

export function fieldsFromErrorBody(text: string): { code: string | null; message: string | null };

export function isSessionError(input: SessionErrorInput): boolean;

export function safeReturnPath(input: string | null | undefined): string | null;

export function loginSearchForReturn(currentPath: string): string;

export function markVoluntarySignOut(): void;

export function consumeVoluntarySignOut(): boolean;

export function isVoluntarySignOutPending(): boolean;

export function claimForcedSignOut(): boolean;

export function resetForcedSignOutForTests(): void;

export function runForcedSignOutOnce(action: () => void | Promise<void>): Promise<boolean>;
