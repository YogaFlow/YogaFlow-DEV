-- 4.3 — Person entfernen: löschen oder anonymisieren.
--
-- Zweck: Owner/Admin können eine Person im eigenen Studio entfernen, ohne
-- dass ein Zahlungsvermerk, ein Erlass, ein Event oder ein Audit-Eintrag
-- verloren geht oder das Löschen an einem Fremdschlüssel scheitert.
-- Ohne Geldbezug wird das Profil gelöscht. Mit Geldbezug wird es
-- anonymisiert und vom Login gelöst. Den Login löscht Schritt 2
-- (delete-user), nur wenn remaining_profiles = 0 ist.
--
-- Bezug: Story 4.3, L8, M6, P1. Entscheidungen L1–L5 (27.09.2026).
-- L1  Owner/Admin im eigenen Studio. Keine Selbstlöschung. Owner bleiben,
--     bis die Rolle gewechselt wurde.
-- L2  Ohne Geldbezug löschen. Mit Geldbezug anonymisieren, auth_user_id
--     auf NULL. Zahlungen, Anmeldungen mit Geldbezug, Events, Audit bleiben.
-- L3  Login-Löschen ist nicht diese Migration. Die RPC liefert den alten
--     auth_user_id und remaining_profiles. M6 macht delete-user in Schritt 2.
-- L4  Nur anonymized_at. Kein Job, keine Frist-Spalte.
-- L5  delete_tenant_complete bleibt service_role und löscht weiter alles
--     im Studio, anonymisierte Zeilen eingeschlossen. Export ist eine
--     eigene Story.
--
-- Geldbezug: Anmeldung mit Zahlungszeile oder Deckung paid/waived, oder
-- payments.recorded_by, oder audit_log.actor_member_id, oder teacher_id
-- eines Kurses, der nicht mehr „aktiv und noch nicht begonnen“ ist.
-- Der letzte Fall ist breiter als „nur vergangene Kurse“: courses.teacher_id
-- ist RESTRICT (seit 20260921233800, L3 ist damit überholt). Ein abgesagter
-- Kurs, der noch nicht begonnen hat, würde das Löschen der Zeile sonst
-- mit 23503 abbrechen. Aktive, noch nicht begonnene Kurse liefern vorher
-- HAS_UPCOMING_COURSES und zählen hier nicht.
--
-- Künftige Anmeldungen (registered/waitlist, Kurs aktiv, noch nicht
-- begonnen) werden auf cancelled/member_removed gesetzt und behalten.
-- Sie gelten danach nicht als „ohne Geldbezug löschen“, sonst verschwände
-- die Stornozeile und das Nachrücken hätte keinen Auslöser mehr in der
-- Zeile. Nachrücken läuft über promote_waitlist_after_registered_cancel.
-- Keine Glocke an die entfernte Person. Die nachgerückte Person bekommt
-- die bestehende Glocke aus promote_from_waitlist.
--
-- Warteliste (K2, 27.09.2026, beide Trigger auf DEV aktiv):
-- compact_waitlist_after_leave feuert bei diesem Storno, sobald die Zeile
-- auf der Warteliste lag (OLD.is_waitlist, cancellation_timestamp war NULL
-- und ist danach gesetzt) und ruft compact_waitlist_positions.
-- Ein registrierter Platz rückt über promote_waitlist_after_registered_cancel
-- nach; promote_from_waitlist (20260927143000) ruft compact am Ende.
-- remove_member ruft compact deshalb nicht noch einmal auf.
--
-- Vorprüfung auth_user_id (Katalog und Funktionen, 27.09.2026):
-- NULL = auth.uid() ist nie wahr. Das ist gewollt.
--   get_my_member_id vergleicht auth_user_id = auth.uid(). Eine
--     anonymisierte Zeile wird nicht mehr das eigene Profil.
--   users_select_own ebenso.
--   handle_new_user setzt auth_user_id beim INSERT. Neue Zeilen haben
--     anonymized_at NULL, der CHECK gilt. INSERT ist vom Guard nicht
--     betroffen.
--   Kein laufender Weg schreibt auth_user_id per UPDATE. Geprüft:
--     Funktionen, Edge Functions, scripts/, seed-dev. Einziger Treffer
--     ist der bereits angewendete Backfill in 20260911151200
--     (SET auth_user_id = id). remove_member ist der einzige neue Weg
--     und setzt dafür yogaflow.allow_member_removal.
--   sync_profile_role_from_app_metadata zählt und ändert nur Zeilen mit
--     diesem auth_user_id. NULL-Zeilen bleiben außen vor.
--   UNIQUE (auth_user_id, tenant_id): mehrere NULL sind in PostgreSQL
--     erlaubt. Ein Login bleibt je Studio eindeutig.
--   users_auth_user_id_fkey ON DELETE CASCADE trifft nur Zeilen mit
--     gesetztem auth_user_id. Die anonymisierte Zeile hängt an keinem Login.
--   studio_member_login_exclusive behandelt NULL schon als „kein Login“.
--   set-participant-password bricht bei auth_user_id NULL bereits ab.
-- Nichts davon setzt NOT NULL voraus, sobald der CHECK die beiden
-- Zustände koppelt.
--
-- Vorprüfung Rolle = user:
--   prevent_role_escalation lässt Owner/Admin eine Nicht-Owner-Rolle auf
--   user setzen. Die RPC läuft mit dem Token der aufrufenden Person,
--   get_my_member_id bleibt der Aufrufer. Owner werden vorher abgelehnt,
--   der Trigger sieht also nie owner → user.
--   cleanup_future_registrations_on_role_upgrade feuert nur bei
--   user → admin/owner. Eine Herabstufung löst ihn nicht aus.
--   Kein Trigger wird abgeschaltet.
--
-- Vorprüfung E-Mail: users_email_format_check lässt
-- entfernt-<uuid>@anonymisiert.invalid zu (SELECT gegen den CHECK, DEV).
-- .invalid ist nach RFC 2606 reserviert. Die UUID im Lokalteil macht die
-- Adresse je Studio eindeutig (users_tenant_email_unique).
--
-- Vorprüfung direkter Löschweg: src/ enthält kein from('users').delete().
--
-- Rückweg (Kommentar, läuft hier nicht). Nur solange keine Zeile
-- anonymized_at gesetzt hat und kein cancel_reason member_removed existiert.
-- admin_register_user_for_course aus 20260927143000 (Zeilen 239–389)
-- danach erneut anwenden.
--
-- DROP TRIGGER IF EXISTS users_identity_guard ON public.users;
-- DROP FUNCTION IF EXISTS yogaflow_private.users_identity_guard();
-- DROP FUNCTION IF EXISTS public.remove_member(uuid);
-- ALTER TABLE public.registrations DROP CONSTRAINT registrations_cancel_reason_check;
-- ALTER TABLE public.registrations ADD CONSTRAINT registrations_cancel_reason_check
--   CHECK (
--     cancel_reason IS NULL
--     OR cancel_reason IN (
--       'participant', 'studio', 'course_cancelled', 'promotion_expired',
--       'role_change', 'legacy_closed'
--     )
--   );
-- ALTER TABLE public.users DROP CONSTRAINT users_auth_link_valid;
-- ALTER TABLE public.users ALTER COLUMN auth_user_id SET NOT NULL;
-- ALTER TABLE public.users DROP COLUMN anonymized_at;
-- CREATE POLICY managers_delete_tenant_users
--   ON public.users FOR DELETE TO authenticated
--   USING (
--     (tenant_id = yogaflow_private.get_my_tenant_id())
--     AND yogaflow_private.is_tenant_manager()
--     AND (id <> (SELECT yogaflow_private.get_my_member_id()))
--     AND (role <> 'owner'::text)
--   );
-- GRANT DELETE ON TABLE public.users TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. users: Anonymisierung und Login-Lösung
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;

