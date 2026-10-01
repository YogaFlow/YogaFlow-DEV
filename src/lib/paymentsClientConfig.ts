/**
 * Z8: Publishable Key nur mit passendem VITE_PAYMENTS_MODE.
 * Nie den Key-Wert loggen.
 */

export type PaymentsMode = 'test' | 'live';

export type PaymentsClientConfig = {
  mode: PaymentsMode | null;
  publishableKey: string | null;
  enabled: boolean;
  reason: 'MODE_MISSING' | 'KEY_MISSING' | 'KEY_MODE_MISMATCH' | null;
};

/** Reine Auswertung — für Unit-Tests und für paymentsClientConfig(). */
export function resolvePaymentsClientConfig(
  modeRaw: string,
  keyRaw: string,
): PaymentsClientConfig {
  const modeRawTrim = modeRaw.trim();
  const key = keyRaw.trim();

  const mode: PaymentsMode | null =
    modeRawTrim === 'test' || modeRawTrim === 'live' ? modeRawTrim : null;

  if (!mode) {
    return {
      mode: null,
      publishableKey: null,
      enabled: false,
      reason: 'MODE_MISSING',
    };
  }

  if (!key) {
    return {
      mode,
      publishableKey: null,
      enabled: false,
      reason: 'KEY_MISSING',
    };
  }

  const prefixOk =
    (mode === 'test' && key.startsWith('pk_test_')) ||
    (mode === 'live' && key.startsWith('pk_live_'));

  if (!prefixOk) {
    return {
      mode,
      publishableKey: null,
      enabled: false,
      reason: 'KEY_MODE_MISMATCH',
    };
  }

  return {
    mode,
    publishableKey: key,
    enabled: true,
    reason: null,
  };
}

export function paymentsClientConfig(): PaymentsClientConfig {
  const modeRaw =
    (import.meta.env.VITE_PAYMENTS_MODE as string | undefined) ?? '';
  const key =
    (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined) ?? '';
  const config = resolvePaymentsClientConfig(modeRaw, key);

  if (!config.enabled) {
    if (config.reason === 'MODE_MISSING' && (modeRaw.trim() || key.trim())) {
      console.error(
        '[payments] VITE_PAYMENTS_MODE fehlt oder ungültig — Bezahlen aus.',
      );
    } else if (config.reason === 'KEY_MISSING') {
      console.error('[payments] VITE_STRIPE_PUBLISHABLE_KEY fehlt — Bezahlen aus.');
    } else if (config.reason === 'KEY_MODE_MISMATCH') {
      console.error(
        `[payments] Key passt nicht zu VITE_PAYMENTS_MODE=${config.mode} — Bezahlen aus.`,
      );
    }
  }

  return config;
}
