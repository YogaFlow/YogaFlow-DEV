/**
 * Maskiert sensible Fragmente in Log-Texten (I10).
 * Keine Abhängigkeiten — absichtlich getrennt von service.ts, damit Deno-Tests offline laufen.
 *
 * Beträge: nur wenn ein Geldsignal da ist —
 *   (a) Schlüssel amount|amount_cents|price(_cents)|betrag|total_cents neben einer Zahl, oder
 *   (b) Zahl mit € / EUR.
 * Bloße Integers (HTTP-Status, Zähler, UUIDs-Teile) bleiben stehen.
 */

const EMAIL_RE =
  /\b[A-Za-z0-9](?:[A-Za-z0-9._%+-]{0,63}[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,}\b/g;

/** IBAN: Ländercode + Prüfziffer + 11–30 alphanumerische Zeichen, optional Leerzeichen dazwischen. */
const IBAN_RE =
  /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g;

/** Stripe- und Secret-Präfixe inkl. Test-Secrets (sk_test_… mit Unterstrichen). */
const STRIPE_RE =
  /\b(?:pm|cus|pi|acct|sk|whsec)_[A-Za-z0-9_]+\b/g;

/**
 * amount_cents: 1500 | "amount":"12.5" | betrag=12
 * Optionale Anführungszeichen um Key-Trenner und Wert (JSON-Logs).
 */
const AMOUNT_KEY_RE =
  /\b(amount_cents|price_cents|total_cents|amount|price|betrag)\b("?\s*[:=]\s*"?)(-?\d+(?:[.,]\d{1,2})?)("?)/gi;

/**
 * 18 € | 18,50€ | 18.50 EUR | EUR 18
 * Nach € kein \\b (€ ist kein Wortzeichen — sonst kein Treffer vor Leerzeichen).
 */
const AMOUNT_CURRENCY_RE =
  /(?:\bEUR\s*-?\d{1,7}(?:[.,]\d{1,2})?\b|-?\d{1,7}(?:[.,]\d{1,2})?\s*€|-?\d{1,7}(?:[.,]\d{1,2})?\s*EUR\b)/gi;

const MASK = "[redacted]";

export function maskSensitiveText(input: string): string {
  if (input === "") return input;

  let out = input;
  out = out.replace(EMAIL_RE, MASK);
  out = out.replace(IBAN_RE, MASK);
  out = out.replace(STRIPE_RE, MASK);
  out = out.replace(
    AMOUNT_KEY_RE,
    (_m, key: string, sep: string, _num: string, trail: string) =>
      `${key}${sep}${MASK}${trail}`,
  );
  out = out.replace(AMOUNT_CURRENCY_RE, MASK);
  return out;
}
