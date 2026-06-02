-- Yomita legacy import (generated)
-- tenant_id: 892370b8-49a1-4699-b480-2f722e4f9fe3
-- auth_csv: C:/Users/49178/Downloads/users_rows (2).csv
-- profiles_csv: C:/Users/49178/Downloads/users_rows (3).csv
-- courses_csv: C:/Users/49178/Downloads/courses_rows (1).csv
-- registrations_csv: C:/Users/49178/Downloads/registrations_rows (1).csv

INSERT INTO public.tenants (id, name, slug) VALUES ('892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid, 'Yomita', 'yomita');

-- auth: stefanie.neck@web.de
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
  '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6'::uuid,
  'authenticated',
  'authenticated',
  'stefanie.neck@web.de',
  '$2a$10$ngfwvMN3FidKaVrPXuag1uzR/08smTfcQfFu/s2ys0ZTi5V4PhNZm',
  '2026-05-10 13:00:38.072024+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"0b0fcce2-15cc-4c06-bd84-129d3b35d7d6","city":"Grevenbroich","email":"stefanie.neck@web.de","phone":"1739223711","street":"Am Reiherbusch","last_name":"Neck","first_name":"Stefanie","postal_code":"41516","house_number":"12a","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-05-10 13:00:37.976273+00'::timestamptz,
  '2026-05-10 13:00:38.131645+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6'::uuid,
  '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6'::uuid,
  '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6'::text,
  'email',
  jsonb_build_object('sub', '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6', 'email', 'stefanie.neck@web.de', 'email_verified', true, 'phone_verified', false),
  '2026-05-10 13:00:37.976273+00'::timestamptz,
  '2026-05-10 13:00:38.131645+00'::timestamptz,
  '2026-05-10 13:00:38.091401+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: gajansen@web.de
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
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  'authenticated',
  'authenticated',
  'gajansen@web.de',
  '$2a$10$7KButQ6AzTJG5DAc2B9V4eyS0nzDZLIc.4rb3.BxePGsu1aDirXj2',
  '2026-02-22 17:41:15.620699+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"17b9d410-e078-4014-aa4f-5c16e678042b","city":"Neuss","email":"gajansen@web.de","phone":"01727455771","street":"Dunantstrasse ","last_name":"Jansen","first_name":"Gabriele","postal_code":"41468","house_number":"21","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 17:41:15.525688+00'::timestamptz,
  '2026-05-28 01:54:48.790074+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  '17b9d410-e078-4014-aa4f-5c16e678042b'::text,
  'email',
  jsonb_build_object('sub', '17b9d410-e078-4014-aa4f-5c16e678042b', 'email', 'gajansen@web.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-22 17:41:15.525688+00'::timestamptz,
  '2026-05-28 01:54:48.790074+00'::timestamptz,
  '2026-02-22 17:41:15.644161+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: tanja@die-thallers.de
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
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'authenticated',
  'authenticated',
  'tanja@die-thallers.de',
  '$2a$10$er7l9Rffgmul5M1jFFTX/edCoyh8FfFBzoDZrRRA3DKdIQorQhdIW',
  '2026-01-22 18:01:27.666288+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"2ef0b4bf-69da-480e-9533-2bdf162dfc18","email":"tanja@die-thallers.de","last_name":"Thaller","first_name":"Tanja","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"owner","street":"Holunderweg","house_number":"6","postal_code":"41468","city":"Neuss","phone":"015209464468"}'::jsonb,
  '2026-01-22 18:01:27.545962+00'::timestamptz,
  '2026-06-02 17:36:33.573259+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::text,
  'email',
  jsonb_build_object('sub', '2ef0b4bf-69da-480e-9533-2bdf162dfc18', 'email', 'tanja@die-thallers.de', 'email_verified', true, 'phone_verified', false),
  '2026-01-22 18:01:27.545962+00'::timestamptz,
  '2026-06-02 17:36:33.573259+00'::timestamptz,
  '2026-06-02 17:36:33.476614+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: heike.huesgen@web.de
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
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  'authenticated',
  'authenticated',
  'heike.huesgen@web.de',
  '$2a$10$fixCu.WjkXL1a1beZjKbqeL9T4aZ.BgpeKfCLIdDh3/M8C8XNB4K6',
  '2026-02-04 19:49:34.152624+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"2f65224e-8ee1-4442-a9b5-56142d1f9413","city":"Neuss","email":"heike.huesgen@web.de","phone":"01729374125","street":"Konradstraße","last_name":"Hüsgen ","first_name":"Heike","postal_code":"41468","house_number":"7","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-04 19:49:34.117608+00'::timestamptz,
  '2026-04-22 21:54:11.320038+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::text,
  'email',
  jsonb_build_object('sub', '2f65224e-8ee1-4442-a9b5-56142d1f9413', 'email', 'heike.huesgen@web.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-04 19:49:34.117608+00'::timestamptz,
  '2026-04-22 21:54:11.320038+00'::timestamptz,
  '2026-03-02 13:39:36.581933+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: neuetafel@aol.com
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
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'authenticated',
  'authenticated',
  'neuetafel@aol.com',
  '$2a$10$Pvg5TqiQjEy1NaeqrLELgOjhf6ZZ7oYJEdwRRfUwVkWo2s7GnTDCW',
  '2026-02-23 11:17:54.746422+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"30eef8e2-74b1-410a-b1de-decf7d376866","city":"Neuss","email":"neuetafel@aol.com","phone":"01764886497","street":"Schlehenweg ","last_name":"Tafel","first_name":"Sabine ","postal_code":"41468","house_number":"10","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-23 11:17:54.623072+00'::timestamptz,
  '2026-05-27 16:11:32.888643+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::text,
  'email',
  jsonb_build_object('sub', '30eef8e2-74b1-410a-b1de-decf7d376866', 'email', 'neuetafel@aol.com', 'email_verified', true, 'phone_verified', false),
  '2026-02-23 11:17:54.623072+00'::timestamptz,
  '2026-05-27 16:11:32.888643+00'::timestamptz,
  '2026-04-26 17:32:11.801463+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: katy-albrecht@t-online.de
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
  '3c7289d8-b471-4b29-8877-abaee929764e'::uuid,
  'authenticated',
  'authenticated',
  'katy-albrecht@t-online.de',
  '$2a$10$l67zlRX7Lz4pKwPw4jaKx.KP9Z1HechiaNlkcrlw9A4W8Vy6640zC',
  '2026-03-27 07:46:29.759115+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"3c7289d8-b471-4b29-8877-abaee929764e","city":"Düsseldorf ","email":"katy-albrecht@t-online.de","phone":"17664807595","street":"Kleverst","last_name":"Albrecht","first_name":"Katy","postal_code":"40477","house_number":"64","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-03-27 07:46:29.69746+00'::timestamptz,
  '2026-03-27 11:02:31.131231+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '3c7289d8-b471-4b29-8877-abaee929764e'::uuid,
  '3c7289d8-b471-4b29-8877-abaee929764e'::uuid,
  '3c7289d8-b471-4b29-8877-abaee929764e'::text,
  'email',
  jsonb_build_object('sub', '3c7289d8-b471-4b29-8877-abaee929764e', 'email', 'katy-albrecht@t-online.de', 'email_verified', true, 'phone_verified', false),
  '2026-03-27 07:46:29.69746+00'::timestamptz,
  '2026-03-27 11:02:31.131231+00'::timestamptz,
  '2026-03-27 07:46:29.771778+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: kathrin.hutmacher@gmx.de
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
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  'authenticated',
  'authenticated',
  'kathrin.hutmacher@gmx.de',
  '$2a$10$v3/vvlDhGItTNPQV2586aeEgAez2cjLovv1yiKn6BbPW1.tT1W3nG',
  '2026-02-02 17:49:49.863149+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"47b11b34-6853-49e7-8006-4b2009ff711b","city":"Neuss","email":"kathrin.hutmacher@gmx.de","phone":"015229712228","street":"Hochstr","last_name":"Päßler ","first_name":"Kathrin ","postal_code":"41460","house_number":"13","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-02 17:49:49.74797+00'::timestamptz,
  '2026-04-28 17:39:38.197791+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  '47b11b34-6853-49e7-8006-4b2009ff711b'::text,
  'email',
  jsonb_build_object('sub', '47b11b34-6853-49e7-8006-4b2009ff711b', 'email', 'kathrin.hutmacher@gmx.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-02 17:49:49.74797+00'::timestamptz,
  '2026-04-28 17:39:38.197791+00'::timestamptz,
  '2026-02-17 12:50:18.029332+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: a.mennen@t-online.de
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
  '493b0cfd-1cf7-4d9a-9b82-5bd5e4c40be4'::uuid,
  'authenticated',
  'authenticated',
  'a.mennen@t-online.de',
  '$2a$10$xZysRNRPn9NL8gzCnLoYzuuI2GbI1GK/ZMCm9KXFAE1JsnK9fGEWy',
  '2026-05-28 17:37:32.569267+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"493b0cfd-1cf7-4d9a-9b82-5bd5e4c40be4","city":"Neuss","email":"a.mennen@t-online.de","phone":"015756169140","street":"Dietrichstrasse ","last_name":"Mennen","first_name":"Anne","postal_code":"41468","house_number":"28","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-05-28 17:37:32.462454+00'::timestamptz,
  '2026-05-28 17:37:32.630882+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '493b0cfd-1cf7-4d9a-9b82-5bd5e4c40be4'::uuid,
  '493b0cfd-1cf7-4d9a-9b82-5bd5e4c40be4'::uuid,
  '493b0cfd-1cf7-4d9a-9b82-5bd5e4c40be4'::text,
  'email',
  jsonb_build_object('sub', '493b0cfd-1cf7-4d9a-9b82-5bd5e4c40be4', 'email', 'a.mennen@t-online.de', 'email_verified', true, 'phone_verified', false),
  '2026-05-28 17:37:32.462454+00'::timestamptz,
  '2026-05-28 17:37:32.630882+00'::timestamptz,
  '2026-05-28 17:37:32.5864+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: anne1104@gmx.net
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
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  'authenticated',
  'authenticated',
  'anne1104@gmx.net',
  '$2a$10$dhxF97DsUDaczoWgAZBQm.X0..3sojhbQcGqHsGJW9OSFYz2Sw1mS',
  '2026-02-15 11:20:50.601013+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"4b249308-86e6-4fab-942f-a36e787534a7","city":"Meerbusch ","email":"anne1104@gmx.net","phone":"01772991649","street":"Nordstr. ","last_name":"Jung","first_name":"Anne-Katrin ","postal_code":"40667","house_number":"79","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-15 11:20:50.576121+00'::timestamptz,
  '2026-05-17 16:50:38.31312+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::text,
  'email',
  jsonb_build_object('sub', '4b249308-86e6-4fab-942f-a36e787534a7', 'email', 'anne1104@gmx.net', 'email_verified', true, 'phone_verified', false),
  '2026-02-15 11:20:50.576121+00'::timestamptz,
  '2026-05-17 16:50:38.31312+00'::timestamptz,
  '2026-05-17 16:50:38.254525+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: kirsten.nill@yahoo.de
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
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::uuid,
  'authenticated',
  'authenticated',
  'kirsten.nill@yahoo.de',
  '$2a$10$NnMGkhGpR633GmMsUkfiTukkrZG2WxQS6yMTVUIw8TbXzYf51JCDC',
  '2026-02-22 12:47:16.427619+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"570d3b6c-7220-4f35-a867-25eca400b2d4","city":"Neuss","email":"kirsten.nill@yahoo.de","phone":"015128974428","street":"Nixhütter Weg ","last_name":"Nill","first_name":"Kirsten","postal_code":"41468","house_number":"56","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 12:47:16.422327+00'::timestamptz,
  '2026-04-23 06:04:48.931724+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::uuid,
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::uuid,
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::text,
  'email',
  jsonb_build_object('sub', '570d3b6c-7220-4f35-a867-25eca400b2d4', 'email', 'kirsten.nill@yahoo.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-22 12:47:16.422327+00'::timestamptz,
  '2026-04-23 06:04:48.931724+00'::timestamptz,
  '2026-04-23 06:04:48.815939+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: nahidnadjafi@gmx.de
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
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  'authenticated',
  'authenticated',
  'nahidnadjafi@gmx.de',
  '$2a$10$P0jIuPE1GgGrXZdgzdcXSu2Pt0P9AJuRIcqDGxWCF4x4r2v2Htlkm',
  '2026-02-23 11:45:33.685807+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"65012a0a-cc60-4c73-890f-46a9740c4c52","city":"Neuss","email":"nahidnadjafi@gmx.de","phone":"01731373333","street":"Pliniusweg ","last_name":"Nadjafi","first_name":"Nahid","postal_code":"41464","house_number":"36","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-23 11:45:33.651754+00'::timestamptz,
  '2026-05-27 18:09:02.416402+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::text,
  'email',
  jsonb_build_object('sub', '65012a0a-cc60-4c73-890f-46a9740c4c52', 'email', 'nahidnadjafi@gmx.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-23 11:45:33.651754+00'::timestamptz,
  '2026-05-27 18:09:02.416402+00'::timestamptz,
  '2026-04-23 05:49:16.48312+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: andre@die-thallers.de
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
  '6cbcbb0d-02cd-4d88-b44e-9e63a2247242'::uuid,
  'authenticated',
  'authenticated',
  'andre@die-thallers.de',
  '$2a$10$/DDQQI6sC6ZvS7BiaGIv7u00FjpZ.SOU9oatS02Kn3gAHlsvBJO8K',
  '2026-01-23 12:54:41.125276+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"6cbcbb0d-02cd-4d88-b44e-9e63a2247242","city":"Neuss","email":"andre@die-thallers.de","phone":"015734673729","street":"Holunderweg","last_name":"Thaller","first_name":"André","postal_code":"41468","house_number":"6","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-01-23 12:54:41.086439+00'::timestamptz,
  '2026-01-23 18:56:29.064882+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '6cbcbb0d-02cd-4d88-b44e-9e63a2247242'::uuid,
  '6cbcbb0d-02cd-4d88-b44e-9e63a2247242'::uuid,
  '6cbcbb0d-02cd-4d88-b44e-9e63a2247242'::text,
  'email',
  jsonb_build_object('sub', '6cbcbb0d-02cd-4d88-b44e-9e63a2247242', 'email', 'andre@die-thallers.de', 'email_verified', true, 'phone_verified', false),
  '2026-01-23 12:54:41.086439+00'::timestamptz,
  '2026-01-23 18:56:29.064882+00'::timestamptz,
  '2026-01-23 18:56:29.059359+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: nicola.schnitzler@sid-marketing.de
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
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  'authenticated',
  'authenticated',
  'nicola.schnitzler@sid-marketing.de',
  '$2a$10$/g19FlPIVyMydIwKY7m2..oGWw2YSJ1HQkV.LIMCCY4RxQ2smd.ga',
  '2026-02-02 10:09:16.885751+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"767daf20-2720-461a-a1ba-2c84de4693ae","city":"Neuss","email":"nicola.schnitzler@sid-marketing.de","phone":"01704406924","street":"Hagebuttenweg","last_name":"Schnitzler","first_name":"Nicola","postal_code":"41468","house_number":"2","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-02 10:09:16.791749+00'::timestamptz,
  '2026-05-28 06:45:01.189841+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::text,
  'email',
  jsonb_build_object('sub', '767daf20-2720-461a-a1ba-2c84de4693ae', 'email', 'nicola.schnitzler@sid-marketing.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-02 10:09:16.791749+00'::timestamptz,
  '2026-05-28 06:45:01.189841+00'::timestamptz,
  '2026-02-02 10:09:16.908718+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: irene.meyers@online.de
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
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  'authenticated',
  'authenticated',
  'irene.meyers@online.de',
  '$2a$10$AVjqX1.XqqDaHjDiAmYWduNE.QN3JEMdQ1NLWR7qun1xjDexG8QM.',
  '2026-02-03 21:03:53.717326+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc","city":"Neuss","email":"irene.meyers@online.de","phone":"015209897377","street":"Gagelweg","last_name":"Meyers","first_name":"Irene","postal_code":"41468","house_number":"17","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-03 21:03:53.603835+00'::timestamptz,
  '2026-05-17 17:48:01.04723+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::text,
  'email',
  jsonb_build_object('sub', '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc', 'email', 'irene.meyers@online.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-03 21:03:53.603835+00'::timestamptz,
  '2026-05-17 17:48:01.04723+00'::timestamptz,
  '2026-02-03 21:03:53.740324+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: volkervonderohe@yahoo.de
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
  '974cc271-26c9-4f96-a194-453cc61ac93f'::uuid,
  'authenticated',
  'authenticated',
  'volkervonderohe@yahoo.de',
  '$2a$10$xchvncQLHZWMRCXDQfmhXOAlIuzMXO0OhaiZCmBwtwUWc5XL/aI7G',
  '2026-05-06 06:14:34.542568+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"974cc271-26c9-4f96-a194-453cc61ac93f","city":"Neuss","email":"volkervonderohe@yahoo.de","phone":"01795718397","street":"Holunderweg","last_name":"von der Ohe","first_name":"Barbara","postal_code":"41468","house_number":"6a","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-05-06 06:14:34.460549+00'::timestamptz,
  '2026-05-06 06:14:34.603959+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '974cc271-26c9-4f96-a194-453cc61ac93f'::uuid,
  '974cc271-26c9-4f96-a194-453cc61ac93f'::uuid,
  '974cc271-26c9-4f96-a194-453cc61ac93f'::text,
  'email',
  jsonb_build_object('sub', '974cc271-26c9-4f96-a194-453cc61ac93f', 'email', 'volkervonderohe@yahoo.de', 'email_verified', true, 'phone_verified', false),
  '2026-05-06 06:14:34.460549+00'::timestamptz,
  '2026-05-06 06:14:34.603959+00'::timestamptz,
  '2026-05-06 06:14:34.562768+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: akoehler4@gmx.de
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
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'authenticated',
  'authenticated',
  'akoehler4@gmx.de',
  '$2a$10$zxMgnxGA.QTPRC0GGgdWZ.hPtOBwbRl3AJhCFV.re7cKR6oj8MbXW',
  '2026-02-15 11:14:15.524363+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"a3856216-c52c-41e3-9d61-2c20bcdb02ab","city":"Neuss","email":"akoehler4@gmx.de","phone":"01794610499","street":"Weissdornweg ","last_name":"Köhler","first_name":"Andrea","postal_code":"41468","house_number":"22","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-15 11:14:15.428418+00'::timestamptz,
  '2026-06-01 16:49:20.371999+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;