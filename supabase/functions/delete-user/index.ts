import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-omlify-tenant",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GENERIC = "Das hat nicht geklappt. Bitte versuche es noch einmal.";

interface DeleteUserRequest {
  userId: string;
}

type RemoveResult = {
  success?: boolean;
  error?: string;
  mode?: string;
  auth_user_id?: string | null;
  remaining_profiles?: number;
  upcoming_courses?: number;
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json(status, { success: false, code, message, ...extra });
}

function kurseText(n: number): string {
  if (n === 1) {
    return "Diese Person leitet noch 1 kommenden Kurs. Übergib oder sage ihn zuerst ab.";
  }
  return `Diese Person leitet noch ${n} kommende Kurse. Übergib oder sage sie zuerst ab.`;
}

function logCode(code: string, memberId?: string, detailCode?: string): void {
  if (memberId && detailCode) console.error("delete-user", code, memberId, detailCode);
  else if (memberId) console.error("delete-user", code, memberId);
  else console.error("delete-user", code);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
      logCode("MISSING_ENV");
      return fail(500, "INTERNAL", GENERIC);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return fail(401, "UNAUTHORIZED", "Die Anmeldung ist ungültig.");
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      return fail(401, "UNAUTHORIZED", "Die Anmeldung ist ungültig.");
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user: requestingUser }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !requestingUser) {
      logCode("UNAUTHORIZED", undefined, authError?.code ?? "NO_CODE");
      return fail(401, "UNAUTHORIZED", "Die Anmeldung ist ungültig.");
    }

    let body: DeleteUserRequest;
    try {
      body = await req.json();
    } catch {
      return fail(400, "INVALID_INPUT", "Die Angaben sind unvollständig.");
    }

    const userId = body?.userId;
    if (typeof userId !== "string" || !UUID_RE.test(userId)) {
      return fail(400, "INVALID_INPUT", "Die Angaben sind unvollständig.");
    }

    // Wie update-user: Header nur weitergeben, wenn die App ihn schickt.
    // Fehlt er, entscheidet get_my_member_id (genau ein Profil, sonst leer).
    const userHeaders: Record<string, string> = {
      Authorization: authHeader,
    };
    const rawSlug = req.headers.get("x-omlify-tenant");
    if (rawSlug !== null && rawSlug.trim() !== "") {
      userHeaders["x-omlify-tenant"] = rawSlug.trim().toLowerCase();
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: userHeaders },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await userClient.rpc("remove_member", { p_member_id: userId });
    if (error) {
      logCode("RPC_FAILED", userId, error.code ?? "NO_CODE");
      return fail(500, "INTERNAL", GENERIC);
    }

    const result = data as RemoveResult | null;
    if (!result || result.success !== true) {
      const code = result?.error;
      if (code === "FORBIDDEN") {
        return fail(403, code, "Nur die Studioleitung kann Personen entfernen.");
      }
      if (code === "NOT_FOUND") {
        return fail(404, code, "Diese Person gibt es in deinem Studio nicht.");
      }
      if (code === "CANNOT_REMOVE_SELF") {
        return fail(400, code, "Du kannst dich nicht selbst entfernen.");
      }
      if (code === "OWNER_NOT_REMOVABLE") {
        return fail(409, code, "Inhaberinnen kannst du nicht entfernen. Ändere zuerst die Rolle.");
      }
      if (code === "ALREADY_REMOVED") {
        return fail(409, code, "Diese Person wurde bereits entfernt.");
      }
      if (code === "HAS_UPCOMING_COURSES") {
        const n = result?.upcoming_courses;
        if (typeof n !== "number" || !Number.isInteger(n) || n < 1) {
          logCode("UPCOMING_COUNT_MISSING", userId);
          return fail(500, "INTERNAL", GENERIC);
        }
        return fail(409, code, kurseText(n), { upcoming_courses: n });
      }
      logCode("RPC_CODE", userId, typeof code === "string" ? code : "NO_CODE");
      return fail(500, "INTERNAL", GENERIC);
    }

    const mode = result.mode;
    if (mode !== "deleted" && mode !== "anonymized") {
      logCode("MODE_UNKNOWN", userId);
      return fail(500, "INTERNAL", GENERIC);
    }

    const remaining = result.remaining_profiles;
    if (typeof remaining !== "number" || !Number.isFinite(remaining)) {
      logCode("REMAINING_UNKNOWN", userId);
      return json(200, {
        success: true,
        code: "REMAINING_UNKNOWN",
        message: "Die Person ist entfernt.",
        mode,
        login_deleted: false,
      });
    }

    if (remaining !== 0) {
      return json(200, {
        success: true,
        code: "REMOVED",
        message: "Die Person ist entfernt.",
        mode,
        login_deleted: false,
      });
    }

    const authUserId = result.auth_user_id;
    if (typeof authUserId !== "string" || !UUID_RE.test(authUserId)) {
      logCode("AUTH_LINK_MISSING", userId);
      return json(200, {
        success: true,
        code: "REMOVED",
        message: "Die Person ist entfernt.",
        mode,
        login_deleted: false,
      });
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(authUserId);
    if (deleteAuthError) {
      logCode("LOGIN_NOT_DELETED", userId, deleteAuthError.code ?? "NO_CODE");
      return json(200, {
        success: true,
        code: "LOGIN_NOT_DELETED",
        message: "Die Person ist entfernt. Das Login konnte nicht gelöscht werden, wir kümmern uns darum.",
        mode,
        login_deleted: false,
      });
    }

    return json(200, {
      success: true,
      code: "REMOVED",
      message: "Die Person ist entfernt.",
      mode,
      login_deleted: true,
    });
  } catch {
    logCode("UNEXPECTED");
    return fail(500, "INTERNAL", GENERIC);
  }
});
