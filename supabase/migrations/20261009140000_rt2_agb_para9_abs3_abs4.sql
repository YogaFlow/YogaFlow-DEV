-- RT-2 Nachtrag: AGB § 9 Abs. 3 + 4 (wirksam mit Zugang, 30 Tage Export, Löschung).
-- Abs. 2 unverändert.
-- allow: (seed only)
-- Hash normalizeLegalMarkdown(strip Hinweise):
--   terms: 815a10da0ad9a1f70fde4ca8dac7e684dd2ac8ec14225b3830e3318c8ad6927d

INSERT INTO public.legal_document_versions (document, version, content_hash)
VALUES (
  'terms',
  '2026-10-09',
  '815a10da0ad9a1f70fde4ca8dac7e684dd2ac8ec14225b3830e3318c8ad6927d'
)
ON CONFLICT (document) DO UPDATE
  SET version = EXCLUDED.version,
      content_hash = EXCLUDED.content_hash,
      updated_at = pg_catalog.now();

DO $$
DECLARE
  v_hash text;
  v_ver text;
BEGIN
  SELECT version, content_hash INTO v_ver, v_hash
  FROM public.legal_document_versions WHERE document = 'terms';
  IF v_ver IS DISTINCT FROM '2026-10-09'
     OR v_hash IS DISTINCT FROM
       '815a10da0ad9a1f70fde4ca8dac7e684dd2ac8ec14225b3830e3318c8ad6927d'
  THEN
    RAISE EXCEPTION 'RT-2 Abs.3/4: terms version=% hash=%', v_ver, v_hash;
  END IF;
END;
$$;
