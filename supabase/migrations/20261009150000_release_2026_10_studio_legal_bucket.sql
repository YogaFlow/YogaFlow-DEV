-- Release 2026-10 — Bucket studio-legal idempotent absichern.
-- allow: (storage bucket)
--
-- RT-1 (20261005130000) legt den Bucket bereits an. Diese Migration ist
-- der Sicherheitsnetz-Schritt für PROD, falls der Bucket fehlt oder
-- abweichend konfiguriert ist. Keine Client-Policies: PDF-Zugriff nur über
-- Edge Function legal-pdf (service_role). Auf DEV gibt es ebenfalls keine
-- storage.objects-Policies für studio-legal (Stand Bestandsaufnahme).
--
-- Rückweg: Bucket und Objekte bleiben (PDFs); manuell im Dashboard löschen.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'studio-legal',
  'studio-legal',
  false,
  5242880,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'studio-legal'
      AND public IS FALSE
  ) THEN
    RAISE EXCEPTION 'release_2026_10: Bucket studio-legal fehlt oder ist öffentlich';
  END IF;
END;
$$;
