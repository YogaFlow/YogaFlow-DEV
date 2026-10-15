/**
 * Gemeinsame E-Mail-Hülle (UX-2 B1).
 * Eine Spalte, max. 560 px, Tabellen-Layout, System-Schriften.
 * Markenakzent mit Kontrastprüfung, Fallback #2F5A4E.
 */

export const OMLIFY_BRAND = "#2F5A4E";
export const EMAIL_MAX_WIDTH = 560;

export type EmailAttachment = {
  filename: string;
  content: string;
  contentType: string;
  encoding?: "utf-8" | "base64";
  contentDisposition?: "attachment" | "inline";
  cid?: string;
};

export type EmailPayload = {
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
};

export type ShellInput = {
  preheader?: string;
  studioName: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  /** Große Überschrift */
  title: string;
  /** Eine Zeile unter der Überschrift (HTML erlaubt nur nach escape durch Aufrufer) */
  introHtml?: string;
  /** Hauptinhalt (bereits HTML) */
  bodyHtml: string;
  /** Fußbereich (Anbieter, Widerruf, …) — bei shorter weggelassen wenn leer */
  footerHtml?: string;
  /** Ops-Monitor u. Ä.: kompakter, ohne Studio-Fuß */
  shorter?: boolean;
};

function parseRgb(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, "");
  const full = raw.length === 3
    ? raw.split("").map((c) => `${c}${c}`).join("")
    : raw;
  if (!/^[0-9A-Fa-f]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channelLinear(c: number): number {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number | null {
  const rgb = parseRgb(hex);
  if (!rgb) return null;
  return (
    0.2126 * channelLinear(rgb[0]) +
    0.7152 * channelLinear(rgb[1]) +
    0.0722 * channelLinear(rgb[2])
  );
}

export function contrastRatio(a: string, b: string): number | null {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  if (l1 == null || l2 == null) return null;
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Markenakzent für Knöpfe/Kopf; Kontrast gegen Weiß ≥ 4,5, sonst Omlify-Grün. */
export function resolveBrandAccent(hex: string | null | undefined): string {
  if (!hex) return OMLIFY_BRAND;
  const normalized = hex.trim().startsWith("#") ? hex.trim() : `#${hex.trim()}`;
  const ratio = contrastRatio(normalized, "#FFFFFF");
  if (ratio == null || ratio < 4.5) return OMLIFY_BRAND;
  const upper = normalized.toUpperCase();
  return upper.length === 7 ? upper : OMLIFY_BRAND;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildStudioLogoUrl(
  supabaseUrl: string | undefined,
  logoPath: string | null | undefined,
): string | null {
  if (!supabaseUrl || !logoPath) return null;
  const base = supabaseUrl.replace(/\/+$/, "");
  const path = logoPath.replace(/^\/+/, "");
  return `${base}/storage/v1/object/public/studio-branding/${path}`;
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] as const;

/** Civil date YYYY-MM-DD → Teile ohne new Date()-UTC-Falle. */
export function civilDateParts(dateStr: string | null | undefined): {
  y: number;
  m: number;
  d: number;
  weekday: string;
  monthShort: string;
  monthUpper: string;
} | null {
  if (!dateStr) return null;
  const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Wochentag über lokale Mitternacht (wie format.ts)
  const local = new Date(y, mo - 1, d);
  const weekday = WEEKDAYS_SHORT[local.getDay()] ?? "";
  const monthShort = MONTHS_SHORT[mo - 1] ?? "";
  return {
    y,
    m: mo,
    d,
    weekday,
    monthShort,
    monthUpper: monthShort.toUpperCase(),
  };
}

export function formatTimeHm(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const m = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Preheader: „Mo, 5. Okt, 13:00 · Kurs · Ort“ */
export function formatEmailPreheader(input: {
  courseDate: string | null;
  courseTime: string | null;
  courseTitle: string;
  place?: string | null;
}): string {
  const parts = civilDateParts(input.courseDate);
  const time = formatTimeHm(input.courseTime);
  const bits: string[] = [];
  if (parts) {
    const head = `${parts.weekday}, ${parts.d}. ${parts.monthShort}` +
      (time ? `, ${time}` : "");
    bits.push(head);
  } else if (time) {
    bits.push(time);
  }
  if (input.courseTitle.trim()) bits.push(input.courseTitle.trim());
  if (input.place?.trim()) bits.push(input.place.trim());
  return bits.join(" · ");
}

export function mapsLink(place: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(place)}`;
}

/**
 * HTML-Hülle + Text-Gerüst.
 * textBody = reiner Text des Inhalts (ohne Preheader/Kopf/Fuß-Duplikate aus HTML).
 */
export function renderEmailShell(
  input: ShellInput,
  textBody: string,
): { html: string; text: string; accent: string } {
  const accent = resolveBrandAccent(input.brandColor);
  const studio = escapeHtml(input.studioName.trim() || "Studio");
  const preheader = (input.preheader ?? "").trim();
  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
        ${escapeHtml(preheader)}
      </div>`
    : "";

  const logoBlock = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="${studio}" width="120" style="display:block;max-width:120px;height:auto;border:0;" />`
    : `<p style="margin:0;font-size:16px;font-weight:600;color:${accent};font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">${studio}</p>`;

  const intro = input.introHtml
    ? `<p style="margin:0 0 20px 0;color:#374151;font-size:16px;line-height:1.5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">${input.introHtml}</p>`
    : "";

  const footer = input.footerHtml?.trim()
    ? `<tr>
        <td style="padding:24px 28px 8px 28px;border-top:1px solid #E5DFD4;">
          <div style="color:#9A9083;font-size:12px;line-height:1.5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
            ${input.footerHtml}
          </div>
        </td>
      </tr>`
    : "";

  const pad = input.shorter ? "20px 24px" : "28px 28px 8px 28px";

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    @media (prefers-color-scheme: dark) {
      .omlify-body { background-color: #1a1a1a !important; }
      .omlify-card { background-color: #242424 !important; }
      .omlify-title { color: #f3f4f6 !important; }
      .omlify-text { color: #d1d5db !important; }
      .omlify-muted { color: #9ca3af !important; }
      .omlify-border { border-color: #3f3f46 !important; }
    }
  </style>
</head>
<body class="omlify-body" style="margin:0;padding:0;background:#F5F3EF;">
  ${preheaderHtml}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F5F3EF;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="omlify-card" cellpadding="0" cellspacing="0" border="0" width="${EMAIL_MAX_WIDTH}" style="max-width:${EMAIL_MAX_WIDTH}px;width:100%;background:#ffffff;border-radius:8px;">
          <tr>
            <td style="padding:${pad};border-bottom:3px solid ${accent};">
              ${logoBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px 28px;">
              <h1 class="omlify-title" style="margin:0 0 8px 0;color:#1F1B16;font-size:24px;line-height:1.25;font-weight:700;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
                ${escapeHtml(input.title)}
              </h1>
              ${intro}
              <div class="omlify-text" style="color:#374151;font-size:16px;line-height:1.5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
                ${input.bodyHtml}
              </div>
            </td>
          </tr>
          ${footer}
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              <p class="omlify-muted" style="margin:0;color:#9A9083;font-size:11px;line-height:1.4;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
                Gesendet über Omlify im Auftrag von ${studio}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textParts = [
    preheader ? preheader : "",
    input.studioName.trim() || "Studio",
    "",
    input.title,
    "",
    textBody.trim(),
    "",
    `Gesendet über Omlify im Auftrag von ${input.studioName.trim() || "Studio"}`,
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === ""));

  return { html, text: textParts.join("\n").trim() + "\n", accent };
}

export function primaryButtonHtml(
  href: string,
  label: string,
  accent: string,
): string {
  return `<a href="${escapeHtml(href)}"
     style="display:inline-block;padding:12px 20px;background-color:${accent};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    ${escapeHtml(label)}
  </a>`;
}

export function textLinkHtml(href: string, label: string, accent: string): string {
  return `<a href="${escapeHtml(href)}" style="color:${accent};font-size:15px;font-weight:600;text-decoration:underline;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">${escapeHtml(label)}</a>`;
}
