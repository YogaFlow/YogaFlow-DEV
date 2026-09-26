-- A1 / D6 — Enum-Wert cancelled für Soft-Cancel (nur ADD VALUE).
--
-- Zweck: registration_status um 'cancelled' erweitern, damit Anmeldungen
-- Soft-Cancel statt DELETE nutzen können (Nachtrag A1, Entscheidung D6).
-- Diese Datei nutzt den neuen Wert nirgends — Nutzung erst in
-- 20260926141501_a1_registrations_soft_cancel_schema.sql (eigene Transaktion;
-- innerhalb einer TX ist ein frisch hinzugefügter Enum-Wert in Postgres
-- noch nicht verwendbar).
--
-- Rückweg: Ein Enum-Wert lässt sich in Postgres nicht einfach entfernen.
-- Rückweg = Wert bleibt ungenutzt; keine abhängigen Spalten/CHECKS in
-- dieser Datei. Spätere Migrationen, die 'cancelled' nutzen, haben eigene
-- Rückwege.

ALTER TYPE public.registration_status ADD VALUE IF NOT EXISTS 'cancelled';
