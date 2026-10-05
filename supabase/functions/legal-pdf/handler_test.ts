import { assertEquals } from "jsr:@std/assert@1";
import {
  authorizeLegalPdf,
  markdownToLines,
  processLegalPdfJobs,
  renderLegalPdf,
  type LegalPdfDeps,
  type LegalPdfJobRow,
} from "./handler.ts";

Deno.test("authorizeLegalPdf Bearer", () => {
  const req = new Request("http://local/legal-pdf", {
    method: "POST",
    headers: { Authorization: "Bearer secret-1" },
  });
  assertEquals(authorizeLegalPdf(req, "secret-1"), true);
  assertEquals(authorizeLegalPdf(req, "other"), false);
});

Deno.test("markdownToLines strips headings", () => {
  const lines = markdownToLines("# AGB\n\n**Hallo** Welt\n- Punkt");
  assertEquals(lines.includes("AGB"), true);
  assertEquals(lines.some((l) => l.includes("Hallo Welt")), true);
  assertEquals(lines.some((l) => l.startsWith("• ")), true);
});

Deno.test("renderLegalPdf with Helvetica fallback", async () => {
  const bytes = await renderLegalPdf({
    studioName: "Demo Studio",
    kind: "terms",
    bodyMd: "# AGB\n\n gueltig fuer Kurse.\n",
    createdAt: "2026-10-05T10:00:00.000Z",
    fontBytes: null,
  });
  assertEquals(bytes.byteLength > 200, true);
  assertEquals(bytes[0], 0x25); // %PDF
});

Deno.test("processLegalPdfJobs uploads and finishes", async () => {
  const jobs: LegalPdfJobRow[] = [{
    job_id: "j1",
    tenant_id: "t1",
    document_id: "d1",
    kind: "terms",
    body_md: "# AGB\n\nTest.\n",
    studio_name: "Studio",
    created_at: "2026-10-05T10:00:00.000Z",
  }];
  const finished: string[] = [];
  const uploaded: string[] = [];
  const deps: LegalPdfDeps = {
    env: () => "secret",
    log: { info: () => {}, warn: () => {}, error: () => {} },
    loadFontBytes: async () => null,
    store: {
      claimJobs: async () => jobs.splice(0),
      finishJob: async (id, outcome) => {
        finished.push(`${id}:${outcome}`);
      },
      setPdfPath: async () => true,
      uploadPdf: async (path) => {
        uploaded.push(path);
      },
    },
  };
  const out = await processLegalPdfJobs(deps);
  assertEquals(out.processed, 1);
  assertEquals(out.results[0]?.outcome, "done");
  assertEquals(uploaded[0], "t1/d1.pdf");
  assertEquals(finished[0], "j1:done");
});
