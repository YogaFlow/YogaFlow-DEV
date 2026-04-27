-- Epic E3: Mandantensicherheit — RLS-Policies, Hilfsfunktionen, Rollen-Trigger

-- ============================================================================
-- 1. Hilfsfunktionen (SECURITY DEFINER, kein rekursives RLS)
-- ============================================================================

-- Gibt tenant_id des aktuell eingeloggten Users zurück
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

-- Prüft ob aktueller User owner oder admin ist
CREATE OR REPLACE FUNCTION public.is_tenant_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

-- Prüft ob aktueller User owner ist
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'owner'
  );
$$;

-- Prüft ob aktueller User teacher, admin oder owner ist (darf Kurse anlegen)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('owner', 'admin', 'teacher')
  );
$$;

-- ============================================================================
-- 2. RLS auf tenants
-- ============================================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Jeder kann Tenants lesen (nötig für Slug-Auflösung im Frontend)
CREATE POLICY "Tenants sind öffentlich lesbar"
  ON public.tenants FOR SELECT
  USING (true);

-- Kein direktes INSERT/UPDATE/DELETE — nur via SECURITY DEFINER RPCs

-- ============================================================================
-- 3. RLS auf users
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Alle User im eigenen Tenant sehen (nötig für Kursleiterliste, etc.)
CREATE POLICY "users_select_same_tenant"
  ON public.users FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- Eigenes Profil aktualisieren
CREATE POLICY "users_update_own_profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Owner/Admin können andere User im Tenant aktualisieren (Rollenvergabe)
CREATE POLICY "managers_update_tenant_users"
  ON public.users FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_manager()
    AND id != auth.uid()
  )
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND role != 'owner'
  );

-- Owner/Admin können nicht-Owner User im Tenant löschen
CREATE POLICY "managers_delete_tenant_users"
  ON public.users FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_manager()
    AND id != auth.uid()
    AND role != 'owner'
  );

-- ============================================================================
-- 4. Rollen-Eskalation verhindern (Trigger ersetzt alte Version)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_role text;
BEGIN
  IF OLD.role IS NOT DISTINCT FROM NEW.role THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_current_role
  FROM public.users
  WHERE id = auth.uid();

  -- Owner und Admin können eigene Rolle nicht ändern
  IF auth.uid() = OLD.id THEN
    NEW.role := OLD.role;
    RETURN NEW;
  END IF;

  -- Nur Owner/Admin dürfen Rollen anderer ändern
  IF v_current_role NOT IN ('owner', 'admin') THEN
    NEW.role := OLD.role;
    RETURN NEW;
  END IF;

  -- Owner-Rolle darf nicht vergeben werden
  IF NEW.role = 'owner' THEN
    NEW.role := OLD.role;
    RETURN NEW;
  END IF;

  -- Owner-Rolle darf nicht entzogen werden
  IF OLD.role = 'owner' THEN
    NEW.role := OLD.role;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_role_escalation ON public.users;
CREATE TRIGGER check_role_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- ============================================================================
-- 5. RLS auf courses
-- ============================================================================

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- Nur Kurse des eigenen Tenants sichtbar
CREATE POLICY "courses_select_own_tenant"
  ON public.courses FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- Staff (owner/admin/teacher) darf Kurse anlegen
CREATE POLICY "staff_insert_courses"
  ON public.courses FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND public.is_staff()
  );

-- Kursleiter kann eigene Kurse bearbeiten; Owner/Admin alle im Tenant
CREATE POLICY "courses_update_own_or_manager"
  ON public.courses FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (teacher_id = auth.uid() OR public.is_tenant_manager())
  )
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- Owner/Admin dürfen Kurse löschen
CREATE POLICY "managers_delete_courses"
  ON public.courses FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_manager()
  );

-- ============================================================================
-- 6. RLS auf registrations
-- ============================================================================

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- User sieht eigene Buchungen; Kursleiter + Manager sehen alle im Tenant
CREATE POLICY "registrations_select"
  ON public.registrations FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (
      user_id = auth.uid()
      OR public.is_staff()
    )
  );

