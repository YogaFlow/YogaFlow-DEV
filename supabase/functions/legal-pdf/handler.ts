/**
 * legal-pdf — RT-1 PDF-Outbox (legal_pdf.render).
 *
 * verify_jwt = false; Authorization: Bearer <LEGAL_PDF_SECRET>.
 * claim → pdf-lib + Noto Sans → Storage studio-legal → pdf_path setzen.
 */
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { createServiceLogger, type ServiceLogger } from "../_shared/service.ts";

export const JOB_LIMIT = 5;
export const SECRET_ENV = "LEGAL_PDF_SECRET";
export const BUCKET = "studio-legal";

export type LegalPdfJobRow = {
  job_id: string;
  tenant_id: string;
  document_id: string;
  kind: string;
  body_md: string;
  studio_name: string;
  created_at: string;
};

export type LegalPdfStore = {
  claimJobs(limit: number): Promise<LegalPdfJobRow[]>;
  finishJob(
    jobId: string,
    outcome: "done" | "retry" | "failed",
    errorCode?: string | null,
  ): Promise<void>;
  setPdfPath(documentId: string, pdfPath: string): Promise<boolean>;
  uploadPdf(path: string, bytes: Uint8Array): Promise<void>;
};

export type LegalPdfDeps = {
  env: (key: string) => string | undefined;
  log: ServiceLogger;
  store: LegalPdfStore;
  loadFontBytes?: () => Promise<Uint8Array | null>;
  now?: () => number;
};

export type LegalPdfResult = {
  processed: number;
  results: { jobId: string; outcome: string; code?: string }[];
};

const encoder = new TextEncoder();

export function timingSafeEqual(a: string, b: string): boolean {
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa[i]! ^ bb[i]!;
  return out === 0;
}

export function authorizeLegalPdf(
  req: Request,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret || !expectedSecret.trim()) return false;
  const header = req.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return false;
  return timingSafeEqual(m[1]!.trim(), expectedSecret.trim());
}

function berlinStand(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function kindTitle(kind: string): string {
  switch (kind) {
    case "terms":
      return "AGB";
    case "privacy":
      return "Datenschutz";
    case "imprint":
      return "Impressum";
    default:
      return "Rechtstext";
  }
}

/** Markdown grob zu Zeilen (kein HTML). */
export function markdownToLines(md: string): string[] {
  const lines: string[] = [];
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw
      .replace(/^#{1,6}\s+/, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/^[-*]\s+/, "• ");
    lines.push(line);
  }
  return lines;
}

function wrapLine(text: string, maxChars: number): string[] {
  if (!text) return [""];
  if (text.length <= maxChars) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

export async function renderLegalPdf(input: {
  studioName: string;
  kind: string;
  bodyMd: string;
  createdAt: string;
  fontBytes: Uint8Array | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const useEmbedded = Boolean(input.fontBytes && input.fontBytes.byteLength > 0);
  let font;
  if (useEmbedded) {
    doc.registerFontkit(fontkit);
    font = await doc.embedFont(input.fontBytes!, { subset: true });
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica);
  }

  const margin = 48;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;
  const fontSize = 10;
  const lineHeight = 14;
  const maxChars = useEmbedded ? 88 : 95;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawHeader = (p: typeof page, pageNo: number, totalHint: string) => {
    const title = `${input.studioName} — ${kindTitle(input.kind)}`;
    const stand = berlinStand(input.createdAt);
    p.drawText(title.slice(0, 90), {
      x: margin,
      y: pageHeight - 36,
      size: 11,
      font,
      color: rgb(0.18, 0.16, 0.12),
    });
    if (stand) {
      p.drawText(`Stand: ${stand}`, {
        x: margin,
        y: pageHeight - 52,
        size: 9,
        font,
        color: rgb(0.4, 0.38, 0.34),
      });
    }
    p.drawText(totalHint || `Seite ${pageNo}`, {
      x: pageWidth - margin - 60,
      y: 28,
      size: 8,
      font,
      color: rgb(0.45, 0.42, 0.38),
    });
  };

  const pages: typeof page[] = [page];
  y = pageHeight - 70;
  drawHeader(page, 1, "");

  const ensureSpace = (need: number) => {
    if (y - need < 48) {
      page = doc.addPage([pageWidth, pageHeight]);
      pages.push(page);
      y = pageHeight - 70;
      drawHeader(page, pages.length, "");
    }
  };

  for (const raw of markdownToLines(input.bodyMd)) {
    const wrapped = wrapLine(raw, maxChars);
    for (const w of wrapped) {
      ensureSpace(lineHeight);
      if (w) {
        try {
          page.drawText(w, {
            x: margin,
            y,
            size: fontSize,
            font,
            color: rgb(0.12, 0.11, 0.1),
            maxWidth: contentWidth,
          });
        } catch {
          // Helvetica ohne Umlaute: Zeichen weglassen statt Job abbrechen
          const ascii = w.replace(/[^\x20-\x7E]/g, "?");
          page.drawText(ascii, {
            x: margin,
            y,
            size: fontSize,
            font,
            color: rgb(0.12, 0.11, 0.1),
            maxWidth: contentWidth,
          });
        }
      }
      y -= lineHeight;
    }
  }

  const total = pages.length;
  pages.forEach((p, i) => {
    p.drawText(`Seite ${i + 1} / ${total}`, {
      x: pageWidth - margin - 70,
      y: 28,
      size: 8,
      font,
      color: rgb(0.45, 0.42, 0.38),
    });
  });

  return doc.save();
}

export async function processLegalPdfJobs(
  deps: LegalPdfDeps,
): Promise<LegalPdfResult> {
  const jobs = await deps.store.claimJobs(JOB_LIMIT);
  const results: LegalPdfResult["results"] = [];
  const fontBytes = deps.loadFontBytes
    ? await deps.loadFontBytes()
    : null;

  for (const job of jobs) {
    try {
      const bytes = await renderLegalPdf({
        studioName: job.studio_name || "Studio",
        kind: job.kind,
        bodyMd: job.body_md || "",
        createdAt: job.created_at,
        fontBytes,
      });
      const path = `${job.tenant_id}/${job.document_id}.pdf`;
      await deps.store.uploadPdf(path, bytes);
      const ok = await deps.store.setPdfPath(job.document_id, path);
      if (!ok) {
        await deps.store.finishJob(job.job_id, "retry", "PDF_PATH_NOT_SET");
        results.push({ jobId: job.job_id, outcome: "retry", code: "PDF_PATH_NOT_SET" });
        continue;
      }
      await deps.store.finishJob(job.job_id, "done", null);
      deps.log.info("legal-pdf", { job_id: job.job_id, code: "DONE" });
      results.push({ jobId: job.job_id, outcome: "done" });
    } catch (err) {
      const code = err instanceof Error ? err.name || "RENDER_FAILED" : "RENDER_FAILED";
      deps.log.error("legal-pdf", { job_id: job.job_id, code });
      await deps.store.finishJob(job.job_id, "retry", code);
      results.push({ jobId: job.job_id, outcome: "retry", code });
    }
  }

  return { processed: results.length, results };
}

export async function handleLegalPdfRequest(
  req: Request,
  deps: LegalPdfDeps,
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!authorizeLegalPdf(req, deps.env(SECRET_ENV))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const result = await processLegalPdfJobs(deps);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function createDefaultLog(): ServiceLogger {
  return createServiceLogger();
}
