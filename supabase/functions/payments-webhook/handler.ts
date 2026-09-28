/**
 * Webhook-Empfang (Geldkette 1.4). Reine Logik, alle Abhängigkeiten injiziert,
 * damit die Tests ohne Netzwerk laufen. Einstieg für Deno.serve: index.ts.
 *
 * Ablauf (Nachtrag 5c, W1–W7): prüfen → speichern → verarbeiten.
 * - Ungültige Signatur oder falscher Modus → 400, nichts gespeichert.
 * - 500 nur bei vorübergehenden Fehlern (Datenbank, Anbieter), damit Stripe erneut zustellt.
 * - Alles andere → 200, auch ignorierte Typen und fachliche Fehler.
 *
 * Geloggt werden nur Event-Typ, Event-ID und Ergebnis-Code. Nie Payload,
 * Signatur, Secrets oder Kontodaten.
 */
import { type PaymentsEnv, readPaymentsMode } from "../_shared/payments/config.ts";
import {
  type PaymentProvider,
  type ProviderAccountState,
  ProviderError,
  type ProviderEvent,
  type ProviderId,
} from "../_shared/payments/port.ts";

export const MAX_BODY_BYTES = 1024 * 1024;

const ERROR_CODE_RE = /^[A-Z_]{3,64}$/;

export interface WebhookLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface RecordEventInput {
  provider: ProviderId;
  eventId: string;
  eventType: string;
  accountRef: string | null;
  livemode: boolean;
  payload: unknown;
}

export type RecordEventResult =
  | { ok: true; id: string; tenantId: string | null; duplicate: boolean; alreadyProcessed: boolean }
  | { ok: false; code: string };

export type UpsertAccountResult = { ok: true } | { ok: false; code: string };
export type MarkDisconnectedResult = { ok: true; changed: boolean } | { ok: false; code: string };

/** Jede Methode wirft bei vorübergehenden Fehlern (Datenbank nicht erreichbar). */
export interface WebhookStore {
  recordEvent(input: RecordEventInput): Promise<RecordEventResult>;
  markProcessed(id: string, errorCode: string | null): Promise<void>;
  markFailed(id: string): Promise<void>;
  upsertAccount(tenantId: string, provider: ProviderId, state: ProviderAccountState): Promise<UpsertAccountResult>;
  markDisconnected(provider: ProviderId, accountRef: string): Promise<MarkDisconnectedResult>;
}

export interface WebhookDeps {
  /** PAYMENTS_MODE, STRIPE_WEBHOOK_SECRET, optional _2 und _THIN. */
  env: PaymentsEnv;
  /** Wirft bei fehlender Konfiguration. */
  getProvider: () => PaymentProvider;
  /** Wirft bei fehlender Konfiguration. */
  getStore: () => WebhookStore;
  log: WebhookLogger;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const received = () => json(200, { received: true });
const failure = (status: number, code: string) => json(status, { code });

/**
 * Gesetzte Webhook-Secrets in fester Reihenfolge.
 * `_2` für Snapshot-Rotation, `_THIN` für das zweite Stripe-Ziel (Thin-Nutzlast).
 */
export function readWebhookSecrets(env: PaymentsEnv): string[] {
  return ["STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET_2", "STRIPE_WEBHOOK_SECRET_THIN"]
    .map((key) => env.get(key)?.trim() ?? "")
    .filter((value) => value !== "");
}

/** null = Body größer als `max` Bytes. */
async function readBodyLimited(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

type VerifyOutcome = { ok: true; event: ProviderEvent } | { ok: false; code: string };

async function verifyWithAnySecret(
  provider: PaymentProvider,
  rawBody: string,
  signature: string,
  secrets: string[],
): Promise<VerifyOutcome> {
  for (const secret of secrets) {
    try {
      return { ok: true, event: await provider.verifyWebhook(rawBody, signature, secret) };
    } catch (err) {
      if (err instanceof ProviderError && err.code === "INVALID_SIGNATURE") continue;
      if (err instanceof ProviderError) return { ok: false, code: err.code };
      return { ok: false, code: "INVALID_SIGNATURE" };
    }
  }
  return { ok: false, code: "INVALID_SIGNATURE" };
}

export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  const { log } = deps;
  const logResult = (result: string, event?: ProviderEvent) =>
    log.info("payments-webhook", { type: event?.type ?? null, event_id: event?.id ?? null, result });

  if (req.method !== "POST") return failure(405, "METHOD_NOT_ALLOWED");

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    logResult("PAYLOAD_TOO_LARGE");
    return failure(413, "PAYLOAD_TOO_LARGE");
  }

