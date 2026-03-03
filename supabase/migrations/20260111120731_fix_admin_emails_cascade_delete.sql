/*
  # Fix admin_emails foreign key to allow user deletion

  1. Changes
    - Modify admin_emails.created_by foreign key to SET NULL on delete
    - This allows users to be deleted while preserving admin_emails records
*/

ALTER TABLE admin_emails 
DROP CONSTRAINT IF EXISTS admin_emails_created_by_fkey;

ALTER TABLE admin_emails 
ADD CONSTRAINT admin_emails_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
