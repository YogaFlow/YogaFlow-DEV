-- NU-1 Teil 2 — Freigabe pro Neuigkeit + Versand-Übersicht.
-- allow: list_released_updates, list_studio_update_sends, send_studio_update
--
-- Begründung neue Tabelle (nicht platform_flags):
--   platform_flags_key_check = ^[a-z_]{3,64}$ — keine Ziffern, kein ':' / '-'.
--   Update-IDs wie 2026-10-zahlungen-im-blick passen nicht ohne CHECK-Änderung.
--
-- DEV-Seed: alle vier aktuellen IDs, wenn Demo-Slug existiert. PROD: leere Tabelle.
-- Rückweg: DROP FUNCTION list_*; DROP TABLE studio_update_releases;
--   send_studio_update auf Fassung 20261015180000 zurücksetzen.

-- ---------------------------------------------------------------------------
-- 1. Freigaben (plattformweit, kein Tenant)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.studio_update_releases (
  update_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT studio_update_releases_id_check
    CHECK (update_id ~ '^[a-z0-9-]{3,80}$')
);

COMMENT ON TABLE public.studio_update_releases IS
  'NU-1: Freigabe von Omlify-Neuigkeiten (update_id). Schreiben nur service_role.';

ALTER TABLE public.studio_update_releases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.studio_update_releases
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.studio_update_releases
  TO service_role;

-- DEV: Demo-Slug vorhanden → alle vier aktuellen IDs freigeben. PROD: niemand.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.tenants
    WHERE slug IN ('demoalpha', 'demobeta', 'e2eapp')
  ) THEN
    INSERT INTO public.studio_update_releases (update_id, enabled)
    VALUES
      ('2026-10-zahlungen-im-blick', true),
      ('2026-10-kurskarten-verkaufen', true),
      ('2026-10-rechtstexte', true),
      ('2026-10-online-bezahlen', true)
    ON CONFLICT (update_id) DO UPDATE
      SET enabled = EXCLUDED.enabled,
          updated_at = now();
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. list_released_updates — nur IDs, Owner/Admin
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_released_updates()
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF yogaflow_private.get_my_member_id() IS NULL
     OR yogaflow_private.get_my_tenant_id() IS NULL
     OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.update_id
  FROM public.studio_update_releases r
  WHERE r.enabled = true
  ORDER BY r.update_id;
END;
$function$;

COMMENT ON FUNCTION public.list_released_updates() IS
  'NU-1: Freigegebene Neuigkeiten-IDs für Owner/Admin. Leer bei fehlender Manager-Rolle.';