  let mode: "test" | "live";
  let provider: PaymentProvider;
  let store: WebhookStore;
  const secrets = readWebhookSecrets(deps.env);
  try {
    mode = readPaymentsMode(deps.env);
    if (secrets.length === 0) throw new ProviderError("CONFIG_ERROR", "STRIPE_WEBHOOK_SECRET");
    if (secrets.some((s) => !s.startsWith("whsec_"))) {
      throw new ProviderError("CONFIG_ERROR", "STRIPE_WEBHOOK_SECRET_FORMAT");
    }
    provider = deps.getProvider();
    store = deps.getStore();
  } catch {
    log.error("payments-webhook", { result: "CONFIG_ERROR" });
    return failure(500, "CONFIG_ERROR");
  }

  const signature = req.headers.get("stripe-signature")?.trim() ?? "";
  if (!signature) {
    logResult("MISSING_SIGNATURE");
    return failure(400, "MISSING_SIGNATURE");
  }

  const rawBody = await readBodyLimited(req, MAX_BODY_BYTES);
  if (rawBody === null) {
    logResult("PAYLOAD_TOO_LARGE");
    return failure(413, "PAYLOAD_TOO_LARGE");
  }

  const verified = await verifyWithAnySecret(provider, rawBody, signature, secrets);
  if (!verified.ok) {
    logResult(verified.code);
    return failure(verified.code === "CONFIG_ERROR" ? 500 : 400, verified.code);
  }
  const event = verified.event;

  if (event.livemode !== (mode === "live")) {
    logResult("LIVEMODE_MISMATCH", event);
    return failure(400, "LIVEMODE_MISMATCH");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logResult("INVALID_EVENT", event);
    return failure(400, "INVALID_EVENT");
  }

  let record: RecordEventResult;
  try {
    record = await store.recordEvent({
      provider: provider.id,
      eventId: event.id,
      eventType: event.type,
      accountRef: event.accountRef,
      livemode: event.livemode,
      payload,
    });
  } catch {
    logResult("DB_ERROR", event);
    return failure(500, "DB_ERROR");
  }

  if (!record.ok) {
    // FORBIDDEN heißt: die Function spricht nicht als service_role.
    if (record.code === "FORBIDDEN") {
      logResult("CONFIG_ERROR", event);
      return failure(500, "CONFIG_ERROR");
    }
    logResult(record.code, event);
    return received();
  }

  if (record.alreadyProcessed) {
    logResult("ALREADY_PROCESSED", event);
    return received();
  }

  const recordId = record.id;
  const failTransient = async (code: string) => {
    try {
      await store.markFailed(recordId);
    } catch {
      logResult("DB_ERROR", event);
    }
    logResult(code, event);
    return failure(500, code);
  };

  let processingError: string | null = null;

  let domain: ReturnType<PaymentProvider["toDomainEvent"]> = null;
  try {
    domain = provider.toDomainEvent(event);
  } catch (err) {
    processingError = err instanceof ProviderError ? err.code : "INVALID_EVENT";
  }

  if (domain?.type === "provider_account.updated") {
    if (record.tenantId === null) {
      processingError = "TENANT_NOT_RESOLVED";
    } else {
      let state: ProviderAccountState | null = null;
      try {
        // W3: Stand beim Anbieter nachlesen, nicht aus dem Event übernehmen.
        state = await provider.getAccountState(domain.accountRef);
      } catch (err) {
        if (err instanceof ProviderError && err.code === "PROVIDER_REJECTED") {
          processingError = "PROVIDER_REJECTED";
        } else {
          return await failTransient("PROVIDER_UNAVAILABLE");
        }
      }

      if (state) {
        let upsert: UpsertAccountResult;
        try {
          upsert = await store.upsertAccount(record.tenantId, provider.id, state);
        } catch {
          return await failTransient("DB_ERROR");
        }
        if (!upsert.ok) {
          processingError = ERROR_CODE_RE.test(upsert.code) ? upsert.code : "UPSERT_FAILED";
        }
      }
    }
  } else if (domain?.type === "provider_account.disconnected") {
    let marked: MarkDisconnectedResult;
    try {
      marked = await store.markDisconnected(provider.id, domain.accountRef);
    } catch {
      return await failTransient("DB_ERROR");
    }
    if (!marked.ok) {
      processingError = ERROR_CODE_RE.test(marked.code) ? marked.code : "DISCONNECT_FAILED";
    }
  }

  try {
    await store.markProcessed(recordId, processingError);
  } catch {
    logResult("DB_ERROR", event);
    return failure(500, "DB_ERROR");
  }

  logResult(processingError ?? (record.duplicate ? "REPROCESSED" : "PROCESSED"), event);
  return received();
}
