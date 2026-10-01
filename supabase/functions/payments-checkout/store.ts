/**
 * Service-RPCs und Lesen für payments-checkout (2.2a-3).
 * Alle Aufrufe mit service_role (RPCs nur dafür freigegeben).
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type {
  AttemptStatusView,
  AttachResult,
  CheckResult,
  CheckoutStore,
  CompleteResult,
  MarkFailedResult,
  PrepareResult,
} from "./handler.ts";

class StoreError extends Error {
  constructor(operation: string) {
    super(`DB_ERROR ${operation}`);
    this.name = "StoreError";
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asRpcObject(data: unknown, operation: string): Record<string, unknown> {
  if (!isObject(data)) throw new StoreError(operation);
  return data;
}

export function createCheckoutStore(serviceClient: SupabaseClient): CheckoutStore {
  return {
    async prepareOnlinePayment(registrationId, userId): Promise<PrepareResult> {
      const { data, error } = await serviceClient.rpc("prepare_online_payment", {
        p_registration_id: registrationId,
        p_user_id: userId,
      });
      if (error) throw new StoreError("prepare_online_payment");
      const row = asRpcObject(data, "prepare_online_payment");
      if (row.success !== true) {
        return { ok: false, code: typeof row.error === "string" ? row.error : "INVALID_REQUEST" };
      }
      return {
        ok: true,
        attemptId: String(row.attempt_id),
        amountCents: Number(row.amount_cents),
        currency: String(row.currency ?? "EUR").toUpperCase() === "EUR" ? "EUR" : String(row.currency),
        accountRef: typeof row.account_ref === "string" ? row.account_ref : "",
        providerRef: typeof row.provider_ref === "string" ? row.provider_ref : null,
        holdExpiresAt: typeof row.hold_expires_at === "string" ? row.hold_expires_at : "",
        livemode: row.livemode === true,
        registrationId,
      };
    },

    async attachPaymentRef(attemptId, providerRef): Promise<AttachResult> {
      const { data, error } = await serviceClient.rpc("attach_payment_ref", {
        p_attempt_id: attemptId,
        p_provider_ref: providerRef,
      });
      if (error) throw new StoreError("attach_payment_ref");
      const row = asRpcObject(data, "attach_payment_ref");
      if (row.success !== true) {
        return { ok: false, code: typeof row.error === "string" ? row.error : "INVALID_REQUEST" };
      }
      return { ok: true, providerRef: String(row.provider_ref ?? providerRef) };
    },

    async checkBeforeConfirm(attemptId, userId): Promise<CheckResult> {
      const { data, error } = await serviceClient.rpc("check_before_confirm", {
        p_attempt_id: attemptId,
        p_user_id: userId,
      });
      if (error) throw new StoreError("check_before_confirm");
      const row = asRpcObject(data, "check_before_confirm");
      if (row.success !== true) {
        return { ok: false, code: typeof row.error === "string" ? row.error : "INVALID_REQUEST" };
      }
      return { ok: true };
    },

    async completeOnlinePayment(input): Promise<CompleteResult> {
      const { data, error } = await serviceClient.rpc("complete_online_payment", {
        p_provider_ref: input.providerRef,
        p_amount_cents: input.amountCents,
        p_currency: input.currency,
        p_received_at: input.receivedAt,
        p_livemode: input.livemode,
      });
      if (error) throw new StoreError("complete_online_payment");
      const row = asRpcObject(data, "complete_online_payment");
      if (row.success !== true) {
        return { ok: false, code: typeof row.error === "string" ? row.error : "INVALID_REQUEST" };
      }
      return { ok: true, code: typeof row.code === "string" ? row.code : null };
    },

    async markOnlinePaymentFailed(providerRef, failureCode): Promise<MarkFailedResult> {
      const { data, error } = await serviceClient.rpc("mark_online_payment_failed", {
        p_provider_ref: providerRef,
        p_failure_code: failureCode,
      });
      if (error) throw new StoreError("mark_online_payment_failed");
      const row = asRpcObject(data, "mark_online_payment_failed");
      if (row.success !== true) {
        return { ok: false, code: typeof row.error === "string" ? row.error : "INVALID_REQUEST" };
      }
      return { ok: true };
    },

    async getAttemptForMember(attemptId, memberId, tenantId): Promise<AttemptStatusView | null> {
      const { data: attempt, error: aErr } = await serviceClient
        .from("payment_attempts")
        .select("id, provider_ref, status, amount_cents, currency, livemode, registration_id, tenant_id")
        .eq("id", attemptId)
        .maybeSingle();
      if (aErr) throw new StoreError("get_attempt");
      if (!isObject(attempt)) return null;
      if (attempt.tenant_id !== tenantId) return null;

      const { data: reg, error: rErr } = await serviceClient
        .from("registrations")
        .select("id, user_id, status, tenant_id")
        .eq("id", attempt.registration_id)
        .maybeSingle();
      if (rErr) throw new StoreError("get_registration");
      if (!isObject(reg)) return null;
      if (reg.user_id !== memberId || reg.tenant_id !== tenantId) return null;

      const { data: account, error: accErr } = await serviceClient
        .from("provider_accounts")
        .select("provider_ref")
        .eq("tenant_id", tenantId)
        .eq("provider", "stripe")
        .is("disconnected_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (accErr) throw new StoreError("get_provider_account");

      return {
        attemptId: String(attempt.id),
        registrationId: String(reg.id),
        providerRef: typeof attempt.provider_ref === "string" ? attempt.provider_ref : null,
        attemptStatus: String(attempt.status),
        registrationStatus: String(reg.status),
        amountCents: Number(attempt.amount_cents),
        currency: String(attempt.currency ?? "EUR").toUpperCase() === "EUR" ? "EUR" : String(attempt.currency),
        livemode: attempt.livemode === true,
        accountRef: typeof account?.provider_ref === "string" ? account.provider_ref : null,
      };
    },
  };
}