ALTER TABLE public.users
  ALTER COLUMN auth_user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_auth_link_valid'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_auth_link_valid
      CHECK ((auth_user_id IS NULL) = (anonymized_at IS NOT NULL));
  END IF;
END $$;

COMMENT ON COLUMN public.users.anonymized_at IS
  'Gesetzt, wenn das Profil eingeschränkt statt gelöscht wurde (4.3, L4). Dann ist auth_user_id NULL.';

-- Identitätssperre statt Spalten-REVOKE.
-- Auf DEV hat authenticated kein Tabellen-UPDATE auf public.users, aber
-- Spalten-UPDATE auf first_name, last_name, email, phone, Adresse und role
-- (20260911134500). Ein REVOKE UPDATE (anonymized_at) würde eine umbenannte
-- anonymisierte Zeile nicht verhindern. auth_user_id ist für anon und
-- authenticated schon nicht beschreibbar; der Guard sperrt die Änderung
-- zusätzlich für jede Rolle außer dem geschalteten remove_member.
-- EXECUTE bleibt für anon und authenticated, weil jeder Profil-UPDATE den
-- Trigger auslöst. Die Funktion schreibt nichts.

CREATE OR REPLACE FUNCTION yogaflow_private.users_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id
     AND NEW.anonymized_at IS NOT DISTINCT FROM OLD.anonymized_at
     AND OLD.anonymized_at IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF pg_catalog.current_setting('yogaflow.allow_member_removal', true) = 'on'
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'MEMBER_IDENTITY_LOCKED'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS users_identity_guard ON public.users;
CREATE TRIGGER users_identity_guard
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.users_identity_guard();

