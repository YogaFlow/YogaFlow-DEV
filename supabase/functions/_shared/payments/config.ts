import { ProviderError } from "./port.ts";

export type PaymentsMode = "test" | "live";

/** Deno.env erfüllt diese Form; Tests reichen ein eigenes Objekt. */
export interface PaymentsEnv {
  get(key: string): string | undefined;
}

export function envFromRecord(values: Record<string, string | undefined>): PaymentsEnv {
  return { get: (key) => values[key] };
}

/** PAYMENTS_MODE muss `test` oder `live` sein, sonst CONFIG_ERROR. */
export function readPaymentsMode(env: PaymentsEnv): PaymentsMode {
  const raw = env.get("PAYMENTS_MODE")?.trim();
  if (raw === "test" || raw === "live") return raw;
  throw new ProviderError("CONFIG_ERROR", "PAYMENTS_MODE");
}
