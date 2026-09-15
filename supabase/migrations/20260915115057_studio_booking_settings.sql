-- Zweck (Auftrag 7, 15.09.2026): global_settings war global (keine tenant_id,
-- UNIQUE(key)); jeder Owner/Admin überschrieb Werte für alle Studios.
-- cancellation_deadline_hours wurde nirgends durchgesetzt → entfällt ersatzlos.
-- Standard-Teilnehmerzahl wird Spalte auf tenants. Härtung: Schreibrechte von
-- anon/authenticated auf tenants entzogen (alle Schreibwege sind SECURITY DEFINER).
-- global_settings wird nur-lesend und nach dem Release entfernt.
--
-- Rückweg:
--   DROP FUNCTION IF EXISTS public.update_booking_settings(integer);
--   ALTER TABLE public.tenants
--     DROP CONSTRAINT IF EXISTS tenants_default_max_participants_range,
--     DROP COLUMN IF EXISTS default_max_participants;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON public.tenants TO anon, authenticated;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON public.global_settings TO anon, authenticated;
--   DROP POLICY IF EXISTS "settings_manage_managers" ON public.global_settings;
--   CREATE POLICY "settings_manage_managers"
--     ON public.global_settings FOR ALL
--     TO authenticated
--     USING (yogaflow_private.is_tenant_manager())
--     WITH CHECK (yogaflow_private.is_tenant_manager());

-- 1. Spalte
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_max_participants integer NOT NULL DEFAULT 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_default_max_participants_range'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_default_max_participants_range
      CHECK (default_max_participants BETWEEN 1 AND 50);
  END IF;
END;
$$;

-- 2. Übernahme aus global_settings (ohne Exception bei Unsinn)
DO $$
DECLARE
  v_raw jsonb;
  v_text text;
  v_int integer;
  v_updated integer := 0;
  v_taken boolean := false;
BEGIN
  SELECT gs.value INTO v_raw
  FROM public.global_settings gs
  WHERE gs.key = 'default_max_participants'
  LIMIT 1;

  IF FOUND THEN
    v_text := v_raw #>> '{}';
    IF v_text IS NOT NULL
       AND v_text ~ '^[0-9]+$'
       AND char_length(v_text) <= 3
    THEN
      v_int := v_text::integer;
      IF v_int BETWEEN 1 AND 50 THEN
        UPDATE public.tenants
        SET default_max_participants = v_int;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        v_taken := true;
      END IF;
    END IF;
  END IF;

  IF v_taken THEN
    RAISE NOTICE 'default_max_participants übernommen: ja, Wert %, Zeilen %', v_int, v_updated;
  ELSE
    RAISE NOTICE 'default_max_participants übernommen: nein, Wert %, Zeilen %', v_int, v_updated;
  END IF;
END;
$$;

