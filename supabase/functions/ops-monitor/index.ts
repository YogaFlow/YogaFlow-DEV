import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  createDefaultLog,
  handleOpsRequest,
  type OpsDeps,
} from "./handler.ts";
import { createOpsStore } from "./store.ts";

Deno.serve(async (req: Request) => {
  const log = createDefaultLog();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const deps: OpsDeps = {
    env: (key) => Deno.env.get(key) ?? undefined,
    log,
    store: createOpsStore(supabase),
    appEnv: Deno.env.get("APP_ENV") ?? "dev",
    sendMail: async ({ to, subject, html, text }) => {
      const internal = Deno.env.get("INTERNAL_EMAIL_SECRET") ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": internal,
        },
        body: JSON.stringify({ to, subject, html, text, fromName: "Omlify Überwachung" }),
      });
      if (!res.ok) {
        throw new Error(`send-email ${res.status}`);
      }
    },
    fetchHeartbeat: async (url) => {
      await fetch(url, { method: "GET" });
    },
  };

  try {
    return await handleOpsRequest(req, deps);
  } catch (err) {
    log.error("ops-monitor failed", {
      code: err instanceof Error ? err.name : "OPS_ERROR",
    });
    return new Response(
      JSON.stringify({ error: "Internal error", code: "OPS_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
