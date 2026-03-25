import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DeleteUserRequest {
  userId: string;
}

Deno.serve(async (req: Request) => {
  // #region agent log
  fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run1',hypothesisId:'H3',location:'supabase/functions/delete-user/index.ts:15',message:'delete-user function entry',data:{method:req.method,hasAuth:Boolean(req.headers.get('Authorization'))},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data: { user: requestingUser }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !requestingUser) {
      // #region agent log
      fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run3',hypothesisId:'H3',location:'supabase/functions/delete-user/index.ts:41',message:'requesting user auth failed',data:{hasAuthError:Boolean(authError),authErrorMessage:authError?.message ?? null,hasRequestingUser:Boolean(requestingUser)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError?.message }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { data: adminCheck, error: adminCheckError } = await adminClient
      .from("users")
      .select("roles")
      .eq("id", requestingUser.id)
      .maybeSingle();
    
    if (adminCheckError) {
      return new Response(
        JSON.stringify({ error: "Failed to check admin status", details: adminCheckError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!adminCheck || !adminCheck.roles?.includes("admin")) {
      // #region agent log
      fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run1',hypothesisId:'H4',location:'supabase/functions/delete-user/index.ts:66',message:'admin privilege check failed',data:{hasAdminCheck:Boolean(adminCheck),rolesCount:Array.isArray(adminCheck?.roles)?adminCheck.roles.length:0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return new Response(
        JSON.stringify({ error: "Admin privileges required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: DeleteUserRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { userId } = body;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (userId === requestingUser.id) {
      return new Response(
        JSON.stringify({ error: "Cannot delete yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: deleteProfileError } = await adminClient
      .from("users")
      .delete()
      .eq("id", userId);

    if (deleteProfileError) {
      // #region agent log
      fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run1',hypothesisId:'H2',location:'supabase/functions/delete-user/index.ts:104',message:'delete profile failed',data:{dbCode:deleteProfileError.code ?? null,message:deleteProfileError.message},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      console.error("Error deleting user profile:", deleteProfileError);
      return new Response(
        JSON.stringify({ error: "Failed to delete user profile", details: deleteProfileError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
      console.error("Error deleting auth user:", deleteAuthError);
    }

    return new Response(
      JSON.stringify({ success: true, message: "User deleted successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7337/ingest/81a138c8-fe6e-4883-8a0d-10b88515cc78',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ab11cc'},body:JSON.stringify({sessionId:'ab11cc',runId:'run1',hypothesisId:'H5',location:'supabase/functions/delete-user/index.ts:123',message:'delete-user unexpected catch',data:{error:String(error)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});