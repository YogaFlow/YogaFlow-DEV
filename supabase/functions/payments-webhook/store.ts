/**
 * WebhookStore über die service_role-RPCs aus 20260928224500_s1_4_webhook_rpcs.sql
 * und upsert_provider_account (1.2a). Kein Nutzer-JWT, kein Tenant-Header (I12).
 *
 * Fehlertexte der Datenbank werden nie weitergereicht: Sie können Werte der
 * Zeile enthalten (z. B. „Failing row contains …“ mit Payload).
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { ProviderAccountState, ProviderId } from "../_shared/payments/port.ts";
import type { RecordEventInput, RecordEventResult, UpsertAccountResult, MarkDisconnectedResult, WebhookStore } from "./handler.ts";

class StoreError extends Error {
  constructor(operation: string) {
    super(`DB_ERROR ${operation}`);
    this.name = "StoreError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function createSupabaseWebhookStore(client: SupabaseClient): WebhookStore {
  return {
    async recordEvent(input: RecordEventInput): Promise<RecordEventResult> {
      const { data, error } = await client.rpc("record_provider_event", {
        p_provider: input.provider,
        p_event_id: input.eventId,
        p_event_type: input.eventType,
        p_account_ref: input.accountRef,
        p_livemode: input.livemode,
        p_payload: input.payload,
      });
      if (error || !isObject(data)) throw new StoreError("record_provider_event");
      if (data.success !== true) {
        return { ok: false, code: typeof data.error === "string" ? data.error : "UNKNOWN" };
      }
      if (typeof data.id !== "string" || typeof data.duplicate !== "boolean" || typeof data.already_processed !== "boolean") {
        throw new StoreError("record_provider_event");
      }
      return {
        ok: true,
        id: data.id,
        tenantId: typeof data.tenant_id === "string" ? data.tenant_id : null,
        duplicate: data.duplicate,
        alreadyProcessed: data.already_processed,
      };
    },

    async markProcessed(id: string, errorCode: string | null): Promise<void> {
      const { error } = await client.rpc("mark_provider_event_processed", { p_id: id, p_error: errorCode });
      if (error) throw new StoreError("mark_provider_event_processed");
    },

    async markFailed(id: string): Promise<void> {
      const { error } = await client.rpc("mark_provider_event_failed", { p_id: id });
      if (error) throw new StoreError("mark_provider_event_failed");
    },

    async upsertAccount(
      tenantId: string,
      provider: ProviderId,
      state: ProviderAccountState,
    ): Promise<UpsertAccountResult> {
      const { data, error } = await client.rpc("upsert_provider_account", {
        p_tenant: tenantId,
        p_provider: provider,
        p_ref: state.ref,
        p_status: state.status,
        p_charges: state.chargesEnabled,
        p_payouts: state.payoutsEnabled,
        p_details: state.detailsSubmitted,
        p_livemode: state.livemode,
        p_capabilities: { card: state.capabilities.card },
        p_requirements_pending: state.requirementsPending,
        p_requirements_due_at: state.requirementsDueAt,
      });
      if (error || !isObject(data)) throw new StoreError("upsert_provider_account");
      if (data.success === true) return { ok: true };
      return { ok: false, code: typeof data.error === "string" ? data.error : "UNKNOWN" };
    },

    async markDisconnected(provider: ProviderId, accountRef: string): Promise<MarkDisconnectedResult> {
      const { data, error } = await client.rpc("mark_provider_account_disconnected", {
        p_provider: provider,
        p_ref: accountRef,
      });
      if (error || !isObject(data)) throw new StoreError("mark_provider_account_disconnected");
      if (data.success === true) {
        return { ok: true, changed: data.changed === true };
      }
      return { ok: false, code: typeof data.error === "string" ? data.error : "UNKNOWN" };
    },
  };
}
