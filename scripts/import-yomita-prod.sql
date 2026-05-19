-- Yomita legacy import
-- tenant_id: 892370b8-49a1-4699-b480-2f722e4f9fe3

INSERT INTO public.tenants (id, name, slug) VALUES ('892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid, 'Yomita', 'yomita');

-- auth: stefanie.neck@web.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
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
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"17b9d410-e078-4014-aa4f-5c16e678042b","city":"Neuss","email":"gajansen@web.de","phone":"01727455771","street":"Dunantstrasse ","last_name":"Jansen","first_name":"Gabriele","postal_code":"41468","house_number":"21","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 17:41:15.525688+00'::timestamptz,
  '2026-05-13 04:11:54.674331+00'::timestamptz,
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
  '2026-05-13 04:11:54.674331+00'::timestamptz,
  '2026-02-22 17:41:15.644161+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: tanja@die-thallers.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
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
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"2ef0b4bf-69da-480e-9533-2bdf162dfc18","email":"tanja@die-thallers.de","last_name":"Thaller","first_name":"Tanja","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"owner","street":"Holunderweg","house_number":"6","postal_code":"41468","city":"Neuss","phone":"015209464468"}'::jsonb,
  '2026-01-22 18:01:27.545962+00'::timestamptz,
  '2026-05-13 08:39:09.786816+00'::timestamptz,
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
  '2026-05-13 08:39:09.786816+00'::timestamptz,
  '2026-05-13 08:39:09.736143+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: heike.huesgen@web.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
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
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"30eef8e2-74b1-410a-b1de-decf7d376866","city":"Neuss","email":"neuetafel@aol.com","phone":"01764886497","street":"Schlehenweg ","last_name":"Tafel","first_name":"Sabine ","postal_code":"41468","house_number":"10","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-23 11:17:54.623072+00'::timestamptz,
  '2026-04-26 17:32:11.841092+00'::timestamptz,
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
  '2026-04-26 17:32:11.841092+00'::timestamptz,
  '2026-04-26 17:32:11.801463+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: katy-albrecht@t-online.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
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

-- auth: anne1104@gmx.net
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
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
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"4b249308-86e6-4fab-942f-a36e787534a7","city":"Meerbusch ","email":"anne1104@gmx.net","phone":"01772991649","street":"Nordstr. ","last_name":"Jung","first_name":"Anne-Katrin ","postal_code":"40667","house_number":"79","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-15 11:20:50.576121+00'::timestamptz,
  '2026-05-12 19:49:45.168593+00'::timestamptz,
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
  '2026-05-12 19:49:45.168593+00'::timestamptz,
  '2026-05-12 19:49:45.097522+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: kirsten.nill@yahoo.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
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
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"65012a0a-cc60-4c73-890f-46a9740c4c52","city":"Neuss","email":"nahidnadjafi@gmx.de","phone":"01731373333","street":"Pliniusweg ","last_name":"Nadjafi","first_name":"Nahid","postal_code":"41464","house_number":"36","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-23 11:45:33.651754+00'::timestamptz,
  '2026-05-11 15:37:54.76548+00'::timestamptz,
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
  '2026-05-11 15:37:54.76548+00'::timestamptz,
  '2026-04-23 05:49:16.48312+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: andre@die-thallers.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
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
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"767daf20-2720-461a-a1ba-2c84de4693ae","city":"Neuss","email":"nicola.schnitzler@sid-marketing.de","phone":"01704406924","street":"Hagebuttenweg","last_name":"Schnitzler","first_name":"Nicola","postal_code":"41468","house_number":"2","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-02 10:09:16.791749+00'::timestamptz,
  '2026-05-12 05:46:20.379774+00'::timestamptz,
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
  '2026-05-12 05:46:20.379774+00'::timestamptz,
  '2026-02-02 10:09:16.908718+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: irene.meyers@online.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
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
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc","city":"Neuss","email":"irene.meyers@online.de","phone":"015209897377","street":"Gagelweg","last_name":"Meyers","first_name":"Irene","postal_code":"41468","house_number":"17","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-03 21:03:53.603835+00'::timestamptz,
  '2026-05-06 18:02:38.596886+00'::timestamptz,
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
  '2026-05-06 18:02:38.596886+00'::timestamptz,
  '2026-02-03 21:03:53.740324+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: volkervonderohe@yahoo.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
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
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"a3856216-c52c-41e3-9d61-2c20bcdb02ab","city":"Neuss","email":"akoehler4@gmx.de","phone":"01794610499","street":"Weissdornweg ","last_name":"Köhler","first_name":"Andrea","postal_code":"41468","house_number":"22","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-15 11:14:15.428418+00'::timestamptz,
  '2026-05-12 15:21:58.234962+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::text,
  'email',
  jsonb_build_object('sub', 'a3856216-c52c-41e3-9d61-2c20bcdb02ab', 'email', 'akoehler4@gmx.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-15 11:14:15.428418+00'::timestamptz,
  '2026-05-12 15:21:58.234962+00'::timestamptz,
  '2026-02-15 11:14:15.542171+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: lara.becker1985@gmail.com
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'authenticated',
  'authenticated',
  'lara.becker1985@gmail.com',
  '$2a$10$eyT55OhMf2qTMHew1FF3GeIqhpSQkAWDg4DWRT62PYQ4LSLCx9VRW',
  '2026-02-22 13:51:08.200018+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"aa8af330-e808-4e39-87a9-131aef59079a","city":"Neuss","email":"lara.becker1985@gmail.com","phone":"01779352228","street":"Grüner Weg","last_name":"Becker","first_name":"Lara","postal_code":"41468","house_number":"12A","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 13:51:08.117876+00'::timestamptz,
  '2026-04-24 07:39:38.4047+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::text,
  'email',
  jsonb_build_object('sub', 'aa8af330-e808-4e39-87a9-131aef59079a', 'email', 'lara.becker1985@gmail.com', 'email_verified', true, 'phone_verified', false),
  '2026-02-22 13:51:08.117876+00'::timestamptz,
  '2026-04-24 07:39:38.4047+00'::timestamptz,
  '2026-02-22 13:51:08.217484+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: kirsten.schoenstein-nill1@currenta.biz
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'authenticated',
  'authenticated',
  'kirsten.schoenstein-nill1@currenta.biz',
  '$2a$10$z54sk9dgEPDDEyho5jNjO.MHMibGmXZIhhD2JgWw3N.lZLdmvL7f6',
  '2026-04-23 06:25:12.5882+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"ac7a314f-6903-47b8-9096-243d6b24842e","city":"Neuss","email":"kirsten.schoenstein-nill1@currenta.biz","phone":"015128974428","street":"Nixhütter Weg","last_name":"Nill","first_name":"Kirsten","postal_code":"41468","house_number":"56","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-04-23 06:25:12.50197+00'::timestamptz,
  '2026-05-01 05:45:09.696909+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::text,
  'email',
  jsonb_build_object('sub', 'ac7a314f-6903-47b8-9096-243d6b24842e', 'email', 'kirsten.schoenstein-nill1@currenta.biz', 'email_verified', true, 'phone_verified', false),
  '2026-04-23 06:25:12.50197+00'::timestamptz,
  '2026-05-01 05:45:09.696909+00'::timestamptz,
  '2026-04-23 09:10:06.195519+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: caroline.pusch@gmx.net
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'authenticated',
  'authenticated',
  'caroline.pusch@gmx.net',
  '$2a$10$eoKc4XuLI0Uubbpb.luG5.qLo0GXw/2c.5.7NhVo7pWlHDvCGMO8G',
  '2026-02-22 12:45:23.140916+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"c6377894-2826-4efe-84ff-2efeae0aed98","city":"Neuss","email":"caroline.pusch@gmx.net","phone":"00491608277292","street":"Fliederweg","last_name":"Pusch","first_name":"Caroline","postal_code":"41468","house_number":"35","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 12:45:23.121962+00'::timestamptz,
  '2026-05-04 14:29:47.586242+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::text,
  'email',
  jsonb_build_object('sub', 'c6377894-2826-4efe-84ff-2efeae0aed98', 'email', 'caroline.pusch@gmx.net', 'email_verified', true, 'phone_verified', false),
  '2026-02-22 12:45:23.121962+00'::timestamptz,
  '2026-05-04 14:29:47.586242+00'::timestamptz,
  '2026-02-22 12:45:23.145177+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: susafalken@gmx.net
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'authenticated',
  'authenticated',
  'susafalken@gmx.net',
  '$2a$10$mSk/tprazUy/KuCO./AtQOqAyv0xyqmWF5M8DAOkcIwb6RWn/CGIK',
  '2026-02-22 14:14:12.406846+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"c6e80666-7afb-40e7-922a-26ac14f43024","city":"Neuss","email":"susafalken@gmx.net","phone":"01738103509","street":"Lupinenstraße","last_name":"Falkenberg","first_name":"Susanne","postal_code":"41466","house_number":"53","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 14:14:12.346338+00'::timestamptz,
  '2026-05-13 05:19:11.85606+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'c6e80666-7afb-40e7-922a-26ac14f43024'::text,
  'email',
  jsonb_build_object('sub', 'c6e80666-7afb-40e7-922a-26ac14f43024', 'email', 'susafalken@gmx.net', 'email_verified', true, 'phone_verified', false),
  '2026-02-22 14:14:12.346338+00'::timestamptz,
  '2026-05-13 05:19:11.85606+00'::timestamptz,
  '2026-02-22 14:14:12.425373+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: txxx@mail.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'd53d3b2d-b59b-4140-acc3-0d7f161565a7'::uuid,
  'authenticated',
  'authenticated',
  'txxx@mail.de',
  '$2a$10$6CmC2fuSaaoE92402hgk6.bQLvPcQ6qcJWxKy9fc9g8PNei.T.1Xu',
  '2026-01-23 12:18:54.49722+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"d53d3b2d-b59b-4140-acc3-0d7f161565a7","city":"Neuss","email":"txxx@mail.de","phone":"02131123456","street":"Holunderweg","last_name":"Thaller","first_name":"Test","postal_code":"41468","house_number":"6","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-01-23 12:18:54.440442+00'::timestamptz,
  '2026-01-23 22:59:42.848966+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'd53d3b2d-b59b-4140-acc3-0d7f161565a7'::uuid,
  'd53d3b2d-b59b-4140-acc3-0d7f161565a7'::uuid,
  'd53d3b2d-b59b-4140-acc3-0d7f161565a7'::text,
  'email',
  jsonb_build_object('sub', 'd53d3b2d-b59b-4140-acc3-0d7f161565a7', 'email', 'txxx@mail.de', 'email_verified', true, 'phone_verified', false),
  '2026-01-23 12:18:54.440442+00'::timestamptz,
  '2026-01-23 22:59:42.848966+00'::timestamptz,
  '2026-01-23 22:59:42.844136+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: drealenk@gmail.com
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::uuid,
  'authenticated',
  'authenticated',
  'drealenk@gmail.com',
  '$2a$10$dEApptP0bMvYz1v78zRLSOkm51yyZZNQid9nXu05i1oNbXL9.jUT6',
  '2026-05-11 19:24:21.870344+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"d7e35357-4209-4429-8ecb-86cea5255fc9","city":"Grevenbroich","email":"drealenk@gmail.com","phone":"015174230936","street":"Brombergestrasse ","last_name":"Schmitz","first_name":"Andrea ","postal_code":"41516","house_number":"15","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-05-11 19:24:21.767588+00'::timestamptz,
  '2026-05-12 21:25:27.727341+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::uuid,
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::uuid,
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::text,
  'email',
  jsonb_build_object('sub', 'd7e35357-4209-4429-8ecb-86cea5255fc9', 'email', 'drealenk@gmail.com', 'email_verified', true, 'phone_verified', false),
  '2026-05-11 19:24:21.767588+00'::timestamptz,
  '2026-05-12 21:25:27.727341+00'::timestamptz,
  '2026-05-11 19:24:21.89286+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: eva.neumeister@gmx.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'authenticated',
  'authenticated',
  'eva.neumeister@gmx.de',
  '$2a$10$rpIQREVd8/r9R7pHPGzlku7XCBu0C.tevgbjftP9LNqtf8zNlVrYi',
  '2026-02-22 15:21:03.40386+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"df756576-1390-4e27-a37c-1ee086061a16","city":"Neuss","email":"eva.neumeister@gmx.de","phone":"015776455801","street":"Gagelweg","last_name":"Vosdellen ","first_name":"Eva ","postal_code":"41468","house_number":"22","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 15:21:03.323085+00'::timestamptz,
  '2026-05-04 17:13:43.683323+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::text,
  'email',
  jsonb_build_object('sub', 'df756576-1390-4e27-a37c-1ee086061a16', 'email', 'eva.neumeister@gmx.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-22 15:21:03.323085+00'::timestamptz,
  '2026-05-04 17:13:43.683323+00'::timestamptz,
  '2026-02-22 15:21:03.420312+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: marianne_cremer@t-online.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'authenticated',
  'authenticated',
  'marianne_cremer@t-online.de',
  '$2a$10$xzltzgQd1QhBfRcVBL5v2.b5UM/7PWKHuCMfFPqVkfFhfEKcbqB8q',
  '2026-02-15 11:30:05.545982+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"e2d34978-a240-4e01-9794-1859b0e6ba29","city":"Neuss","email":"marianne_cremer@t-online.de","phone":"01721491133","street":"Haselweg","last_name":"Cremer","first_name":"Marianne","postal_code":"41468","house_number":"18","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-15 11:30:05.492655+00'::timestamptz,
  '2026-04-23 05:51:33.217709+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::text,
  'email',
  jsonb_build_object('sub', 'e2d34978-a240-4e01-9794-1859b0e6ba29', 'email', 'marianne_cremer@t-online.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-15 11:30:05.492655+00'::timestamptz,
  '2026-04-23 05:51:33.217709+00'::timestamptz,
  '2026-02-15 11:30:05.556236+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: antjebauer@hotmail.com
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'authenticated',
  'authenticated',
  'antjebauer@hotmail.com',
  '$2a$10$tvuCm39hxwu2.MkLy1htmeaYeJTcf3V7xZinC7eeJFWBNqLFE8myq',
  '2026-02-22 12:47:01.108889+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"e4a096c1-8fc5-4979-950f-89b90d986133","city":"Neuss","email":"antjebauer@hotmail.com","phone":"01777639292","street":"Fliederweg ","last_name":"Bauer","first_name":"Antje","postal_code":"41468","house_number":"30","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 12:47:01.099402+00'::timestamptz,
  '2026-05-12 11:29:25.046347+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::text,
  'email',
  jsonb_build_object('sub', 'e4a096c1-8fc5-4979-950f-89b90d986133', 'email', 'antjebauer@hotmail.com', 'email_verified', true, 'phone_verified', false),
  '2026-02-22 12:47:01.099402+00'::timestamptz,
  '2026-05-12 11:29:25.046347+00'::timestamptz,
  '2026-03-11 22:32:34.353401+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: andrea.karnath@arcor.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'authenticated',
  'authenticated',
  'andrea.karnath@arcor.de',
  '$2a$10$Ip3f2SPxwIQxt51TqY3mG.147j34dbAvo2NpaE8u1ddleIMWOzJV6',
  '2026-02-02 10:25:42.280276+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"f63447c3-a2b4-4064-97fe-22428a032a2d","city":"Neuss","email":"andrea.karnath@arcor.de","phone":"01781682285","street":"Pliniusweg ","last_name":"Karnath ","first_name":"Andrea ","postal_code":"41464","house_number":"46","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-02 10:25:42.191777+00'::timestamptz,
  '2026-05-05 05:53:28.500384+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::text,
  'email',
  jsonb_build_object('sub', 'f63447c3-a2b4-4064-97fe-22428a032a2d', 'email', 'andrea.karnath@arcor.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-02 10:25:42.191777+00'::timestamptz,
  '2026-05-05 05:53:28.500384+00'::timestamptz,
  '2026-04-11 21:16:50.020378+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: spollotzek@web.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'authenticated',
  'authenticated',
  'spollotzek@web.de',
  '$2a$10$4R1L0h0GS9rIENb.xDJFcuD9INpx1trRCeg/6EUclMsEiY4igcI6C',
  '2026-02-22 15:52:19.073635+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"f81c8ff0-cc12-429b-9e85-8ee8e8a07138","city":"Neuss","email":"spollotzek@web.de","phone":"01604162080","street":"Fliederweg","last_name":"Pollotzek","first_name":"Stefanie","postal_code":"41468","house_number":"13a","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 15:52:19.021876+00'::timestamptz,
  '2026-05-11 07:28:37.691841+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::text,
  'email',
  jsonb_build_object('sub', 'f81c8ff0-cc12-429b-9e85-8ee8e8a07138', 'email', 'spollotzek@web.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-22 15:52:19.021876+00'::timestamptz,
  '2026-05-11 07:28:37.691841+00'::timestamptz,
  '2026-02-22 15:52:19.087352+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: elke.leven@arcor.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'authenticated',
  'authenticated',
  'elke.leven@arcor.de',
  '$2a$10$SSovN4fbE8fn//w9dlfyV.5bJkfwmK/VbAvzoFydGJONtQMwxScTW',
  '2026-02-22 12:41:58.744438+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"fac5a9c9-0dc1-427c-aab4-db097ab8fa16","city":"Neuss","email":"elke.leven@arcor.de","phone":"01794959236","street":"Melissenstraße ","last_name":"Leven","first_name":"Elke","postal_code":"41466","house_number":"1","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 12:41:58.686075+00'::timestamptz,
  '2026-05-11 17:38:53.590081+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::text,
  'email',
  jsonb_build_object('sub', 'fac5a9c9-0dc1-427c-aab4-db097ab8fa16', 'email', 'elke.leven@arcor.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-22 12:41:58.686075+00'::timestamptz,
  '2026-05-11 17:38:53.590081+00'::timestamptz,
  '2026-02-22 12:41:58.765788+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: andrethaller@icloud.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000'::uuid,
  'ffd06ae6-242c-4ea2-a5a5-76f219740548'::uuid,
  'authenticated',
  'authenticated',
  'andrethaller@icloud.de',
  '$2a$10$3K5xtlGaQcAM07AOOX4iA.8oGd.h9eNlBvR8Ifj/djOFoaZ8bKn8q',
  '2026-02-06 13:26:14.294605+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"ffd06ae6-242c-4ea2-a5a5-76f219740548","city":"Neuss","email":"andrethaller@icloud.de","phone":"015734673729","street":"Holunderweg","last_name":"Thaller","first_name":"André","postal_code":"41468","house_number":"6","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-06 13:26:14.258226+00'::timestamptz,
  '2026-02-06 13:26:14.325594+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'ffd06ae6-242c-4ea2-a5a5-76f219740548'::uuid,
  'ffd06ae6-242c-4ea2-a5a5-76f219740548'::uuid,
  'ffd06ae6-242c-4ea2-a5a5-76f219740548'::text,
  'email',
  jsonb_build_object('sub', 'ffd06ae6-242c-4ea2-a5a5-76f219740548', 'email', 'andrethaller@icloud.de', 'email_verified', true, 'phone_verified', false),
  '2026-02-06 13:26:14.258226+00'::timestamptz,
  '2026-02-06 13:26:14.325594+00'::timestamptz,
  '2026-02-06 13:26:14.308168+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- Mark all Yomita users verified (app gate)
UPDATE public.users SET
  email_verified = true,
  email_verified_at = COALESCE(email_verified_at, created_at),
  gdpr_consent = true,
  gdpr_consent_date = COALESCE(gdpr_consent_date, created_at)
WHERE tenant_id = '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid;

-- courses
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Mittwoch',
  'Hatha/Vinyasa für alle',
  '2026-06-24'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  'f317d6ed-4cac-46d8-ab5b-b67f5a3fbd77'::uuid,
  '2026-04-22 20:25:04.201213+00'::timestamptz,
  '2026-04-22 20:25:04.201213+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Dienstag',
  'Vinyasa für Fortgeschrittene',
  '2026-06-30'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  '35f08238-f358-430a-999f-21a6cb211040'::uuid,
  '2026-04-22 20:26:47.833385+00'::timestamptz,
  '2026-04-22 20:26:47.833385+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Dienstag',
  'Vinyasa für Fortgeschrittene',
  '2026-06-23'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  '35f08238-f358-430a-999f-21a6cb211040'::uuid,
  '2026-04-22 20:26:47.833385+00'::timestamptz,
  '2026-04-22 20:26:47.833385+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  '51f56177-d67c-4b49-9154-009bcef0e046'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Dienstag',
  'Vinyasa für Fortgeschrittene',
  '2026-05-26'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  NULL,
  '2026-04-05 15:14:34.144443+00'::timestamptz,
  '2026-04-05 15:14:34.144443+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Dienstag',
  'Vinyasa für Fortgeschrittene',
  '2026-06-16'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  '35f08238-f358-430a-999f-21a6cb211040'::uuid,
  '2026-04-22 20:26:47.833385+00'::timestamptz,
  '2026-04-22 20:26:47.833385+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Dienstag',
  'Vinyasa für Fortgeschrittene',
  '2026-06-02'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  '35f08238-f358-430a-999f-21a6cb211040'::uuid,
  '2026-04-22 20:26:47.833385+00'::timestamptz,
  '2026-04-22 20:26:47.833385+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Mittwoch',
  'Hatha/Vinyasa für alle',
  '2026-06-17'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  'f317d6ed-4cac-46d8-ab5b-b67f5a3fbd77'::uuid,
  '2026-04-22 20:25:04.201213+00'::timestamptz,
  '2026-04-22 20:25:04.201213+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  'd0cfc4a6-3189-4365-b86c-b478dcadbf68'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Mittwoch',
  'Hatha-Yoga/Vinyasa für alle',
  '2026-05-27'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  NULL,
  '2026-04-08 08:32:52.458948+00'::timestamptz,
  '2026-04-08 08:32:52.458948+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'YOGA & AYURVEDA (Tagesrereat)',
  'Gemeinsam mit der kreativen Ayurveda-Köchin Monika im wunderschönen Celebrate Yoga in Leichlingen. 
Noch zum Frühbucherpreis! Ab 01.06.2026 129,- Euro.',
  '2026-07-12'::date,
  '09:00:00'::time,
  '17:00:00'::time,
  'Celebrate Yoga, Leichlingen',
  NULL,
  10,
  99.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  480,
  NULL,
  'one_time',
  NULL,
  '2026-05-03 10:37:34.417922+00'::timestamptz,
  '2026-05-03 10:37:34.417922+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Mittwoch',
  'Hatha/Vinyasa für alle',
  '2026-05-13'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  NULL,
  '2026-03-13 21:00:01.11986+00'::timestamptz,
  '2026-03-13 21:00:01.11986+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Dienstag',
  'Vinyasa für Fortgeschrittene',
  '2026-06-09'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Gagelweg',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  '35f08238-f358-430a-999f-21a6cb211040'::uuid,
  '2026-04-22 20:26:47.833385+00'::timestamptz,
  '2026-04-22 20:26:47.833385+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Mittwoch',
  'Vinyasa für Fortgeschrittene',
  '2026-06-03'::date,
  '18:00:00'::time,
  '19:30:00'::time,
  'Neuss',
  NULL,
  8,
  12.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  90,
  NULL,
  'one_time',
  NULL,
  '2026-04-17 04:40:34.093596+00'::timestamptz,
  '2026-04-17 04:40:34.093596+00'::timestamptz
);

-- registrations
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '01bb5759-964f-44dc-aa16-f4dd3ec25de1'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:23:57.741694+00'::timestamptz,
  '2026-04-23 04:23:57.741694+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '0429fb30-6626-43eb-af4f-45bc66b8e87a'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:33:22.817303+00'::timestamptz,
  '2026-04-22 20:33:22.817303+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '04977ef4-1198-4138-8c84-2121cfb75264'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:36:44.094428+00'::timestamptz,
  '2026-04-22 20:36:44.094428+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '06ed7339-8855-44a5-8970-68a3e01ec28a'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '51f56177-d67c-4b49-9154-009bcef0e046'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  'registered'::public.registration_status,
  '2026-04-07 18:13:10.517534+00'::timestamptz,
  '2026-04-07 18:13:10.517534+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '077d9555-8dc9-44db-9e53-cf2b815bb0a5'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd0cfc4a6-3189-4365-b86c-b478dcadbf68'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'registered'::public.registration_status,
  '2026-04-09 12:09:23.543736+00'::timestamptz,
  '2026-04-09 12:09:23.543736+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '10f770fe-b18b-48c3-8999-4d18fe4e1103'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 06:29:43.222224+00'::timestamptz,
  '2026-04-23 06:29:43.222224+00'::timestamptz,
  '2026-04-23 06:29:50.531733+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '13b33a0a-e2f2-4a22-ad86-09ebdf9d2187'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:55:20.259222+00'::timestamptz,
  '2026-04-23 05:55:20.259222+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '16c9b1e8-b9e3-4adf-9dea-a4d27ebf0612'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::uuid,
  'registered'::public.registration_status,
  '2026-04-19 13:16:50.772361+00'::timestamptz,
  '2026-04-19 13:16:50.772361+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '19401d56-a239-45c7-84fd-5ddb348fc65f'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:25:46.158216+00'::timestamptz,
  '2026-04-23 05:25:46.158216+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '2118c6e2-f10f-4d35-b95a-b5d3d106fcdc'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:02:52.715121+00'::timestamptz,
  '2026-04-23 05:02:52.715121+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '2315de26-8329-401b-8f99-d6777c25980a'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'registered'::public.registration_status,
  '2026-04-21 18:51:28.290356+00'::timestamptz,
  '2026-04-21 18:51:28.290356+00'::timestamptz,
  '2026-05-06 05:44:41.322201+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '23f50362-f5af-48ba-bebf-f74ecf5f404c'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd0cfc4a6-3189-4365-b86c-b478dcadbf68'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 06:28:59.148891+00'::timestamptz,
  '2026-04-23 06:28:59.148891+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '2447f82c-c945-44e7-9a9f-a0e55dcf8a47'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:01:34.395579+00'::timestamptz,
  '2026-04-23 04:01:34.395579+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '25091d9d-8c97-4d64-9193-d7f744dbf8d2'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:56:51.584406+00'::timestamptz,
  '2026-04-22 20:56:51.584406+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '284f43f0-ba23-4da2-a755-98faae64f386'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 21:17:58.819192+00'::timestamptz,
  '2026-04-22 21:17:58.819192+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '2b6a302a-0a55-4ac2-8a02-8481d6a2dcbe'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  'waitlist'::public.registration_status,
  '2026-04-28 17:41:02.17753+00'::timestamptz,
  '2026-04-28 17:41:02.17753+00'::timestamptz,
  NULL,
  true,
  1
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '2db70591-8772-451e-9eaf-8e3b76b3428f'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:20:23.065535+00'::timestamptz,
  '2026-04-23 04:20:23.065535+00'::timestamptz,
  '2026-05-11 17:43:39.437789+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '2ed714e8-f004-4a0d-be74-e5cf422af326'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'registered'::public.registration_status,
  '2026-03-27 13:47:58.894235+00'::timestamptz,
  '2026-03-27 13:47:58.894235+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '30fbbc32-9b8c-4ecd-b3ca-fcf77744c00e'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:26:08.32555+00'::timestamptz,
  '2026-04-23 05:26:08.32555+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '31bb88b1-5efe-4457-96dc-30e1acd46b07'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:32:03.712819+00'::timestamptz,
  '2026-04-22 20:32:03.712819+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '37fb331e-f0e4-45af-aa00-263451f65552'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '51f56177-d67c-4b49-9154-009bcef0e046'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  'registered'::public.registration_status,
  '2026-04-21 07:21:57.759866+00'::timestamptz,
  '2026-04-21 07:21:57.759866+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '39006a31-3bd1-4f38-ae24-c33f87b37fec'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 06:29:30.408174+00'::timestamptz,
  '2026-04-23 06:29:30.408174+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '3b878400-2547-447d-a215-862fbc9fd2e5'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:36:24.59253+00'::timestamptz,
  '2026-04-22 20:36:24.59253+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '3d469b96-3da7-45ed-a28f-f71ea3bb0de8'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  'registered'::public.registration_status,
  '2026-05-06 16:55:50.712586+00'::timestamptz,
  '2026-05-06 16:55:50.712586+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '3dd0181b-d8af-40ca-84cc-0b0a8ef47005'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:54:43.686236+00'::timestamptz,
  '2026-04-23 05:54:43.686236+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '40e689a9-910c-4d40-87fd-502ae14095a8'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:20:39.602466+00'::timestamptz,
  '2026-04-23 04:20:39.602466+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '420ab90a-cad5-4545-a4b3-1a7f18166c71'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:58:05.8358+00'::timestamptz,
  '2026-04-22 20:58:05.8358+00'::timestamptz,
  '2026-05-11 07:30:36.507584+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '45e47d66-b8ad-4d7b-bcc3-a46d0251d7ac'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd0cfc4a6-3189-4365-b86c-b478dcadbf68'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:51:11.067056+00'::timestamptz,
  '2026-04-23 05:51:11.067056+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '463891bf-837d-483b-8656-f84d1a575ff5'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:36:17.383627+00'::timestamptz,
  '2026-04-22 20:36:17.383627+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '479b265b-a740-446a-b987-fb7a69e8bd5f'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd0cfc4a6-3189-4365-b86c-b478dcadbf68'::uuid,
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 08:22:28.78819+00'::timestamptz,
  '2026-04-23 08:22:28.78819+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '4a99b370-128c-4620-925f-31c7d7ba274b'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  'registered'::public.registration_status,
  '2026-04-28 17:40:38.835614+00'::timestamptz,
  '2026-04-28 17:40:38.835614+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '4b47d2bd-9196-47a7-af07-c13e34a9c83d'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:23:49.703274+00'::timestamptz,
  '2026-04-23 04:23:49.703274+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '4da1608e-ff9a-4d6a-925c-cd8a38bf9735'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  'registered'::public.registration_status,
  '2026-03-19 21:56:35.170269+00'::timestamptz,
  '2026-03-19 21:56:35.170269+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '4e0369db-dc65-480c-a533-a6e74415af55'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:33:33.586742+00'::timestamptz,
  '2026-04-22 20:33:33.586742+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '4e4c02d2-86b0-4506-9bae-9dbf415551ed'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:32:12.508314+00'::timestamptz,
  '2026-04-22 20:32:12.508314+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '4fc50e3d-8688-4086-b719-dbe084722840'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 07:14:25.268822+00'::timestamptz,
  '2026-04-23 07:14:25.268822+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '4fe89ba4-43f5-4d39-8036-716716c787dc'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:20:48.457204+00'::timestamptz,
  '2026-04-23 04:20:48.457204+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '5265f329-0943-4c0f-8da3-889a458d99a5'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:01:10.707926+00'::timestamptz,
  '2026-04-23 04:01:10.707926+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '52ffde96-474a-4bfc-9dd5-fd7c7b8bdbed'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:51:31.685057+00'::timestamptz,
  '2026-04-23 05:51:31.685057+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '577b85a6-0c88-43f8-992b-d58877a97776'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:31:40.773577+00'::timestamptz,
  '2026-04-22 20:31:40.773577+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '57b17bc1-3ef9-4415-b655-3b0528899b9b'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'waitlist'::public.registration_status,
  '2026-05-06 05:44:44.524207+00'::timestamptz,
  '2026-05-06 05:44:44.524207+00'::timestamptz,
  NULL,
  true,
  1
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '58ddeabf-f07a-4469-9853-6e29929b01f3'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:25:39.884342+00'::timestamptz,
  '2026-04-23 05:25:39.884342+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '5991ece6-cc74-4d74-a019-6361672d5981'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  '974cc271-26c9-4f96-a194-453cc61ac93f'::uuid,
  'registered'::public.registration_status,
  '2026-05-06 06:15:18.194749+00'::timestamptz,
  '2026-05-06 06:15:18.194749+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '59b25404-b877-4343-b6af-f013a57159be'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:23:23.385478+00'::timestamptz,
  '2026-04-23 04:23:23.385478+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '5f9c48a9-272d-42ee-bab0-ce103a958f96'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'registered'::public.registration_status,
  '2026-04-26 17:37:32.452138+00'::timestamptz,
  '2026-04-26 17:37:32.452138+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '610f3a5b-5726-46e2-b4de-a7376b89c931'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 21:18:42.423252+00'::timestamptz,
  '2026-04-22 21:18:42.423252+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '612ec058-adb2-4d6b-a409-42335f883ea6'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd0cfc4a6-3189-4365-b86c-b478dcadbf68'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  'registered'::public.registration_status,
  '2026-04-08 16:08:54.137428+00'::timestamptz,
  '2026-04-08 16:08:54.137428+00'::timestamptz,
  '2026-04-22 05:30:41.278737+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '64f5ec07-6f8e-4d7f-a313-42cd3bda3d02'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'waitlist'::public.registration_status,
  '2026-04-26 17:39:20.078327+00'::timestamptz,
  '2026-04-26 17:39:20.078327+00'::timestamptz,
  '2026-04-26 17:39:31.731591+00'::timestamptz,
  true,
  2
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '65104715-d0d4-49b8-9d14-6c742833608d'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:02:08.260982+00'::timestamptz,
  '2026-04-23 04:02:08.260982+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '65884f2f-bc53-4063-a6ce-6d20f668ac20'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 03:59:57.072+00'::timestamptz,
  '2026-04-23 03:59:57.072+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '6acbd08a-0b0a-463c-b598-b46140fb0947'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'waitlist'::public.registration_status,
  '2026-04-26 17:39:59.489593+00'::timestamptz,
  '2026-04-26 17:39:59.489593+00'::timestamptz,
  NULL,
  true,
  2
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '6b5478a3-2c8d-4471-87d8-4619668d3c52'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'registered'::public.registration_status,
  '2026-03-26 06:34:22.875191+00'::timestamptz,
  '2026-03-26 06:34:22.875191+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '6d8400b5-8080-4c07-92ef-7bac553033d4'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'registered'::public.registration_status,
  '2026-05-06 05:44:08.945704+00'::timestamptz,
  '2026-05-06 05:44:08.945704+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '6db11ec1-9515-4508-963d-cacd3c24e583'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 06:01:20.078575+00'::timestamptz,
  '2026-04-22 06:01:20.078575+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '6e68b5be-b20e-4178-ad49-5c7242e58671'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:25:59.98512+00'::timestamptz,
  '2026-04-23 05:25:59.98512+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '6eb798dd-d268-42b9-8fa9-cccc4a3f8e2e'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:26:17.96518+00'::timestamptz,
  '2026-04-23 05:26:17.96518+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '6fc2c794-8e81-4258-a07d-b33c906a7e22'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:25:30.72944+00'::timestamptz,
  '2026-04-23 05:25:30.72944+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '6fcc6523-22b0-4142-9e13-b3784539ddee'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 21:02:31.839912+00'::timestamptz,
  '2026-04-22 21:02:31.839912+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '7db0bd5f-3e25-4a9d-8ca9-205011029c8d'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:53:48.701284+00'::timestamptz,
  '2026-04-23 05:53:48.701284+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '7fdf7190-7a03-434a-b6de-7e8f0b5360de'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd0cfc4a6-3189-4365-b86c-b478dcadbf68'::uuid,
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::uuid,
  'registered'::public.registration_status,
  '2026-04-09 03:12:15.414202+00'::timestamptz,
  '2026-04-09 03:12:15.414202+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '92292547-d5f8-4d59-a5e8-a67d5d60a438'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd0cfc4a6-3189-4365-b86c-b478dcadbf68'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'registered'::public.registration_status,
  '2026-04-08 18:32:49.447224+00'::timestamptz,
  '2026-04-08 18:32:49.447224+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '9382bef8-4727-4416-8b8e-6912e744a4d7'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'waitlist'::public.registration_status,
  '2026-04-26 17:36:44.505703+00'::timestamptz,
  '2026-04-26 17:36:44.505703+00'::timestamptz,
  '2026-04-26 17:37:46.686446+00'::timestamptz,
  true,
  2
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '954e5e41-ff0e-4b4f-ae8b-928b4b1a9895'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  'registered'::public.registration_status,
  '2026-03-23 21:44:40.413104+00'::timestamptz,
  '2026-03-23 21:44:40.413104+00'::timestamptz,
  '2026-05-13 04:12:45.066798+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '98b42c5e-bb32-49ab-83e6-b23beb90bfbc'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'registered'::public.registration_status,
  '2026-03-25 19:04:35.614912+00'::timestamptz,
  '2026-03-25 19:04:35.614912+00'::timestamptz,
  '2026-05-13 05:26:52.984414+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '997d24f7-4872-4f42-bb18-8455efe3a705'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'waitlist'::public.registration_status,
  '2026-04-23 07:45:43.803505+00'::timestamptz,
  '2026-04-23 07:45:43.803505+00'::timestamptz,
  NULL,
  true,
  1
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'a24c8ce0-1f12-4488-a1d5-5e66a8cee3ec'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6'::uuid,
  'registered'::public.registration_status,
  '2026-05-10 13:01:07.404534+00'::timestamptz,
  '2026-05-10 13:01:07.404534+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'a367ce65-5d7f-4177-af3e-c4e800852675'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 07:15:04.435513+00'::timestamptz,
  '2026-04-23 07:15:04.435513+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'a3f07b43-63c8-4f29-a8f2-d613f1988c66'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:57:27.640796+00'::timestamptz,
  '2026-04-22 20:57:27.640796+00'::timestamptz,
  '2026-05-11 07:30:30.975717+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'a5748dfc-aef2-4157-9591-2152a3ecb073'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'registered'::public.registration_status,
  '2026-04-09 12:04:23.837026+00'::timestamptz,
  '2026-04-09 12:04:23.837026+00'::timestamptz,
  '2026-04-09 12:06:31.984741+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'a902441b-04e6-41bb-bcda-d405853a98a0'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 06:29:35.79532+00'::timestamptz,
  '2026-04-23 06:29:35.79532+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'ab7c7ada-2997-4586-8c72-05add0365bb7'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:36:32.354943+00'::timestamptz,
  '2026-04-22 20:36:32.354943+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'ab857b73-6ced-48c5-bb37-0fc594885076'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '51f56177-d67c-4b49-9154-009bcef0e046'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 05:30:36.814316+00'::timestamptz,
  '2026-04-22 05:30:36.814316+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'ac976ef1-acd0-42a2-acaf-d18bd09f548c'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd0cfc4a6-3189-4365-b86c-b478dcadbf68'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'registered'::public.registration_status,
  '2026-04-08 18:00:22.802583+00'::timestamptz,
  '2026-04-08 18:00:22.802583+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'ad3551e8-5c0c-4b49-984c-4afb6450d7dc'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:02:42.33331+00'::timestamptz,
  '2026-04-23 05:02:42.33331+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'af8b92c0-e146-4907-87ba-5d1d44fadffc'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:23:43.881345+00'::timestamptz,
  '2026-04-23 04:23:43.881345+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'b1e55fad-cad2-40d1-8059-d6281bf9a92f'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::uuid,
  'registered'::public.registration_status,
  '2026-05-11 19:25:15.361319+00'::timestamptz,
  '2026-05-11 19:25:15.361319+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'b8d3da43-6b02-48a7-8c21-5c1c936147fd'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:25:34.690813+00'::timestamptz,
  '2026-04-23 05:25:34.690813+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'bdc0d1c0-e188-49be-9a82-07323fb6e30b'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 07:14:49.630983+00'::timestamptz,
  '2026-04-23 07:14:49.630983+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'c66f278e-58e0-40e6-8db2-ea07868023d4'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 07:45:08.794486+00'::timestamptz,
  '2026-04-23 07:45:08.794486+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'c7dae917-ad4d-4996-a4ca-cfaa11a28cc2'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '51f56177-d67c-4b49-9154-009bcef0e046'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'registered'::public.registration_status,
  '2026-04-07 19:04:22.114586+00'::timestamptz,
  '2026-04-07 19:04:22.114586+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'cb21e650-0262-4e1e-ab16-22156a215c88'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:23:35.428447+00'::timestamptz,
  '2026-04-23 04:23:35.428447+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'cb4cc973-1445-4d5a-83e7-c73031b87a18'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  'waitlist'::public.registration_status,
  '2026-04-28 17:41:11.791354+00'::timestamptz,
  '2026-04-28 17:41:11.791354+00'::timestamptz,
  NULL,
  true,
  2
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'cc04284a-8302-4873-919a-5bf559432ce2'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 07:14:59.524425+00'::timestamptz,
  '2026-04-23 07:14:59.524425+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'cca66b3c-618f-4bc8-8b42-b3163ae61afe'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 06:29:20.617083+00'::timestamptz,
  '2026-04-23 06:29:20.617083+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'cd75524f-67b4-4bdd-a263-15271fe3a559'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:25:40.017698+00'::timestamptz,
  '2026-04-23 05:25:40.017698+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'cdd5f633-ec14-4245-ba3c-deaf19f1267c'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 08:23:40.146043+00'::timestamptz,
  '2026-04-23 08:23:40.146043+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'd04b4ce3-a005-4e25-8313-2f10bc5f5594'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '51f56177-d67c-4b49-9154-009bcef0e046'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  'registered'::public.registration_status,
  '2026-04-21 12:49:24.893561+00'::timestamptz,
  '2026-04-21 12:49:24.893561+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'd0e41ae4-3635-48fc-a670-4c8cbbe3e759'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '30045a46-204d-43e6-8d33-90c977df486f'::uuid,
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  'registered'::public.registration_status,
  '2026-04-28 17:41:29.355167+00'::timestamptz,
  '2026-04-28 17:41:29.355167+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'db2489d5-c29b-4a68-976b-0529ed42227c'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'registered'::public.registration_status,
  '2026-03-21 20:28:03.441427+00'::timestamptz,
  '2026-03-21 20:28:03.441427+00'::timestamptz,
  '2026-05-11 17:39:55.740735+00'::timestamptz,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'dd37500b-2924-4418-8f54-245fd469695a'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  'registered'::public.registration_status,
  '2026-05-05 06:14:54.6687+00'::timestamptz,
  '2026-05-05 06:14:54.6687+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'dd575164-47b0-4416-b06c-ea516ee9745c'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 07:14:36.169623+00'::timestamptz,
  '2026-04-23 07:14:36.169623+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'de616bc9-079e-4b9b-9fbd-4ffd14a146eb'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 04:00:46.4881+00'::timestamptz,
  '2026-04-23 04:00:46.4881+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'e035d3e7-52c0-4ecd-98c2-b5c55fd220ee'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'registered'::public.registration_status,
  '2026-03-15 16:29:32.477768+00'::timestamptz,
  '2026-03-15 16:29:32.477768+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'e17be49e-a39b-4c07-96fe-ab5b14bc55b5'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:51:54.761571+00'::timestamptz,
  '2026-04-23 05:51:54.761571+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'e5b39ca6-17b1-48f9-ad87-5ccedb6394f3'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'db98d548-8c2e-40ed-9ec4-c2120afbcd49'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:50:52.127827+00'::timestamptz,
  '2026-04-23 05:50:52.127827+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'e903b291-94d3-46da-88a3-091653fc25af'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:51:49.554714+00'::timestamptz,
  '2026-04-23 05:51:49.554714+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'e9b5df3e-77a2-4830-ba92-1037f5536ec6'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '85ad90eb-e21b-45ae-8d73-58038c502f73'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 05:25:26.065602+00'::timestamptz,
  '2026-04-23 05:25:26.065602+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'ed7d9df1-c5e2-4a9d-bf1a-f2674455d38e'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 21:02:39.838511+00'::timestamptz,
  '2026-04-22 21:02:39.838511+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'ee7886f3-b5c7-48f1-ae51-d4c3c4e435e0'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'registered'::public.registration_status,
  '2026-04-23 06:29:53.689864+00'::timestamptz,
  '2026-04-23 06:29:53.689864+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'ee9435af-cd34-46db-a1d2-132a26ad178c'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 21:18:37.154878+00'::timestamptz,
  '2026-04-22 21:18:37.154878+00'::timestamptz,
  NULL,
  false,
  NULL
);