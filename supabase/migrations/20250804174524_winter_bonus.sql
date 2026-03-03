/*
  # Benutzer-Tabelle erstellen

  1. Neue Tabellen
    - `users`
      - `id` (uuid, primary key) - verknüpft mit auth.users
      - `email` (text, unique)
      - `first_name` (text)
      - `last_name` (text)
      - `street` (text)
      - `house_number` (text)
      - `postal_code` (text)
      - `city` (text)
      - `phone` (text)
      - `role` (enum: student, teacher, admin)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Sicherheit
    - RLS aktiviert für `users` Tabelle
    - Benutzer können ihre eigenen Daten lesen und bearbeiten
    - Administratoren können alle Benutzerdaten verwalten
*/

-- Erstelle Enum für Benutzerrollen
CREATE TYPE user_role AS ENUM ('student', 'teacher', 'admin');

-- Erstelle users Tabelle
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  street text NOT NULL,
  house_number text NOT NULL,
  postal_code text NOT NULL,
  city text NOT NULL,
  phone text NOT NULL,
  role user_role DEFAULT 'student',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Aktiviere RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Benutzer können ihre eigenen Daten lesen
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Benutzer können ihre eigenen Daten bearbeiten
CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Administratoren können alle Benutzerdaten verwalten
CREATE POLICY "Admins can manage all users"
  ON users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Funktion zum automatischen Erstellen eines Benutzerprofils nach der Registrierung
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, first_name, last_name, street, house_number, postal_code, city, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'street', ''),
    COALESCE(NEW.raw_user_meta_data->>'house_number', ''),
    COALESCE(NEW.raw_user_meta_data->>'postal_code', ''),
    COALESCE(NEW.raw_user_meta_data->>'city', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    'student'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger für automatische Profilerstellung
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();