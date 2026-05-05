/*
  Ensure no active participant registrations remain for elevated roles.

  1) Harden role-upgrade cleanup trigger function:
     - delete by user_id with course join (robust against historical tenant_id mismatches)
  2) One-time backfill:
     - remove active registrations for teacher/admin/owner users.
*/

CREATE OR REPLACE FUNCTION public.cleanup_future_registrations_on_role_upgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'user'
     AND NEW.role IN ('teacher', 'admin', 'owner')
     AND NEW.id IS NOT NULL
  THEN
    DELETE FROM public.registrations r
    USING public.courses c
    WHERE r.course_id = c.id
      AND r.user_id = NEW.id
      AND c.tenant_id = NEW.tenant_id
      AND r.cancellation_timestamp IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DELETE FROM public.registrations r
USING public.users u, public.courses c
WHERE r.user_id = u.id
  AND r.course_id = c.id
  AND r.cancellation_timestamp IS NULL
  AND u.role IN ('teacher', 'admin', 'owner')
  AND u.tenant_id = c.tenant_id;
