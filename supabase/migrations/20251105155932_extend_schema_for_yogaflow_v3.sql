/*
  # Extend Schema for YogaFlow Manager

  1. Schema Changes
    - Add multi-role support to users
    - Add GDPR consent fields to users
    - Extend courses table with new fields
    - Extend registrations with tracking fields
    - Create messages table
    - Create global_settings table
    
  2. Security
    - RLS policies for all new tables and features
*/

-- Add new columns to users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'roles'
  ) THEN
    ALTER TABLE users ADD COLUMN roles text[];
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'gdpr_consent'
  ) THEN
    ALTER TABLE users ADD COLUMN gdpr_consent boolean DEFAULT true;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'gdpr_consent_date'
  ) THEN
    ALTER TABLE users ADD COLUMN gdpr_consent_date timestamptz DEFAULT now();
  END IF;
END $$;

-- Migrate existing role data to roles array
UPDATE users 
SET roles = ARRAY[role::text]
WHERE roles IS NULL;

-- Add new columns to courses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'status'
  ) THEN
    ALTER TABLE courses ADD COLUMN status text DEFAULT 'active';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'duration'
  ) THEN
    ALTER TABLE courses ADD COLUMN duration integer DEFAULT 60;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'room'
  ) THEN
    ALTER TABLE courses ADD COLUMN room text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'prerequisites'
  ) THEN
    ALTER TABLE courses ADD COLUMN prerequisites text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'frequency'
  ) THEN
    ALTER TABLE courses ADD COLUMN frequency text DEFAULT 'one_time';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'series_id'
  ) THEN
    ALTER TABLE courses ADD COLUMN series_id uuid;
  END IF;
END $$;

-- Extend registrations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'registrations' AND column_name = 'signup_timestamp'
  ) THEN
    ALTER TABLE registrations ADD COLUMN signup_timestamp timestamptz DEFAULT now();
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'registrations' AND column_name = 'cancellation_timestamp'
  ) THEN
    ALTER TABLE registrations ADD COLUMN cancellation_timestamp timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'registrations' AND column_name = 'is_waitlist'
  ) THEN
    ALTER TABLE registrations ADD COLUMN is_waitlist boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'registrations' AND column_name = 'waitlist_position'
  ) THEN
    ALTER TABLE registrations ADD COLUMN waitlist_position integer;
  END IF;
END $$;

-- Update existing registration records
UPDATE registrations 
SET signup_timestamp = COALESCE(registered_at, now())
WHERE signup_timestamp IS NULL;

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  recipient_id uuid REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_broadcast boolean DEFAULT false,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create global_settings table
CREATE TABLE IF NOT EXISTS global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Insert default settings
INSERT INTO global_settings (key, value, updated_at)
VALUES 
  ('cancellation_deadline_hours', '48', now()),
  ('default_max_participants', '10', now()),
  ('notification_templates', '{"signup_confirmation": "You have successfully signed up for {{course_title}} on {{date}} at {{time}}.", "cancellation_reminder": "Reminder: You can cancel your booking for {{course_title}} until {{deadline}}.", "course_update": "Course {{course_title}} has been updated. Status: {{status}}."}', now())
ON CONFLICT (key) DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for messages
CREATE POLICY "Users can view messages sent to them"
  ON messages FOR SELECT
  TO authenticated
  USING (
    recipient_id = auth.uid() 
    OR sender_id = auth.uid()
    OR (is_broadcast AND course_id IN (
      SELECT course_id FROM registrations WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Participants can send messages to course leaders"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND recipient_id IN (
      SELECT teacher_id FROM courses WHERE id = course_id
    )
  );

CREATE POLICY "Course leaders can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND course_id IN (
      SELECT id FROM courses WHERE teacher_id = auth.uid()
    )
  );

CREATE POLICY "Users can mark messages as read"
  ON messages FOR UPDATE
  TO authenticated
  USING (
    recipient_id = auth.uid() 
    OR (is_broadcast AND course_id IN (
      SELECT course_id FROM registrations WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    recipient_id = auth.uid() 
    OR (is_broadcast AND course_id IN (
      SELECT course_id FROM registrations WHERE user_id = auth.uid()
    ))
  );

-- RLS policies for global_settings
CREATE POLICY "Anyone authenticated can view settings"
  ON global_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage settings"
  ON global_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND 'admin' = ANY(users.roles)
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);
CREATE INDEX IF NOT EXISTS idx_courses_series_id ON courses(series_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_registrations_is_waitlist ON registrations(is_waitlist);
CREATE INDEX IF NOT EXISTS idx_messages_course_id ON messages(course_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);