/*
  # Security and Performance Fixes
  
  1. Missing Foreign Key Indexes
    - Add index on courses.teacher_id
    - Add index on registrations.user_id
  
  2. RLS Policy Performance
    - Replace auth.uid() with (select auth.uid()) for single evaluation
    - Affects: users, messages, courses, registrations, email_templates, 
               system_settings, global_settings, auth_tokens
  
  3. Function Search Path Security
    - Add SET search_path = public to all functions
  
  4. Duplicate Policy Cleanup
    - Remove redundant policies where multiple policies serve same purpose
  
  Note: Unused indexes are kept - they may be needed as application scales.
  Note: Auth DB Connection Strategy and Leaked Password Protection are 
        Supabase dashboard settings, not fixable via migration.
*/

-- ============================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_registrations_user_id ON registrations(user_id);


-- ============================================
-- 2. FIX RLS POLICIES - Use (select auth.uid())
-- ============================================

-- === USERS TABLE ===
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Users can read own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Admins can manage all users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- Consolidated user policies (eliminates duplicates)
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Admins can manage all users"
  ON users FOR ALL
  TO authenticated
  USING (is_admin());


-- === MESSAGES TABLE ===
DROP POLICY IF EXISTS "Users can view messages sent to them" ON messages;
DROP POLICY IF EXISTS "Participants can send messages to course leaders" ON messages;
DROP POLICY IF EXISTS "Course leaders can send messages" ON messages;
DROP POLICY IF EXISTS "Users can mark messages as read" ON messages;

CREATE POLICY "Users can view messages sent to them"
  ON messages FOR SELECT
  TO authenticated
  USING (recipient_id = (select auth.uid()) OR sender_id = (select auth.uid()));

CREATE POLICY "Participants can send messages to course leaders"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM registrations r
      JOIN courses c ON r.course_id = c.id
      WHERE r.user_id = (select auth.uid())
      AND c.teacher_id = messages.recipient_id
    )
  );

CREATE POLICY "Course leaders can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (select auth.uid())
      AND 'course_leader' = ANY(roles)
    )
  );

CREATE POLICY "Users can mark messages as read"
  ON messages FOR UPDATE
  TO authenticated
  USING (recipient_id = (select auth.uid()))
  WITH CHECK (recipient_id = (select auth.uid()));


-- === COURSES TABLE ===
DROP POLICY IF EXISTS "Course leaders can create courses" ON courses;
DROP POLICY IF EXISTS "Course leaders can update own courses" ON courses;
DROP POLICY IF EXISTS "Course leaders can delete own courses" ON courses;

CREATE POLICY "Course leaders can create courses"
  ON courses FOR INSERT
  TO authenticated
  WITH CHECK (
    teacher_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (select auth.uid())
      AND ('course_leader' = ANY(roles) OR 'admin' = ANY(roles))
    )
  );

CREATE POLICY "Course leaders can update own courses"
  ON courses FOR UPDATE
  TO authenticated
  USING (
    teacher_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = (select auth.uid())
      AND 'admin' = ANY(roles)
    )
  )
  WITH CHECK (
    teacher_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = (select auth.uid())
      AND 'admin' = ANY(roles)
    )
  );

CREATE POLICY "Course leaders can delete own courses"
  ON courses FOR DELETE
  TO authenticated
  USING (
    teacher_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = (select auth.uid())
      AND 'admin' = ANY(roles)
    )
  );


-- === REGISTRATIONS TABLE ===
DROP POLICY IF EXISTS "Users can read own registrations" ON registrations;
DROP POLICY IF EXISTS "Course leaders can read course registrations" ON registrations;
DROP POLICY IF EXISTS "Admins can read all registrations" ON registrations;
DROP POLICY IF EXISTS "Participants can create registrations" ON registrations;
DROP POLICY IF EXISTS "Users can delete own registrations" ON registrations;
DROP POLICY IF EXISTS "Course leaders can update course registrations" ON registrations;
DROP POLICY IF EXISTS "Admins can update all registrations" ON registrations;
DROP POLICY IF EXISTS "Admins can delete all registrations" ON registrations;
DROP POLICY IF EXISTS "Admins can manage all registrations" ON registrations;
DROP POLICY IF EXISTS "Course leaders can delete course registrations" ON registrations;

CREATE POLICY "Users can read own registrations"
  ON registrations FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Course leaders can read course registrations"
  ON registrations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = registrations.course_id
      AND courses.teacher_id = (select auth.uid())
    )
  );

CREATE POLICY "Admins can read all registrations"
  ON registrations FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY "Participants can create registrations"
  ON registrations FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = (select auth.uid())
      AND 'participant' = ANY(roles)
    )
  );

CREATE POLICY "Users can delete own registrations"
  ON registrations FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Course leaders can update course registrations"
  ON registrations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = registrations.course_id
      AND courses.teacher_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = registrations.course_id
      AND courses.teacher_id = (select auth.uid())
    )
  );

CREATE POLICY "Admins can manage all registrations"
  ON registrations FOR ALL
  TO authenticated
  USING (is_admin());


-- === EMAIL_TEMPLATES TABLE ===
DROP POLICY IF EXISTS "Admins can manage email templates" ON email_templates;
DROP POLICY IF EXISTS "Anyone can read email templates" ON email_templates;

