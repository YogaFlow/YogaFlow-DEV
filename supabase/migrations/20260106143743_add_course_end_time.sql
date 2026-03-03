/*
  # Add end_time column to courses table

  1. Changes
    - Add `end_time` column to `courses` table (time without time zone)
    - This allows tracking course end time alongside start time and duration
    - The column is nullable to allow for existing records
  
  2. Notes
    - `duration` column already exists (in minutes)
    - `time` column is the start time
    - `end_time` is the course end time
    - Any two of these three values can be used to calculate the third
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'end_time'
  ) THEN
    ALTER TABLE courses ADD COLUMN end_time time;
  END IF;
END $$;