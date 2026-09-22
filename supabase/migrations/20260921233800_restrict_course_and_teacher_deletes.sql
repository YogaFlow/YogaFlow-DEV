-- Zweck: Geldkette Story 0.2, Befunde L2 und L3, Korrektur K3 (21.09.2026).
-- Ein Kurs mit Anmeldungen und ein Lehrerprofil mit Kursen verschwinden nicht mehr
-- per Kaskade. Soft-Cancel und „übergeben oder absagen“ kommen später (Story A1 / 3.2).
--
-- FK-Inventur DEV 21.09.2026, vor dieser Migration.
-- Abfrage: pg_constraint.confdeltype IN ('r','a'), Quelle oder Ziel in
-- public.tenants, users, courses, registrations, messages, user_notifications.
-- Ergebnis: keine Zeile.
--
-- Nicht am Mandanten (deshalb hier nicht gelöscht): storage.objects,
-- storage.s3_multipart_uploads, storage.s3_multipart_uploads_parts und
-- storage.vector_indexes haben NO ACTION auf storage.buckets bzw.
-- storage.buckets_vectors, nicht auf tenants/users/courses.
--
-- Diese Migration macht zwei FKs zu RESTRICT. Die müssen in delete_tenant_complete
-- explizit vor ihrem Ziel gelöscht werden:
--   registrations_course_id_fkey   registrations.course_id → courses(id)   war CASCADE, wird RESTRICT
--   courses_teacher_id_fkey        courses.teacher_id      → users(id)     war CASCADE, wird RESTRICT
--
-- Übrige FKs auf courses/users/tenants blockieren ein DELETE nicht
-- (CASCADE oder SET NULL): courses.tenant_id, registrations.tenant_id,
-- registrations.user_id, messages.course_id, messages.sender_id,
-- messages.recipient_id, messages.tenant_id, user_notifications.tenant_id,
-- user_notifications.user_id, users.tenant_id CASCADE;
-- user_notifications.course_id und admin_emails.created_by SET NULL.
-- courses.series_id hat keinen Fremdschlüssel.
--
-- DELETE-Reihenfolge in delete_tenant_complete, jede der beiden neuen
-- RESTRICT-Regeln ist abgedeckt (registrations vor courses, courses vor users):
--   1. user_notifications
--   2. messages
--   3. registrations
--   4. courses          (Nachrichten, die das Nachrücken in Schritt 3 anlegt,
--                        hängen an messages.course_id ON DELETE CASCADE und
--                        gehen mit den Kursen mit)
--   5. users            (Trigger prevent_last_owner_delete bleibt pausiert)
--   6. tenants
--
-- Jede neue Tabelle mit RESTRICT auf courses/users/tenants muss hier ergänzt werden.
--
-- Rückweg (ausführbar, diese Zeilen sind Kommentar und laufen hier nicht).
-- FKs zurück auf CASCADE. delete_tenant_complete aus 20260503120000.
--
-- ALTER TABLE public.registrations DROP CONSTRAINT registrations_course_id_fkey;
-- ALTER TABLE public.registrations
--   ADD CONSTRAINT registrations_course_id_fkey
--   FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
-- ALTER TABLE public.courses DROP CONSTRAINT courses_teacher_id_fkey;
-- ALTER TABLE public.courses
--   ADD CONSTRAINT courses_teacher_id_fkey
--   FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE CASCADE;
--
-- CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
--     RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
--       USING ERRCODE = 'P0002';
--   END IF;
-- 
--   ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
--   BEGIN
--     DELETE FROM public.tenants WHERE id = p_tenant_id;
--   EXCEPTION WHEN OTHERS THEN
--     ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
--     RAISE;
--   END;
-- 
--   ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
-- END;
-- $$;
-- 
-- COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
--   'Löscht einen Mandanten inkl. CASCADE (users, courses, …). SQL Editor: SELECT public.delete_tenant_complete(''…''::uuid); auth.users ggf. separat im Dashboard; nur postgres/service_role.';
-- 
-- REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid) FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO postgres;
-- GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO service_role;
ALTER TABLE public.registrations DROP CONSTRAINT registrations_course_id_fkey;
ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;

ALTER TABLE public.courses DROP CONSTRAINT courses_teacher_id_fkey;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE RESTRICT;

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
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
    DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
    RAISE;
  END;

  ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
END;
$function$;

COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
  'Löscht einen Mandanten in fester Reihenfolge: user_notifications, messages, registrations, courses, users, tenants. registrations.course_id und courses.teacher_id sind RESTRICT. prevent_last_owner_delete ist währenddessen pausiert. auth.users separat. Nur postgres/service_role. Jede neue Tabelle mit RESTRICT auf courses/users/tenants muss hier ergänzt werden.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO service_role;

DO $$
DECLARE
  v_course_fk "char";
  v_teacher_fk "char";
  v_def text;
  v_reg integer;
  v_courses integer;
  v_users integer;
BEGIN
  SELECT confdeltype INTO v_course_fk
  FROM pg_constraint
  WHERE conname = 'registrations_course_id_fkey';
  IF v_course_fk IS DISTINCT FROM 'r'::"char" THEN
    RAISE EXCEPTION 'registrations_course_id_fkey confdeltype %, erwartet r', v_course_fk;
  END IF;

  SELECT confdeltype INTO v_teacher_fk
  FROM pg_constraint
  WHERE conname = 'courses_teacher_id_fkey';
  IF v_teacher_fk IS DISTINCT FROM 'r'::"char" THEN
    RAISE EXCEPTION 'courses_teacher_id_fkey confdeltype %, erwartet r', v_teacher_fk;
  END IF;

  SELECT pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure) INTO v_def;
  v_reg := strpos(v_def, 'DELETE FROM public.registrations');
  v_courses := strpos(v_def, 'DELETE FROM public.courses');
  v_users := strpos(v_def, 'DELETE FROM public.users');
  IF v_reg = 0 OR v_courses = 0 OR v_users = 0 OR v_reg > v_courses OR v_courses > v_users THEN
    RAISE EXCEPTION 'delete_tenant_complete löscht nicht registrations vor courses vor users';
  END IF;
  IF v_def NOT LIKE '%pg_temp%' THEN
    RAISE EXCEPTION 'delete_tenant_complete search_path ohne pg_temp';
  END IF;
  IF v_def NOT LIKE '%DISABLE TRIGGER prevent_last_owner_delete%' THEN
    RAISE EXCEPTION 'prevent_last_owner_delete wird nicht pausiert';
  END IF;

  -- Genau ein FK je Spalte, keiner davon CASCADE. Unabhängig vom Constraint-Namen.
  IF (
    SELECT count(DISTINCT c.oid)
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND rel.relname = 'registrations'
      AND a.attname = 'course_id'
  ) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'public.registrations(course_id) hat nicht genau einen Fremdschlüssel';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND rel.relname = 'registrations'
      AND a.attname = 'course_id'
      AND c.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'public.registrations(course_id) hat noch ON DELETE CASCADE';
  END IF;

  IF (
    SELECT count(DISTINCT c.oid)
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND rel.relname = 'courses'
      AND a.attname = 'teacher_id'
  ) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'public.courses(teacher_id) hat nicht genau einen Fremdschlüssel';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND rel.relname = 'courses'
      AND a.attname = 'teacher_id'
      AND c.confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'public.courses(teacher_id) hat noch ON DELETE CASCADE';
  END IF;
END $$;