REVOKE ALL ON FUNCTION public.list_released_updates()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_released_updates()
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. list_studio_update_sends — letzter Versand je update_id im eigenen Tenant
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_studio_update_sends()
RETURNS TABLE (
  update_id text,
  last_sent_at timestamptz,
  recipient_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := yogaflow_private.get_my_tenant_id();

  IF yogaflow_private.get_my_member_id() IS NULL
     OR v_tenant_id IS NULL
     OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH batches AS (
    SELECT
      (n.metadata ->> 'update_id') AS batch_update_id,
      n.created_at AS batch_at,
      COUNT(*)::integer AS batch_count,
      ROW_NUMBER() OVER (
        PARTITION BY (n.metadata ->> 'update_id')
        ORDER BY n.created_at DESC
      ) AS rn
    FROM public.user_notifications n
    WHERE n.tenant_id = v_tenant_id
      AND n.type = 'studio_update'
      AND COALESCE(n.metadata ->> 'update_id', '') <> ''
    GROUP BY (n.metadata ->> 'update_id'), n.created_at
  )
  SELECT
    b.batch_update_id,
    b.batch_at,
    b.batch_count
  FROM batches b
  WHERE b.rn = 1
  ORDER BY b.batch_update_id;
END;
$function$;

COMMENT ON FUNCTION public.list_studio_update_sends() IS
  'NU-1: Letzter studio_update-Versand je update_id im eigenen Tenant (Owner/Admin).';

REVOKE ALL ON FUNCTION public.list_studio_update_sends()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_studio_update_sends()
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. send_studio_update — nicht freigegebene update_id ablehnen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.send_studio_update(
  p_recipient_ids uuid[],
  p_title text,
  p_body text,
  p_update_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_title text;
  v_body text;
  v_update_id text;
  v_sent integer := 0;
  v_skipped integer := 0;
  v_requested integer := 0;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();

  IF v_member_id IS NULL OR v_tenant_id IS NULL
     OR NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_title := pg_catalog.btrim(COALESCE(p_title, ''));
  v_body := pg_catalog.btrim(COALESCE(p_body, ''));
  v_update_id := pg_catalog.btrim(COALESCE(p_update_id, ''));

  IF v_body = '' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'EMPTY_MESSAGE');
  END IF;

  IF v_update_id = '' OR pg_catalog.char_length(v_update_id) > 80 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_UPDATE_ID');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.studio_update_releases r
    WHERE r.update_id = v_update_id
      AND r.enabled = true
  ) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'UPDATE_NOT_RELEASED');
  END IF;

  IF pg_catalog.char_length(v_title) > 120 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'TITLE_TOO_LONG');
  END IF;

  IF pg_catalog.char_length(v_body) > 2000 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'BODY_TOO_LONG');
  END IF;

  IF p_recipient_ids IS NULL THEN
    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, title, body, course_id, action_path, metadata
    )
    SELECT
      v_tenant_id,
      u.id,
      'studio_update',
      NULLIF(v_title, ''),
      v_body,
      NULL,
      '',
      pg_catalog.jsonb_build_object(
        'update_id', v_update_id,
        'sent_by', v_member_id
      )
    FROM public.users u
    WHERE u.tenant_id = v_tenant_id
      AND u.role = 'user'
      AND u.archived_at IS NULL
      AND u.anonymized_at IS NULL;

    GET DIAGNOSTICS v_sent = ROW_COUNT;
    v_skipped := 0;
  ELSE
    v_requested := COALESCE(pg_catalog.cardinality(p_recipient_ids), 0);

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, title, body, course_id, action_path, metadata
    )
    SELECT
      v_tenant_id,
      req.id,
      'studio_update',
      NULLIF(v_title, ''),
      v_body,
      NULL,
      '',
      pg_catalog.jsonb_build_object(
        'update_id', v_update_id,
        'sent_by', v_member_id
      )
    FROM (
      SELECT DISTINCT x AS id
      FROM unnest(p_recipient_ids) AS t(x)
      WHERE x IS NOT NULL
    ) req
    INNER JOIN public.users u
      ON u.id = req.id
     AND u.tenant_id = v_tenant_id
     AND u.role = 'user'
     AND u.archived_at IS NULL
     AND u.anonymized_at IS NULL;

    GET DIAGNOSTICS v_sent = ROW_COUNT;
    v_skipped := GREATEST(v_requested - v_sent, 0);
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'sent', v_sent,
    'skipped', v_skipped
  );
END;
$function$;

COMMENT ON FUNCTION public.send_studio_update(uuid[], text, text, text) IS
  'NU-1: Owner/Admin sendet Studio-Neuigkeit als user_notifications. Nur freigegebene update_id.';

REVOKE ALL ON FUNCTION public.send_studio_update(uuid[], text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_studio_update(uuid[], text, text, text)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Selbstprüfung Rechte
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.studio_update_releases') IS NULL THEN
    RAISE EXCEPTION 'NU-1.2: studio_update_releases fehlt';
  END IF;

  IF has_table_privilege('anon', 'public.studio_update_releases', 'SELECT')
     OR has_table_privilege('authenticated', 'public.studio_update_releases', 'SELECT')
     OR has_table_privilege('authenticated', 'public.studio_update_releases', 'INSERT')
  THEN
    RAISE EXCEPTION 'NU-1.2: Client darf studio_update_releases nicht lesen/schreiben';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.studio_update_releases', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.studio_update_releases', 'INSERT')
  THEN
    RAISE EXCEPTION 'NU-1.2: service_role braucht SELECT/INSERT auf studio_update_releases';
  END IF;

  IF has_function_privilege('anon', 'public.list_released_updates()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('public', 'public.list_released_updates()'::regprocedure, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'NU-1.2: anon/PUBLIC hat EXECUTE auf list_released_updates';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.list_released_updates()'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'NU-1.2: authenticated braucht EXECUTE auf list_released_updates';
  END IF;

  IF has_function_privilege('anon', 'public.list_studio_update_sends()'::regprocedure, 'EXECUTE')
     OR has_function_privilege('public', 'public.list_studio_update_sends()'::regprocedure, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'NU-1.2: anon/PUBLIC hat EXECUTE auf list_studio_update_sends';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.list_studio_update_sends()'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'NU-1.2: authenticated braucht EXECUTE auf list_studio_update_sends';
  END IF;
END;
$$;
