/*
  # Fix User Profile Trigger to Include All Required Fields
  
  1. Changes
    - Update trigger function to extract all user data from metadata
    - Include street, house_number, postal_code, city, and phone fields
    - Provide default empty strings for missing fields
    
  2. Security
    - Trigger runs with security definer privileges
    - Automatically creates complete user profile when auth user is created
*/

-- Update trigger function to create user profile with all required fields
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

  -- Insert user profile with all required fields
  INSERT INTO public.users (
    id,
    email,
    first_name,
    last_name,
    street,
    house_number,
    postal_code,
    city,
    phone,
    roles,
    gdpr_consent,
    gdpr_consent_date
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'street', ''),
    COALESCE(NEW.raw_user_meta_data->>'house_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'postal_code', ''),
    COALESCE(NEW.raw_user_meta_data->>'city', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    user_roles,
    true,
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    street = EXCLUDED.street,
    house_number = EXCLUDED.house_number,
    postal_code = EXCLUDED.postal_code,
    city = EXCLUDED.city,
    phone = EXCLUDED.phone,
    roles = EXCLUDED.roles,
    updated_at = now();

  RETURN NEW;
END;
$$;
