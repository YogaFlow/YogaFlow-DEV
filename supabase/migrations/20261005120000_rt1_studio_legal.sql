-- RT-1 — Studio-Rechtstexte (Impressum/AGB/Datenschutz): Profilfelder, Fassungen, Sperre.
-- allow: imprint_complete,studio_tpl_accepted,studio_legal_texts_ready,online_method_block_reason,upsert_studio_legal_profile,get_studio_legal_profile,publish_studio_legal_document,release_studio_legal,get_studio_legal_status,get_public_studio_legal,accept_legal_document,get_legal_acceptance_status,get_payment_setup_status,set_online_payments_enabled,delete_tenant_complete
-- Hashes Vorlagen v1 (2026-10-05), normalize_legal_text wie hash_legal_text:
--   studio_terms_tpl:    873e2dc6efe889c446ded08ce80641e5f47ab6a6cb2d599e729ecfcf1b182311
--   studio_privacy_tpl:  fff7c88dc2fce2bfc38e93bab184ca3c385ffd08614191240eacf7524a13dbb3

-- ---------------------------------------------------------------------------
-- 1. tenant_legal_profiles: neue Felder
-- ---------------------------------------------------------------------------

ALTER TABLE public.tenant_legal_profiles
  ADD COLUMN IF NOT EXISTS legal_form text,
  ADD COLUMN IF NOT EXISTS representatives text,
  ADD COLUMN IF NOT EXISTS register_court text,
  ADD COLUMN IF NOT EXISTS register_number text,
  ADD COLUMN IF NOT EXISTS vat_id text,
  ADD COLUMN IF NOT EXISTS economic_id text,
  ADD COLUMN IF NOT EXISTS extra_rules text;

ALTER TABLE public.tenant_legal_profiles
  DROP CONSTRAINT IF EXISTS tenant_legal_profiles_legal_form_check;
ALTER TABLE public.tenant_legal_profiles
  ADD CONSTRAINT tenant_legal_profiles_legal_form_check
  CHECK (
    legal_form IS NULL
    OR legal_form IN ('sole_trader', 'gbr', 'ug', 'gmbh', 'ev', 'other')
  );

ALTER TABLE public.tenant_legal_profiles
  DROP CONSTRAINT IF EXISTS tenant_legal_profiles_representatives_len;
ALTER TABLE public.tenant_legal_profiles
  ADD CONSTRAINT tenant_legal_profiles_representatives_len
  CHECK (representatives IS NULL OR char_length(representatives) BETWEEN 1 AND 500);

ALTER TABLE public.tenant_legal_profiles
  DROP CONSTRAINT IF EXISTS tenant_legal_profiles_register_court_len;
ALTER TABLE public.tenant_legal_profiles
  ADD CONSTRAINT tenant_legal_profiles_register_court_len
  CHECK (register_court IS NULL OR char_length(register_court) BETWEEN 1 AND 120);

ALTER TABLE public.tenant_legal_profiles
  DROP CONSTRAINT IF EXISTS tenant_legal_profiles_register_number_len;
ALTER TABLE public.tenant_legal_profiles
  ADD CONSTRAINT tenant_legal_profiles_register_number_len
  CHECK (register_number IS NULL OR char_length(register_number) BETWEEN 1 AND 40);

ALTER TABLE public.tenant_legal_profiles
  DROP CONSTRAINT IF EXISTS tenant_legal_profiles_vat_id_len;
ALTER TABLE public.tenant_legal_profiles
  ADD CONSTRAINT tenant_legal_profiles_vat_id_len
  CHECK (vat_id IS NULL OR char_length(vat_id) BETWEEN 1 AND 40);

ALTER TABLE public.tenant_legal_profiles
  DROP CONSTRAINT IF EXISTS tenant_legal_profiles_economic_id_len;
ALTER TABLE public.tenant_legal_profiles
  ADD CONSTRAINT tenant_legal_profiles_economic_id_len
  CHECK (economic_id IS NULL OR char_length(economic_id) BETWEEN 1 AND 40);

ALTER TABLE public.tenant_legal_profiles
  DROP CONSTRAINT IF EXISTS tenant_legal_profiles_extra_rules_len;
ALTER TABLE public.tenant_legal_profiles
  ADD CONSTRAINT tenant_legal_profiles_extra_rules_len
  CHECK (extra_rules IS NULL OR char_length(extra_rules) <= 1500);

COMMENT ON COLUMN public.tenant_legal_profiles.legal_form IS
  'RT-1: Rechtsform sole_trader|gbr|ug|gmbh|ev|other.';
COMMENT ON COLUMN public.tenant_legal_profiles.extra_rules IS
  'RT-1: Freifeld Weitere Regeln für AGB, max. 1500 Zeichen.';

-- ---------------------------------------------------------------------------
-- 2. Impressum-Vollständigkeit + Studio-Rechtstexte bereit
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.imprint_complete(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_legal_profiles p
    WHERE p.tenant_id = p_tenant
      AND yogaflow_private.legal_profile_complete(p_tenant)
      AND p.legal_form IS NOT NULL
      AND (
        p.legal_form = 'sole_trader'
        OR (
          p.representatives IS NOT NULL
          AND pg_catalog.btrim(p.representatives) <> ''
        )
      )
      AND (
        p.legal_form NOT IN ('ug', 'gmbh', 'ev')
        OR (
          p.register_number IS NOT NULL
          AND pg_catalog.btrim(p.register_number) <> ''
          AND p.register_court IS NOT NULL
          AND pg_catalog.btrim(p.register_court) <> ''
        )
      )
  );
