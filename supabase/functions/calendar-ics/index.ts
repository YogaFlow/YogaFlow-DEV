/**
 * calendar-ics — öffentliche ICS-Datei für eine Buchung (UX-3 B).
 * GET ?t=<HMAC-Token> → text/calendar; ungültig/fremd → 404.
 * Kein Login; im ICS nur Kurs, Zeit, Ort, Studio — keine Personendaten.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyCalendarToken } from "../_shared/calendar_token.ts";
import { buildIcs } from "../_shared/ics.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const secret = Deno.env.get("CALENDAR_ICS_SECRET")?.trim() ?? "";
  if (!secret) {
    console.error("calendar-ics: CALENDAR_ICS_SECRET missing");
    return notFound();
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("t")?.trim() ?? "";
  if (!token) return notFound();

  const payload = await verifyCalendarToken(secret, token);
  if (!payload) return notFound();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: reg, error: regErr } = await supabase
    .from("registrations")
    .select("id, tenant_id, course_id, status, cancellation_timestamp")
    .eq("id", payload.rid)
    .maybeSingle();

  if (regErr || !reg || reg.cancellation_timestamp != null) return notFound();
  if (reg.status !== "registered" && reg.status !== "paid" && reg.status !== "pending_payment") {
    return notFound();
  }

  const { data: course, error: courseErr } = await supabase
    .from("courses")
    .select("id, title, date, time, end_time, location, room, status")
    .eq("id", reg.course_id)
    .maybeSingle();

  if (courseErr || !course || !course.date || !course.time) return notFound();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name")
    .eq("id", reg.tenant_id)
    .maybeSingle();

  const place = [course.location, course.room].filter(Boolean).join(" · ");
  const studioName = (tenant?.name as string | undefined)?.trim() || "Studio";

  try {
    const ics = buildIcs({
      uid: reg.id,
      summary: course.title ?? "Kurs",
      date: course.date,
      startTime: course.time,
      endTime: course.end_time,
      location: place || undefined,
      description: `Termin bei ${studioName}`,
      method: "REQUEST",
    });

    return new Response(ics, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="buchung.ics"',
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("calendar-ics build failed", e);
    return notFound();
  }
});
