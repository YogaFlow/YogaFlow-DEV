-- Epic E1 (Erweiterung): Slug-Constraints + reserved_slugs + Onboarding-RPCs

-- ============================================================================
-- 1. Längen-Constraint auf tenants.slug
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_slug_length'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_slug_length
      CHECK (LENGTH(slug) BETWEEN 3 AND 30);
  END IF;
END $$;

-- ============================================================================
-- 2. reserved_slugs-Tabelle
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reserved_slugs (
  slug text PRIMARY KEY
);

INSERT INTO public.reserved_slugs (slug) VALUES
  ('www'), ('app'), ('api'), ('admin'), ('mail'), ('smtp'), ('ftp'),
  ('staging'), ('dev'), ('preview'), ('static'), ('assets'), ('cdn'),
  ('auth'), ('login'), ('signup'), ('onboarding'), ('dashboard'),
  ('help'), ('support'), ('status'), ('blog'), ('docs'), ('health'),
  ('webhook'), ('webhooks'), ('storage'), ('media'), ('test'), ('demo'),
  ('sandbox'), ('yogaflow'), ('legal'), ('privacy'), ('terms'),
  ('contact'), ('abuse')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Trigger: reservierten Slug auf tenants ablehnen
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_tenant_slug_not_reserved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = NEW.slug) THEN
    RAISE EXCEPTION 'reserved_slug: Dieser Name ist nicht erlaubt.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_tenant_slug_not_reserved ON public.tenants;
CREATE TRIGGER check_tenant_slug_not_reserved
  BEFORE INSERT ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.check_tenant_slug_not_reserved();

-- ============================================================================
-- 4. RPC: check_slug_available (aufrufbar ohne Auth)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_slug_available(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF p_slug !~ '^[a-z0-9]+$'                        THEN RETURN false; END IF;
  IF LENGTH(p_slug) < 3 OR LENGTH(p_slug) > 30       THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = p_slug) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.tenants      WHERE slug = p_slug) THEN RETURN false; END IF;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_slug_available(text) TO anon, authenticated;

-- ============================================================================
-- 5. RPC: begin_tenant_onboarding (legt Tenant an, gibt tenant_id zurück)
--    Aufrufbar ohne Auth (anon), weil User beim Onboarding noch nicht eingeloggt ist.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.begin_tenant_onboarding(
  p_name text,
  p_slug text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Validierungen (redundant zu DB-Constraints, aber bessere Fehlermeldungen)
  IF TRIM(p_name) = '' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_name',
      'message', 'Studio-Name darf nicht leer sein.');
  END IF;

  IF p_slug !~ '^[a-z0-9]+$' THEN
    RETURN json_build_object('success', false, 'error', 'invalid_format',
      'message', 'Nur Kleinbuchstaben und Zahlen erlaubt.');
  END IF;

  IF LENGTH(p_slug) < 3 OR LENGTH(p_slug) > 30 THEN
    RETURN json_build_object('success', false, 'error', 'invalid_length',
      'message', 'Der Name muss zwischen 3 und 30 Zeichen lang sein.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.reserved_slugs WHERE slug = p_slug) THEN
    RETURN json_build_object('success', false, 'error', 'reserved_slug',
      'message', 'Dieser Name ist nicht erlaubt.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = p_slug) THEN
    RETURN json_build_object('success', false, 'error', 'slug_taken',
      'message', 'Dieser Name ist bereits vergeben. Bitte wähle einen anderen.');
  END IF;

  INSERT INTO public.tenants (name, slug)
  VALUES (TRIM(p_name), p_slug)
  RETURNING id INTO v_tenant_id;

  RETURN json_build_object('success', true, 'tenant_id', v_tenant_id);

EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'error', 'slug_taken',
      'message', 'Dieser Name ist bereits vergeben. Bitte wähle einen anderen.');
  WHEN others THEN
    RAISE LOG 'begin_tenant_onboarding error: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', 'server_error',
      'message', 'Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.begin_tenant_onboarding(text, text) TO anon, authenticated;

-- ============================================================================
-- 6. RPC: cancel_tenant_onboarding (Kompensation falls signUp fehlschlägt)
--    Löscht Tenant nur wenn noch kein Owner existiert.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_tenant_onboarding(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.tenants
  WHERE id = p_tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.users WHERE tenant_id = p_tenant_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_tenant_onboarding(uuid) TO anon, authenticated;