-- 3. RPC: Owner oder Admin setzt die Standard-Teilnehmerzahl des eigenen Studios.
CREATE OR REPLACE FUNCTION public.update_booking_settings(p_default_max_participants integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member uuid;
  v_tenant_id uuid;
  v_row public.tenants;
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
      'message', 'Nur Inhaberin, Inhaber oder Admin des Studios kann die Buchungseinstellungen ändern.'
    );
  END IF;

  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  IF p_default_max_participants IS NULL
     OR p_default_max_participants < 1
     OR p_default_max_participants > 50
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Die Standardanzahl muss zwischen 1 und 50 liegen.'
    );
  END IF;

  UPDATE public.tenants
  SET default_max_participants = p_default_max_participants
  WHERE id = v_tenant_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Studio nicht gefunden.'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Gespeichert.',
    'tenant', jsonb_build_object(
      'id', v_row.id,
      'default_max_participants', v_row.default_max_participants,
      'updated_at', v_row.updated_at
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_booking_settings(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_booking_settings(integer) TO authenticated;

-- 4. Härtung tenants (SELECT bleibt)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.tenants FROM anon, authenticated;

-- 5. global_settings nur-lesend
DROP POLICY IF EXISTS settings_manage_managers ON public.global_settings;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.global_settings FROM anon, authenticated;

-- 6. Selbstprüfung
DO $$
DECLARE
  v_data_type text;
  v_nullable text;
  v_default text;
  v_count integer;
  v_prosecdef boolean;
  v_proconfig text[];
  v_owner name;
  v_definer boolean;
  v_role text;
  v_priv text;
  v_fn_name text;
  v_fn_ident text;
  v_oid oid;
BEGIN
  -- a) Spalte
  SELECT c.data_type, c.is_nullable, c.column_default
    INTO v_data_type, v_nullable, v_default
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'tenants'
    AND c.column_name = 'default_max_participants';

  IF v_data_type IS NULL THEN
    RAISE EXCEPTION 'Spalte public.tenants.default_max_participants fehlt';
  END IF;
  IF v_data_type IS DISTINCT FROM 'integer' THEN
    RAISE EXCEPTION 'public.tenants.default_max_participants hat Typ %, erwartet integer', v_data_type;
  END IF;
  IF v_nullable IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION 'public.tenants.default_max_participants is_nullable=%, erwartet NO', v_nullable;
  END IF;
  IF regexp_replace(coalesce(v_default, ''), '[^0-9]', '', 'g') IS DISTINCT FROM '10' THEN
    RAISE EXCEPTION 'public.tenants.default_max_participants Default %, erwartet 10', v_default;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_default_max_participants_range'
      AND conrelid = 'public.tenants'::regclass
  ) THEN
    RAISE EXCEPTION 'Constraint tenants_default_max_participants_range fehlt';
  END IF;

  -- b) Kein Studio außerhalb des Bereichs
  SELECT count(*) INTO v_count
  FROM public.tenants
  WHERE default_max_participants < 1 OR default_max_participants > 50;
  IF v_count <> 0 THEN
    RAISE EXCEPTION '% Studios mit default_max_participants außerhalb 1–50', v_count;
  END IF;

  -- c) RPC
  SELECT p.prosecdef, p.proconfig
    INTO v_prosecdef, v_proconfig
  FROM pg_proc p
  WHERE p.oid = 'public.update_booking_settings(integer)'::regprocedure;

  IF v_prosecdef IS NOT TRUE THEN
    RAISE EXCEPTION 'update_booking_settings ist nicht SECURITY DEFINER';
  END IF;
  IF v_proconfig IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM unnest(v_proconfig) AS cfg
       WHERE cfg LIKE 'search_path=public%'
     )
  THEN
    RAISE EXCEPTION 'update_booking_settings proconfig ohne search_path=public: %', v_proconfig;
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_proconfig) AS cfg WHERE cfg LIKE '%pg_temp%'
  ) THEN
    RAISE EXCEPTION 'update_booking_settings proconfig enthält pg_temp: %', v_proconfig;
  END IF;
  IF has_function_privilege('anon', 'public.update_booking_settings(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf update_booking_settings';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.update_booking_settings(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated fehlt EXECUTE auf update_booking_settings';
  END IF;

  -- d) tenants-Rechte
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT has_table_privilege(v_role, 'public.tenants', 'SELECT') THEN
      RAISE EXCEPTION '% fehlt SELECT auf public.tenants', v_role;
    END IF;
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(v_role, 'public.tenants', v_priv) THEN
        RAISE EXCEPTION '% hat noch % auf public.tenants', v_role, v_priv;
      END IF;
    END LOOP;
  END LOOP;

  -- e) global_settings
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege(v_role, 'public.global_settings', v_priv) THEN
        RAISE EXCEPTION '% hat noch % auf public.global_settings', v_role, v_priv;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT has_table_privilege('authenticated', 'public.global_settings', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated fehlt SELECT auf public.global_settings';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'global_settings'
      AND policyname = 'settings_manage_managers'
  ) THEN
    RAISE EXCEPTION 'Policy settings_manage_managers existiert noch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'global_settings'
      AND policyname = 'settings_select_authenticated'
  ) THEN
    RAISE EXCEPTION 'Policy settings_select_authenticated fehlt';
  END IF;

  -- f) Schreibwege auf tenants bleiben SECURITY DEFINER / postgres
  FOREACH v_fn_ident IN ARRAY ARRAY[
    'public.update_studio_branding(text, text, text, boolean, boolean, boolean)',
    'public.set_studio_logo(text)',
    'public.begin_tenant_onboarding(text, text)',
    'public.cancel_tenant_onboarding(uuid)',
    'public.delete_tenant_complete(uuid)',
    'public.update_booking_settings(integer)'
  ] LOOP
    v_oid := to_regprocedure(v_fn_ident);
    IF v_oid IS NULL THEN
      v_fn_name := split_part(split_part(v_fn_ident, '.', 2), '(', 1);
      RAISE EXCEPTION '% existiert nicht', v_fn_name;
    END IF;
    SELECT p.prosecdef, pg_get_userbyid(p.proowner)
      INTO v_definer, v_owner
    FROM pg_proc p
    WHERE p.oid = v_oid;
    IF v_owner IS DISTINCT FROM 'postgres' THEN
      RAISE EXCEPTION '% Eigentümer ist %, erwartet postgres', v_fn_ident, v_owner;
    END IF;
    IF v_definer IS NOT TRUE THEN
      RAISE EXCEPTION '% ist nicht SECURITY DEFINER', v_fn_ident;
    END IF;
  END LOOP;

  -- g) Kontrastprüfung bleibt für Schreibende auf tenants ausführbar
  IF NOT has_function_privilege(
    'authenticated',
    'yogaflow_private.is_brand_color_allowed(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated fehlt EXECUTE auf is_brand_color_allowed';
  END IF;
END;
$$;
