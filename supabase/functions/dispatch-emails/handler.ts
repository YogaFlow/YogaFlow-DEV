/**
 * dispatch-emails — Outbox-Versand (2.1b-b B2 / S6e–S6d / 2.2a-4b J10 / UX-2 B1).
 *
 * verify_jwt = false; Aufruf nur mit Header X-Email-Dispatch-Secret
 * (= EMAIL_DISPATCH_SECRET). Holt claim_email_deliveries (max. 20),
 * prüft je kind, baut HTML+Text(+ICS), sendet über send-email.
 *
 * kinds: waitlist_promoted_payment_required | payment_succeeded | payment_refunded
 *      | pass_purchased | pass_expiring_30 | pass_expiring_7 | pass_units_low
 *      | pass_withdrawal_received | pass_withdrawal_refunded
 *
 * Logs: delivery_id, kind, Ergebnis-Code — nie Adresse oder Inhalt.
 */
import { createServiceLogger, type ServiceLogger } from "../_shared/service.ts";
import {
  type EmailAttachment,
  type EmailPayload,
  civilDateParts,
  escapeHtml,
  formatEmailPreheader,
  formatTimeHm,
  mapsLink,
  primaryButtonHtml,
  renderEmailShell,
  resolveBrandAccent,
  textLinkHtml,
} from "../_shared/email_template.ts";
import { buildIcs } from "../_shared/ics.ts";
import {
  buildCalendarPageUrl,
  signCalendarToken,
} from "../_shared/calendar_token.ts";
import { cancellationDeadlineLine } from "../_shared/cancellation_deadline.ts";
import { buildGoogleCalendarUrl } from "../_shared/google_calendar.ts";

export const DISPATCH_LIMIT = 20;
export const SECRET_HEADER = "X-Email-Dispatch-Secret";

/** Nummer als eigener Text. Der Link trägt sie nicht allein. */
export function receiptMentionHtml(
  number: string,
  link: string,
  accent: string,
  linkLabel = "Beleg ansehen",
): string {
  return [
    `<p style="margin:0 0 4px 0;font-size:14px;color:#1F1B16;">Beleg ${escapeHtml(number)}</p>`,
    `<p style="margin:0 0 16px 0;font-size:14px;">${textLinkHtml(link, linkLabel, accent)}</p>`,
  ].join("");
}

export function receiptMentionText(
  number: string,
  link: string,
  linkLabel = "Beleg ansehen",
): string {
  return `Beleg ${number}\n${linkLabel}: ${link}`;
}

export type DeliveryRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  kind: string;
  registration_id: string | null;
  pass_id?: string | null;
  status: string;
  attempts: number;
};

export type DeliveryContext = {
  registrationStatus: string | null;
  holdExpiresAt: string | null;
  courseTitle: string | null;
  courseDate: string | null;
  courseTime: string | null;
  studioName: string | null;
  studioSlug: string | null;
  recipientEmail: string | null;
  anonymizedAt: string | null;
  authUserId: string | null;
  /** Betrag der (Original-)Zahlung in Cent; für payment_succeeded. */
  amountCents: number | null;
  /** Erstattungsbetrag in Cent (payment_refunded). */
  refundAmountCents: number | null;
  /** Originalbetrag für Teilerstattung-Text. */
  originalAmountCents: number | null;
  /** payment_refunds.reason */
  refundReason: string | null;
  /** Es existiert eine Erstattungszeile (reverses_payment_id). */
  hasRefund: boolean;
  /** Event payment.refund_required zum Original — Platz war vergeben (Fallback). */
  refundRequired: boolean;
  courseEndTime?: string | null;
  courseLocation?: string | null;
  courseRoom?: string | null;
  teacherName?: string | null;
  durationMinutes?: number | null;
  cancelDeadline?: string | null;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
  taxRegime?: string | null;
  vatRateBp?: number | null;
  receiptId?: string | null;
  receiptNumber?: string | null;
  refundReceiptId?: string | null;
  refundReceiptNumber?: string | null;
  termsText?: string | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  /** payments.created_at der Originalzahlung */
  paidAt?: string | null;
};

/** K1: Kontext für Karten-Mails (subject = pass). */
export type PassDeliveryContext = {
  passId: string;
  passName: string;
  unitsTotal: number;
  remaining: number;
  validUntil: string | null;
  studioName: string | null;
  studioSlug: string | null;
  recipientEmail: string | null;
  anonymizedAt: string | null;
  authUserId: string | null;
  amountCents: number | null;
  refundAmountCents: number | null;
  wertersatzCents: number | null;
  unitsUsed: number | null;
  purchasedAt: string | null;
  withdrawalAt: string | null;
  receiptId: string | null;
  receiptNumber: string | null;
  refundReceiptId: string | null;
  refundReceiptNumber: string | null;
  legalName: string | null;
  legalStreet: string | null;
  legalHouse: string | null;
  legalPostal: string | null;
  legalCity: string | null;
  contactEmail: string | null;
  legalPhone: string | null;
  taxRegime: string | null;
  vatRateBp: number | null;
  brandColor: string | null;
  logoUrl: string | null;
};

export type DispatchDeps = {
  env: (key: string) => string | undefined;
  log: ServiceLogger;
  claimDeliveries: (limit: number) => Promise<DeliveryRow[]>;
  loadContext: (registrationId: string) => Promise<DeliveryContext | null>;
  loadPassContext: (passId: string) => Promise<PassDeliveryContext | null>;
  markDelivery: (
    id: string,
    status: "sent" | "skipped" | "failed" | "released",
    errorCode?: string | null,
  ) => Promise<void>;
  sendEmail: (input: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    fromName?: string;
    replyTo?: string;
    attachments?: EmailAttachment[];
  }) => Promise<{ ok: true } | { ok: false; errorCode: string }>;
  now?: () => Date;
};

export type DispatchResult = {
  processed: number;
  results: { deliveryId: string; kind: string; code: string }[];
};

function berlinParts(iso: string | Date): { date: string; time: string } {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${g("day")}.${g("month")}.${g("year")}`,
    time: `${g("hour")}:${g("minute")}`,
  };
}

function courseDateText(dateStr: string | null): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}.${y}`;
}

function courseTimeText(timeStr: string | null): string {
  return formatTimeHm(timeStr);
}

