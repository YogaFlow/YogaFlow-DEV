/*
  # Fix registration trigger date field error
  
  1. Problem
    - The trigger `prevent_past_course_registration` on `registrations` table
    - Calls function `check_course_not_past()` which tries to access `NEW.date`
    - But `registrations` table has no `date` field, only `course_id`
    - This causes error: "record 'new' has no field 'date'"
  
  2. Solution
    - Create new function `check_registration_course_not_past()` 
    - This function looks up the course date via `course_id`
    - Update trigger to use the new function
    
  3. Changes
    - New function: `check_registration_course_not_past()`
    - Drop and recreate trigger with correct function
*/

-- Create new function that checks course date via course_id
CREATE OR REPLACE FUNCTION check_registration_course_not_past()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_date date;
BEGIN
  -- Get the course date via the course_id
  SELECT date INTO v_course_date
  FROM courses
  WHERE id = NEW.course_id;
  
  -- Check if course date is in the past
  IF v_course_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot register for courses in the past';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop and recreate the trigger with the correct function
DROP TRIGGER IF EXISTS prevent_past_course_registration ON registrations;
CREATE TRIGGER prevent_past_course_registration
  BEFORE INSERT ON registrations
  FOR EACH ROW
  EXECUTE FUNCTION check_registration_course_not_past();