REVOKE ALL ON FUNCTION yogaflow_private.users_identity_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION yogaflow_private.users_identity_guard() TO anon, authenticated;

COMMENT ON FUNCTION yogaflow_private.users_identity_guard() IS
  'Sperrt Änderung von auth_user_id und anonymized_at und jedes Update einer schon anonymisierten Zeile. Ausnahme: yogaflow.allow_member_removal = on und current_user nicht anon/authenticated.';

-- ---------------------------------------------------------------------------
-- 2. cancel_reason: member_removed (CHECK, kein Enum)
-- ---------------------------------------------------------------------------

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_cancel_reason_check;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_cancel_reason_check
  CHECK (
    cancel_reason IS NULL
    OR cancel_reason IN (
      'participant',
      'studio',
      'course_cancelled',
      'promotion_expired',
      'role_change',
      'legacy_closed',
      'member_removed'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. remove_member
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_member(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_tenant uuid;
  v_target public.users%ROWTYPE;
  v_upcoming integer;
  v_cancelled integer := 0;
  v_deleted_regs integer := 0;
  v_money boolean;
  v_mode text;
  v_old_auth uuid;
  v_remaining integer;
  v_event_id uuid;
  v_fields text[];
BEGIN
  v_actor := yogaflow_private.get_my_member_id();
  IF NOT yogaflow_private.is_tenant_manager() THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_tenant := yogaflow_private.get_my_tenant_id();

  SELECT *
    INTO v_target
  FROM public.users
  WHERE id = p_member_id;

  IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_target.id = v_actor THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'CANNOT_REMOVE_SELF');
  END IF;

  IF v_target.role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'OWNER_NOT_REMOVABLE');
  END IF;

  IF v_target.anonymized_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REMOVED');
  END IF;

  SELECT count(*)::integer
    INTO v_upcoming
  FROM public.courses c
  WHERE c.teacher_id = v_target.id
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  IF v_upcoming > 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'HAS_UPCOMING_COURSES',
      'upcoming_courses', v_upcoming
    );
  END IF;

  SELECT *
    INTO v_target
  FROM public.users
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND OR v_target.tenant_id IS DISTINCT FROM v_tenant THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_target.anonymized_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REMOVED');
  END IF;

  IF v_target.role = 'owner' THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'OWNER_NOT_REMOVABLE');
  END IF;

  v_old_auth := v_target.auth_user_id;

  PERFORM 1
  FROM public.courses c
  WHERE c.id IN (
    SELECT r.course_id
    FROM public.registrations r
    JOIN public.courses c2 ON c2.id = r.course_id
    WHERE r.user_id = v_target.id
      AND r.tenant_id = v_tenant
      AND r.cancellation_timestamp IS NULL
      AND r.status IN (
        'registered'::public.registration_status,
        'waitlist'::public.registration_status
      )
      AND c2.status = 'active'
      AND (c2.date + COALESCE(c2.time, TIME '00:00:00'))
            AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
  )
  ORDER BY c.id
  FOR UPDATE;

  -- Warteliste verdichtet compact_waitlist_after_leave, registrierte Plätze
  -- promote_from_waitlist. Beides hängt schon an diesem UPDATE. Siehe Kopf.
  UPDATE public.registrations r
  SET
    status = 'cancelled'::public.registration_status,
    cancellation_timestamp = pg_catalog.now(),
    cancelled_by = v_actor,
    cancel_reason = 'member_removed',
    waitlist_position = NULL
  FROM public.courses c
  WHERE r.course_id = c.id
    AND r.user_id = v_target.id
    AND r.tenant_id = v_tenant
    AND r.cancellation_timestamp IS NULL
    AND r.status IN (
      'registered'::public.registration_status,
      'waitlist'::public.registration_status
    )
    AND c.status = 'active'
    AND (c.date + COALESCE(c.time, TIME '00:00:00'))
          AT TIME ZONE 'Europe/Berlin' > pg_catalog.now();

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  v_money := EXISTS (
    SELECT 1
    FROM public.registrations r
    WHERE r.user_id = v_target.id
      AND (
        r.coverage_status IN (
          'paid'::public.registration_coverage_status,
          'waived'::public.registration_coverage_status
        )
        OR EXISTS (
          SELECT 1 FROM public.payments p WHERE p.registration_id = r.id
        )
      )
  ) OR EXISTS (
    SELECT 1 FROM public.payments p WHERE p.recorded_by = v_target.id
  ) OR EXISTS (
    SELECT 1 FROM public.audit_log a WHERE a.actor_member_id = v_target.id
  ) OR EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.teacher_id = v_target.id
      AND NOT (
        c.status = 'active'
        AND (c.date + COALESCE(c.time, TIME '00:00:00'))
              AT TIME ZONE 'Europe/Berlin' > pg_catalog.now()
      )
  );

  IF NOT v_money THEN
    v_mode := 'deleted';
    SELECT count(*)::integer
      INTO v_deleted_regs
    FROM public.registrations
    WHERE user_id = v_target.id;

    DELETE FROM public.users WHERE id = v_target.id;
    v_fields := ARRAY['id']::text[];
  ELSE
    v_mode := 'anonymized';

    DELETE FROM public.messages
    WHERE sender_id = v_target.id OR recipient_id = v_target.id;

    DELETE FROM public.user_notifications
    WHERE user_id = v_target.id;

    -- member_removed bleibt: das ist die künftige Anmeldung aus dem
    -- Schritt davor. Zahlungen werden nicht angefasst.
    DELETE FROM public.registrations r
    WHERE r.user_id = v_target.id
      AND r.cancel_reason IS DISTINCT FROM 'member_removed'
      AND r.coverage_status NOT IN (
        'paid'::public.registration_coverage_status,
        'waived'::public.registration_coverage_status
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.payments p WHERE p.registration_id = r.id
      );

    GET DIAGNOSTICS v_deleted_regs = ROW_COUNT;

    -- Transaktionslokal. users_identity_guard lässt das UPDATE nur so durch.
    PERFORM pg_catalog.set_config('yogaflow.allow_member_removal', 'on', true);

    UPDATE public.users
    SET
      first_name = 'Entfernte',
      last_name = 'Person',
      email = 'entfernt-' || id::text || '@anonymisiert.invalid',
      street = NULL,
      house_number = NULL,
      postal_code = NULL,
      city = NULL,
      phone = NULL,
      email_verified = false,
      email_verified_at = NULL,
      role = 'user',
      anonymized_at = pg_catalog.now(),
      auth_user_id = NULL
    WHERE id = v_target.id;

    v_fields := ARRAY[
      'anonymized_at',
      'auth_user_id',
      'email',
      'first_name',
      'last_name',
      'street',
      'house_number',
      'postal_code',
      'city',
      'phone',
      'email_verified',
      'email_verified_at',
      'role'
    ]::text[];
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_tenant,
    'member.removed',
    'member',
    v_target.id,
    pg_catalog.jsonb_build_object(
      'member_id', v_target.id,
      'mode', v_mode,
      'cancelled_registrations', v_cancelled,
      'deleted_registrations', v_deleted_regs
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant,
    v_actor,
    'member.removed',
    'users',
    v_target.id,
    v_fields,
    v_event_id
  );

  SELECT count(*)::integer
    INTO v_remaining
  FROM public.users
  WHERE auth_user_id = v_old_auth;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'mode', v_mode,
    'auth_user_id', v_old_auth,
    'remaining_profiles', v_remaining,
    'cancelled_registrations', v_cancelled,
    'deleted_registrations', v_deleted_regs
  );
