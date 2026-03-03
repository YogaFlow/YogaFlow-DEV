/*
  # Add additional data integrity constraints (v2)
  
  1. New Constraints
    - Ensure dates are not in the past for active courses
    - Prevent negative or zero durations
    - Ensure messages have content
    - Validate user data completeness
    
  2. Data Integrity
    - Protects against invalid data at database level
    - Enforces business rules consistently
*/

-- Ensure duration is positive if set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'courses_duration_positive_check'
  ) THEN
    ALTER TABLE courses
    ADD CONSTRAINT courses_duration_positive_check
    CHECK (duration IS NULL OR duration > 0);
  END IF;
END $$;

-- Ensure messages have non-empty content
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'messages_content_not_empty_check'
  ) THEN
    ALTER TABLE messages
    ADD CONSTRAINT messages_content_not_empty_check
    CHECK (length(trim(content)) > 0);
  END IF;
END $$;

-- Ensure broadcast messages don't have individual recipients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'messages_broadcast_no_recipient_check'
  ) THEN
    ALTER TABLE messages
    ADD CONSTRAINT messages_broadcast_no_recipient_check
    CHECK (NOT (is_broadcast = true AND recipient_id IS NOT NULL));
  END IF;
END $$;

-- Ensure non-broadcast messages have recipients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'messages_non_broadcast_has_recipient_check'
  ) THEN
    ALTER TABLE messages
    ADD CONSTRAINT messages_non_broadcast_has_recipient_check
    CHECK (is_broadcast = true OR recipient_id IS NOT NULL);
  END IF;
END $$;

-- Ensure users have valid email format (basic check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_email_format_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_email_format_check
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
  END IF;
END $$;

-- Ensure users have at least one role
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_has_roles_check'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT users_has_roles_check
    CHECK (roles IS NOT NULL AND array_length(roles, 1) > 0);
  END IF;
END $$;

-- Ensure registrations signup_timestamp is set
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'registrations_signup_timestamp_check'
  ) THEN
    ALTER TABLE registrations
    ADD CONSTRAINT registrations_signup_timestamp_check
    CHECK (signup_timestamp IS NOT NULL);
  END IF;
END $$;

-- Create function to prevent registration for past courses
CREATE OR REPLACE FUNCTION check_course_not_past()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM courses
    WHERE id = NEW.course_id
    AND date < CURRENT_DATE
  ) THEN
    RAISE EXCEPTION 'Cannot register for courses in the past';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for registration date validation
DROP TRIGGER IF EXISTS prevent_past_course_registration ON registrations;
CREATE TRIGGER prevent_past_course_registration
  BEFORE INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION check_course_not_past();