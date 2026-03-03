/*
  # Remove hardcoded admin emails from trigger
  
  1. New Tables
    - `admin_emails`: Stores authorized admin email addresses
    
  2. Changes
    - Create admin_emails table with email column
    - Update handle_new_user trigger to check admin_emails table
    - Insert existing admin emails into the new table
    
  3. Security
    - Only admins can manage admin_emails table
    - RLS policies enforce access control
*/

-- Create admin_emails table
CREATE TABLE IF NOT EXISTS admin_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES users(id)
);

-- Enable RLS
ALTER TABLE admin_emails ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_emails
CREATE POLICY "Anyone authenticated can read admin emails"
  ON admin_emails
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert admin emails"
  ON admin_emails
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND 'admin' = ANY(users.roles)
    )
  );

CREATE POLICY "Admins can delete admin emails"
  ON admin_emails
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND 'admin' = ANY(users.roles)
    )
  );

-- Insert existing admin emails
INSERT INTO admin_emails (email, created_at)
VALUES 
  ('andre.thaller@outlook.de', now()),
  ('tanja@die-thallers.de', now()),
  ('admin@yoga-kurse.de', now())
ON CONFLICT (email) DO NOTHING;

-- Update trigger function to use admin_emails table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_roles text[];
  is_admin boolean;
BEGIN
  -- Check if email is in admin_emails table
  SELECT EXISTS (
    SELECT 1 FROM admin_emails WHERE email = NEW.email
  ) INTO is_admin;

  -- Set roles based on admin status
  IF is_admin THEN
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