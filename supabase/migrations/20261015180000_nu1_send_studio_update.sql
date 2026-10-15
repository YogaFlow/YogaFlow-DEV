-- NU-1 — Owner/Admin sendet Studio-Neuigkeit an Teilnehmende (Glocke).
-- allow: send_studio_update
--
-- Additive Funktion; keine Änderung an messages.
-- user_notifications.type hat keinen CHECK → 'studio_update' ohne Schema-Änderung.
-- action_path = '' (kein CTA-Link in der Glocke).
--
-- Rückweg: DROP FUNCTION public.send_studio_update(uuid[], text, text, text);

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
    -- Alles in der Eingabe, das nicht zugestellt wurde (fremd, falsch, NULL, Duplikat)
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
  'NU-1: Owner/Admin sendet Studio-Neuigkeit als user_notifications (studio_update). NULL-Empfänger = alle aktiven Teilnehmenden.';

REVOKE ALL ON FUNCTION public.send_studio_update(uuid[], text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_studio_update(uuid[], text, text, text)
  TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.send_studio_update(uuid[], text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'NU-1: send_studio_update fehlt';
  END IF;

  IF has_function_privilege('anon', 'public.send_studio_update(uuid[], text, text, text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'NU-1: anon hat EXECUTE auf send_studio_update';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.send_studio_update(uuid[], text, text, text)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'NU-1: authenticated braucht EXECUTE auf send_studio_update';
  END IF;

  IF has_function_privilege(
    'public',
    'public.send_studio_update(uuid[], text, text, text)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'NU-1: PUBLIC hat noch EXECUTE auf send_studio_update';
  END IF;
END;
$$;
