/*
  # Administrator-Benutzer erstellen

  1. Neuer Administrator
    - E-Mail: admin@yoga-kurse.de
    - Passwort: admin123 (sollte nach dem ersten Login geändert werden)
    - Rolle: admin
    - Vollständige Profildaten

  2. Sicherheit
    - Temporäres Passwort für ersten Login
    - Vollständige Administrator-Rechte
*/

-- Erstelle einen Administrator-Benutzer
-- WICHTIG: Dies sollte nur einmal ausgeführt werden
DO $$
DECLARE
    admin_user_id uuid;
BEGIN
    -- Prüfe ob bereits ein Admin existiert
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@yoga-kurse.de') THEN
        -- Erstelle den Auth-Benutzer
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            recovery_sent_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(),
            'authenticated',
            'authenticated',
            'admin@yoga-kurse.de',
            crypt('admin123', gen_salt('bf')),
            NOW(),
            NOW(),
            NOW(),
            '{"provider": "email", "providers": ["email"]}',
            '{"role": "admin"}',
            NOW(),
            NOW(),
            '',
            '',
            '',
            ''
        ) RETURNING id INTO admin_user_id;

        -- Erstelle das Benutzerprofil
        INSERT INTO public.users (
            id,
            email,
            first_name,
            last_name,
            street,
            house_number,
            postal_code,
            city,
            phone,
            role,
            created_at,
            updated_at
        ) VALUES (
            admin_user_id,
            'admin@yoga-kurse.de',
            'System',
            'Administrator',
            'Musterstraße',
            '1',
            '12345',
            'Musterstadt',
            '+49 123 456789',
            'admin',
            NOW(),
            NOW()
        );

        -- Bestätige die E-Mail
        UPDATE auth.users 
        SET email_confirmed_at = NOW()
        WHERE id = admin_user_id;

    END IF;
END $$;