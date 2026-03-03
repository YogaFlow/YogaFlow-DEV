/*
  # Update admin user role

  1. Changes
    - Update the role of user "admin@yoga-kurse.de" from "student" to "admin"
  
  2. Security
    - This ensures the admin user has proper administrative privileges
*/

UPDATE users 
SET role = 'admin'::user_role, updated_at = now()
WHERE email = 'admin@yoga-kurse.de';