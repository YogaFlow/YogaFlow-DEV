/*
  # Kurse-Tabelle erstellen

  1. Neue Tabellen
    - `courses`
      - `id` (uuid, primary key)
      - `title` (text)
      - `description` (text)
      - `date` (date)
      - `time` (time)
      - `location` (text)
      - `max_participants` (integer)
      - `price` (decimal)
      - `teacher_id` (uuid, foreign key zu users)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Sicherheit
    - RLS aktiviert für `courses` Tabelle
    - Alle können Kurse lesen
    - Nur Lehrer und Admins können Kurse erstellen/bearbeiten
    - Lehrer können nur ihre eigenen Kurse bearbeiten
*/

CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  date date NOT NULL,
  time time NOT NULL,
  location text NOT NULL,
  max_participants integer NOT NULL CHECK (max_participants > 0),
  price decimal(10,2) NOT NULL CHECK (price >= 0),
  teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Aktiviere RLS
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Alle authentifizierten Benutzer können Kurse lesen
CREATE POLICY "Anyone can read courses"
  ON courses
  FOR SELECT
  TO authenticated
  USING (true);

-- Lehrer können ihre eigenen Kurse erstellen
CREATE POLICY "Teachers can create courses"
  ON courses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = teacher_id AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- Lehrer können ihre eigenen Kurse bearbeiten
CREATE POLICY "Teachers can update own courses"
  ON courses
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = teacher_id AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- Lehrer können ihre eigenen Kurse löschen
CREATE POLICY "Teachers can delete own courses"
  ON courses
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = teacher_id AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role IN ('teacher', 'admin')
    )
  );

-- Administratoren können alle Kurse verwalten
CREATE POLICY "Admins can manage all courses"
  ON courses
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger für updated_at
CREATE TRIGGER update_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();