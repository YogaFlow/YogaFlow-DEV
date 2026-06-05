-- Fix: update_registrations_updated_at trigger fires on UPDATE but registrations
-- has no updated_at column, causing "record 'new' has no field 'updated_at'" exception.
-- This breaks waitlist promotion in unregister_from_course and
-- admin_unregister_user_from_course.

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure existing rows have a value
UPDATE public.registrations
SET updated_at = COALESCE(registered_at, now())
WHERE updated_at IS NULL;

-- Re-create the trigger (it already exists via 20260122181223, this is idempotent)
DROP TRIGGER IF EXISTS update_registrations_updated_at ON public.registrations;
CREATE TRIGGER update_registrations_updated_at
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
