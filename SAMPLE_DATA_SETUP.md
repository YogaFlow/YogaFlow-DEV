# YogaFlow Manager - Sample Data Setup

This document explains how to populate your YogaFlow Manager database with sample data for testing.

## Prerequisites

- Supabase project set up and configured
- Database migrations applied

## Option 1: Manual Setup via Supabase Dashboard

### Step 1: Create Auth Users

Go to your Supabase Dashboard → Authentication → Users and create the following users:

1. **Administrator**
   - Email: `admin@yogaflow.com`
   - Password: `YogaFlow2025!`
   - Auto Confirm: Yes

2. **Course Leaders**
   - Email: `leader1@yogaflow.com` / Password: `Leader2025!`
   - Email: `leader2@yogaflow.com` / Password: `Leader2025!`

3. **Participants** (create 10 users)
   - Email pattern: `participant1@yogaflow.com` through `participant10@yogaflow.com`
   - Password: `Participant2025!`

### Step 2: Update User Profiles

After creating auth users, run the following SQL in your Supabase SQL Editor to update their profiles with roles:

```sql
-- Update admin user
UPDATE users SET roles = ARRAY['admin', 'course_leader', 'participant']::text[]
WHERE email = 'admin@yogaflow.com';

-- Update course leaders
UPDATE users SET roles = ARRAY['course_leader', 'participant']::text[]
WHERE email IN ('leader1@yogaflow.com');

UPDATE users SET roles = ARRAY['course_leader']::text[]
WHERE email IN ('leader2@yogaflow.com');

-- Participants already have the correct role by default
```

### Step 3: Create Sample Courses

Run this SQL to create sample courses:

```sql
-- Get user IDs
DO $$
DECLARE
  leader1_id uuid;
  leader2_id uuid;
  course1_id uuid;
  course2_id uuid;
  course3_id uuid;
  course3_series uuid;
BEGIN
  -- Get leader IDs
  SELECT id INTO leader1_id FROM users WHERE email = 'leader1@yogaflow.com';
  SELECT id INTO leader2_id FROM users WHERE email = 'leader2@yogaflow.com';

  -- Generate course IDs
  course1_id := gen_random_uuid();
  course2_id := gen_random_uuid();
  course3_id := gen_random_uuid();
  course3_series := gen_random_uuid();

  -- Course 1: Recurring weekly Monday course
  INSERT INTO courses (id, title, description, date, time, location, room, max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id)
  VALUES
    (course1_id, 'Vinyasa Flow - Monday Evening',
     'Dynamic yoga practice connecting breath and movement. Suitable for intermediate level.',
     (CURRENT_DATE + INTERVAL '7 days')::date, '18:00'::time,
     'YogaFlow Studio Downtown', 'Studio A', 10, 25.00, leader1_id,
     'active', 90, 'Basic yoga experience recommended', 'weekly', course1_id);

  -- Course 2: One-time meditation workshop
  INSERT INTO courses (id, title, description, date, time, location, room, max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id)
  VALUES
    (course2_id, 'Introduction to Meditation Workshop',
     'Learn fundamental meditation techniques for stress relief and mindfulness. Perfect for beginners.',
     (CURRENT_DATE + INTERVAL '14 days')::date, '10:00'::time,
     'YogaFlow Studio Downtown', 'Studio B', 15, 35.00, leader2_id,
     'active', 120, 'None - beginners welcome', 'one_time', NULL);

  -- Course 3: Recurring weekly Wednesday course
  INSERT INTO courses (id, title, description, date, time, location, room, max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id)
  VALUES
    (course3_id, 'Gentle Yoga - Wednesday Morning',
     'Slow-paced, gentle stretching and breathing exercises. Great for seniors and beginners.',
     (CURRENT_DATE + INTERVAL '10 days')::date, '09:30'::time,
     'YogaFlow Studio Uptown', 'Room 1', 12, 20.00, leader1_id,
     'active', 60, 'None', 'weekly', course3_series);

  -- Course 3 exception: Holiday - not happening
  INSERT INTO courses (id, title, description, date, time, location, room, max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id)
  VALUES
    (gen_random_uuid(), 'Gentle Yoga - Wednesday Morning (Holiday)',
     'This class will not take place due to the holiday.',
     '2025-12-24'::date, '09:30'::time,
     'YogaFlow Studio Uptown', 'Room 1', 12, 20.00, leader1_id,
     'not_planned', 60, 'None', 'weekly', course3_series);
END $$;
```

### Step 4: Create Sample Bookings (Optional)

To populate courses with bookings, you can either:
- Use the app UI to manually book participants into courses
- Run SQL to create bookings (replace user IDs accordingly)

## Option 2: Automated Setup Script

You can create a Node.js script to automate user creation using Supabase Admin API. Here's a template:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key for admin operations
)

async function createSampleData() {
  // Create admin
  const { data: admin } = await supabase.auth.admin.createUser({
    email: 'admin@yogaflow.com',
    password: 'YogaFlow2025!',
    email_confirm: true
  })

  // Update admin profile
  await supabase
    .from('users')
    .update({ roles: ['admin', 'course_leader', 'participant'] })
    .eq('id', admin.user.id)

  // Continue for other users...
}

createSampleData()
```

## Testing Credentials

Once setup is complete, you can log in with:

- **Admin**: admin@yogaflow.com / YogaFlow2025!
- **Course Leader**: leader1@yogaflow.com / Leader2025!
- **Participant**: participant1@yogaflow.com / Participant2025!

## Features to Test

1. **Admin Features**
   - User management (create/edit/delete users)
   - Global settings configuration
   - View all courses and bookings
   - Send messages

2. **Course Leader Features**
   - Create and manage courses
   - View participant lists
   - Send messages to participants
   - Mark courses as cancelled or not planned

3. **Participant Features**
   - Browse courses
   - Sign up for courses
   - Join waitlist when courses are full
   - Cancel bookings (with deadline warnings)
   - Send messages to course leaders
   - View course status indicators

## Data Structure Overview

- **1 Admin** with all roles
- **2 Course Leaders** (one can also participate)
- **10 Participants**
- **3 Main Courses** (1 recurring weekly, 1 one-time, 1 recurring with exception)
- **Sample bookings** showing full courses and waitlists
- **Sample messages** demonstrating in-app communication
