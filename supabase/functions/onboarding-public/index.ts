import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/** Simple per-IP sliding window (best-effort; resets on isolate cold start). */
const rateBuckets = new Map<string, { windowStart: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;

function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("cf-connecting-ip")
    ?? "unknown";
}

function allowRate(key: string): boolean {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || now - b.windowStart > RATE_WINDOW_MS) {
    b = { windowStart: now, count: 0 };
    rateBuckets.set(key, b);
  }
  b.count += 1;
  if (b.count > RATE_MAX) return false;
  if (rateBuckets.size > 50_000) rateBuckets.clear();
  return true;
}

type Action = "check_slug" | "begin" | "cancel";

interface Body {
  action: Action;
  p_slug?: string;
  p_name?: string;
  p_tenant_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const key = clientKey(req);
  if (!allowRate(key)) {
    return new Response(JSON.stringify({ error: "Zu viele Anfragen. Bitte kurz warten." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as Body;
    const action = body?.action;

    if (action === "check_slug") {
      const slug = body.p_slug;
      if (typeof slug !== "string" || slug.length === 0) {
        return new Response(JSON.stringify({ error: "p_slug erforderlich" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabase.rpc("check_slug_available", { p_slug: slug });
      if (error) {
        console.error("check_slug_available", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "begin") {
      const name = body.p_name;
      const slug = body.p_slug;
      if (typeof name !== "string" || typeof slug !== "string") {
        return new Response(JSON.stringify({ error: "p_name und p_slug erforderlich" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabase.rpc("begin_tenant_onboarding", {
        p_name: name,
        p_slug: slug,
      });
      if (error) {
        console.error("begin_tenant_onboarding", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel") {
      const tid = body.p_tenant_id;
      if (typeof tid !== "string" || tid.length === 0) {
        return new Response(JSON.stringify({ error: "p_tenant_id erforderlich" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.rpc("cancel_tenant_onboarding", { p_tenant_id: tid });
      if (error) {
        console.error("cancel_tenant_onboarding", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unbekannte action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Serverfehler" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