$function$;

COMMENT ON FUNCTION yogaflow_private.imprint_complete(uuid) IS
  'RT-1: Impressumspflichtfelder inkl. Rechtsform/Vertretung/Register.';

REVOKE ALL ON FUNCTION yogaflow_private.imprint_complete(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. studio_legal_documents (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.studio_legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  kind text NOT NULL,
  template_version text NOT NULL,
  body_md text NOT NULL,
  "values" jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  "trigger" text NOT NULL,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  pdf_path text,
  CONSTRAINT studio_legal_documents_kind_check
    CHECK (kind IN ('imprint', 'terms', 'privacy')),
  CONSTRAINT studio_legal_documents_trigger_check
    CHECK ("trigger" IN ('release', 'settings_change', 'profile_change')),
  CONSTRAINT studio_legal_documents_version_check
    CHECK (template_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT studio_legal_documents_hash_check
    CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT studio_legal_documents_body_len
    CHECK (char_length(body_md) BETWEEN 1 AND 200000)
);

CREATE INDEX IF NOT EXISTS studio_legal_documents_tenant_kind_created_idx
  ON public.studio_legal_documents (tenant_id, kind, created_at DESC);

COMMENT ON TABLE public.studio_legal_documents IS
  'RT-1 L4: Gerenderte Studio-Rechtstexte, append-only. Aktuell = neueste je Art.';

ALTER TABLE public.studio_legal_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.studio_legal_documents
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.studio_legal_documents TO authenticated;

DROP POLICY IF EXISTS studio_legal_documents_select_managers
  ON public.studio_legal_documents;
CREATE POLICY studio_legal_documents_select_managers
  ON public.studio_legal_documents
  FOR SELECT TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

DROP TRIGGER IF EXISTS studio_legal_documents_append_only
  ON public.studio_legal_documents;
CREATE TRIGGER studio_legal_documents_append_only
  BEFORE UPDATE OR DELETE ON public.studio_legal_documents
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.enforce_append_only();

-- ---------------------------------------------------------------------------
-- 4. legal_document_versions / legal_acceptances: Studio-Vorlagen
-- ---------------------------------------------------------------------------

ALTER TABLE public.legal_document_versions
  DROP CONSTRAINT IF EXISTS legal_document_versions_document_check;
ALTER TABLE public.legal_document_versions
  ADD CONSTRAINT legal_document_versions_document_check
  CHECK (document IN (
    'avv', 'terms', 'privacy', 'studio_terms_tpl', 'studio_privacy_tpl'
  ));

ALTER TABLE public.legal_acceptances
  DROP CONSTRAINT IF EXISTS legal_acceptances_document_check;
ALTER TABLE public.legal_acceptances
  ADD CONSTRAINT legal_acceptances_document_check
  CHECK (document IN (
    'avv', 'terms', 'privacy', 'studio_terms_tpl', 'studio_privacy_tpl'
  ));

INSERT INTO public.legal_document_versions (document, version, content_hash)
VALUES
  (
    'studio_terms_tpl',
    '2026-10-05',
    '873e2dc6efe889c446ded08ce80641e5f47ab6a6cb2d599e729ecfcf1b182311'
  ),
  (
    'studio_privacy_tpl',
    '2026-10-05',
    'fff7c88dc2fce2bfc38e93bab184ca3c385ffd08614191240eacf7524a13dbb3'
  )
ON CONFLICT (document) DO UPDATE
  SET version = EXCLUDED.version,
      content_hash = EXCLUDED.content_hash,
      updated_at = pg_catalog.now();

CREATE OR REPLACE FUNCTION yogaflow_private.studio_tpl_accepted(
  p_tenant uuid,
  p_document text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.legal_acceptances a
    JOIN public.legal_document_versions v
      ON v.document = p_document
     AND a.document = p_document
     AND a.version = v.version
     AND a.content_hash = v.content_hash
    WHERE a.tenant_id = p_tenant
  );
$function$;

REVOKE ALL ON FUNCTION yogaflow_private.studio_tpl_accepted(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.studio_legal_texts_ready(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT yogaflow_private.imprint_complete(p_tenant)
     AND yogaflow_private.studio_tpl_accepted(p_tenant, 'studio_terms_tpl')
     AND yogaflow_private.studio_tpl_accepted(p_tenant, 'studio_privacy_tpl')
     AND EXISTS (
       SELECT 1 FROM public.studio_legal_documents d
       WHERE d.tenant_id = p_tenant AND d.kind = 'terms'
     )
     AND EXISTS (
       SELECT 1 FROM public.studio_legal_documents d
       WHERE d.tenant_id = p_tenant AND d.kind = 'privacy'
     );
$function$;

COMMENT ON FUNCTION yogaflow_private.studio_legal_texts_ready(uuid) IS
  'RT-1 L9: Impressum vollständig + AGB/Datenschutz freigegeben und veröffentlicht.';

REVOKE ALL ON FUNCTION yogaflow_private.studio_legal_texts_ready(uuid)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. terms_document_id an Buchung / Attempt / Karte
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS terms_document_id uuid
  REFERENCES public.studio_legal_documents (id) ON DELETE RESTRICT;

ALTER TABLE public.payment_attempts
  ADD COLUMN IF NOT EXISTS terms_document_id uuid
  REFERENCES public.studio_legal_documents (id) ON DELETE RESTRICT;

ALTER TABLE public.passes
  ADD COLUMN IF NOT EXISTS terms_document_id uuid
  REFERENCES public.studio_legal_documents (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.registrations.terms_document_id IS
  'RT-1 L5: AGB-Fassung zum Buchungszeitpunkt (NULL = vor RT-1).';
COMMENT ON COLUMN public.payment_attempts.terms_document_id IS
  'RT-1 L5: AGB-Fassung zum Attempt.';
COMMENT ON COLUMN public.passes.terms_document_id IS
  'RT-1 L5: AGB-Fassung zum Kartenkauf.';

-- ---------------------------------------------------------------------------
-- 6. online_method_block_reason: STUDIO_LEGAL_TEXTS_MISSING
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION yogaflow_private.online_method_block_reason(
  p_tenant uuid,
  p_amount_cents integer DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_online boolean;
BEGIN
  IF p_tenant IS NULL THEN
    RETURN 'FORBIDDEN';
  END IF;

  IF NOT yogaflow_private.platform_flag('online_payments') THEN
    RETURN 'PLATFORM_DISABLED';
  END IF;

  SELECT s.online_payments_enabled
    INTO v_online
  FROM yogaflow_private.tenant_payment_settings_for(p_tenant) s;

  IF NOT COALESCE(v_online, false) THEN
    RETURN 'ONLINE_DISABLED';
  END IF;

  IF NOT yogaflow_private.provider_ready(p_tenant) THEN
    RETURN 'PROVIDER_NOT_READY';
  END IF;

  IF NOT yogaflow_private.tax_setting_present(p_tenant) THEN
    RETURN 'TAX_SETTING_MISSING';
  END IF;

  IF NOT yogaflow_private.legal_profile_complete(p_tenant) THEN
    RETURN 'LEGAL_PROFILE_MISSING';
  END IF;

  IF NOT yogaflow_private.current_avv_accepted(p_tenant) THEN
    RETURN 'AVV_MISSING';
  END IF;

  IF NOT yogaflow_private.studio_legal_texts_ready(p_tenant) THEN
    RETURN 'STUDIO_LEGAL_TEXTS_MISSING';
  END IF;

  IF NOT yogaflow_private.online_amount_allowed(p_amount_cents) THEN
    RETURN 'AMOUNT_ABOVE_RECEIPT_LIMIT';
  END IF;

  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION yogaflow_private.online_method_block_reason(uuid, integer) IS
  'ZW-1/RT-1: Erster Blocker warum Online nicht wählbar ist, sonst NULL.';

REVOKE ALL ON FUNCTION yogaflow_private.online_method_block_reason(uuid, integer)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. upsert / get studio legal profile (erweitert)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.upsert_studio_legal_profile(
  text, text, text, text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.upsert_studio_legal_profile(
  p_legal_name text,
  p_street text,
  p_house_number text,
  p_postal_code text,
  p_city text,
  p_country text DEFAULT 'DE',
  p_contact_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_legal_form text DEFAULT NULL,
  p_representatives text DEFAULT NULL,
  p_register_court text DEFAULT NULL,
  p_register_number text DEFAULT NULL,
  p_vat_id text DEFAULT NULL,
  p_economic_id text DEFAULT NULL,
  p_extra_rules text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
  v_name text := pg_catalog.btrim(COALESCE(p_legal_name, ''));
  v_street text := pg_catalog.btrim(COALESCE(p_street, ''));
  v_house text := pg_catalog.btrim(COALESCE(p_house_number, ''));
  v_plz text := pg_catalog.btrim(COALESCE(p_postal_code, ''));
  v_city text := pg_catalog.btrim(COALESCE(p_city, ''));
  v_country text := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_country, 'DE')));
  v_email text := pg_catalog.btrim(COALESCE(p_contact_email, ''));
  v_phone text := NULLIF(pg_catalog.btrim(COALESCE(p_phone, '')), '');
  v_tax text := NULLIF(pg_catalog.btrim(COALESCE(p_tax_id, '')), '');
  v_form text := NULLIF(pg_catalog.btrim(COALESCE(p_legal_form, '')), '');
  v_repr text := NULLIF(pg_catalog.btrim(COALESCE(p_representatives, '')), '');
  v_court text := NULLIF(pg_catalog.btrim(COALESCE(p_register_court, '')), '');
  v_reg text := NULLIF(pg_catalog.btrim(COALESCE(p_register_number, '')), '');
  v_vat text := NULLIF(pg_catalog.btrim(COALESCE(p_vat_id, '')), '');
  v_econ text := NULLIF(pg_catalog.btrim(COALESCE(p_economic_id, '')), '');
  v_extra text := NULLIF(pg_catalog.btrim(COALESCE(p_extra_rules, '')), '');
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_name = '' OR char_length(v_name) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'legal_name');
  END IF;
  IF v_street = '' OR char_length(v_street) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'street');
  END IF;
  IF v_house = '' OR char_length(v_house) > 16 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'house_number');
  END IF;
  IF v_city = '' OR char_length(v_city) > 80 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'city');
  END IF;
  IF v_country !~ '^[A-Z]{2}$' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'country');
  END IF;
  IF v_country = 'DE' AND v_plz !~ '^[0-9]{5}$' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'postal_code');
  END IF;
  IF v_country <> 'DE' AND (v_plz = '' OR char_length(v_plz) > 10) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'postal_code');
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     OR char_length(v_email) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'contact_email');
  END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 40 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'phone');
  END IF;
  IF v_tax IS NOT NULL AND char_length(v_tax) > 40 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'tax_id');
  END IF;
  IF v_form IS NOT NULL AND v_form NOT IN ('sole_trader', 'gbr', 'ug', 'gmbh', 'ev', 'other') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'legal_form');
  END IF;
  IF v_form IS NOT NULL AND v_form <> 'sole_trader'
     AND (v_repr IS NULL OR char_length(v_repr) > 500) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'representatives');
  END IF;
  IF v_form IN ('ug', 'gmbh', 'ev') AND (v_reg IS NULL OR v_court IS NULL) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false, 'error', 'VALIDATION',
      'field', CASE WHEN v_reg IS NULL THEN 'register_number' ELSE 'register_court' END
    );
  END IF;
  IF v_court IS NOT NULL AND char_length(v_court) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'register_court');
  END IF;
  IF v_reg IS NOT NULL AND char_length(v_reg) > 40 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'register_number');
  END IF;
  IF v_vat IS NOT NULL AND char_length(v_vat) > 40 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'vat_id');
  END IF;
  IF v_econ IS NOT NULL AND char_length(v_econ) > 40 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'economic_id');
  END IF;
  IF v_extra IS NOT NULL AND char_length(v_extra) > 1500 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VALIDATION', 'field', 'extra_rules');
  END IF;

  INSERT INTO public.tenant_legal_profiles (
    tenant_id, legal_name, street, house_number, postal_code, city, country,
    contact_email, phone, tax_id,
    legal_form, representatives, register_court, register_number,
    vat_id, economic_id, extra_rules,
    updated_by, updated_at
  ) VALUES (
    v_tenant_id, v_name, v_street, v_house, v_plz, v_city, v_country,
    v_email, v_phone, v_tax,
    v_form, v_repr, v_court, v_reg,
    v_vat, v_econ, v_extra,
    v_member_id, pg_catalog.now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET legal_name = EXCLUDED.legal_name,
        street = EXCLUDED.street,
        house_number = EXCLUDED.house_number,
        postal_code = EXCLUDED.postal_code,
        city = EXCLUDED.city,
        country = EXCLUDED.country,
        contact_email = EXCLUDED.contact_email,
        phone = EXCLUDED.phone,
        tax_id = EXCLUDED.tax_id,
        legal_form = EXCLUDED.legal_form,
        representatives = EXCLUDED.representatives,
        register_court = EXCLUDED.register_court,
        register_number = EXCLUDED.register_number,
        vat_id = EXCLUDED.vat_id,
        economic_id = EXCLUDED.economic_id,
        extra_rules = EXCLUDED.extra_rules,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'imprint_complete', yogaflow_private.imprint_complete(v_tenant_id)
  );