-- User bucht für sich selbst im eigenen Tenant
CREATE POLICY "registrations_insert_own"
  ON public.registrations FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND user_id = auth.uid()
  );

-- User storniert eigene Buchung; Manager storniert alle im Tenant
CREATE POLICY "registrations_delete"
  ON public.registrations FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (user_id = auth.uid() OR public.is_tenant_manager())
  );

-- Manager kann Buchungsstatus ändern (z.B. Warteliste → gebucht)
CREATE POLICY "registrations_update_manager"
  ON public.registrations FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND public.is_tenant_manager()
  )
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ============================================================================
-- 7. RLS auf messages (Post-MVP — minimal tenant-scoped)
-- ============================================================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_own_tenant"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_my_tenant_id()
    AND (recipient_id = auth.uid() OR sender_id = auth.uid() OR is_broadcast)
  );

CREATE POLICY "messages_insert_own_tenant"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_my_tenant_id()
    AND sender_id = auth.uid()
  );

CREATE POLICY "messages_update_own"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id() AND recipient_id = auth.uid())
  WITH CHECK (tenant_id = public.get_my_tenant_id());

-- ============================================================================
-- 8. global_settings — nur Manager können ändern
-- ============================================================================

ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select_authenticated"
  ON public.global_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "settings_manage_managers"
  ON public.global_settings FOR ALL
  TO authenticated
  USING (public.is_tenant_manager())
  WITH CHECK (public.is_tenant_manager());

-- ============================================================================
-- 9. register_for_course: Tenant-aware + neues Rollenmodell
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_for_course(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_tenant_id      uuid;
  v_course_tenant  uuid;
  v_max_participants integer;
  v_current_count  integer;
  v_course_date    date;
  v_next_position  integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = v_user_id;

  SELECT tenant_id, max_participants, date
  INTO v_course_tenant, v_max_participants, v_course_date
  FROM public.courses WHERE id = p_course_id;

  IF v_course_tenant IS DISTINCT FROM v_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not in your tenant');
  END IF;

  IF v_course_date < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot register for past courses');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE course_id = p_course_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already registered or on waitlist');
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.registrations
  WHERE course_id = p_course_id AND status = 'registered' AND is_waitlist = false;

  IF v_current_count >= v_max_participants THEN
    SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_position
    FROM public.registrations
    WHERE course_id = p_course_id AND is_waitlist = true;

    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist, waitlist_position)
    VALUES (v_user_id, p_course_id, v_tenant_id, 'waitlist', true, v_next_position);

    RETURN jsonb_build_object('success', true, 'message', 'Added to waitlist',
      'waitlist_position', v_next_position);
  ELSE
    INSERT INTO public.registrations (user_id, course_id, tenant_id, status, is_waitlist)
    VALUES (v_user_id, p_course_id, v_tenant_id, 'registered', false);

    RETURN jsonb_build_object('success', true, 'message', 'Registration successful');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_for_course(uuid) TO authenticated;

-- ============================================================================
-- 10. unregister_from_course: Tenant-aware
-- ============================================================================

CREATE OR REPLACE FUNCTION public.unregister_from_course(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_tenant_id      uuid;
  v_course_tenant  uuid;
  v_was_registered boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.users WHERE id = v_user_id;
  SELECT tenant_id INTO v_course_tenant FROM public.courses WHERE id = p_course_id;

  IF v_course_tenant IS DISTINCT FROM v_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not in your tenant');
  END IF;

  SELECT (status = 'registered' AND is_waitlist = false) INTO v_was_registered
  FROM public.registrations
  WHERE course_id = p_course_id AND user_id = v_user_id;

  DELETE FROM public.registrations
  WHERE course_id = p_course_id AND user_id = v_user_id;

  IF v_was_registered THEN
    PERFORM public.promote_from_waitlist(p_course_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Unregistration successful');
END;
$$;

GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid) TO authenticated;

-- ============================================================================
-- 11. Grants für Hilfsfunktionen
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_my_tenant_id()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_manager()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff()           TO authenticated;
