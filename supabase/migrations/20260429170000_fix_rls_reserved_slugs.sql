-- Fix: RLS auf reserved_slugs aktivieren (war in E1-Migration vergessen worden)
-- Tabelle enthält nur reservierte Wörter (www, api, admin, …) – keine sensiblen Daten.
-- Read-only für alle; Schreibzugriff nur über service_role.

ALTER TABLE public.reserved_slugs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reserved_slugs_public_read"
ON public.reserved_slugs
FOR SELECT
USING (true);
