/**
 * JobsStore über service_role-RPCs (claim/finish/complete/record).
 * Fehlertexte der DB werden nie weitergereicht.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type {
  CompleteResult,
  JobsStore,
  ProviderJobRow,
  RefundRecordResult,
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

function mapJob(row: Record<string, unknown>): ProviderJobRow {
  return {
    job_id: String(row.job_id),
    kind: String(row.kind),
    tenant_id: String(row.tenant_id),
    account_ref: typeof row.account_ref === "string" ? row.account_ref : null,
    provider_ref: typeof row.provider_ref === "string" ? row.provider_ref : null,
    payment_id: typeof row.payment_id === "string" ? row.payment_id : null,
    amount_cents: typeof row.amount_cents === "number" ? row.amount_cents : null,
  };
}

export function createJobsStore(client: SupabaseClient): JobsStore {
  return {
    async claimJobs(limit) {
      const { data, error } = await client.rpc("claim_provider_jobs", { p_limit: limit });
      if (error) throw new StoreError("claim_provider_jobs");
      const rows = Array.isArray(data) ? data : [];
      return rows.filter(isObject).map(mapJob);
    },

    async finishJob(jobId, outcome, errorCode) {
      const { data, error } = await client.rpc("finish_provider_job", {
        p_job_id: jobId,
        p_outcome: outcome,
        p_error_code: errorCode ?? null,
      });
      if (error) throw new StoreError("finish_provider_job");
      const row = asRpcObject(data, "finish_provider_job");
      if (row.success !== true) throw new StoreError("finish_provider_job");
    },

    async completeOnlinePayment(input): Promise<CompleteResult> {
      const { data, error } = await client.rpc("complete_online_payment", {
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

    async recordOnlineRefund(input): Promise<RefundRecordResult> {
      const { data, error } = await client.rpc("record_online_refund", {
        p_payment_id: input.paymentId,
        p_refund_ref: input.refundRef,
        p_amount_cents: input.amountCents,
        p_received_at: input.receivedAt,
      });
      if (error) throw new StoreError("record_online_refund");
      const row = asRpcObject(data, "record_online_refund");
      if (row.success !== true) {
        return { ok: false, code: typeof row.error === "string" ? row.error : "INVALID_REQUEST" };
      }
      return { ok: true, code: typeof row.code === "string" ? row.code : null };
    },
  };
}
