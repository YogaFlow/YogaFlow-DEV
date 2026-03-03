/*
  # E-Mail-Vorlagen-Tabelle erstellen

  1. Neue Tabellen
    - `email_templates`
      - `id` (uuid, primary key)
      - `type` (enum: reminder_24h, reminder_1h, registration_confirmation)
      - `subject` (text)
      - `content` (text)

  2. Sicherheit
    - RLS aktiviert für `email_templates` Tabelle
    - Nur Administratoren können E-Mail-Vorlagen verwalten
    - Alle können E-Mail-Vorlagen lesen (für System-E-Mails)
*/

-- Erstelle Enum für E-Mail-Typen
CREATE TYPE email_template_type AS ENUM ('reminder_24h', 'reminder_1h', 'registration_confirmation');

CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type email_template_type UNIQUE NOT NULL,
  subject text NOT NULL,
  content text NOT NULL
);

-- Aktiviere RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Alle können E-Mail-Vorlagen lesen (für System-E-Mails)
CREATE POLICY "Anyone can read email templates"
  ON email_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Nur Administratoren können E-Mail-Vorlagen verwalten
CREATE POLICY "Admins can manage email templates"
  ON email_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Standard E-Mail-Vorlagen einfügen
INSERT INTO email_templates (type, subject, content) VALUES
('registration_confirmation', 
 'Anmeldung bestätigt: {{course_title}}', 
 'Liebe/r {{user_name}},

vielen Dank für Ihre Anmeldung zum Yoga-Kurs "{{course_title}}".

Kursdetails:
- Datum: {{course_date}}
- Uhrzeit: {{course_time}}
- Ort: {{course_location}}
- Lehrer: {{teacher_name}}

Wir freuen uns auf Sie!

Mit freundlichen Grüßen
Ihr Yoga-Team'),

('reminder_24h', 
 'Erinnerung: Ihr Yoga-Kurs morgen - {{course_title}}', 
 'Liebe/r {{user_name}},

dies ist eine freundliche Erinnerung an Ihren Yoga-Kurs morgen:

"{{course_title}}"
Datum: {{course_date}}
Uhrzeit: {{course_time}}
Ort: {{course_location}}
Lehrer: {{teacher_name}}

Bitte bringen Sie eine Yogamatte und bequeme Kleidung mit.

Wir freuen uns auf Sie!

Mit freundlichen Grüßen
Ihr Yoga-Team'),

('reminder_1h', 
 'Letzter Aufruf: Ihr Yoga-Kurs beginnt in 1 Stunde - {{course_title}}', 
 'Liebe/r {{user_name}},

Ihr Yoga-Kurs "{{course_title}}" beginnt in einer Stunde!

Kursdetails:
- Uhrzeit: {{course_time}}
- Ort: {{course_location}}
- Lehrer: {{teacher_name}}

Wir sehen uns gleich!

Mit freundlichen Grüßen
Ihr Yoga-Team')
ON CONFLICT (type) DO NOTHING;