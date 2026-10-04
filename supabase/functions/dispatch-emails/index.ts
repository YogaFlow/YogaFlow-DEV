import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createDefaultLog,
  handleDispatchRequest,
  type DeliveryContext,
  type DeliveryRow,
  type DispatchDeps,
  type PassDeliveryContext,
} from "./handler.ts";
import { buildStudioLogoUrl } from "../_shared/email_template.ts";

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
          "id, status, hold_expires_at, user_id, course_id, tenant_id, cancellation_deadline",
        )
        .eq("id", registrationId)
        .maybeSingle();
      if (re || !reg) return null;

      const [{ data: course }, { data: tenant }, { data: user }] = await Promise.all([
        supabase
          .from("courses")
          .select("title, date, time, end_time, location, room, teacher_id")
          .eq("id", reg.course_id)
          .maybeSingle(),
        supabase
          .from("tenants")
          .select("name, slug, brand_color, logo_path")
          .eq("id", reg.tenant_id)
          .maybeSingle(),
        supabase
          .from("users")
          .select("email, anonymized_at, auth_user_id")
          .eq("id", reg.user_id)
          .maybeSingle(),
      ]);

      const { data: payments } = await supabase
        .from("payments")
        .select("id, amount_cents, reverses_payment_id, provider, status, created_at")
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

      const { data: legal } = await supabase
        .from("tenant_legal_profiles")
        .select("legal_name, street, house_number, postal_code, city, contact_email, phone")
        .eq("tenant_id", reg.tenant_id)
        .maybeSingle();

      const { data: tax } = await supabase
        .from("tenant_tax_settings")
        .select("regime, vat_rate_bp")
        .eq("tenant_id", reg.tenant_id)
        .order("valid_from", { ascending: false })
        .limit(1)
        .maybeSingle();

      let teacherName: string | null = null;
      if (course?.teacher_id) {
        const { data: teacher } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", course.teacher_id)
          .maybeSingle();
        teacherName = [teacher?.first_name, teacher?.last_name].filter(Boolean).join(" ") || null;
      }

      let receiptId: string | null = null;
      let receiptNumber: string | null = null;
      let refundReceiptId: string | null = null;
      let refundReceiptNumber: string | null = null;
      if (original?.id) {
        const { data: recs } = await supabase
          .from("receipts")
          .select("id, number, kind")
          .eq("payment_id", original.id);
        for (const rec of recs ?? []) {
          if (rec.kind === "receipt") {
            receiptId = rec.id;
            receiptNumber = rec.number;
          }
          if (rec.kind === "refund_receipt") {
            refundReceiptId = rec.id;
            refundReceiptNumber = rec.number;
          }
        }
      }

      let durationMinutes: number | null = null;
      if (course?.time && course?.end_time) {
        const [sh, sm] = String(course.time).split(":").map(Number);
        const [eh, em] = String(course.end_time).split(":").map(Number);
        if (Number.isFinite(sh) && Number.isFinite(sm) && Number.isFinite(eh) && Number.isFinite(em)) {
          const mins = eh * 60 + em - (sh * 60 + sm);
          if (mins > 0) durationMinutes = mins;
        }
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
        courseEndTime: course?.end_time ?? null,
        courseLocation: course?.location ?? null,
        courseRoom: course?.room ?? null,
        teacherName,
        durationMinutes,
        cancelDeadline: reg.cancellation_deadline ?? null,
        legalName: legal?.legal_name ?? null,
        legalStreet: legal?.street ?? null,
        legalHouse: legal?.house_number ?? null,
        legalPostal: legal?.postal_code ?? null,
        legalCity: legal?.city ?? null,
        contactEmail: legal?.contact_email ?? null,
        legalPhone: legal?.phone ?? null,
        taxRegime: tax?.regime ?? null,
        vatRateBp: typeof tax?.vat_rate_bp === "number" ? tax.vat_rate_bp : null,
        receiptId,
        receiptNumber,
        refundReceiptId,
        refundReceiptNumber,
        termsText: null,
        brandColor: typeof tenant?.brand_color === "string" ? tenant.brand_color : null,
        logoUrl: buildStudioLogoUrl(supabaseUrl, tenant?.logo_path ?? null),
        paidAt: original && typeof original.created_at === "string" ? original.created_at : null,
      };
      return ctx;
    },
    loadPassContext: async (passId) => {
      const { data: pass, error: pe } = await supabase
        .from("passes")
        .select(
          "id, name, units_total, valid_until, member_id, tenant_id, payment_id, status, created_at",
        )
        .eq("id", passId)
        .maybeSingle();
      if (pe || !pass) return null;

      const [{ data: tenant }, { data: user }, { data: movements }] = await Promise.all([
        supabase
          .from("tenants")
          .select("name, slug, brand_color, logo_path")
          .eq("id", pass.tenant_id)
          .maybeSingle(),
        supabase
          .from("users")
          .select("email, anonymized_at, auth_user_id")
          .eq("id", pass.member_id)
          .maybeSingle(),
        supabase
          .from("pass_movements")
          .select("delta, kind")
          .eq("pass_id", passId),
      ]);

      const movs = Array.isArray(movements) ? movements : [];
      const remaining = movs.reduce((sum, m) => sum + Number(m.delta ?? 0), 0);
      const unitsUsed = movs
        .filter((m) => m.kind === "redeem" || m.kind === "redeem_reversal")
        .reduce((sum, m) => sum + (-Number(m.delta ?? 0)), 0);

      let amountCents: number | null = null;
      let refundAmountCents: number | null = null;
      let wertersatzCents: number | null = null;
      let purchasedAt: string | null = null;
      let withdrawalAt: string | null = null;
      let receiptId: string | null = null;
      let receiptNumber: string | null = null;
      let refundReceiptId: string | null = null;
      let refundReceiptNumber: string | null = null;

      if (pass.payment_id) {
        const { data: pay } = await supabase
          .from("payments")
          .select("id, amount_cents, received_at, created_at")
          .eq("id", pass.payment_id)
          .maybeSingle();
        if (pay) {
          amountCents = Number(pay.amount_cents);
          purchasedAt = typeof pay.received_at === "string"
            ? pay.received_at
            : typeof pay.created_at === "string"
            ? pay.created_at
            : null;
        }
        const { data: refunds } = await supabase
          .from("payments")
          .select("id, amount_cents, created_at")
          .eq("reverses_payment_id", pass.payment_id)
          .order("created_at", { ascending: false })
          .limit(1);
        const refund = Array.isArray(refunds) ? refunds[0] : null;
        if (refund) {
          refundAmountCents = Math.abs(Number(refund.amount_cents ?? 0)) || null;
        }
        if (amountCents != null && unitsUsed >= 0 && pass.units_total > 0) {
          wertersatzCents = Math.round((amountCents * unitsUsed) / pass.units_total);
          if (refundAmountCents == null) {
            refundAmountCents = Math.max(amountCents - wertersatzCents, 0);
          }
        }
        const { data: recs } = await supabase
          .from("receipts")
          .select("id, number, kind")
          .eq("payment_id", pass.payment_id);
        for (const rec of recs ?? []) {
          if (rec.kind === "receipt") {
            receiptId = rec.id;
            receiptNumber = rec.number;
          }
          if (rec.kind === "refund_receipt") {
            refundReceiptId = rec.id;
            refundReceiptNumber = rec.number;
          }
        }
        if (refund?.id) {
          const { data: rrecs } = await supabase
            .from("receipts")
            .select("id, number, kind")
            .eq("payment_id", refund.id);
          for (const rec of rrecs ?? []) {
            if (rec.kind === "refund_receipt") {
              refundReceiptId = rec.id;
              refundReceiptNumber = rec.number;
            }
          }
        }
      }

      const { data: wdEvent } = await supabase
        .from("events")
        .select("created_at")
        .eq("type", "pass.withdrawal_received")
        .eq("subject_id", passId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (wdEvent && typeof wdEvent.created_at === "string") {
        withdrawalAt = wdEvent.created_at;
      }

      const [{ data: legal }, { data: tax }] = await Promise.all([
        supabase
          .from("tenant_legal_profiles")
          .select("legal_name, street, house_number, postal_code, city, contact_email, phone")
          .eq("tenant_id", pass.tenant_id)
          .maybeSingle(),
        supabase
          .from("tenant_tax_settings")
          .select("regime, vat_rate_bp")
          .eq("tenant_id", pass.tenant_id)
          .order("valid_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const ctx: PassDeliveryContext = {
        passId: pass.id,
        passName: pass.name ?? "Karte",
        unitsTotal: Number(pass.units_total ?? 0),
        remaining,
        validUntil: typeof pass.valid_until === "string" ? pass.valid_until : null,
        studioName: tenant?.name ?? null,
        studioSlug: tenant?.slug ?? null,
        recipientEmail: user?.email ?? null,
        anonymizedAt: user?.anonymized_at ?? null,
        authUserId: user?.auth_user_id ?? null,
        amountCents,
        refundAmountCents,
        wertersatzCents,
        unitsUsed,
        purchasedAt,
        withdrawalAt,
        receiptId,
        receiptNumber,
        refundReceiptId,
        refundReceiptNumber,
        legalName: legal?.legal_name ?? null,
        legalStreet: legal?.street ?? null,
        legalHouse: legal?.house_number ?? null,
        legalPostal: legal?.postal_code ?? null,
        legalCity: legal?.city ?? null,
        contactEmail: legal?.contact_email ?? null,
        legalPhone: legal?.phone ?? null,
        taxRegime: tax?.regime ?? null,
        vatRateBp: typeof tax?.vat_rate_bp === "number" ? tax.vat_rate_bp : null,
        brandColor: typeof tenant?.brand_color === "string" ? tenant.brand_color : null,
        logoUrl: buildStudioLogoUrl(supabaseUrl, tenant?.logo_path ?? null),
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
    sendEmail: async ({ to, subject, html, text, fromName, replyTo, attachments }) => {
      const internal = Deno.env.get("INTERNAL_EMAIL_SECRET") ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": internal,
        },
        body: JSON.stringify({ to, subject, html, text, fromName, replyTo, attachments }),
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