/** 2400 → „24,00 €“ */
export function formatEurCents(cents: number): string {
  const n = (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
  return `${n} €`;
}

export function buildReceiptLink(
  slug: string | null,
  baseDomain: string | undefined,
  receiptId: string,
): string {
  const domain = (baseDomain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const s = (slug ?? "").trim().toLowerCase();
  if (s && domain) return `https://${s}.${domain}/receipts/${receiptId}`;
  if (domain) return `https://${domain}/receipts/${receiptId}`;
  return `/receipts/${receiptId}`;
}

export function studioFromName(studioName: string): string {
  const name = studioName.trim() || "Studio";
  return `${name} über Omlify`;
}

export function buildMyRegistrationsLink(
  slug: string | null,
  baseDomain: string | undefined,
): string {
  const domain = (baseDomain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const s = (slug ?? "").trim().toLowerCase();
  if (s && domain) return `https://${s}.${domain}/my-registrations`;
  if (domain) return `https://${domain}/my-registrations`;
  return "/my-registrations";
}

export function buildMyPassesLink(
  slug: string | null,
  baseDomain: string | undefined,
): string {
  const domain = (baseDomain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const s = (slug ?? "").trim().toLowerCase();
  if (s && domain) return `https://${s}.${domain}/my-passes`;
  if (domain) return `https://${domain}/my-passes`;
  return "/my-passes";
}

export function buildCoursesLink(
  slug: string | null,
  baseDomain: string | undefined,
): string {
  const domain = (baseDomain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const s = (slug ?? "").trim().toLowerCase();
  if (s && domain) return `https://${s}.${domain}/courses`;
  if (domain) return `https://${domain}/courses`;
  return "/courses";
}

export function buildWiderrufLink(
  slug: string | null,
  baseDomain: string | undefined,
): string {
  const domain = (baseDomain ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const s = (slug ?? "").trim().toLowerCase();
  if (s && domain) return `https://${s}.${domain}/widerruf`;
  if (domain) return `https://${domain}/widerruf`;
  return "/widerruf";
}

function civilDateLabel(isoDate: string | null): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${Number(d)}.${m}.${y}`;
}

function passProviderFooterHtml(input: {
  studioName: string;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
  widerrufLink?: string | null;
}): string {
  const name = escapeHtml(input.legalName || input.studioName);
  const street = `${input.legalStreet ?? ""} ${input.legalHouse ?? ""}`.trim();
  const city = `${input.legalPostal ?? ""} ${input.legalCity ?? ""}`.trim();
  const lines = [
    name,
    street ? escapeHtml(street) : "",
    city ? escapeHtml(city) : "",
    input.contactEmail ? escapeHtml(input.contactEmail) : "",
    input.legalPhone ? escapeHtml(input.legalPhone) : "",
  ].filter(Boolean);
  const widerruf = input.widerrufLink
    ? `<p style="margin:8px 0 0 0;">Du hast ein 14-tägiges Widerrufsrecht. ` +
      `<a href="${escapeHtml(input.widerrufLink)}">Widerruf erklären</a>. ` +
      `Du hast der sofortigen Nutzung ausdrücklich zugestimmt; bei Widerruf leistest du anteilig Wertersatz für genutzte Termine.</p>`
    : "";
  return [
    `<p style="margin:0 0 8px 0;">${lines.join("<br />")}</p>`,
    widerruf,
  ].join("");
}

export function buildPassPurchasedEmail(input: {
  passName: string;
  unitsTotal: number;
  validUntil: string | null;
  studioName: string;
  amountCents: number;
  coursesLink: string;
  receiptLink: string | null;
  receiptNumber: string | null;
  widerrufLink: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
  taxRegime?: string | null;
  vatRateBp?: number | null;
}): EmailPayload {
  const title = `Deine ${input.passName} ist bereit`;
  const until = civilDateLabel(input.validUntil);
  const unitsLabel = input.unitsTotal === 1 ? "1 Termin" : `${input.unitsTotal} Termine`;
  const price = priceLine(input.amountCents, input.taxRegime ?? null, input.vatRateBp ?? null);
  const accent = resolveBrandAccent(input.brandColor);
  const bodyHtml = [
    `<p style="margin:0 0 12px 0;">${escapeHtml(unitsLabel)}${until ? ` · gültig bis ${escapeHtml(until)}` : ""}</p>`,
    `<p style="margin:0 0 12px 0;">${escapeHtml(price)}</p>`,
    input.receiptLink && input.receiptNumber
      ? receiptMentionHtml(input.receiptNumber, input.receiptLink, accent)
      : "",
    primaryButtonHtml("Kurs buchen", input.coursesLink, accent),
  ].join("");
  const textBody = [
    title,
    `${unitsLabel}${until ? ` · gültig bis ${until}` : ""}`,
    price,
    input.receiptLink && input.receiptNumber
      ? receiptMentionText(input.receiptNumber, input.receiptLink)
      : "",
    `Kurs buchen: ${input.coursesLink}`,
    `Widerruf: ${input.widerrufLink}`,
  ].filter(Boolean).join("\n");
  const { html, text } = renderEmailShell(
    {
      preheader: `${unitsLabel}${until ? `, gültig bis ${until}` : ""}`,
      studioName: input.studioName,
      logoUrl: input.logoUrl,
      brandColor: input.brandColor,
      title,
      introHtml: `Deine Karte bei ${escapeHtml(input.studioName)} ist sofort nutzbar.`,
      bodyHtml,
      footerHtml: passProviderFooterHtml({ ...input, widerrufLink: input.widerrufLink }),
    },
    textBody,
  );
  return { subject: title, html, text };
}

export function buildPassExpiringEmail(input: {
  kind: "pass_expiring_30" | "pass_expiring_7";
  passName: string;
  remaining: number;
  validUntil: string | null;
  studioName: string;
  coursesLink: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
}): EmailPayload {
  const until = civilDateLabel(input.validUntil);
  const days = input.kind === "pass_expiring_30" ? 30 : 7;
  const title = `${input.passName}: noch ${days} Tage gültig`;
  const rem = input.remaining === 1 ? "1 Termin" : `${input.remaining} Termine`;
  const accent = resolveBrandAccent(input.brandColor);
  const bodyHtml = [
    `<p style="margin:0 0 12px 0;">Noch ${escapeHtml(rem)} offen${until ? ` · gültig bis ${escapeHtml(until)}` : ""}.</p>`,
    primaryButtonHtml("Kurs buchen", input.coursesLink, accent),
  ].join("");
  const textBody = [
    title,
    `Noch ${rem} offen${until ? ` · gültig bis ${until}` : ""}.`,
    `Kurs buchen: ${input.coursesLink}`,
  ].join("\n");
  const { html, text } = renderEmailShell(
    {
      preheader: until ? `Gültig bis ${until}` : title,
      studioName: input.studioName,
      logoUrl: input.logoUrl,
      brandColor: input.brandColor,
      title,
      introHtml: `Deine Karte bei ${escapeHtml(input.studioName)} läuft bald ab.`,
      bodyHtml,
      footerHtml: passProviderFooterHtml(input),
    },
    textBody,
  );
  return { subject: title, html, text };
}

export function buildPassUnitsLowEmail(input: {
  passName: string;
  validUntil: string | null;
  studioName: string;
  coursesLink: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
}): EmailPayload {
  const title = `Noch 1 Termin auf deiner ${input.passName}`;
  const until = civilDateLabel(input.validUntil);
  const accent = resolveBrandAccent(input.brandColor);
  const bodyHtml = [
    until
      ? `<p style="margin:0 0 12px 0;">Gültig bis ${escapeHtml(until)}.</p>`
      : "",
    primaryButtonHtml("Kurs buchen", input.coursesLink, accent),
  ].join("");
  const textBody = [title, until ? `Gültig bis ${until}.` : "", `Kurs buchen: ${input.coursesLink}`]
    .filter(Boolean)
    .join("\n");
  const { html, text } = renderEmailShell(
    {
      preheader: "Noch 1 Termin offen",
      studioName: input.studioName,
      logoUrl: input.logoUrl,
      brandColor: input.brandColor,
      title,
      introHtml: `Auf deiner Karte bei ${escapeHtml(input.studioName)} ist noch ein Termin übrig.`,
      bodyHtml,
      footerHtml: passProviderFooterHtml(input),
    },
    textBody,
  );
  return { subject: title, html, text };
}

export function buildPassWithdrawalReceivedEmail(input: {
  passName: string;
  studioName: string;
  withdrawalAt: string;
  priceCents: number;
  unitsUsed: number;
  wertersatzCents: number;
  refundCents: number;
  brandColor?: string | null;
  logoUrl?: string | null;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
}): EmailPayload {
  const when = berlinParts(input.withdrawalAt);
  const title = `Widerruf eingegangen: ${input.passName}`;
  // Anzeige: Preis ÷ Termine (wie Story); Wertersatz serverseitig auf die Summe gerundet.
  const rechenweg =
    input.unitsUsed === 0
      ? `${formatEurCents(input.priceCents)} − 0 genutzte Termine = ${formatEurCents(input.refundCents)}`
      : `${formatEurCents(input.priceCents)} − ${input.unitsUsed} genutzte Termine × ` +
        `${formatEurCents(input.wertersatzCents > 0 ? Math.round(input.wertersatzCents / input.unitsUsed) : 0)}` +
        ` = ${formatEurCents(input.refundCents)}`;
  const bodyHtml = [
    `<p style="margin:0 0 12px 0;">Eingang: ${escapeHtml(when.date)}, ${escapeHtml(when.time)} Uhr.</p>`,
    `<p style="margin:0 0 12px 0;">Erstattung: ${escapeHtml(rechenweg)}</p>`,
    `<p style="margin:0;">Die Erstattung folgt in den nächsten Tagen.</p>`,
  ].join("");
  const textBody = [
    title,
    `Eingang: ${when.date}, ${when.time} Uhr.`,
    `Erstattung: ${rechenweg}`,
    "Die Erstattung folgt in den nächsten Tagen.",
  ].join("\n");
  const { html, text } = renderEmailShell(
    {
      preheader: `Erstattung ${formatEurCents(input.refundCents)}`,
      studioName: input.studioName,
      logoUrl: input.logoUrl,
      brandColor: input.brandColor,
      title,
      introHtml: `Dein Widerruf bei ${escapeHtml(input.studioName)} ist eingegangen.`,
      bodyHtml,
      footerHtml: passProviderFooterHtml(input),
    },
    textBody,
  );
  return { subject: title, html, text };
}

export function buildPassWithdrawalRefundedEmail(input: {
  passName: string;
  studioName: string;
  refundCents: number;
  receiptLink: string | null;
  receiptNumber: string | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
}): EmailPayload {
  const title = `Erstattung nach Widerruf: ${formatEurCents(input.refundCents)}`;
  const accent = resolveBrandAccent(input.brandColor);
  const bodyHtml = [
    `<p style="margin:0 0 12px 0;">Deine ${escapeHtml(input.passName)} wurde entwertet. ${escapeHtml(formatEurCents(input.refundCents))} sind unterwegs.</p>`,
    input.receiptLink && input.receiptNumber
      ? receiptMentionHtml(
        input.receiptNumber,
        input.receiptLink,
        accent,
        "Erstattungsbeleg ansehen",
      )
      : "",
  ].join("");
  const textBody = [
    title,
    `Deine ${input.passName} wurde entwertet.`,
    input.receiptLink && input.receiptNumber
      ? receiptMentionText(
        input.receiptNumber,
        input.receiptLink,
        "Erstattungsbeleg ansehen",
      )
      : "",
  ].filter(Boolean).join("\n");
  const { html, text } = renderEmailShell(
    {
      preheader: title,
      studioName: input.studioName,
      logoUrl: input.logoUrl,
      brandColor: input.brandColor,
      title,
      introHtml: `Eine Erstattung von ${escapeHtml(input.studioName)} ist unterwegs.`,
      bodyHtml,
      footerHtml: passProviderFooterHtml(input),
    },
    textBody,
  );
  return { subject: title, html, text };
}

function recipientPassGone(ctx: PassDeliveryContext | null): boolean {
  if (!ctx) return true;
  if (ctx.anonymizedAt != null || ctx.authUserId == null) return true;
  if (!ctx.recipientEmail || !ctx.recipientEmail.trim()) return true;
  return false;
}

const RECEIPT_TAX_SMALL_BUSINESS_FULL =
  "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";

function priceLine(amountCents: number, regime: string | null, vatRateBp: number | null): string {
  const amount = formatEurCents(Math.abs(amountCents));
  if (regime === "regular") {
    const pct = Math.round((vatRateBp ?? 1900) / 100);
    return `${amount} inkl. ${pct} % USt`;
  }
  return `${amount} · ${RECEIPT_TAX_SMALL_BUSINESS_FULL}`;
}

function taxLineSmall(regime: string | null, vatRateBp: number | null): string {
  if (regime === "regular") {
    const pct = Math.round((vatRateBp ?? 1900) / 100);
    return `inkl. ${pct} % USt`;
  }
  return RECEIPT_TAX_SMALL_BUSINESS_FULL;
}

/** UX-3/UX-4: freundliche Abmeldezeile vor/nach Frist (gemeinsam mit Client). */
export function cancelLine(
  deadlineIso: string | null | undefined,
  now: Date = new Date(),
): string {
  return cancellationDeadlineLine(deadlineIso, now);
}

function placeOf(ctx: {
  courseLocation?: string | null;
  courseRoom?: string | null;
  place?: string | null;
}): string {
  if (ctx.place) return ctx.place;
  return [ctx.courseLocation, ctx.courseRoom].filter(Boolean).join(" · ");
}

function providerFooterHtml(input: {
  studioName: string;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
}): string {
  const name = escapeHtml(input.legalName || input.studioName);
  const street = `${input.legalStreet ?? ""} ${input.legalHouse ?? ""}`.trim();
  const city = `${input.legalPostal ?? ""} ${input.legalCity ?? ""}`.trim();
  const lines = [
    name,
    street ? escapeHtml(street) : "",
    city ? escapeHtml(city) : "",
    input.contactEmail ? escapeHtml(input.contactEmail) : "",
    input.legalPhone ? escapeHtml(input.legalPhone) : "",
  ].filter(Boolean);
  return [
    `<p style="margin:0 0 8px 0;">${lines.join("<br />")}</p>`,
    `<p style="margin:0;">Für Kurse mit festem Termin besteht kein Widerrufsrecht (§ 312g Abs. 2 Nr. 9 BGB).</p>`,
  ].join("");
}

function termCardHtml(input: {
  courseDate: string | null;
  courseTime: string | null;
  courseEndTime?: string | null;
  courseTitle: string;
  place?: string | null;
  teacherName?: string | null;
  /** Erstattungsmail: Karte ausgegraut */
  muted?: boolean;
  accent?: string;
}): string {
  const parts = civilDateParts(input.courseDate);
  const weekday = parts ? parts.weekday.toUpperCase() : "";
  const day = parts ? String(parts.d) : "–";
  const month = parts?.monthUpper ?? "";
  const start = formatTimeHm(input.courseTime);
  const end = formatTimeHm(input.courseEndTime ?? null);
  const timeLabel = start && end ? `${start}–${end}` : start;
  const place = input.place?.trim() || "";
  const linkColor = input.accent ?? "#2F5A4E";
  const placeHtml = place
    ? `<a href="${escapeHtml(mapsLink(place))}" style="color:${linkColor};text-decoration:underline;">${escapeHtml(place)}</a>`
    : "";
  const meta = [timeLabel ? `${escapeHtml(timeLabel)} Uhr` : "", placeHtml, input.teacherName ? escapeHtml(input.teacherName) : ""]
    .filter(Boolean)
    .join(" · ");
  const muted = Boolean(input.muted);
  const titleColor = muted ? "#6F6558" : "#1F1B16";
  const dayColor = muted ? "#6F6558" : "#1F1B16";
  const opacity = muted ? "opacity:0.72;" : "";

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="omlify-border" style="margin:0 0 20px 0;border:1px solid #E5DFD4;border-radius:8px;${opacity}">
    <tr>
      <td width="72" valign="top" align="center" style="padding:16px 8px;background:#F5F3EF;border-radius:8px 0 0 8px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#6F6558;">${escapeHtml(weekday)}</div>
        <div style="font-size:28px;font-weight:700;line-height:1;color:${dayColor};margin-top:4px;">${escapeHtml(day)}</div>
        <div style="font-size:12px;font-weight:600;letter-spacing:0.06em;color:#6F6558;margin-top:4px;">${escapeHtml(month)}</div>
      </td>
      <td valign="middle" style="padding:16px 16px 16px 12px;">
        <div style="font-size:16px;font-weight:700;color:${titleColor};margin:0 0 6px 0;">${escapeHtml(input.courseTitle)}</div>
        <div style="font-size:14px;color:#6F6558;line-height:1.4;">${meta}</div>
      </td>
    </tr>
  </table>`;
}

export function buildPromotionEmail(input: {
  courseTitle: string;
  courseDate: string;
  courseTime: string;
  studioName: string;
  holdExpiresAt: string;
  link: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  courseDateRaw?: string | null;
  courseEndTime?: string | null;
  place?: string | null;
  teacherName?: string | null;
}): EmailPayload {
  const hold = berlinParts(input.holdExpiresAt);
  const subject =
    `Du bist nachgerückt: ${input.courseTitle} am ${input.courseDate}` +
    ` – Platz reserviert bis ${hold.date}, ${hold.time}`;

  const preheader = formatEmailPreheader({
    courseDate: input.courseDateRaw ?? null,
    courseTime: input.courseTime,
    courseTitle: input.courseTitle,
    place: input.place,
  });

  const accent = resolveBrandAccent(input.brandColor);

  const bodyHtml = `
    ${termCardHtml({
      courseDate: input.courseDateRaw ?? null,
      courseTime: input.courseTime,
      courseEndTime: input.courseEndTime,
      courseTitle: input.courseTitle,
      place: input.place,
      teacherName: input.teacherName,
    })}
    <p style="margin:0 0 16px 0;">
      In <strong>${escapeHtml(input.courseTitle)}</strong> ist ein Platz für dich frei geworden.
      Dein Platz ist bis <strong>${escapeHtml(hold.date)}, ${escapeHtml(hold.time)} Uhr</strong>
      reserviert. Bitte bezahle bis dahin online, sonst geht er an die nächste Person.
    </p>
    <p style="margin:0 0 8px 0;">
      ${primaryButtonHtml(input.link, "Zu meinen Anmeldungen", accent)}
    </p>
    <p style="margin:16px 0 0 0;color:#6F6558;font-size:13px;">
      Wenn du den Platz nicht mehr brauchst, kannst du dich dort wieder abmelden.
    </p>`;

  const textBody = [
    `In ${input.courseTitle} ist ein Platz für dich frei geworden.`,
    `Dein Platz ist bis ${hold.date}, ${hold.time} Uhr reserviert.`,
    `Bitte bezahle bis dahin online: ${input.link}`,
  ].join("\n");

  const { html, text } = renderEmailShell(
    {
      preheader,
      studioName: input.studioName,
      logoUrl: input.logoUrl,
      brandColor: input.brandColor,
      title: "Du bist nachgerückt",
      introHtml: `Ein Platz bei ${escapeHtml(input.studioName)} wartet auf dich.`,
      bodyHtml,
    },
    textBody,
  );

  return { subject, html, text };
}

export function buildPaymentSucceededEmail(input: {
  courseTitle: string;
  courseDate: string;
  courseTime: string;
  studioName: string;
  amountCents: number;
  link: string;
  receiptLink: string;
  receiptNumber: string;
  registrationId: string;
  /** https calendar-ics Link; fehlt → Knopf entfällt (Tests ohne Secret). */
  calendarIcsUrl?: string | null;
  googleCalendarUrl?: string | null;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
  durationMinutes?: number | null;
  place?: string | null;
  teacherName?: string | null;
  taxRegime?: string | null;
  vatRateBp?: number | null;
  cancelDeadline?: string | null;
  termsText?: string | null;
  paidAtLabel?: string | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  courseDateRaw?: string | null;
  courseEndTime?: string | null;
}): EmailPayload {
  const subject = `Buchungsbestätigung: ${input.courseTitle} am ${input.courseDate}`;
  const preheader = formatEmailPreheader({
    courseDate: input.courseDateRaw ?? null,
    courseTime: input.courseTime,
    courseTitle: input.courseTitle,
    place: input.place,
  });

  const ics = buildIcs({
    uid: input.registrationId,
    summary: input.courseTitle,
    date: input.courseDateRaw ?? "",
    startTime: input.courseTime,
    endTime: input.courseEndTime,
    location: input.place ?? undefined,
    description: `Buchung bei ${input.studioName}`,
    method: "REQUEST",
  });

  const accent = resolveBrandAccent(input.brandColor);

  const paidBits = [
    formatEurCents(input.amountCents),
    "Karte",
    input.paidAtLabel ?? "",
  ].filter(Boolean).join(" · ");

  const calendarPrimary = input.calendarIcsUrl
    ? `<p style="margin:0 0 8px 0;">${primaryButtonHtml(input.calendarIcsUrl, "In Kalender eintragen", accent)}</p>`
    : "";
  const calendarSecondary = input.googleCalendarUrl
    ? `<p style="margin:0 0 20px 0;font-size:13px;">${textLinkHtml(input.googleCalendarUrl, "Google Kalender", accent)}</p>`
    : `<p style="margin:0 0 20px 0;"></p>`;

  const bodyHtml = `
    ${termCardHtml({
      courseDate: input.courseDateRaw ?? null,
      courseTime: input.courseTime,
      courseEndTime: input.courseEndTime,
      courseTitle: input.courseTitle,
      place: input.place,
      teacherName: input.teacherName,
      accent,
    })}
    ${calendarPrimary}
    ${calendarSecondary}
    <p style="margin:0 0 20px 0;">
      ${textLinkHtml(input.link, "Buchung ansehen", accent)}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px 0;background:#F5F3EF;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 6px 0;font-size:15px;font-weight:600;color:#1F1B16;">${escapeHtml(paidBits)}</p>
          <p style="margin:0 0 8px 0;font-size:12px;color:#6F6558;">${escapeHtml(taxLineSmall(input.taxRegime ?? null, input.vatRateBp ?? null))}</p>
          ${receiptMentionHtml(input.receiptNumber, input.receiptLink, accent)}
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:14px;color:#374151;">${escapeHtml(cancelLine(input.cancelDeadline))}</p>`;

  // Preiszeile bewusst im Text (K6/N5), auch wenn HTML die Kurzform im Kasten zeigt.
  const textBody = [
    `Deine Buchung bei ${input.studioName} ist bestätigt.`,
    `${input.courseTitle}`,
    `${input.courseDate} ${input.courseTime}${input.place ? ` · ${input.place}` : ""}`,
    input.teacherName ? `Lehrende: ${input.teacherName}` : "",
    priceLine(input.amountCents, input.taxRegime ?? null, input.vatRateBp ?? null),
    `Zahlungsart Karte (online)${input.paidAtLabel ? `, ${input.paidAtLabel}` : ""}`,
    cancelLine(input.cancelDeadline),
    "Für Kurse mit festem Termin besteht kein Widerrufsrecht (§ 312g Abs. 2 Nr. 9 BGB).",
    receiptMentionText(input.receiptNumber, input.receiptLink),
    `Buchung ansehen: ${input.link}`,
    input.calendarIcsUrl ? `Kalender: ${input.calendarIcsUrl}` : "",
    input.googleCalendarUrl ? `Google Kalender: ${input.googleCalendarUrl}` : "",
    "Kalenderdatei im Anhang (ICS).",
  ].filter(Boolean).join("\n");

  const { html, text } = renderEmailShell(
    {
      preheader,
      studioName: input.studioName,
      logoUrl: input.logoUrl,
      brandColor: input.brandColor,
      title: "Du bist dabei",
      introHtml: `Deine Buchung bei ${escapeHtml(input.studioName)} ist bestätigt.`,
      bodyHtml,
      footerHtml: providerFooterHtml(input),
    },
    textBody + "\n\n" + [
      input.legalName || input.studioName,
      `${input.legalStreet ?? ""} ${input.legalHouse ?? ""}`.trim(),
      `${input.legalPostal ?? ""} ${input.legalCity ?? ""}`.trim(),
      input.contactEmail ?? "",
    ].filter(Boolean).join("\n"),
  );

  const attachments: EmailAttachment[] = [{
    filename: "buchung.ics",
    content: ics,
    contentType: "text/calendar; charset=utf-8; method=REQUEST",
    encoding: "utf-8",
  }];

  return { subject, html, text, attachments };
}

export function buildPaymentRefundedEmail(input: {
  courseTitle: string;
  courseDate: string;
  studioName: string;
  refundAmountCents: number;
  originalAmountCents: number | null;
  reason: string | null;
  receiptLink?: string | null;
  receiptNumber?: string | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  courseDateRaw?: string | null;
  courseTime?: string | null;
  courseEndTime?: string | null;
  place?: string | null;
  teacherName?: string | null;
  legalName?: string | null;
  legalStreet?: string | null;
  legalHouse?: string | null;
  legalPostal?: string | null;
  legalCity?: string | null;
  contactEmail?: string | null;
  legalPhone?: string | null;
}): EmailPayload {
  const refundLabel = formatEurCents(input.refundAmountCents);
  const original = input.originalAmountCents;
  const isPartial = original != null && original > input.refundAmountCents;
  const title = `${refundLabel} sind auf dem Weg zu dir`;
  const amountBoxLine = isPartial
    ? `${refundLabel} von ${formatEurCents(original!)}`
    : refundLabel;

  const reasonLine = refundReasonSentence(input.reason);
  const accent = resolveBrandAccent(input.brandColor);
  const preheader = formatEmailPreheader({
    courseDate: input.courseDateRaw ?? null,
    courseTime: input.courseTime ?? null,
    courseTitle: input.courseTitle,
    place: input.place,
  }) || title;

  const bodyHtml = `
    ${termCardHtml({
      courseDate: input.courseDateRaw ?? null,
      courseTime: input.courseTime ?? null,
      courseEndTime: input.courseEndTime,
      courseTitle: input.courseTitle,
      place: input.place,
      teacherName: input.teacherName,
      muted: true,
      accent,
    })}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px 0;background:#F5F3EF;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#1F1B16;">${escapeHtml(amountBoxLine)}</p>
          <p style="margin:0 0 8px 0;font-size:14px;color:#6F6558;">zurück auf deine Karte</p>
          ${reasonLine ? `<p style="margin:0 0 8px 0;font-size:14px;color:#1F1B16;">${escapeHtml(reasonLine)}</p>` : ""}
          <p style="margin:0 0 10px 0;font-size:13px;color:#6F6558;">Gutschrift je nach Bank in einigen Werktagen</p>
          ${input.receiptLink && input.receiptNumber
            ? receiptMentionHtml(
              input.receiptNumber,
              input.receiptLink,
              accent,
              "Erstattungsbeleg ansehen",
            )
            : ""}
        </td>
      </tr>
    </table>`;

  const textBody = [
    title,
    input.courseTitle,
    `${input.courseDate}${input.courseTime ? ` ${formatTimeHm(input.courseTime)}` : ""}`,
    amountBoxLine,
    "zurück auf deine Karte",
    reasonLine ?? "",
    "Gutschrift je nach Bank in einigen Werktagen",
    input.receiptLink && input.receiptNumber
      ? receiptMentionText(
        input.receiptNumber,
        input.receiptLink,
        "Erstattungsbeleg ansehen",
      )
      : "",
  ].filter(Boolean).join("\n");

  const { html, text } = renderEmailShell(
    {
      preheader,
      studioName: input.studioName,
      logoUrl: input.logoUrl,
      brandColor: input.brandColor,
      title,
      introHtml: `Eine Erstattung von ${escapeHtml(input.studioName)} ist unterwegs.`,
      bodyHtml,
      footerHtml: providerFooterHtml(input),
    },
    textBody + "\n\n" + [
      input.legalName || input.studioName,
      `${input.legalStreet ?? ""} ${input.legalHouse ?? ""}`.trim(),
      `${input.legalPostal ?? ""} ${input.legalCity ?? ""}`.trim(),
      input.contactEmail ?? "",
    ].filter(Boolean).join("\n"),
  );

  return { subject: title, html, text };
}

/** E5: Grund-Satz je reason; manual/provider_dashboard ohne Satz. */
export function refundReasonSentence(reason: string | null | undefined): string | null {
  switch (reason) {
    case "course_cancelled":
      return "Der Kurs wurde abgesagt.";
    case "self_cancel_in_window":
      return "Du hast dich rechtzeitig abgemeldet.";
    case "staff_unregister":
    case "member_removed":
      return "Das Studio hat deine Anmeldung storniert.";
    case "late_payment":
      return "Dein Platz war leider inzwischen vergeben.";
    case "withdrawal":
      return "Du hast den Vertrag widerrufen.";
    default:
      return null;
  }
}

function recipientGone(ctx: DeliveryContext | null): boolean {
  if (!ctx) return true;
  if (ctx.anonymizedAt != null || ctx.authUserId == null) return true;
  if (!ctx.recipientEmail || !ctx.recipientEmail.trim()) return true;
  return false;
}

/** S6d: Promotion vor dem Versand. */
export function classifyDelivery(
  ctx: DeliveryContext | null,
): "ok" | "NOT_PENDING" | "RECIPIENT_GONE" {
  if (recipientGone(ctx)) return "RECIPIENT_GONE";
  if (ctx!.registrationStatus !== "pending_payment") return "NOT_PENDING";
  return "ok";
}

/** J10: payment_succeeded. */
export function classifyPaymentSucceeded(
  ctx: DeliveryContext | null,
): "ok" | "RECIPIENT_GONE" | "NOT_REGISTERED" | "ALREADY_REFUNDED" | "AMOUNT_MISSING" {
  if (recipientGone(ctx)) return "RECIPIENT_GONE";
  const status = ctx!.registrationStatus;
  if (status !== "registered" && status !== "paid") return "NOT_REGISTERED";
  if (ctx!.hasRefund) return "ALREADY_REFUNDED";
  if (ctx!.amountCents == null || ctx!.amountCents <= 0) return "AMOUNT_MISSING";
  return "ok";
}

/** J10: payment_refunded. */
export function classifyPaymentRefunded(
  ctx: DeliveryContext | null,
): "ok" | "RECIPIENT_GONE" | "REFUND_MISSING" | "AMOUNT_MISSING" {
  if (recipientGone(ctx)) return "RECIPIENT_GONE";
  if (!ctx!.hasRefund) return "REFUND_MISSING";
  const amount = ctx!.refundAmountCents ?? ctx!.amountCents;
  if (amount == null || amount <= 0) return "AMOUNT_MISSING";
  return "ok";
}

async function sendBuilt(
  deps: DispatchDeps,
  row: DeliveryRow,
  ctx: DeliveryContext,
  mail: EmailPayload,
): Promise<"SENT" | string> {
  const sent = await deps.sendEmail({
    to: ctx.recipientEmail!.trim(),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    fromName: studioFromName(ctx.studioName ?? "Studio"),
    replyTo: ctx.contactEmail ?? undefined,
    attachments: mail.attachments,
  });
  if (!sent.ok) {
    await deps.markDelivery(row.id, "failed", sent.errorCode);
    deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: sent.errorCode });
    return sent.errorCode;
  }
  await deps.markDelivery(row.id, "sent", null);
  deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "SENT" });
  return "SENT";
}

const PASS_EMAIL_KINDS = new Set([
  "pass_purchased",
  "pass_expiring_30",
  "pass_expiring_7",
  "pass_units_low",
  "pass_withdrawal_received",
  "pass_withdrawal_refunded",
]);

export async function runDispatch(deps: DispatchDeps): Promise<DispatchResult> {
  const rows = await deps.claimDeliveries(DISPATCH_LIMIT);
  const results: DispatchResult["results"] = [];

  for (const row of rows) {
    if (PASS_EMAIL_KINDS.has(row.kind)) {
      const passId = row.pass_id ?? "";
      if (!passId) {
        await deps.markDelivery(row.id, "failed", "PASS_MISSING");
        results.push({ deliveryId: row.id, kind: row.kind, code: "PASS_MISSING" });
        continue;
      }
      const pctx = await deps.loadPassContext(passId);
      if (recipientPassGone(pctx)) {
        await deps.markDelivery(row.id, "skipped", "RECIPIENT_GONE");
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "RECIPIENT_GONE" });
        results.push({ deliveryId: row.id, kind: row.kind, code: "RECIPIENT_GONE" });
        continue;
      }
      const coursesLink = buildCoursesLink(pctx!.studioSlug, deps.env("APP_BASE_DOMAIN"));
      const widerrufLink = buildWiderrufLink(pctx!.studioSlug, deps.env("APP_BASE_DOMAIN"));
      let mail: EmailPayload;
      if (row.kind === "pass_purchased") {
        if (!pctx!.receiptId || !pctx!.receiptNumber) {
          await deps.markDelivery(row.id, "released", "RECEIPT_PENDING");
          results.push({ deliveryId: row.id, kind: row.kind, code: "RECEIPT_PENDING" });
          continue;
        }
        if (pctx!.amountCents == null || pctx!.amountCents <= 0) {
          await deps.markDelivery(row.id, "skipped", "AMOUNT_MISSING");
          results.push({ deliveryId: row.id, kind: row.kind, code: "AMOUNT_MISSING" });
          continue;
        }
        mail = buildPassPurchasedEmail({
          passName: pctx!.passName,
          unitsTotal: pctx!.unitsTotal,
          validUntil: pctx!.validUntil,
          studioName: pctx!.studioName ?? "Studio",
          amountCents: pctx!.amountCents,
          coursesLink,
          receiptLink: buildReceiptLink(
            pctx!.studioSlug,
            deps.env("APP_BASE_DOMAIN"),
            pctx!.receiptId,
          ),
          receiptNumber: pctx!.receiptNumber,
          widerrufLink,
          brandColor: pctx!.brandColor,
          logoUrl: pctx!.logoUrl,
          legalName: pctx!.legalName,
          legalStreet: pctx!.legalStreet,
          legalHouse: pctx!.legalHouse,
          legalPostal: pctx!.legalPostal,
          legalCity: pctx!.legalCity,
          contactEmail: pctx!.contactEmail,
          legalPhone: pctx!.legalPhone,
          taxRegime: pctx!.taxRegime,
          vatRateBp: pctx!.vatRateBp,
        });
      } else if (row.kind === "pass_expiring_30" || row.kind === "pass_expiring_7") {
        mail = buildPassExpiringEmail({
          kind: row.kind,
          passName: pctx!.passName,
          remaining: pctx!.remaining,
          validUntil: pctx!.validUntil,
          studioName: pctx!.studioName ?? "Studio",
          coursesLink,
          brandColor: pctx!.brandColor,
          logoUrl: pctx!.logoUrl,
          legalName: pctx!.legalName,
          legalStreet: pctx!.legalStreet,
          legalHouse: pctx!.legalHouse,
          legalPostal: pctx!.legalPostal,
          legalCity: pctx!.legalCity,
          contactEmail: pctx!.contactEmail,
          legalPhone: pctx!.legalPhone,
        });
      } else if (row.kind === "pass_units_low") {
        mail = buildPassUnitsLowEmail({
          passName: pctx!.passName,
          validUntil: pctx!.validUntil,
          studioName: pctx!.studioName ?? "Studio",
          coursesLink,
          brandColor: pctx!.brandColor,
          logoUrl: pctx!.logoUrl,
          legalName: pctx!.legalName,
          legalStreet: pctx!.legalStreet,
          legalHouse: pctx!.legalHouse,
          legalPostal: pctx!.legalPostal,
          legalCity: pctx!.legalCity,
          contactEmail: pctx!.contactEmail,
          legalPhone: pctx!.legalPhone,
        });
      } else if (row.kind === "pass_withdrawal_received") {
        mail = buildPassWithdrawalReceivedEmail({
          passName: pctx!.passName,
          studioName: pctx!.studioName ?? "Studio",
          withdrawalAt: pctx!.withdrawalAt ?? new Date().toISOString(),
          priceCents: pctx!.amountCents ?? 0,
          unitsUsed: pctx!.unitsUsed ?? 0,
          wertersatzCents: pctx!.wertersatzCents ?? 0,
          refundCents: pctx!.refundAmountCents ?? 0,
          brandColor: pctx!.brandColor,
          logoUrl: pctx!.logoUrl,
          legalName: pctx!.legalName,
          legalStreet: pctx!.legalStreet,
          legalHouse: pctx!.legalHouse,
          legalPostal: pctx!.legalPostal,
          legalCity: pctx!.legalCity,
          contactEmail: pctx!.contactEmail,
          legalPhone: pctx!.legalPhone,
        });
      } else {
        if (!pctx!.refundReceiptId || !pctx!.refundReceiptNumber) {
          await deps.markDelivery(row.id, "released", "RECEIPT_PENDING");
          results.push({ deliveryId: row.id, kind: row.kind, code: "RECEIPT_PENDING" });
          continue;
        }
        mail = buildPassWithdrawalRefundedEmail({
          passName: pctx!.passName,
          studioName: pctx!.studioName ?? "Studio",
          refundCents: pctx!.refundAmountCents ?? 0,
          receiptLink: buildReceiptLink(
            pctx!.studioSlug,
            deps.env("APP_BASE_DOMAIN"),
            pctx!.refundReceiptId,
          ),
          receiptNumber: pctx!.refundReceiptNumber,
          brandColor: pctx!.brandColor,
          logoUrl: pctx!.logoUrl,
          legalName: pctx!.legalName,
          legalStreet: pctx!.legalStreet,
          legalHouse: pctx!.legalHouse,
          legalPostal: pctx!.legalPostal,
          legalCity: pctx!.legalCity,
          contactEmail: pctx!.contactEmail,
          legalPhone: pctx!.legalPhone,
        });
      }
      const code = await sendBuilt(deps, row, {
        registrationStatus: null,
        holdExpiresAt: null,
        courseTitle: null,
        courseDate: null,
        courseTime: null,
        studioName: pctx!.studioName,
        studioSlug: pctx!.studioSlug,
        recipientEmail: pctx!.recipientEmail,
        anonymizedAt: pctx!.anonymizedAt,
        authUserId: pctx!.authUserId,
        amountCents: pctx!.amountCents,
        refundAmountCents: pctx!.refundAmountCents,
        originalAmountCents: pctx!.amountCents,
        refundReason: "withdrawal",
        hasRefund: false,
        refundRequired: false,
        contactEmail: pctx!.contactEmail,
      }, mail);
      results.push({ deliveryId: row.id, kind: row.kind, code });
      continue;
    }

    if (!row.registration_id) {
      await deps.markDelivery(row.id, "failed", "REGISTRATION_MISSING");
      results.push({ deliveryId: row.id, kind: row.kind, code: "REGISTRATION_MISSING" });
      continue;
    }
    const ctx = await deps.loadContext(row.registration_id);

    if (row.kind === "waitlist_promoted_payment_required") {
      const gate = classifyDelivery(ctx);
      if (gate !== "ok") {
        await deps.markDelivery(row.id, "skipped", gate);
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: gate });
        results.push({ deliveryId: row.id, kind: row.kind, code: gate });
        continue;
      }
      const courseDate = courseDateText(ctx!.courseDate);
      const courseTime = courseTimeText(ctx!.courseTime);
      const holdIso = ctx!.holdExpiresAt ?? new Date().toISOString();
      const link = buildMyRegistrationsLink(ctx!.studioSlug, deps.env("APP_BASE_DOMAIN"));
      const mail = buildPromotionEmail({
        courseTitle: ctx!.courseTitle ?? "Kurs",
        courseDate,
        courseTime,
        studioName: ctx!.studioName ?? "Studio",
        holdExpiresAt: holdIso,
        link,
        brandColor: ctx!.brandColor,
        logoUrl: ctx!.logoUrl,
        courseDateRaw: ctx!.courseDate,
        courseEndTime: ctx!.courseEndTime,
        place: placeOf(ctx!),
        teacherName: ctx!.teacherName,
      });
      const code = await sendBuilt(deps, row, ctx!, mail);
      results.push({ deliveryId: row.id, kind: row.kind, code });
      continue;
    }

    if (row.kind === "payment_succeeded") {
      const gate = classifyPaymentSucceeded(ctx);
      if (gate !== "ok") {
        await deps.markDelivery(row.id, "skipped", gate);
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: gate });
        results.push({ deliveryId: row.id, kind: row.kind, code: gate });
        continue;
      }
      if (!ctx!.receiptId || !ctx!.receiptNumber) {
        await deps.markDelivery(row.id, "released", "RECEIPT_PENDING");
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "RECEIPT_PENDING" });
        results.push({ deliveryId: row.id, kind: row.kind, code: "RECEIPT_PENDING" });
        continue;
      }
      if (!ctx!.courseDate || !ctx!.courseTime) {
        await deps.markDelivery(row.id, "failed", "COURSE_TIME_MISSING");
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "COURSE_TIME_MISSING" });
        results.push({ deliveryId: row.id, kind: row.kind, code: "COURSE_TIME_MISSING" });
        continue;
      }
      const link = buildMyRegistrationsLink(ctx!.studioSlug, deps.env("APP_BASE_DOMAIN"));
      const receiptLink = buildReceiptLink(
        ctx!.studioSlug,
        deps.env("APP_BASE_DOMAIN"),
        ctx!.receiptId,
      );
      const place = placeOf(ctx!) || null;
      const paidAtLabel = ctx!.paidAt ? berlinParts(ctx!.paidAt).date : null;
      const calendarSecret = deps.env("CALENDAR_ICS_SECRET")?.trim() ?? "";
      let calendarIcsUrl: string | null = null;
      if (calendarSecret) {
        const token = await signCalendarToken(calendarSecret, row.registration_id);
        // UX-4 C1: Mail verlinkt auf Kalender-Seite; ICS bleibt als Anhang.
        calendarIcsUrl = buildCalendarPageUrl(
          ctx!.studioSlug,
          deps.env("APP_BASE_DOMAIN"),
          token,
        );
      }
      const googleCalendarUrl = buildGoogleCalendarUrl({
        title: ctx!.courseTitle ?? "Kurs",
        date: ctx!.courseDate,
        startTime: ctx!.courseTime,
        endTime: ctx!.courseEndTime,
        location: place,
        details: `Buchung bei ${ctx!.studioName ?? "Studio"}`,
      });
      const mail = buildPaymentSucceededEmail({
        courseTitle: ctx!.courseTitle ?? "Kurs",
        courseDate: courseDateText(ctx!.courseDate),
        courseTime: courseTimeText(ctx!.courseTime),
        studioName: ctx!.studioName ?? "Studio",
        amountCents: ctx!.amountCents!,
        link,
        receiptLink,
        receiptNumber: ctx!.receiptNumber,
        registrationId: row.registration_id,
        calendarIcsUrl,
        googleCalendarUrl,
        legalName: ctx!.legalName,
        legalStreet: ctx!.legalStreet,
        legalHouse: ctx!.legalHouse,
        legalPostal: ctx!.legalPostal,
        legalCity: ctx!.legalCity,
        contactEmail: ctx!.contactEmail,
        legalPhone: ctx!.legalPhone,
        durationMinutes: ctx!.durationMinutes,
        place,
        teacherName: ctx!.teacherName,
        taxRegime: ctx!.taxRegime,
        vatRateBp: ctx!.vatRateBp,
        cancelDeadline: ctx!.cancelDeadline,
        termsText: ctx!.termsText,
        paidAtLabel,
        brandColor: ctx!.brandColor,
        logoUrl: ctx!.logoUrl,
        courseDateRaw: ctx!.courseDate,
        courseEndTime: ctx!.courseEndTime,
      });
      const code = await sendBuilt(deps, row, ctx!, mail);
      results.push({ deliveryId: row.id, kind: row.kind, code });
      continue;
    }

    if (row.kind === "payment_refunded") {
      const gate = classifyPaymentRefunded(ctx);
      if (gate !== "ok") {
        await deps.markDelivery(row.id, "skipped", gate);
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: gate });
        results.push({ deliveryId: row.id, kind: row.kind, code: gate });
        continue;
      }
      if (!ctx!.refundReceiptId || !ctx!.refundReceiptNumber) {
        await deps.markDelivery(row.id, "released", "RECEIPT_PENDING");
        deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "RECEIPT_PENDING" });
        results.push({ deliveryId: row.id, kind: row.kind, code: "RECEIPT_PENDING" });
        continue;
      }
      const refundCents = ctx!.refundAmountCents ?? ctx!.amountCents!;
      const reason = ctx!.refundReason ??
        (ctx!.refundRequired ? "late_payment" : null);
      const mail = buildPaymentRefundedEmail({
        courseTitle: ctx!.courseTitle ?? "Kurs",
        courseDate: courseDateText(ctx!.courseDate),
        studioName: ctx!.studioName ?? "Studio",
        refundAmountCents: refundCents,
        originalAmountCents: ctx!.originalAmountCents,
        reason,
        receiptLink: buildReceiptLink(
          ctx!.studioSlug,
          deps.env("APP_BASE_DOMAIN"),
          ctx!.refundReceiptId,
        ),
        receiptNumber: ctx!.refundReceiptNumber,
        brandColor: ctx!.brandColor,
        logoUrl: ctx!.logoUrl,
        courseDateRaw: ctx!.courseDate,
        courseTime: ctx!.courseTime,
        courseEndTime: ctx!.courseEndTime,
        place: placeOf(ctx!),
        teacherName: ctx!.teacherName,
        legalName: ctx!.legalName,
        legalStreet: ctx!.legalStreet,
        legalHouse: ctx!.legalHouse,
        legalPostal: ctx!.legalPostal,
        legalCity: ctx!.legalCity,
        contactEmail: ctx!.contactEmail,
        legalPhone: ctx!.legalPhone,
      });
      const code = await sendBuilt(deps, row, ctx!, mail);
      results.push({ deliveryId: row.id, kind: row.kind, code });
      continue;
    }

    await deps.markDelivery(row.id, "skipped", "UNKNOWN_KIND");
    deps.log.info("dispatch", { delivery_id: row.id, kind: row.kind, code: "UNKNOWN_KIND" });
    results.push({ deliveryId: row.id, kind: row.kind, code: "UNKNOWN_KIND" });
  }

  return { processed: results.length, results };
}

export function authorizeDispatch(
  req: Request,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret || !expectedSecret.trim()) return false;
  const got = req.headers.get(SECRET_HEADER);
  return got === expectedSecret;
}

export async function handleDispatchRequest(
  req: Request,
  deps: DispatchDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const secret = deps.env("EMAIL_DISPATCH_SECRET");
  if (!authorizeDispatch(req, secret)) {
    deps.log.warn("dispatch unauthorized");
    return new Response(JSON.stringify({ error: "Unauthorized", code: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await runDispatch(deps);
  return new Response(JSON.stringify({ success: true, ...result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function createDefaultLog(): ServiceLogger {
  return createServiceLogger();
}
