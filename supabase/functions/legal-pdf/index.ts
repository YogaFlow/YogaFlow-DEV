import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  BUCKET,
  createDefaultLog,
  handleLegalPdfRequest,
  type LegalPdfDeps,
  type LegalPdfJobRow,
} from "./handler.ts";

async function loadFontBytes(): Promise<Uint8Array | null> {
  try {
    const url = new URL("../_shared/fonts/NotoSans-Regular.ttf", import.meta.url);
    const bytes = await Deno.readFile(url);
    return bytes.byteLength > 0 ? bytes : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const log = createDefaultLog();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const deps: LegalPdfDeps = {
    env: (key) => Deno.env.get(key) ?? undefined,
    log,
    loadFontBytes,
    store: {
      claimJobs: async (limit) => {
        const { data, error } = await supabase.rpc("claim_studio_legal_pdf_jobs", {
          p_limit: limit,
        });
        if (error) {
          log.error("claim_studio_legal_pdf_jobs", { code: error.code ?? "CLAIM_FAILED" });
          throw error;
        }
        return (data ?? []) as LegalPdfJobRow[];
      },
      finishJob: async (jobId, outcome, errorCode) => {
        const { error } = await supabase.rpc("finish_studio_legal_pdf_job", {
          p_job_id: jobId,
          p_outcome: outcome,
          p_error_code: errorCode ?? null,
        });
        if (error) throw error;
      },
      setPdfPath: async (documentId, pdfPath) => {
        const { data, error } = await supabase.rpc("set_studio_legal_pdf_path", {
          p_document_id: documentId,
          p_pdf_path: pdfPath,
        });
        if (error) throw error;
        return data === true;
      },
      uploadPdf: async (path, bytes) => {
        const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
          contentType: "application/pdf",
          upsert: true,
        });
        if (error) throw error;
      },
    },
  };

  try {
    return await handleLegalPdfRequest(req, deps);
  } catch (err) {
    log.error("legal-pdf failed", {
      code: err instanceof Error ? err.name : "LEGAL_PDF_ERROR",
    });
    return new Response(
      JSON.stringify({ error: "Internal error", code: "LEGAL_PDF_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
