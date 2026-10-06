-- UX-7: Kartenhinweis am Tenant (Standard aus, Text anpassbar).
-- allow: update_pass_hint_settings
-- Spalten: pass_hint_enabled (default false), pass_hint_template (null = Vorbelegung).
-- Schreiben nur Owner/Admin (is_tenant_manager). Kein Einfluss auf AGB-Fassungen.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS pass_hint_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS pass_hint_template text NULL;

-- Bestehende Studios: Hinweis aus (auch wenn Spalte schon existierte).
UPDATE public.tenants
SET pass_hint_enabled = false
WHERE pass_hint_enabled IS DISTINCT FROM false;

COMMENT ON COLUMN public.tenants.pass_hint_enabled IS
  'UX-7: Hinweis auf Karten im Kursdetail anzeigen (Standard aus).';
COMMENT ON COLUMN public.tenants.pass_hint_template IS
  'UX-7: Vorlage mit Platzhaltern {karte}/{preis_karte}/{preis_einzel}/{ersparnis}; NULL = Vorbelegung.';

CREATE OR REPLACE FUNCTION public.update_pass_hint_settings(
  p_enabled boolean DEFAULT NULL,
  p_template text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_member uuid;
  v_tenant_id uuid;
  v_row public.tenants;
  v_old public.tenants;
  v_fields text[] := '{}';
  v_event_id uuid;
  v_template text;
  v_unknown text;
BEGIN
  v_member := yogaflow_private.get_my_member_id();
  IF v_member IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Bitte melde dich an.'
    );
  END IF;

  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Nur Inhaberin, Inhaber oder Admin kann den Kartenhinweis ändern.'
    );
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  IF p_enabled IS NULL AND p_template IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Keine Änderung angegeben.'
    );
  END IF;

  -- p_template: NULL am Parameter = nicht ändern; '' = Vorbelegung speichern (NULL).
  IF p_template IS NOT NULL THEN
    v_template := NULLIF(btrim(p_template), '');
    IF v_template IS NOT NULL AND char_length(v_template) > 120 THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Der Text darf höchstens 120 Zeichen haben.'
      );
    END IF;
    IF v_template IS NOT NULL THEN
      SELECT string_agg(x, ', ' ORDER BY x)
        INTO v_unknown
      FROM (
        SELECT DISTINCT m[1] AS x
        FROM regexp_matches(v_template, '\{([a-z_]+)\}', 'g') AS m
        WHERE m[1] NOT IN ('karte', 'preis_karte', 'preis_einzel', 'ersparnis')
      ) s;
      IF v_unknown IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', false,
          'message', 'Unbekannte Platzhalter: {' || replace(v_unknown, ', ', '}, {') || '}.'
        );
      END IF;
    END IF;
  END IF;

  SELECT * INTO v_old FROM public.tenants WHERE id = v_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  UPDATE public.tenants
  SET
    pass_hint_enabled = COALESCE(p_enabled, pass_hint_enabled),
    pass_hint_template = CASE
      WHEN p_template IS NULL THEN pass_hint_template
      ELSE v_template
    END
  WHERE id = v_tenant_id
  RETURNING * INTO v_row;

  IF v_row.pass_hint_enabled IS DISTINCT FROM v_old.pass_hint_enabled THEN
    v_fields := v_fields || ARRAY['pass_hint_enabled']::text[];
  END IF;
  IF v_row.pass_hint_template IS DISTINCT FROM v_old.pass_hint_template THEN
    v_fields := v_fields || ARRAY['pass_hint_template']::text[];
  END IF;

  IF pg_catalog.array_length(v_fields, 1) IS NOT NULL THEN
    v_event_id := yogaflow_private.insert_event(
      v_tenant_id,
      'tenant.pass_hint_settings_updated',
      'tenant',
      v_tenant_id,
      pg_catalog.jsonb_build_object(
        'pass_hint_enabled', v_row.pass_hint_enabled,
        'pass_hint_template', v_row.pass_hint_template
      ),
      pg_catalog.gen_random_uuid()
    );
    PERFORM yogaflow_private.insert_audit(
      v_tenant_id,
      v_member,
      'tenant.pass_hint_settings_updated',
      'tenants',
      v_tenant_id,
      v_fields,
      v_event_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Gespeichert.',
    'tenant', jsonb_build_object(
      'id', v_row.id,
      'pass_hint_enabled', v_row.pass_hint_enabled,
      'pass_hint_template', v_row.pass_hint_template,
      'updated_at', v_row.updated_at
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.update_pass_hint_settings(boolean, text) IS
  'Owner/Admin: Kartenhinweis an/aus und Vorlage. p_enabled/p_template NULL = nicht ändern; leere Vorlage = Vorbelegung.';

REVOKE ALL ON FUNCTION public.update_pass_hint_settings(boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_pass_hint_settings(boolean, text) TO authenticated;

DO $$
DECLARE
  v_enabled_default text;
  v_on_count integer;
  v_proconfig text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'pass_hint_enabled'
  ) THEN
    RAISE EXCEPTION 'UX-7: Spalte pass_hint_enabled fehlt';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'pass_hint_template'
  ) THEN
    RAISE EXCEPTION 'UX-7: Spalte pass_hint_template fehlt';
  END IF;

  SELECT column_default INTO v_enabled_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'tenants'
    AND column_name = 'pass_hint_enabled';
  IF v_enabled_default IS NULL OR v_enabled_default NOT ILIKE '%false%' THEN
    RAISE EXCEPTION 'UX-7: pass_hint_enabled Default ist nicht false: %', v_enabled_default;
  END IF;

  SELECT count(*)::integer INTO v_on_count
  FROM public.tenants
  WHERE pass_hint_enabled IS TRUE;
  IF v_on_count <> 0 THEN
    RAISE EXCEPTION 'UX-7: % Tenants haben pass_hint_enabled = true nach Migration', v_on_count;
  END IF;

  IF NOT (
    SELECT prosecdef FROM pg_proc
    WHERE oid = 'public.update_pass_hint_settings(boolean, text)'::regprocedure
  ) THEN
    RAISE EXCEPTION 'UX-7: update_pass_hint_settings ist nicht SECURITY DEFINER';
  END IF;

  SELECT proconfig INTO v_proconfig
  FROM pg_proc
  WHERE oid = 'public.update_pass_hint_settings(boolean, text)'::regprocedure;
  IF v_proconfig IS NULL OR NOT (v_proconfig::text ILIKE '%search_path%') THEN
    RAISE EXCEPTION 'UX-7: update_pass_hint_settings ohne search_path';
  END IF;

  IF has_function_privilege('anon', 'public.update_pass_hint_settings(boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'UX-7: anon hat EXECUTE auf update_pass_hint_settings';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.update_pass_hint_settings(boolean, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'UX-7: authenticated fehlt EXECUTE auf update_pass_hint_settings';
  END IF;

  -- Direktes UPDATE auf tenants: authenticated hat kein Tabellen-UPDATE (seit Booking-Settings).
  IF has_table_privilege('authenticated', 'public.tenants', 'UPDATE') THEN
    RAISE EXCEPTION 'UX-7: authenticated darf tenants direkt UPDATEn';
  END IF;
  IF has_table_privilege('anon', 'public.tenants', 'UPDATE') THEN
    RAISE EXCEPTION 'UX-7: anon darf tenants direkt UPDATEn';
  END IF;
END;
$$;
