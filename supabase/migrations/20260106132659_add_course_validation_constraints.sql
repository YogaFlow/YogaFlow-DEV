/*
  # Add validation constraints to courses table
  
  1. Changes
    - Add CHECK constraints for data validation
    - Ensure title and description have minimum lengths
    - Validate max_participants range
    - Validate price is non-negative
    
  2. Security
    - Server-side validation prevents invalid data
    - Constraints enforce business rules at database level
*/

-- Add constraints to courses table
DO $$
BEGIN
  -- Title must be at least 3 characters and at most 200 characters
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'courses_title_length_check'
  ) THEN
    ALTER TABLE courses
    ADD CONSTRAINT courses_title_length_check
    CHECK (length(trim(title)) >= 3 AND length(trim(title)) <= 200);
  END IF;

  -- Description must be at least 10 characters and at most 2000 characters
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'courses_description_length_check'
  ) THEN
    ALTER TABLE courses
    ADD CONSTRAINT courses_description_length_check
    CHECK (length(trim(description)) >= 10 AND length(trim(description)) <= 2000);
  END IF;

  -- Max participants must be between 1 and 50
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'courses_max_participants_range_check'
  ) THEN
    ALTER TABLE courses
    ADD CONSTRAINT courses_max_participants_range_check
    CHECK (max_participants >= 1 AND max_participants <= 50);
  END IF;

  -- Price must be non-negative and less than 1000
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'courses_price_range_check'
  ) THEN
    ALTER TABLE courses
    ADD CONSTRAINT courses_price_range_check
    CHECK (price >= 0 AND price <= 1000);
  END IF;

  -- Location must not be empty
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'courses_location_not_empty_check'
  ) THEN
    ALTER TABLE courses
    ADD CONSTRAINT courses_location_not_empty_check
    CHECK (length(trim(location)) > 0);
  END IF;
END $$;