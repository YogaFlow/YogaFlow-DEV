-- RT-2 Nachtrag: AGB § 9 Abs. 3 Klarstellung „bis zum Wirksamwerden“ → neuer Hash.
-- allow: (seed only)
-- Hash normalizeLegalMarkdown(strip Hinweise):
--   terms: 9acd5496274c520c18dcccb0fe6bbdae0626225b66bdfdc85dfa1e7734622fe4

INSERT INTO public.legal_document_versions (document, version, content_hash)
VALUES (
  'terms',
  '2026-10-09',
  '9acd5496274c520c18dcccb0fe6bbdae0626225b66bdfdc85dfa1e7734622fe4'
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
       '9acd5496274c520c18dcccb0fe6bbdae0626225b66bdfdc85dfa1e7734622fe4'
  THEN
    RAISE EXCEPTION 'RT-2 Abs.3: terms version=% hash=%', v_ver, v_hash;
  END IF;
END;
$$;