END;
$function$;

COMMENT ON FUNCTION public.upsert_studio_legal_profile(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) IS
  'B1/RT-1: Anbieterangaben inkl. Impressum-Felder. Nur Owner.';

REVOKE ALL ON FUNCTION public.upsert_studio_legal_profile(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_studio_legal_profile(
  text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_studio_legal_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid := yogaflow_private.get_my_member_id();
  v_tenant_id uuid := yogaflow_private.get_my_tenant_id();
  v_row public.tenant_legal_profiles%ROWTYPE;
BEGIN
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row
  FROM public.tenant_legal_profiles
  WHERE tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'present', false,
      'imprint_complete', false
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'present', true,
    'legal_name', v_row.legal_name,
    'street', v_row.street,
    'house_number', v_row.house_number,
    'postal_code', v_row.postal_code,
    'city', v_row.city,
    'country', v_row.country,
    'contact_email', v_row.contact_email,
    'phone', v_row.phone,
    'tax_id', v_row.tax_id,
    'legal_form', v_row.legal_form,
    'representatives', v_row.representatives,
    'register_court', v_row.register_court,
    'register_number', v_row.register_number,
    'vat_id', v_row.vat_id,
    'economic_id', v_row.economic_id,
    'extra_rules', v_row.extra_rules,
    'updated_at', v_row.updated_at,
    'imprint_complete', yogaflow_private.imprint_complete(v_tenant_id)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_studio_legal_profile() IS
  'B1/RT-1: Volle Anbieterangaben. Owner/Admin.';

REVOKE ALL ON FUNCTION public.get_studio_legal_profile()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_studio_legal_profile()
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. publish / release
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_studio_legal_document(
  p_kind text,
  p_template_version text,
  p_body_md text,
  p_values jsonb,
  p_content_hash text,
  p_trigger text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_hash text;
  v_prev text;
  v_id uuid;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('imprint', 'terms', 'privacy') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_KIND');
  END IF;
  IF p_trigger IS NULL OR p_trigger NOT IN ('release', 'settings_change', 'profile_change') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_TRIGGER');
  END IF;
  IF p_template_version IS NULL
     OR p_template_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_VERSION');
  END IF;
  IF p_body_md IS NULL OR pg_catalog.btrim(p_body_md) = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'EMPTY_BODY');
  END IF;

  v_hash := yogaflow_private.hash_legal_text(p_body_md);
  IF p_content_hash IS DISTINCT FROM v_hash THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'HASH_MISMATCH');
  END IF;

  SELECT d.content_hash INTO v_prev
  FROM public.studio_legal_documents d
  WHERE d.tenant_id = v_tenant AND d.kind = p_kind
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_prev IS NOT DISTINCT FROM v_hash THEN
    SELECT d.id INTO v_id
    FROM public.studio_legal_documents d
    WHERE d.tenant_id = v_tenant AND d.kind = p_kind
    ORDER BY d.created_at DESC
    LIMIT 1;
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'changed', false, 'id', v_id, 'content_hash', v_hash
    );
  END IF;

  INSERT INTO public.studio_legal_documents (
    tenant_id, kind, template_version, body_md, "values", content_hash, "trigger", created_by
  ) VALUES (
    v_tenant, p_kind, p_template_version, p_body_md,
    COALESCE(p_values, '{}'::jsonb), v_hash, p_trigger, v_member
  )
  RETURNING id INTO v_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true, 'changed', true, 'id', v_id, 'content_hash', v_hash
  );
