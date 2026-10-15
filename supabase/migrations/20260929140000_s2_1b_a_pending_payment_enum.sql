-- 2.1b-a — Enum-Wert pending_payment für Reservierung (nur ADD VALUE).
--
-- Zweck: registration_status um 'pending_payment' erweitern (Platz reserviert,
-- Online-Zahlung läuft). Diese Datei nutzt den neuen Wert nirgends — Nutzung
-- erst in 20260929140001_s2_1b_a_pending_payment_schema.sql (eigene Transaktion;
-- innerhalb einer TX ist ein frisch hinzugefügter Enum-Wert in Postgres
-- noch nicht verwendbar). Muster wie A1 / 20260926141500.
--
-- Rückweg: Ein Enum-Wert lässt sich in Postgres nicht einfach entfernen.
-- Rückweg = Wert bleibt ungenutzt; keine abhängigen Spalten/CHECKS in
-- dieser Datei. Spätere Migrationen, die 'pending_payment' nutzen, haben
-- eigene Rückwege.

ALTER TYPE public.registration_status ADD VALUE IF NOT EXISTS 'pending_payment';
