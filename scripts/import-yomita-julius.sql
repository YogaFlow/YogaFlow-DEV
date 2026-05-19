-- Nachimport: juliusbne@gmail.com → Tenant Yomita (892370b8-49a1-4699-b480-2f722e4f9fe3)
-- Keine Registrierungen im Legacy-Export für diesen User.

-- auth: juliusbne@gmail.com
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'd54ac880-4600-4e60-ba22-2b07c88ba0e0'::uuid,
  'authenticated',
  'authenticated',
  'juliusbne@gmail.com',
  '$2a$10$3.m637MaJo65sFgSa43TkOuVazgUD/JkgJDvNl5mnpzi.0ALMjc2a',
  '2026-02-23 14:30:33.389387+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "d54ac880-4600-4e60-ba22-2b07c88ba0e0", "tenant_id": "892370b8-49a1-4699-b480-2f722e4f9fe3", "role": "user", "first_name": "Julius", "last_name": "Blaschke", "street": "Fliederweg ", "house_number": "40", "postal_code": "41468", "city": "Neuss", "phone": "01783226430", "email_verified": true}'::jsonb,
  '2026-02-23 14:30:33.269276+00'::timestamptz,
  '2026-05-13 08:25:35.281824+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'd54ac880-4600-4e60-ba22-2b07c88ba0e0'::uuid,
  'd54ac880-4600-4e60-ba22-2b07c88ba0e0'::uuid,
  'd54ac880-4600-4e60-ba22-2b07c88ba0e0'::text,
  'email',
  jsonb_build_object('sub', 'd54ac880-4600-4e60-ba22-2b07c88ba0e0', 'email', 'juliusbne@gmail.com', 'email_verified', true, 'phone_verified', false),
  '2026-02-23 14:30:33.269276+00'::timestamptz,
  '2026-05-13 08:25:35.281824+00'::timestamptz,
  '2026-02-23 14:30:33.389387+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

UPDATE public.users SET
  email_verified = true,
  email_verified_at = COALESCE(email_verified_at, created_at),
  gdpr_consent = true,
  gdpr_consent_date = COALESCE(gdpr_consent_date, created_at)
WHERE id = 'd54ac880-4600-4e60-ba22-2b07c88ba0e0'::uuid
  AND tenant_id = '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid;