END;
$function$;

COMMENT ON FUNCTION public.publish_studio_legal_document(text, text, text, jsonb, text, text) IS
  'RT-1: Fassung einfügen wenn Hash neu. Owner/Admin.';

REVOKE ALL ON FUNCTION public.publish_studio_legal_document(text, text, text, jsonb, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_studio_legal_document(text, text, text, jsonb, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.release_studio_legal(
  p_kind text,
  p_template_version text,
  p_body_md text,
  p_values jsonb,
  p_content_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_doc text;
  v_cur public.legal_document_versions%ROWTYPE;
  v_acc_id uuid;
  v_pub jsonb;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('terms', 'privacy') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_KIND');
  END IF;
  IF NOT yogaflow_private.imprint_complete(v_tenant) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'IMPRINT_INCOMPLETE');
  END IF;

  v_doc := CASE p_kind
    WHEN 'terms' THEN 'studio_terms_tpl'
    ELSE 'studio_privacy_tpl'
  END;

  SELECT * INTO v_cur
  FROM public.legal_document_versions
  WHERE document = v_doc;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'UNKNOWN_DOCUMENT');
  END IF;
  IF p_template_version IS DISTINCT FROM v_cur.version THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VERSION_MISMATCH');
  END IF;

  SELECT a.id INTO v_acc_id
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant
    AND a.document = v_doc
    AND a.version = v_cur.version
    AND a.content_hash = v_cur.content_hash
  ORDER BY a.accepted_at DESC
  LIMIT 1;

  IF v_acc_id IS NULL THEN
    INSERT INTO public.legal_acceptances (
      tenant_id, user_id, document, version, content_hash
    ) VALUES (
      v_tenant, v_member, v_doc, v_cur.version, v_cur.content_hash
    )
    RETURNING id INTO v_acc_id;
  END IF;

  v_pub := public.publish_studio_legal_document(
    p_kind,
    p_template_version,
    p_body_md,
    p_values,
    p_content_hash,
    'release'
  );
  IF COALESCE((v_pub ->> 'success')::boolean, false) IS NOT TRUE THEN
    RETURN v_pub;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'acceptance_id', v_acc_id,
    'document_id', v_pub -> 'id',
    'changed', v_pub -> 'changed',
    'content_hash', v_pub -> 'content_hash'
  );
