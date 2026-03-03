/*
  # System-Einstellungen-Tabelle erstellen

  1. Neue Tabellen
    - `system_settings`
      - `id` (uuid, primary key)
      - `smtp_host` (text)
      - `smtp_port` (integer)
      - `smtp_user` (text)
      - `smtp_password` (text, verschlüsselt)
      - `smtp_secure` (boolean)
      - `from_email` (text)
      - `from_name` (text)

  2. Sicherheit
    - RLS aktiviert für `system_settings` Tabelle
    - Nur Administratoren können System-Einstellungen verwalten
*/

CREATE TABLE IF NOT EXISTS system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  smtp_host text DEFAULT 'smtp.ionos.de',
  smtp_port integer DEFAULT 587,
  smtp_user text DEFAULT '',
  smtp_password text DEFAULT '',
  smtp_secure boolean DEFAULT true,
  from_email text DEFAULT '',
  from_name text DEFAULT 'Yoga Kursverwaltung'
);

-- Aktiviere RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Nur Administratoren können System-Einstellungen lesen
CREATE POLICY "Admins can read system settings"
  ON system_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Nur Administratoren können System-Einstellungen verwalten
CREATE POLICY "Admins can manage system settings"
  ON system_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Standard-Einstellungen einfügen
INSERT INTO system_settings (smtp_host, smtp_port, smtp_secure, from_name) 
VALUES ('smtp.ionos.de', 587, true, 'Yoga Kursverwaltung')
ON CONFLICT DO NOTHING;