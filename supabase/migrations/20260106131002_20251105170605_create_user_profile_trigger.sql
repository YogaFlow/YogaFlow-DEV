/*
  # Create User Profile Trigger
  
  1. Changes
    - Create trigger function to automatically create user profile on signup
    - Assign admin roles to specific email addresses
    - Create participant role by default for all users
    
  2. Security
    - Trigger runs with security definer privileges
    - Automatically creates user profile when auth user is created
*/

-- Create trigger function to create user profile automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_roles text[];
BEGIN
  -- Set roles based on email
  IF NEW.email = 'andre.thaller@outlook.de' THEN
    user_roles := ARRAY['admin', 'course_leader', 'participant'];
  ELSIF NEW.email IN ('tanja@die-thallers.de', 'admin@yoga-kurse.de') THEN
    user_roles := ARRAY['admin', 'course_leader', 'participant'];
  ELSE
    user_roles := ARRAY['participant'];
  END IF;

  -- Insert user profile
  INSERT INTO public.users (
    id,
    email,
    first_name,
    last_name,
    roles,
    gdpr_consent,
    gdpr_consent_date
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    user_roles,
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    roles = EXCLUDED.roles,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();