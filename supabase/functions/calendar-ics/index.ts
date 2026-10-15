/**
 * calendar-ics — öffentliche ICS / Meta für eine Buchung (UX-3 B / UX-4 C1).
 * GET ?t=<HMAC-Token> → text/calendar (default attachment; ?inline=1 → inline)
 * GET ?t=&format=json → Kurs-Meta + Google-URL
 * Ungültig/fremd → 404.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyCalendarToken } from "../_shared/calendar_token.ts";
import { buildIcs } from "../_shared/ics.ts";
import { buildGoogleCalendarUrl } from "../_shared/google_calendar.ts";

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

function berlinWhen(date: string, time: string): { dateLabel: string; timeLabel: string } {
  const isoGuess = `${date}T${time.length >= 8 ? time.slice(0, 8) : `${time.slice(0, 5)}:00`}`;
  // Anzeige über Europe/Berlin-Format aus dem Kurs-Zivildatum (kein Date-Shift der Wandzeit).
  const [y, m, d] = date.split("-");
  const weekday = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
  })
    .format(new Date(`${date}T12:00:00+02:00`))
    .replace(/\.$/, "");
  const month = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    month: "short",
  })
    .format(new Date(`${date}T12:00:00+02:00`))
    .replace(/\.$/, "");
  const dayNum = String(Number(d));
  const hm = time.slice(0, 5);
  return {
    dateLabel: `${weekday}, ${dayNum}. ${month}`,
    timeLabel: hm,
  };
  void y;
  void m;
  void isoGuess;
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
    .select("name, slug, brand_color")
    .eq("id", reg.tenant_id)
    .maybeSingle();

  const place = [course.location, course.room].filter(Boolean).join(" · ");
  const studioName = (tenant?.name as string | undefined)?.trim() || "Studio";
  const title = (course.title as string | undefined)?.trim() || "Kurs";
  const when = berlinWhen(course.date, course.time);
  const googleUrl = buildGoogleCalendarUrl({
    title,
    date: course.date,
    startTime: course.time,
    endTime: course.end_time,
    location: place || undefined,
    details: `Termin bei ${studioName}`,
  });

  const wantJson = url.searchParams.get("format") === "json";
  if (wantJson) {
    const icsUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/calendar-ics?t=${
      encodeURIComponent(token)
    }`;
    const body = {
      title,
      date: course.date,
      time: course.time.slice(0, 5),
      dateLabel: when.dateLabel,
      timeLabel: when.timeLabel,
      place: place || null,
      studioName,
      brandColor: (tenant?.brand_color as string | undefined) ?? null,
      tenantSlug: (tenant?.slug as string | undefined) ?? null,
      googleUrl,
      icsUrl,
      icsInlineUrl: `${icsUrl}&inline=1`,
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  try {
    const ics = buildIcs({
      uid: reg.id,
      summary: title,
      date: course.date,
      startTime: course.time,
      endTime: course.end_time,
      location: place || undefined,
      description: `Termin bei ${studioName}`,
      method: "REQUEST",
    });

    const inline = url.searchParams.get("inline") === "1";
    return new Response(ics, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": inline
          ? 'inline; filename="buchung.ics"'
          : 'attachment; filename="buchung.ics"',
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("calendar-ics build failed", e);
    return notFound();
  }
});
