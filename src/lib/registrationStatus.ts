import type { RegistrationStatus } from '../types';

/**
 * Beschriftung für einen Anmelde-Status. Unbekannte/stornierte Werte
 * bekommen einen neutralen Fallback — kein eigenes Cancelled-UI (A8).
 */
export function labelRegistrationStatus(
  status: RegistrationStatus,
  waitlistPosition?: number | null
): string {
  switch (status) {
    case 'registered':
      return 'Angemeldet';
    case 'waitlist':
      return waitlistPosition
        ? `Warteliste (Pos. ${waitlistPosition})`
        : 'Warteliste';
    case 'cancelled':
      return '—';
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return '—';
    }
  }
}

/** Kurzform ohne „(Pos. n)“ — z. B. mobile Teilnehmerliste. */
export function labelRegistrationStatusShort(
  status: RegistrationStatus,
  waitlistPosition?: number | null
): string {
  switch (status) {
    case 'registered':
      return 'Angemeldet';
    case 'waitlist':
      return waitlistPosition ? `Warteliste ${waitlistPosition}` : 'Warteliste';
    case 'cancelled':
      return '—';
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return '—';
    }
  }
}
