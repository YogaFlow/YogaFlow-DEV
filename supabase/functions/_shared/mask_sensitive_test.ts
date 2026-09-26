import { maskSensitiveText } from "./mask_sensitive.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string): void {
  if (actual !== expected) {
    throw new Error(
      `${msg ?? "assertEquals"}:\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("E-Mail mitten im Satz", () => {
  assertEquals(
    maskSensitiveText("Mail an demoalpha.owner@example.com gesendet"),
    "Mail an [redacted] gesendet",
  );
});

Deno.test("IBAN mit Leerzeichen", () => {
  assertEquals(
    maskSensitiveText("Konto DE89 3704 0044 0532 0130 00"),
    "Konto [redacted]",
  );
});

Deno.test("IBAN ohne Leerzeichen", () => {
  assertEquals(
    maskSensitiveText("IBAN DE89370400440532013000 gebucht"),
    "IBAN [redacted] gebucht",
  );
});

Deno.test("Stripe-Präfixe pm_ cus_ pi_ acct_ sk_ whsec_", () => {
  const input =
    "pm_1Abc cus_XYZ pi_3Def acct_1Ghi sk_test_51Xxx whsec_abc123";
  assertEquals(
    maskSensitiveText(input),
    "[redacted] [redacted] [redacted] [redacted] [redacted] [redacted]",
  );
});

Deno.test("Betrag als Key=Zahl und als Währungsstring", () => {
  assertEquals(
    maskSensitiveText("amount_cents: 1500 und Preis 18,50 € sowie EUR 20"),
    "amount_cents: [redacted] und Preis [redacted] sowie [redacted]",
  );
  assertEquals(
    maskSensitiveText('{"amount":"12.5","price_cents":900}'),
    '{"amount":"[redacted]","price_cents":[redacted]}',
  );
});

Deno.test("mehrere Treffer in einem Text", () => {
  assertEquals(
    maskSensitiveText(
      "user a@b.de paid 15 € with pm_1X IBAN DE89370400440532013000",
    ),
    "user [redacted] paid [redacted] with [redacted] IBAN [redacted]",
  );
});

Deno.test("Text ohne Treffer bleibt unverändert", () => {
  const plain = "Kurs voll: 12 von 12 Plätzen, status=200";
  assertEquals(maskSensitiveText(plain), plain);
});

Deno.test("leerer String", () => {
  assertEquals(maskSensitiveText(""), "");
});