END;
$function$;

COMMENT ON FUNCTION public.remove_member(uuid) IS
  'Entfernt ein Profil im Studio der aufrufenden Person. Ohne Geldbezug löschen, mit Geldbezug anonymisieren und vom Login lösen. Login löscht delete-user nur bei remaining_profiles = 0.';

REVOKE ALL ON FUNCTION public.remove_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_member(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Direkten Löschweg schließen
--    delete_tenant_complete bleibt. Sie löscht users nach tenant_id,
--    ohne anonymized_at auszunehmen (L5).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS managers_delete_tenant_users ON public.users;

REVOKE DELETE ON TABLE public.users FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. admin_register_user_for_course: anonymisierte Person
--    Körper wie 20260927143000, plus MEMBER_REMOVED.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_register_user_for_course(p_user_id uuid, p_course_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id           uuid;
  v_actor_role         text;
  v_actor_tenant       uuid;
  v_course_tenant      uuid;
  v_teacher_id         uuid;
  v_max_participants   integer;
  v_course_date        date;
  v_course_title       text;
  v_course_time        time;
  v_course_status      text;
  v_current_count      integer;
  v_next_position      integer;
  v_notification_body  text;
BEGIN
  v_actor_id := yogaflow_private.get_my_member_id();
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role, tenant_id INTO v_actor_role, v_actor_tenant
  FROM public.users WHERE id = v_actor_id;

  IF v_actor_role NOT IN ('owner', 'admin', 'teacher') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient permissions');
  END IF;

  SELECT tenant_id, teacher_id, max_participants, date, title, time, status
  INTO v_course_tenant, v_teacher_id, v_max_participants, v_course_date, v_course_title, v_course_time, v_course_status
  FROM public.courses WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;

  IF v_course_tenant IS DISTINCT FROM v_actor_tenant THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cross-tenant operation not allowed');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND tenant_id = v_actor_tenant
      AND anonymized_at IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_REMOVED');
  END IF;

  IF v_course_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'COURSE_NOT_AVAILABLE');
  END IF;

  IF v_actor_role = 'teacher' AND v_teacher_id IS DISTINCT FROM v_actor_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Teachers can only add participants to their own courses');
  END IF;

  IF p_user_id IS NOT DISTINCT FROM v_teacher_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course teachers cannot be added as participants to their own course');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id
      AND tenant_id = v_actor_tenant
      AND role IN ('user', 'teacher')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found or not a participant');
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot register for past courses');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE course_id = p_course_id
      AND user_id = p_user_id
      AND cancellation_timestamp IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_registered');
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id
    AND status = 'registered'
    AND is_waitlist = false
    AND cancellation_timestamp IS NULL;

  IF v_current_count >= v_max_participants THEN
    SELECT COUNT(*)::integer + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id
      AND is_waitlist = true
      AND status = 'waitlist'
      AND cancellation_timestamp IS NULL;

    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist, waitlist_position)
    VALUES (p_user_id, p_course_id, v_actor_tenant, 'waitlist', true, v_next_position);

    v_notification_body := format(
      'Du wurdest für den Kurs "%s" auf die Warteliste gesetzt (Platz %s).',
      v_course_title,
      v_next_position
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_actor_tenant,
      p_user_id,
      'course_waitlisted',
      v_notification_body,
      p_course_id,
      '/my-courses',
      jsonb_build_object('added_by_user_id', v_actor_id, 'waitlist_position', v_next_position)
    );

    RETURN jsonb_build_object(
      'success', true,
      'on_waitlist', true,
      'waitlist_position', v_next_position
    );
  ELSE
    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist)
    VALUES (p_user_id, p_course_id, v_actor_tenant, 'registered', false);

    v_notification_body := format(
      'Du wurdest zum Kurs "%s" am %s um %s hinzugefügt.',
      v_course_title,
      to_char(v_course_date, 'DD.MM.YYYY'),
      to_char(v_course_time, 'HH24:MI')
    );

    INSERT INTO public.user_notifications (
      tenant_id, user_id, type, body, course_id, action_path, metadata
    ) VALUES (
      v_actor_tenant,
      p_user_id,
      'course_added',
      v_notification_body,
      p_course_id,
      '/my-courses',
      jsonb_build_object('added_by_user_id', v_actor_id)
    );

    RETURN jsonb_build_object('success', true, 'on_waitlist', false);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_register_user_for_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_register_user_for_course(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_oid oid;
  v_def text;
  v_tenant_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'anonymized_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION '4.3: Spalte users.anonymized_at fehlt';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.users'::regclass
      AND attname = 'auth_user_id'
      AND attnotnull
  ) THEN
    RAISE EXCEPTION '4.3: auth_user_id ist noch NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_auth_link_valid'
      AND conrelid = 'public.users'::regclass
      AND pg_get_constraintdef(oid) LIKE '%auth_user_id IS NULL%'
      AND pg_get_constraintdef(oid) LIKE '%anonymized_at IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION '4.3: CHECK users_auth_link_valid fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'registrations_cancel_reason_check'
      AND conrelid = 'public.registrations'::regclass
      AND pg_get_constraintdef(oid) LIKE '%member_removed%'
  ) THEN
    RAISE EXCEPTION '4.3: member_removed ist nicht erlaubt';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.users'::regclass
      AND polname = 'managers_delete_tenant_users'
  ) THEN
    RAISE EXCEPTION '4.3: Policy managers_delete_tenant_users ist noch da';
  END IF;

  IF has_table_privilege('authenticated', 'public.users', 'DELETE')
     OR has_table_privilege('anon', 'public.users', 'DELETE') THEN
    RAISE EXCEPTION '4.3: anon oder authenticated darf users noch löschen';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'users'
      AND t.tgname = 'users_identity_guard'
      AND NOT t.tgisinternal
      AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION '4.3: Trigger users_identity_guard fehlt oder ist nicht aktiv';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'yogaflow_private'
      AND p.proname = 'users_identity_guard'
      AND p.prosrc LIKE '%MEMBER_IDENTITY_LOCKED%'
      AND p.prosrc LIKE '%yogaflow.allow_member_removal%'
  ) THEN
    RAISE EXCEPTION '4.3: users_identity_guard sperrt die Identität nicht';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'yogaflow_private.users_identity_guard()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION '4.3: authenticated kann users_identity_guard nicht ausführen';
  END IF;

  SELECT p.oid
    INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'remove_member'
    AND pg_get_function_identity_arguments(p.oid) = 'p_member_id uuid';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION '4.3: remove_member fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef
  ) THEN
    RAISE EXCEPTION '4.3: remove_member ist nicht SECURITY DEFINER';
  END IF;

  IF pg_get_functiondef(v_oid) NOT LIKE '%yogaflow.allow_member_removal%' THEN
    RAISE EXCEPTION '4.3: remove_member setzt den Identitätsschalter nicht';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_oid))
    WHERE option_name = 'search_path'
      AND option_value IN ('""', '')
  ) THEN
    RAISE EXCEPTION '4.3: remove_member search_path ist nicht leer';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.remove_member(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.remove_member(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.remove_member(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '4.3: EXECUTE auf remove_member sitzt nicht nur bei authenticated';
  END IF;

  SELECT pg_get_functiondef('public.admin_register_user_for_course(uuid, uuid)'::regprocedure)
    INTO v_def;

  IF v_def NOT LIKE '%MEMBER_REMOVED%' THEN
    RAISE EXCEPTION '4.3: admin_register_user_for_course enthält MEMBER_REMOVED nicht';
  END IF;

  SELECT pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
    INTO v_tenant_def;

  IF v_tenant_def NOT LIKE '%DELETE FROM public.users WHERE tenant_id = p_tenant_id%' THEN
    RAISE EXCEPTION '4.3: delete_tenant_complete löscht die Profilzeilen des Studios nicht';
  END IF;

  IF v_tenant_def LIKE '%anonymized_at%' THEN
    RAISE EXCEPTION '4.3: delete_tenant_complete nimmt anonymisierte Zeilen aus';
  END IF;
END $$;