END;
$function$;

COMMENT ON FUNCTION public.release_studio_legal(text, text, text, jsonb, text) IS
  'RT-1: AGB/Datenschutz freigeben (Zustimmung Vorlage + Veröffentlichung).';

REVOKE ALL ON FUNCTION public.release_studio_legal(text, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_studio_legal(text, text, text, jsonb, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Status / öffentlich
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_studio_legal_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_imprint_ok boolean;
  v_terms_cur public.legal_document_versions%ROWTYPE;
  v_priv_cur public.legal_document_versions%ROWTYPE;
  v_terms_acc public.legal_acceptances%ROWTYPE;
  v_priv_acc public.legal_acceptances%ROWTYPE;
  v_terms_doc public.studio_legal_documents%ROWTYPE;
  v_priv_doc public.studio_legal_documents%ROWTYPE;
  v_imp_doc public.studio_legal_documents%ROWTYPE;
  v_terms_status text;
  v_priv_status text;
  v_imp_status text;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_imprint_ok := yogaflow_private.imprint_complete(v_tenant);

  SELECT * INTO v_imp_doc
  FROM public.studio_legal_documents
  WHERE tenant_id = v_tenant AND kind = 'imprint'
  ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_terms_doc
  FROM public.studio_legal_documents
  WHERE tenant_id = v_tenant AND kind = 'terms'
  ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_priv_doc
  FROM public.studio_legal_documents
  WHERE tenant_id = v_tenant AND kind = 'privacy'
  ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_terms_cur FROM public.legal_document_versions WHERE document = 'studio_terms_tpl';
  SELECT * INTO v_priv_cur FROM public.legal_document_versions WHERE document = 'studio_privacy_tpl';

  SELECT a.* INTO v_terms_acc
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant AND a.document = 'studio_terms_tpl'
  ORDER BY a.accepted_at DESC LIMIT 1;

  SELECT a.* INTO v_priv_acc
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant AND a.document = 'studio_privacy_tpl'
  ORDER BY a.accepted_at DESC LIMIT 1;

  IF NOT v_imprint_ok THEN
    v_imp_status := 'missing';
  ELSE
    v_imp_status := 'current';
  END IF;

  IF v_terms_acc.id IS NULL THEN
    v_terms_status := CASE WHEN v_imprint_ok THEN 'release' ELSE 'missing' END;
  ELSIF v_terms_cur.document IS NOT NULL
        AND v_terms_acc.version = v_terms_cur.version
        AND v_terms_acc.content_hash = v_terms_cur.content_hash THEN
    v_terms_status := 'current';
  ELSE
    v_terms_status := 'new_template';
  END IF;

  IF v_priv_acc.id IS NULL THEN
    v_priv_status := CASE WHEN v_imprint_ok THEN 'release' ELSE 'missing' END;
  ELSIF v_priv_cur.document IS NOT NULL
        AND v_priv_acc.version = v_priv_cur.version
        AND v_priv_acc.content_hash = v_priv_cur.content_hash THEN
    v_priv_status := 'current';
  ELSE
    v_priv_status := 'new_template';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'imprint_complete', v_imprint_ok,
    'texts_ready', yogaflow_private.studio_legal_texts_ready(v_tenant),
    'imprint', pg_catalog.jsonb_build_object(
      'status', v_imp_status,
      'created_at', v_imp_doc.created_at,
      'template_version', v_imp_doc.template_version
    ),
    'terms', pg_catalog.jsonb_build_object(
      'status', v_terms_status,
      'created_at', v_terms_doc.created_at,
      'template_version', COALESCE(v_terms_doc.template_version, v_terms_cur.version),
      'current_template_version', v_terms_cur.version,
      'accepted_version', v_terms_acc.version
    ),
    'privacy', pg_catalog.jsonb_build_object(
      'status', v_priv_status,
      'created_at', v_priv_doc.created_at,
      'template_version', COALESCE(v_priv_doc.template_version, v_priv_cur.version),
      'current_template_version', v_priv_cur.version,
      'accepted_version', v_priv_acc.version
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.get_studio_legal_status() IS
  'RT-1: Status-Pillen für Einstellungen › Rechtliches.';

REVOKE ALL ON FUNCTION public.get_studio_legal_status()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_studio_legal_status()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_studio_legal(p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_slug text := yogaflow_private.request_tenant_slug();
  v_tenant uuid;
  v_name text;
  v_email text;
  v_doc public.studio_legal_documents%ROWTYPE;
  v_prof public.tenant_legal_profiles%ROWTYPE;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('imprint', 'terms', 'privacy') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_KIND');
  END IF;
  IF v_slug IS NULL OR v_slug = '#invalid' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NO_TENANT');
  END IF;

  SELECT t.id, t.name INTO v_tenant, v_name
  FROM public.tenants t
  WHERE t.slug = v_slug;
  IF v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NO_TENANT');
  END IF;
  SELECT * INTO v_prof FROM public.tenant_legal_profiles WHERE tenant_id = v_tenant;
  v_email := COALESCE(v_prof.contact_email, '');

  IF p_kind = 'imprint' AND NOT yogaflow_private.imprint_complete(v_tenant) THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'kind', 'imprint',
      'minimal', true,
      'studio_name', COALESCE(v_name, ''),
      'contact_email', v_email,
      'body_md', NULL,
      'created_at', NULL
    );
  END IF;

  SELECT * INTO v_doc
  FROM public.studio_legal_documents d
  WHERE d.tenant_id = v_tenant AND d.kind = p_kind
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF p_kind = 'imprint' THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'kind', 'imprint',
        'minimal', true,
        'studio_name', COALESCE(v_name, ''),
        'contact_email', v_email,
        'body_md', NULL,
        'created_at', NULL
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'kind', p_kind,
      'present', false,
      'studio_name', COALESCE(v_name, ''),
      'body_md', NULL,
      'created_at', NULL
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'kind', p_kind,
    'present', true,
    'minimal', false,
    'studio_name', COALESCE(v_name, ''),
    'body_md', v_doc.body_md,
    'created_at', v_doc.created_at,
    'template_version', v_doc.template_version,
    'content_hash', v_doc.content_hash,
    'id', v_doc.id
  );
END;
$function$;

COMMENT ON FUNCTION public.get_public_studio_legal(text) IS
  'RT-1 L7/L11: Aktuelle Fassung öffentlich je Tenant (Header).';

REVOKE ALL ON FUNCTION public.get_public_studio_legal(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_studio_legal(text)
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10. accept_legal_document / get_legal_acceptance_status erweitern
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_legal_document(
  p_document text,
  p_version text,
  p_content_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_cur public.legal_document_versions%ROWTYPE;
  v_id uuid;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL OR NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF p_document IS NULL OR p_document NOT IN (
    'avv', 'terms', 'privacy', 'studio_terms_tpl', 'studio_privacy_tpl'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DOCUMENT');
  END IF;

  SELECT * INTO v_cur
  FROM public.legal_document_versions
  WHERE document = p_document;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'UNKNOWN_DOCUMENT');
  END IF;
  IF p_version IS DISTINCT FROM v_cur.version
     OR p_content_hash IS DISTINCT FROM v_cur.content_hash THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'VERSION_MISMATCH');
  END IF;

  SELECT a.id INTO v_id
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant
    AND a.document = p_document
    AND a.version = v_cur.version
    AND a.content_hash = v_cur.content_hash
  ORDER BY a.accepted_at DESC
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'changed', false, 'id', v_id, 'version', v_cur.version
    );
  END IF;

  INSERT INTO public.legal_acceptances (
    tenant_id, user_id, document, version, content_hash
  ) VALUES (
    v_tenant, v_member, p_document, v_cur.version, v_cur.content_hash
  )
  RETURNING id INTO v_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true, 'changed', true, 'id', v_id, 'version', v_cur.version
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.accept_legal_document(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_legal_document(text, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_legal_acceptance_status(p_document text DEFAULT 'avv')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_cur public.legal_document_versions%ROWTYPE;
  v_acc public.legal_acceptances%ROWTYPE;
  v_name text;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;
  IF p_document IS NULL OR p_document NOT IN (
    'avv', 'terms', 'privacy', 'studio_terms_tpl', 'studio_privacy_tpl'
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DOCUMENT');
  END IF;

  SELECT * INTO v_cur FROM public.legal_document_versions WHERE document = p_document;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'UNKNOWN_DOCUMENT');
  END IF;

  SELECT a.* INTO v_acc
  FROM public.legal_acceptances a
  WHERE a.tenant_id = v_tenant
    AND a.document = p_document
    AND a.version = v_cur.version
    AND a.content_hash = v_cur.content_hash
  ORDER BY a.accepted_at DESC
  LIMIT 1;

  IF v_acc.id IS NOT NULL THEN
    SELECT trim(both FROM COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))
      INTO v_name
    FROM public.users u
    WHERE u.id = v_acc.user_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'document', p_document,
    'current_version', v_cur.version,
    'current_hash', v_cur.content_hash,
    'accepted', v_acc.id IS NOT NULL,
    'accepted_at', v_acc.accepted_at,
    'accepted_by_name', NULLIF(v_name, ''),
    'accepted_version', v_acc.version
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_legal_acceptance_status(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_legal_acceptance_status(text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 10b. get_payment_setup_status: studio_legal_texts_ready
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payment_setup_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_acc public.provider_accounts%ROWTYPE;
  v_has boolean;
  v_card text;
  v_online boolean;
  v_onsite boolean;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_acc
  FROM public.provider_accounts a
  WHERE a.tenant_id = v_tenant_id
    AND a.provider = 'stripe'::public.payment_provider;
  v_has := FOUND;

  IF v_has THEN
    SELECT c.status
      INTO v_card
    FROM public.provider_capabilities c
    WHERE c.provider_account_id = v_acc.id
      AND c.method = 'card'::public.payment_method;
  END IF;

  SELECT s.online_payments_enabled, s.allow_onsite_payment
    INTO v_online, v_onsite
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'platform_enabled', yogaflow_private.platform_flag('online_payments'),
    'has_account', v_has,
    'onboarding_status', CASE WHEN v_has THEN v_acc.onboarding_status ELSE 'not_started' END,
    'charges_enabled', COALESCE(v_acc.charges_enabled, false),
    'card_active', COALESCE(v_card = 'active', false),
    'tax_setting_present', yogaflow_private.tax_setting_present(v_tenant_id),
    'legal_profile_present', yogaflow_private.legal_profile_complete(v_tenant_id),
    'avv_accepted', yogaflow_private.current_avv_accepted(v_tenant_id),
    'studio_legal_texts_ready', yogaflow_private.studio_legal_texts_ready(v_tenant_id),
    'online_payments_enabled', v_online,
    'allow_onsite_payment', v_onsite,
    'requirements_pending', COALESCE(v_acc.requirements_pending, false),
    'requirements_due_at', CASE WHEN v_has THEN v_acc.requirements_due_at ELSE NULL END,
    'disconnected', COALESCE(v_acc.onboarding_status = 'disconnected', false)
  );
END;
$function$;

COMMENT ON FUNCTION public.get_payment_setup_status() IS
  'ZW-1/RT-1: Online-Setup inkl. AVV und Studio-Rechtstexte.';

REVOKE ALL ON FUNCTION public.get_payment_setup_status()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_setup_status()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.set_online_payments_enabled(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_online boolean;
  v_onsite boolean;
  v_type text;
  v_payload jsonb;
  v_event_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL OR NOT yogaflow_private.is_owner() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_enabled IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('tenant_payment_settings:' || v_tenant_id::text, 0)
  );

  SELECT s.online_payments_enabled, s.allow_onsite_payment
    INTO v_online, v_onsite
  FROM yogaflow_private.tenant_payment_settings_for(v_tenant_id) s;

  IF p_enabled THEN
    IF NOT yogaflow_private.platform_flag('online_payments') THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PLATFORM_DISABLED');
    END IF;
    IF NOT yogaflow_private.provider_ready(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'PROVIDER_NOT_READY');
    END IF;
    IF NOT yogaflow_private.tax_setting_present(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'TAX_SETTING_MISSING');
    END IF;
    IF NOT yogaflow_private.legal_profile_complete(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LEGAL_PROFILE_MISSING');
    END IF;
    IF NOT yogaflow_private.current_avv_accepted(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'AVV_MISSING');
    END IF;
    IF NOT yogaflow_private.studio_legal_texts_ready(v_tenant_id) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'STUDIO_LEGAL_TEXTS_MISSING');
    END IF;
  ELSE
    IF NOT COALESCE(v_onsite, true) THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'LAST_METHOD');
    END IF;
  END IF;

  IF v_online = p_enabled THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true, 'changed', false, 'online_payments_enabled', v_online
    );
  END IF;

  INSERT INTO public.tenant_payment_settings (
    tenant_id, online_payments_enabled, changed_by, updated_at
  ) VALUES (
    v_tenant_id, p_enabled, v_member_id, pg_catalog.now()
  )
  ON CONFLICT (tenant_id) DO UPDATE
    SET online_payments_enabled = EXCLUDED.online_payments_enabled,
        changed_by = EXCLUDED.changed_by,
        updated_at = EXCLUDED.updated_at;

  IF p_enabled THEN
    v_type := 'payments.online_enabled';
    v_payload := '{}'::jsonb;
  ELSE
    v_type := 'payments.online_disabled';
    v_payload := pg_catalog.jsonb_build_object('reason', 'OWNER');
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    v_type,
    'tenant',
    v_tenant_id,
    v_payload,
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    v_type,
    'tenant_payment_settings',
    v_tenant_id,
    ARRAY['online_payments_enabled', 'changed_by', 'updated_at']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true, 'changed', true, 'online_payments_enabled', p_enabled
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_online_payments_enabled(boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_online_payments_enabled(boolean)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. delete_tenant_complete
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
      USING ERRCODE = 'P0002';
  END IF;

  ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
  BEGIN
    SET LOCAL yogaflow.allow_append_only_delete = 'on';
    SET LOCAL yogaflow.allow_payment_delete = 'on';
    SET LOCAL yogaflow.allow_pass_product_delete = 'on';
    SET LOCAL yogaflow.allow_pass_delete = 'on';
    SET LOCAL yogaflow.allow_email_delivery_delete = 'on';
    SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED;
    SET CONSTRAINTS public.coverage_waive_batches_tenant_id_fkey DEFERRED;
    SET CONSTRAINTS public.registrations_coverage_waived_batch_id_fkey DEFERRED;

    UPDATE public.registrations
      SET terms_document_id = NULL
      WHERE tenant_id = p_tenant_id;
    UPDATE public.payment_attempts
      SET terms_document_id = NULL
      WHERE tenant_id = p_tenant_id;
    UPDATE public.passes
      SET terms_document_id = NULL
      WHERE tenant_id = p_tenant_id;

    DELETE FROM public.studio_legal_documents WHERE tenant_id = p_tenant_id;

    DELETE FROM public.ledger_event_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.ledger_entries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_tax_settings WHERE tenant_id = p_tenant_id;
    DELETE FROM public.legal_acceptances WHERE tenant_id = p_tenant_id;
    DELETE FROM public.receipts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.receipt_counters WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_legal_profiles WHERE tenant_id = p_tenant_id;

    DELETE FROM public.provider_events_raw WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_capabilities WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_accounts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_payment_settings WHERE tenant_id = p_tenant_id;

    DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.email_deliveries WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_withdrawal_lookups WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_purchase_consents WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_validity_changes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_movements WHERE tenant_id = p_tenant_id;
    DELETE FROM public.passes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.provider_jobs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_attempts WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_disputes WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payment_refunds WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payments
      WHERE tenant_id = p_tenant_id
        AND reverses_payment_id IS NOT NULL;
    DELETE FROM public.payments WHERE tenant_id = p_tenant_id;
    DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
    DELETE FROM public.coverage_waive_batches WHERE tenant_id = p_tenant_id;
    DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_products WHERE tenant_id = p_tenant_id;
    DELETE FROM public.users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
    RAISE;
  END;

  ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 12. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
  v_hash text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenant_legal_profiles'
      AND column_name = 'legal_form'
  ) THEN
    RAISE EXCEPTION 'RT-1: legal_form fehlt';
  END IF;

  IF to_regclass('public.studio_legal_documents') IS NULL THEN
    RAISE EXCEPTION 'RT-1: studio_legal_documents fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.legal_document_versions
    WHERE document = 'studio_terms_tpl' AND version = '2026-10-05'
      AND content_hash = '873e2dc6efe889c446ded08ce80641e5f47ab6a6cb2d599e729ecfcf1b182311'
  ) THEN
    RAISE EXCEPTION 'RT-1: studio_terms_tpl Hash falsch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.legal_document_versions
    WHERE document = 'studio_privacy_tpl' AND version = '2026-10-05'
      AND content_hash = 'fff7c88dc2fce2bfc38e93bab184ca3c385ffd08614191240eacf7524a13dbb3'
  ) THEN
    RAISE EXCEPTION 'RT-1: studio_privacy_tpl Hash falsch';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'yogaflow_private.online_method_block_reason(uuid,integer)'::regprocedure
  );
  IF position('STUDIO_LEGAL_TEXTS_MISSING' IN v_def) = 0 THEN
    RAISE EXCEPTION 'RT-1: online_method_block_reason ohne STUDIO_LEGAL_TEXTS_MISSING';
  END IF;

  v_def := pg_catalog.pg_get_functiondef(
    'public.delete_tenant_complete(uuid)'::regprocedure
  );
  IF position('studio_legal_documents' IN v_def) = 0 THEN
    RAISE EXCEPTION 'RT-1: delete_tenant_complete ohne studio_legal_documents';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'registrations'
      AND column_name = 'terms_document_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payment_attempts'
      AND column_name = 'terms_document_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'passes'
      AND column_name = 'terms_document_id'
  ) THEN
    RAISE EXCEPTION 'RT-1: terms_document_id Spalten fehlen';
  END IF;

  IF has_function_privilege('anon', 'public.publish_studio_legal_document(text,text,text,jsonb,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.release_studio_legal(text,text,text,jsonb,text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'RT-1: publish/release für anon freigegeben';
  END IF;

  IF NOT has_function_privilege('anon', 'public.get_public_studio_legal(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_public_studio_legal(text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'RT-1: get_public_studio_legal nicht für anon/authenticated';
  END IF;

  v_hash := yogaflow_private.hash_legal_text(E'Hallo\n');
  IF v_hash IS NULL OR char_length(v_hash) <> 64 THEN
    RAISE EXCEPTION 'RT-1: hash_legal_text defekt';
  END IF;
END;
$$;
