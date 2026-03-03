/*
  # Add performance indexes for common queries
  
  1. New Indexes
    - Add indexes for frequently queried columns
    - Improve JOIN performance
    - Optimize filtering and sorting operations
    
  2. Performance Impact
    - Faster course listing with date/status filters
    - Faster registration lookups
    - Faster message retrieval
    - Improved authentication queries
*/

-- Index for courses queries (date filtering and sorting)
CREATE INDEX IF NOT EXISTS idx_courses_date_status 
ON courses(date, status) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_courses_teacher_date 
ON courses(teacher_id, date) 
WHERE status = 'active';

-- Index for registrations queries (course and user lookups)
CREATE INDEX IF NOT EXISTS idx_registrations_user_course 
ON registrations(user_id, course_id);

CREATE INDEX IF NOT EXISTS idx_registrations_course_status 
ON registrations(course_id, status) 
WHERE cancellation_timestamp IS NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_status_timestamp 
ON registrations(course_id, status, signup_timestamp) 
WHERE status = 'waitlist' AND cancellation_timestamp IS NULL;

-- Index for users queries (email and role lookups)
CREATE INDEX IF NOT EXISTS idx_users_email 
ON users(email);

-- Index for messages queries (already partially covered but adding composite)
CREATE INDEX IF NOT EXISTS idx_messages_recipient_created 
ON messages(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_created 
ON messages(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_broadcast_course 
ON messages(is_broadcast, course_id, created_at DESC) 
WHERE is_broadcast = true;

-- Index for admin_emails lookup
CREATE INDEX IF NOT EXISTS idx_admin_emails_email 
ON admin_emails(email);