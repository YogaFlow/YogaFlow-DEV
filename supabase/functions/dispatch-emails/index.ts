import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createDefaultLog,
  handleDispatchRequest,
  type DeliveryContext,
  type DeliveryRow,
  type DispatchDeps,
} from "./handler.ts";

Deno.serve(async (req: Request) => {
  const log = createDefaultLog();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const deps: DispatchDeps = {
    env: (key) => Deno.env.get(key) ?? undefined,
    log,
    claimDeliveries: async (limit) => {
      const { data, error } = await supabase.rpc("claim_email_deliveries", {
        p_limit: limit,
      });
      if (error) {
        log.error("claim_email_deliveries", { code: error.code ?? "CLAIM_FAILED" });
        throw error;
      }
      return (data ?? []) as DeliveryRow[];
    },
    loadContext: async (registrationId) => {
      const { data: reg, error: re } = await supabase
        .from("registrations")
        .select(
          "id, status, hold_expires_at, user_id, course_id, tenant_id",
        )
        .eq("id", registrationId)
        .maybeSingle();
      if (re || !reg) return null;

      const [{ data: course }, { data: tenant }, { data: user }] = await Promise.all([
        supabase
          .from("courses")
          .select("title, date, time")
          .eq("id", reg.course_id)
          .maybeSingle(),
        supabase.from("tenants").select("name, slug").eq("id", reg.tenant_id).maybeSingle(),
        supabase
          .from("users")
          .select("email, anonymized_at, auth_user_id")
          .eq("id", reg.user_id)
          .maybeSingle(),
      ]);

      const { data: payments } = await supabase
        .from("payments")
        .select("id, amount_cents, reverses_payment_id, provider, status")
        .eq("registration_id", registrationId);

      const rows = Array.isArray(payments) ? payments : [];
      const originals = rows.filter((p) => p && p.reverses_payment_id == null && (p.amount_cents ?? 0) > 0);
      const refunds = rows.filter((p) => p && p.reverses_payment_id != null);
      const original = originals[0] ?? null;
      const hasRefund = refunds.length > 0;
      const originalAmountCents = original ? Number(original.amount_cents) : null;
      const refundAmountCents = hasRefund
        ? Math.abs(Number(refunds[0]?.amount_cents ?? 0)) || null
        : null;
      const amountCents = hasRefund
        ? refundAmountCents
        : (originalAmountCents && originalAmountCents > 0 ? originalAmountCents : null);

      let refundRequired = false;
      if (original?.id) {
        const { data: ev } = await supabase
          .from("events")
          .select("id")
          .eq("type", "payment.refund_required")
          .eq("subject_type", "payment")
          .eq("subject_id", original.id)
          .limit(1)
          .maybeSingle();
        refundRequired = !!ev;
      }

      let refundReason: string | null = null;
      if (original?.id) {
        const { data: pr } = await supabase
          .from("payment_refunds")
          .select("reason")
          .eq("payment_id", original.id)
          .neq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pr && typeof pr.reason === "string") refundReason = pr.reason;
      }

      const ctx: DeliveryContext = {
        registrationStatus: reg.status ?? null,
        holdExpiresAt: reg.hold_expires_at ?? null,
        courseTitle: course?.title ?? null,
        courseDate: course?.date ?? null,
        courseTime: course?.time ?? null,
        studioName: tenant?.name ?? null,
        studioSlug: tenant?.slug ?? null,
        recipientEmail: user?.email ?? null,
        anonymizedAt: user?.anonymized_at ?? null,
        authUserId: user?.auth_user_id ?? null,
        amountCents: amountCents && amountCents > 0 ? amountCents : null,
        refundAmountCents,
        originalAmountCents,
        refundReason,
        hasRefund,
        refundRequired,
      };
      return ctx;
    },
    markDelivery: async (id, status, errorCode) => {
      const { error } = await supabase.rpc("mark_email_delivery", {
        p_id: id,
        p_status: status,
        p_error_code: errorCode ?? null,
      });
      if (error) {
        log.error("mark_email_delivery", { code: error.code ?? "MARK_FAILED" });
        throw error;
      }
    },
    sendEmail: async ({ to, subject, html }) => {
      const internal = Deno.env.get("INTERNAL_EMAIL_SECRET") ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": internal,
        },
        body: JSON.stringify({ to, subject, html }),
      });
      if (!res.ok) {
        return { ok: false, errorCode: "SMTP_ERROR" };
      }
      return { ok: true };
    },
  };

  try {
    return await handleDispatchRequest(req, deps);
  } catch (err) {
    log.error("dispatch failed", {
      code: err instanceof Error ? err.name : "DISPATCH_ERROR",
    });
    return new Response(
      JSON.stringify({ error: "Internal error", code: "DISPATCH_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
