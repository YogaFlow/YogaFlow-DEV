-- Nachimport: andre.thaller@outlook.de → Tenant Yomita (892370b8-49a1-4699-b480-2f722e4f9fe3)
-- Legacy auth + admin role. No registrations in legacy export for this user.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  '0f9b2bd1-a780-48fc-9973-59fcddc801f1'::uuid,
  'authenticated',
  'authenticated',
  'andre.thaller@outlook.de',
  '$2a$10$AWwtfNy1Jlt.9MAVYAL3oOQQaSlnYEOOZ57CMcNvlgr3Bhjc5wxiK',
  '2026-01-22 18:00:27.462511+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "0f9b2bd1-a780-48fc-9973-59fcddc801f1", "tenant_id": "892370b8-49a1-4699-b480-2f722e4f9fe3", "role": "admin", "first_name": "André", "last_name": "Thaller", "street": "Holunderweg", "house_number": "6", "postal_code": "41468", "city": "Neuss", "phone": "015734673729", "email_verified": true}'::jsonb,
  '2026-01-22 18:00:27.433141+00'::timestamptz,
  '2026-03-11 15:46:50.255274+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '0f9b2bd1-a780-48fc-9973-59fcddc801f1'::uuid,
  '0f9b2bd1-a780-48fc-9973-59fcddc801f1'::uuid,
  '0f9b2bd1-a780-48fc-9973-59fcddc801f1'::text,
  'email',
  jsonb_build_object('sub', '0f9b2bd1-a780-48fc-9973-59fcddc801f1', 'email', 'andre.thaller@outlook.de', 'email_verified', true, 'phone_verified', false),
  '2026-01-22 18:00:27.433141+00'::timestamptz,
  '2026-03-11 15:46:50.255274+00'::timestamptz,
  '2026-02-06 15:06:35.444403+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

UPDATE public.users SET
  email_verified = true,
  email_verified_at = COALESCE(email_verified_at, created_at),
  gdpr_consent = true,
  gdpr_consent_date = COALESCE(gdpr_consent_date, created_at),
  role = 'admin'
WHERE id = '0f9b2bd1-a780-48fc-9973-59fcddc801f1'::uuid
  AND tenant_id = '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid;

UPDATE auth.users u
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  email_change = COALESCE(email_change, ''),
  phone_change = COALESCE(phone_change, '')
WHERE u.id = '0f9b2bd1-a780-48fc-9973-59fcddc801f1'::uuid;
