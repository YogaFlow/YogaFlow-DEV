/*
  Follow-up: role upgrade cleanup should remove all active registrations,
  not only future course registrations.
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
    WHERE r.user_id = NEW.id
      AND r.tenant_id = NEW.tenant_id
      AND r.cancellation_timestamp IS NULL;
  END IF;

  RETURN NEW;
END;
$$;