CREATE POLICY "Anyone can read email templates"
  ON email_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage email templates"
  ON email_templates FOR ALL
  TO authenticated
  USING (is_admin());


-- === SYSTEM_SETTINGS TABLE ===
DROP POLICY IF EXISTS "Admins can read system settings" ON system_settings;
DROP POLICY IF EXISTS "Admins can manage system settings" ON system_settings;

CREATE POLICY "Admins can manage system settings"
  ON system_settings FOR ALL
  TO authenticated
  USING (is_admin());


-- === GLOBAL_SETTINGS TABLE ===
DROP POLICY IF EXISTS "Admins can manage settings" ON global_settings;
DROP POLICY IF EXISTS "Anyone authenticated can view settings" ON global_settings;

CREATE POLICY "Anyone authenticated can view settings"
  ON global_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage settings"
  ON global_settings FOR ALL
  TO authenticated
  USING (is_admin());


-- === AUTH_TOKENS TABLE ===
DROP POLICY IF EXISTS "Service role can manage all tokens" ON auth_tokens;

CREATE POLICY "Service role can manage all tokens"
  ON auth_tokens FOR ALL
  TO service_role
  USING (true);


-- ============================================
-- 3. FIX FUNCTION SEARCH PATHS
-- ============================================

-- Drop existing functions first to allow signature changes
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_tokens();
DROP FUNCTION IF EXISTS create_verification_token(uuid, text);
DROP FUNCTION IF EXISTS create_password_reset_token(uuid, text);
DROP FUNCTION IF EXISTS verify_token(text, text);
DROP FUNCTION IF EXISTS mark_token_used(text);
DROP FUNCTION IF EXISTS register_for_course(uuid, uuid);
DROP FUNCTION IF EXISTS unregister_from_course(uuid, uuid);


CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_registrations_updated_at ON registrations;
CREATE TRIGGER update_registrations_updated_at
  BEFORE UPDATE ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


CREATE FUNCTION cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth_tokens WHERE expires_at < now();
END;
$$;


CREATE FUNCTION create_verification_token(
  p_user_id uuid,
  p_email text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  
  INSERT INTO auth_tokens (user_id, email, token, token_type, expires_at)
  VALUES (p_user_id, p_email, v_token, 'email_verification', now() + interval '24 hours');
  
  RETURN v_token;
END;
$$;


CREATE FUNCTION create_password_reset_token(
  p_user_id uuid,
  p_email text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  
  INSERT INTO auth_tokens (user_id, email, token, token_type, expires_at)
  VALUES (p_user_id, p_email, v_token, 'password_reset', now() + interval '1 hour');
  
  RETURN v_token;
END;
$$;


CREATE FUNCTION verify_token(
  p_token text,
  p_token_type text
)
RETURNS TABLE(user_id uuid, email text, is_valid boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.user_id,
    t.email,
    (t.expires_at > now() AND NOT t.used) as is_valid
  FROM auth_tokens t
  WHERE t.token = p_token
  AND t.token_type = p_token_type;
END;
$$;


CREATE FUNCTION mark_token_used(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth_tokens
  SET used = true, used_at = now()
  WHERE token = p_token AND NOT used;
  
  RETURN FOUND;
END;
$$;


CREATE FUNCTION register_for_course(
  p_course_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_course record;
  v_current_count int;
  v_is_waitlist boolean;
  v_registration_id uuid;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not authenticated');
  END IF;
  
  SELECT * INTO v_course FROM courses WHERE id = p_course_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course not found');
  END IF;
  
  IF v_course.status != 'published' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Course is not open for registration');
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM registrations 
    WHERE course_id = p_course_id 
    AND user_id = v_user_id 
    AND status != 'cancelled'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already registered for this course');
  END IF;
  
  SELECT COUNT(*) INTO v_current_count
  FROM registrations
  WHERE course_id = p_course_id
  AND status IN ('confirmed', 'pending')
  AND NOT is_waitlist;
  
  v_is_waitlist := v_current_count >= v_course.max_participants;
  
  INSERT INTO registrations (course_id, user_id, status, is_waitlist)
  VALUES (p_course_id, v_user_id, 'confirmed', v_is_waitlist)
  RETURNING id INTO v_registration_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'registration_id', v_registration_id,
    'is_waitlist', v_is_waitlist
  );
END;
$$;


CREATE FUNCTION unregister_from_course(
  p_course_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_registration record;
  v_next_waitlist record;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not authenticated');
  END IF;
  
  SELECT * INTO v_registration
  FROM registrations
  WHERE course_id = p_course_id
  AND user_id = v_user_id
  AND status != 'cancelled';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Registration not found');
  END IF;
  
  UPDATE registrations
  SET status = 'cancelled'
  WHERE id = v_registration.id;
  
  IF NOT v_registration.is_waitlist THEN
    SELECT * INTO v_next_waitlist
    FROM registrations
    WHERE course_id = p_course_id
    AND is_waitlist = true
    AND status = 'confirmed'
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF FOUND THEN
      UPDATE registrations
      SET is_waitlist = false
      WHERE id = v_next_waitlist.id;
    END IF;
  END IF;
  
  RETURN jsonb_build_object('success', true);
END;
$$;