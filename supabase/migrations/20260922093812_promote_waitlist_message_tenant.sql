-- Zweck: Nachrücken-Nachricht in messages bekommt die tenant_id des Kurses.
--
-- Befund 22.09.2026 auf DEV: promote_from_waitlist legt die Glück-Nachricht an,
-- ohne tenant_id. messages.tenant_id gibt es seit 20260426110000 (nullable).
-- Der Insert lässt sie seit der ersten Fassung 20260106175737 aus; die erste
-- Neufassung nach der Spalte, 20260907113107, und 20260921233700 ebenfalls.
-- messages_select_own_tenant verlangt tenant_id = get_my_tenant_id()
-- (seit 20260426120000). NULL scheitert still, Absender und Empfänger sehen
-- die Zeile nicht. Beleg: Test Kurs V1, Nachricht 4c4e6fd5-6b46-4cee-9584-12839db1f27e.
--
-- Diese Migration schreibt nur neue Zeilen. Vorhandene NULL-Zeilen bleiben,
-- damit keine alte Nachricht nachträglich im Chat auftaucht.
--
-- Rückweg: Körper aus 20260921233700 (Kommentar, läuft hier nicht).
-- Rechte bleiben der REVOKE darunter.
--
-- CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_course_id uuid)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO ''
-- AS $$
-- DECLARE
--   v_max_participants integer;
--   v_current_count integer;
--   v_next_user record;
--   v_course_title text;
--   v_course_date date;
--   v_course_time time;
--   v_teacher_id uuid;
--   v_message_content text;
-- BEGIN
--   SELECT max_participants, title, date, time, teacher_id
--   INTO v_max_participants, v_course_title, v_course_date, v_course_time, v_teacher_id
--   FROM public.courses
--   WHERE id = p_course_id
--   FOR UPDATE;
--
--   SELECT COUNT(*) INTO v_current_count
--   FROM public.registrations
--   WHERE course_id = p_course_id
--     AND status = 'registered'
--     AND is_waitlist = false
--     AND cancellation_timestamp IS NULL;
--
--   WHILE v_current_count < v_max_participants LOOP
--     SELECT id, user_id, waitlist_position INTO v_next_user
--     FROM public.registrations
--     WHERE course_id = p_course_id
--       AND is_waitlist = true
--       AND status = 'waitlist'
--       AND cancellation_timestamp IS NULL
--     ORDER BY waitlist_position ASC
--     LIMIT 1;
--
--     EXIT WHEN v_next_user.id IS NULL;
--
--     UPDATE public.registrations
--     SET status = 'registered',
--         is_waitlist = false,
--         waitlist_position = NULL,
--         registered_at = now()
--     WHERE id = v_next_user.id;
--
--     v_message_content := format(
--       'Du hast Glück und einen Platz im Kurs "%s" am %s um %s bekommen.',
--       v_course_title,
--       to_char(v_course_date, 'DD.MM.YYYY'),
--       to_char(v_course_time, 'HH24:MI')
--     );
--
--     INSERT INTO public.messages (
--       course_id,
--       sender_id,
--       recipient_id,
--       content,
--       is_broadcast,
--       read
--     ) VALUES (
--       p_course_id,
--       v_teacher_id,
--       v_next_user.user_id,
--       v_message_content,
--       false,
--       false
--     );
--
--     v_current_count := v_current_count + 1;
--   END LOOP;
--
--   PERFORM public.compact_waitlist_positions(p_course_id);
-- END;
-- $$;

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_max_participants integer;
  v_current_count integer;
  v_next_user record;
  v_course_title text;
  v_course_date date;
  v_course_time time;
  v_teacher_id uuid;
  v_tenant_id uuid;
  v_message_content text;
BEGIN
  SELECT max_participants, title, date, time, teacher_id, tenant_id
  INTO v_max_participants, v_course_title, v_course_date, v_course_time, v_teacher_id, v_tenant_id
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  WHILE v_current_count < v_max_participants LOOP
    SELECT id, user_id, waitlist_position INTO v_next_user
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL
    ORDER BY waitlist_position ASC
    LIMIT 1;

    EXIT WHEN v_next_user.id IS NULL;

    UPDATE public.registrations
    SET status = 'registered',
        is_waitlist = false,
        waitlist_position = NULL,
        registered_at = now()
    WHERE id = v_next_user.id;

    v_message_content := format(
      'Du hast Glück und einen Platz im Kurs "%s" am %s um %s bekommen.',
      v_course_title,
      to_char(v_course_date, 'DD.MM.YYYY'),
      to_char(v_course_time, 'HH24:MI')
    );

    INSERT INTO public.messages (
      course_id,
      sender_id,
      recipient_id,
      content,
      is_broadcast,
      read,
      tenant_id
    ) VALUES (
      p_course_id,
      v_teacher_id,
      v_next_user.user_id,
      v_message_content,
      false,
      false,
      v_tenant_id
    );

    v_current_count := v_current_count + 1;
  END LOOP;

  PERFORM public.compact_waitlist_positions(p_course_id);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_from_waitlist(uuid) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_def text;
  v_volatile "char";
BEGIN
  SELECT pg_get_functiondef('public.promote_from_waitlist(uuid)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'promote_from_waitlist ohne FOR UPDATE';
  END IF;
  IF v_def NOT LIKE '%tenant_id%' THEN
    RAISE EXCEPTION 'promote_from_waitlist ohne tenant_id';
  END IF;

  SELECT p.provolatile
    INTO v_volatile
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'promote_from_waitlist';
  IF v_volatile IS DISTINCT FROM 'v' THEN
    RAISE EXCEPTION 'promote_from_waitlist ist nicht VOLATILE';
  END IF;

  IF has_function_privilege('anon', 'public.promote_from_waitlist(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon darf promote_from_waitlist nicht ausführen';
  END IF;
  IF has_function_privilege('authenticated', 'public.promote_from_waitlist(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated darf promote_from_waitlist nicht ausführen';
  END IF;
END $$;
