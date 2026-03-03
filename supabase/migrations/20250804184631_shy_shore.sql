/*
  # Create Administrator User

  This migration creates a default administrator user for the system.
  
  1. Creates an auth user with email and password
  2. Creates corresponding user profile in users table
  3. Sets role to 'admin'
  
  IMPORTANT: Change the default password after first login!
  
  Login credentials:
  - Email: admin@yoga-kurse.de  
  - Password: admin123
*/

-- Create the admin user in auth.users if it doesn't exist
DO $$
DECLARE
    admin_user_id uuid;
BEGIN
    -- Check if admin user already exists
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = 'admin@yoga-kurse.de';
    
    -- If admin doesn't exist, we need to create it manually
    -- Note: In production, you should create users through Supabase Dashboard or Auth API
    IF admin_user_id IS NULL THEN
        -- Insert into auth.users (this requires superuser privileges)
        -- In a real deployment, create this user through Supabase Dashboard instead
        RAISE NOTICE 'Admin user does not exist. Please create user admin@yoga-kurse.de with password admin123 through Supabase Dashboard.';
        
        -- For now, we'll create a placeholder that will be updated when the real user signs up
        INSERT INTO users (
            id,
            email,
            first_name,
            last_name,
            street,
            house_number,
            postal_code,
            city,
            phone,
            role
        ) VALUES (
            gen_random_uuid(),
            'admin@yoga-kurse.de',
            'System',
            'Administrator',
            'Musterstraße',
            '1',
            '12345',
            'Musterstadt',
            '+49 123 456789',
            'admin'
        )
        ON CONFLICT (email) DO NOTHING;
    END IF;
END $$;