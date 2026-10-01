/**
 * Einzige Stelle, an der das Stripe-SDK importiert wird. Version und API-Version
 * sind fest gepinnt; ein Update ändert beide Konstanten und den Import gemeinsam.
 *
 * Quelle (28.09.2026): npm-Registry `stripe` dist-tag latest = 22.6.2;
 * `Stripe.API_VERSION` dieses Pakets = 2026-08-26.dahlia, neueste stabile Version
 * laut https://docs.stripe.com/changelog.
 */
import Stripe from "npm:stripe@22.6.2";

import type { PaymentsMode } from "../config.ts";
import { ProviderError } from "../port.ts";

export { Stripe };

export const STRIPE_SDK_VERSION = "22.6.2";
export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

/** Edge Functions: 150 s Wall-clock (docs/EDGE_FUNCTION_RUNTIME_0.3.md). 3 × 20 s bleibt darunter. */
export const STRIPE_TIMEOUT_MS = 20_000;
export const STRIPE_MAX_NETWORK_RETRIES = 2;

const KEY_PREFIX: Record<PaymentsMode, RegExp> = {
  test: /^(sk|rk)_test_/,
  live: /^(sk|rk)_live_/,
};

export interface StripeClientConfig {
  secretKey: string | undefined;
  mode: PaymentsMode;
  /** Nur für Tests: ersetzt fetch, damit kein Netzwerk erreicht wird. */
  fetchFn?: typeof fetch;
}

/** Wirft CONFIG_ERROR, bevor irgendeine Anfrage an Stripe möglich ist. */
export function assertKeyMatchesMode(secretKey: string | undefined, mode: PaymentsMode): string {
  const key = secretKey?.trim();
  if (!key) throw new ProviderError("CONFIG_ERROR", "STRIPE_SECRET_KEY");
  if (!KEY_PREFIX[mode].test(key)) {
    throw new ProviderError("CONFIG_ERROR", "STRIPE_SECRET_KEY_MODE");
  }
  return key;
}

export function createStripeClient(config: StripeClientConfig): Stripe {
  const key = assertKeyMatchesMode(config.secretKey, config.mode);
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(config.fetchFn),
    maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES,
    timeout: STRIPE_TIMEOUT_MS,
  });
}

export const subtleCryptoProvider = Stripe.createSubtleCryptoProvider();

/** Übersetzt SDK-Fehler in ProviderError. Die Meldung des SDK wird verworfen. */
export function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
    return new ProviderError("INVALID_SIGNATURE", err.type);
  }
  if (err instanceof Stripe.errors.StripeError) {
    const detail = err.code ? `${err.type}/${err.code}` : err.type;
    switch (err.type) {
      case "StripeAuthenticationError":
      case "StripePermissionError":
        return new ProviderError("CONFIG_ERROR", detail);
      case "StripeInvalidRequestError":
      case "StripeCardError":
      case "StripeIdempotencyError":
        return new ProviderError("PROVIDER_REJECTED", detail);
      default:
        return new ProviderError("PROVIDER_UNAVAILABLE", detail);
    }
  }
  return new ProviderError("PROVIDER_UNAVAILABLE");
}

/**
 * Fehler-Mapping für Zahlungsaufrufe (Port: PaymentProviderError-Codes).
 * Keine Stripe-Meldungstexte nach außen.
 */
export function toPaymentError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Stripe.errors.StripeRateLimitError) {
    return new ProviderError("RATE_LIMITED", err.type);
  }
  if (err instanceof Stripe.errors.StripeCardError) {
    const detail = err.code ? `${err.type}/${err.code}` : err.type;
    if (err.code === "authentication_required") {
      return new ProviderError("AUTHENTICATION_REQUIRED", detail);
    }
    return new ProviderError("CARD_DECLINED", detail);
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    const detail = err.code ? `${err.type}/${err.code}` : err.type;
    if (err.code === "resource_missing") {
      return new ProviderError("NOT_FOUND", detail);
    }
    return new ProviderError("INVALID_REQUEST", detail);
  }
  if (err instanceof Stripe.errors.StripeError) {
    const detail = err.code ? `${err.type}/${err.code}` : err.type;
    switch (err.type) {
      case "StripeAuthenticationError":
      case "StripePermissionError":
        return new ProviderError("CONFIG_ERROR", detail);
      case "StripeIdempotencyError":
        return new ProviderError("INVALID_REQUEST", detail);
      default:
        return new ProviderError("PROVIDER_UNAVAILABLE", detail);
    }
  }
  return new ProviderError("PROVIDER_UNAVAILABLE");
}
