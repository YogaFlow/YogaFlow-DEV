/*
  # Anmeldungen-Tabelle erstellen

  1. Neue Tabellen
    - `registrations`
      - `id` (uuid, primary key)
      - `course_id` (uuid, foreign key zu courses)
      - `user_id` (uuid, foreign key zu users)
      - `status` (enum: registered, waitlist)
      - `registered_at` (timestamp)

  2. Sicherheit
    - RLS aktiviert für `registrations` Tabelle
    - Benutzer können ihre eigenen Anmeldungen verwalten
    - Lehrer können Anmeldungen für ihre Kurse einsehen
    - Administratoren können alle Anmeldungen verwalten
*/

-- Erstelle Enum für Anmeldestatus
CREATE TYPE registration_status AS ENUM ('registered', 'waitlist');

CREATE TABLE IF NOT EXISTS registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status registration_status DEFAULT 'registered',
  registered_at timestamptz DEFAULT now(),
  UNIQUE(course_id, user_id)
);

-- Aktiviere RLS
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

-- Benutzer können ihre eigenen Anmeldungen lesen
CREATE POLICY "Users can read own registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Benutzer können sich für Kurse anmelden
CREATE POLICY "Users can create registrations"
  ON registrations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Benutzer können ihre eigenen Anmeldungen löschen (abmelden)
CREATE POLICY "Users can delete own registrations"
  ON registrations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Lehrer können Anmeldungen für ihre Kurse einsehen
CREATE POLICY "Teachers can read course registrations"
  ON registrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses 
      WHERE id = course_id AND teacher_id = auth.uid()
    )
  );

-- Lehrer können Anmeldungen für ihre Kurse verwalten
CREATE POLICY "Teachers can manage course registrations"
  ON registrations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses 
      WHERE id = course_id AND teacher_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Administratoren können alle Anmeldungen verwalten
CREATE POLICY "Admins can manage all registrations"
  ON registrations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );