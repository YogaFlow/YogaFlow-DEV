-- Yomita legacy import (generated)
-- tenant_id: 892370b8-49a1-4699-b480-2f722e4f9fe3
-- auth_csv: C:/Users/49178/Downloads/users_rows (2).csv
-- profiles_csv: C:/Users/49178/Downloads/users_rows (3).csv
-- courses_csv: C:/Users/49178/Downloads/courses_rows (1).csv
-- registrations_csv: C:/Users/49178/Downloads/registrations_rows (1).csv

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
  '2026-06-01 16:49:20.371999+00'::timestamptz,
  '2026-02-15 11:14:15.542171+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: lara.becker1985@gmail.com
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
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'authenticated',
  'authenticated',
  'lara.becker1985@gmail.com',
  '$2a$10$eyT55OhMf2qTMHew1FF3GeIqhpSQkAWDg4DWRT62PYQ4LSLCx9VRW',
  '2026-02-22 13:51:08.200018+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"aa8af330-e808-4e39-87a9-131aef59079a","city":"Neuss","email":"lara.becker1985@gmail.com","phone":"01779352228","street":"Grüner Weg","last_name":"Becker","first_name":"Lara","postal_code":"41468","house_number":"12A","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 13:51:08.117876+00'::timestamptz,
  '2026-05-29 13:12:08.330238+00'::timestamptz,
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
  '2026-05-29 13:12:08.330238+00'::timestamptz,
  '2026-02-22 13:51:08.217484+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: kirsten.schoenstein-nill1@currenta.biz
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
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'authenticated',
  'authenticated',
  'kirsten.schoenstein-nill1@currenta.biz',
  '$2a$10$z54sk9dgEPDDEyho5jNjO.MHMibGmXZIhhD2JgWw3N.lZLdmvL7f6',
  '2026-04-23 06:25:12.5882+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"ac7a314f-6903-47b8-9096-243d6b24842e","city":"Neuss","email":"kirsten.schoenstein-nill1@currenta.biz","phone":"015128974428","street":"Nixhütter Weg","last_name":"Nill","first_name":"Kirsten","postal_code":"41468","house_number":"56","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-04-23 06:25:12.50197+00'::timestamptz,
  '2026-06-01 07:42:21.250972+00'::timestamptz,
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
  '2026-06-01 07:42:21.250972+00'::timestamptz,
  '2026-05-26 11:25:56.764157+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: caroline.pusch@gmx.net
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
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'authenticated',
  'authenticated',
  'caroline.pusch@gmx.net',
  '$2a$10$eoKc4XuLI0Uubbpb.luG5.qLo0GXw/2c.5.7NhVo7pWlHDvCGMO8G',
  '2026-02-22 12:45:23.140916+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"c6377894-2826-4efe-84ff-2efeae0aed98","city":"Neuss","email":"caroline.pusch@gmx.net","phone":"00491608277292","street":"Fliederweg","last_name":"Pusch","first_name":"Caroline","postal_code":"41468","house_number":"35","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 12:45:23.121962+00'::timestamptz,
  '2026-05-31 15:12:39.719042+00'::timestamptz,
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
  '2026-05-31 15:12:39.719042+00'::timestamptz,
  '2026-05-26 15:37:08.643342+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: susafalken@gmx.net
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
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'authenticated',
  'authenticated',
  'susafalken@gmx.net',
  '$2a$10$mSk/tprazUy/KuCO./AtQOqAyv0xyqmWF5M8DAOkcIwb6RWn/CGIK',
  '2026-02-22 14:14:12.406846+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"c6e80666-7afb-40e7-922a-26ac14f43024","city":"Neuss","email":"susafalken@gmx.net","phone":"01738103509","street":"Lupinenstraße","last_name":"Falkenberg","first_name":"Susanne","postal_code":"41466","house_number":"53","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 14:14:12.346338+00'::timestamptz,
  '2026-05-14 11:14:14.712429+00'::timestamptz,
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
  '2026-05-14 11:14:14.712429+00'::timestamptz,
  '2026-02-22 14:14:12.425373+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: txxx@mail.de
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
  'd53d3b2d-b59b-4140-acc3-0d7f161565a7'::uuid,
  'authenticated',
  'authenticated',
  'txxx@mail.de',
  '$2a$10$6CmC2fuSaaoE92402hgk6.bQLvPcQ6qcJWxKy9fc9g8PNei.T.1Xu',
  '2026-01-23 12:18:54.49722+00'::timestamptz,
  '', '', '', '', '', '', '', '',
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

-- auth: juliusbne@gmail.com
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
  'd54ac880-4600-4e60-ba22-2b07c88ba0e0'::uuid,
  'authenticated',
  'authenticated',
  'juliusbne@gmail.com',
  '$2a$10$3.m637MaJo65sFgSa43TkOuVazgUD/JkgJDvNl5mnpzi.0ALMjc2a',
  '2026-02-23 14:30:33.389387+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"d54ac880-4600-4e60-ba22-2b07c88ba0e0","city":"Neuss","email":"juliusbne@gmail.com","phone":"01783226430","street":"Fliederweg ","last_name":"Blaschke","first_name":"Julius","postal_code":"41468","house_number":"40","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-23 14:30:33.269276+00'::timestamptz,
  '2026-06-02 18:59:01.593146+00'::timestamptz,
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
  '2026-06-02 18:59:01.593146+00'::timestamptz,
  '2026-06-02 18:59:01.533114+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: drealenk@gmail.com
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
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::uuid,
  'authenticated',
  'authenticated',
  'drealenk@gmail.com',
  '$2a$10$dEApptP0bMvYz1v78zRLSOkm51yyZZNQid9nXu05i1oNbXL9.jUT6',
  '2026-05-11 19:24:21.870344+00'::timestamptz,
  '', '', '', '', '', '', '', '',
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
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token,
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
  '', '', '', '', '', '', '', '',
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
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token,
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
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"e2d34978-a240-4e01-9794-1859b0e6ba29","city":"Neuss","email":"marianne_cremer@t-online.de","phone":"01721491133","street":"Haselweg","last_name":"Cremer","first_name":"Marianne","postal_code":"41468","house_number":"18","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-15 11:30:05.492655+00'::timestamptz,
  '2026-05-23 17:55:12.298767+00'::timestamptz,
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
  '2026-05-23 17:55:12.298767+00'::timestamptz,
  '2026-02-15 11:30:05.556236+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: antjebauer@hotmail.com
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
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'authenticated',
  'authenticated',
  'antjebauer@hotmail.com',
  '$2a$10$tvuCm39hxwu2.MkLy1htmeaYeJTcf3V7xZinC7eeJFWBNqLFE8myq',
  '2026-02-22 12:47:01.108889+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"e4a096c1-8fc5-4979-950f-89b90d986133","city":"Neuss","email":"antjebauer@hotmail.com","phone":"01777639292","street":"Fliederweg ","last_name":"Bauer","first_name":"Antje","postal_code":"41468","house_number":"30","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 12:47:01.099402+00'::timestamptz,
  '2026-06-02 06:20:15.457428+00'::timestamptz,
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
  '2026-06-02 06:20:15.457428+00'::timestamptz,
  '2026-03-11 22:32:34.353401+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: cursor-agent-1780221886@example.com
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
  'e7093d1f-c493-476c-add8-046b70d02965'::uuid,
  'authenticated',
  'authenticated',
  'cursor-agent-1780221886@example.com',
  '$2a$10$otp1yBERAfKEBCUdJcd/TuiGDqFQdIrHpj6t5Hqeeyo.Mj4SaWg4a',
  '2026-05-31 10:04:47.376811+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"e7093d1f-c493-476c-add8-046b70d02965","email":"cursor-agent-1780221886@example.com","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user","first_name":"","last_name":"","street":null,"house_number":null,"postal_code":null,"city":null,"phone":null}'::jsonb,
  '2026-05-31 10:04:47.282617+00'::timestamptz,
  '2026-05-31 10:06:47.087111+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'e7093d1f-c493-476c-add8-046b70d02965'::uuid,
  'e7093d1f-c493-476c-add8-046b70d02965'::uuid,
  'e7093d1f-c493-476c-add8-046b70d02965'::text,
  'email',
  jsonb_build_object('sub', 'e7093d1f-c493-476c-add8-046b70d02965', 'email', 'cursor-agent-1780221886@example.com', 'email_verified', true, 'phone_verified', false),
  '2026-05-31 10:04:47.282617+00'::timestamptz,
  '2026-05-31 10:06:47.087111+00'::timestamptz,
  '2026-05-31 10:06:47.023297+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: andrea.karnath@arcor.de
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
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'authenticated',
  'authenticated',
  'andrea.karnath@arcor.de',
  '$2a$10$Ip3f2SPxwIQxt51TqY3mG.147j34dbAvo2NpaE8u1ddleIMWOzJV6',
  '2026-02-02 10:25:42.280276+00'::timestamptz,
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"f63447c3-a2b4-4064-97fe-22428a032a2d","city":"Neuss","email":"andrea.karnath@arcor.de","phone":"01781682285","street":"Pliniusweg ","last_name":"Karnath ","first_name":"Andrea ","postal_code":"41464","house_number":"46","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-02 10:25:42.191777+00'::timestamptz,
  '2026-05-19 08:13:25.34337+00'::timestamptz,
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
  '2026-05-19 08:13:25.34337+00'::timestamptz,
  '2026-04-11 21:16:50.020378+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: spollotzek@web.de
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
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'authenticated',
  'authenticated',
  'spollotzek@web.de',
  '$2a$10$4R1L0h0GS9rIENb.xDJFcuD9INpx1trRCeg/6EUclMsEiY4igcI6C',
  '2026-02-22 15:52:19.073635+00'::timestamptz,
  '', '', '', '', '', '', '', '',
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
  confirmation_token, recovery_token, email_change_token_new,
  email_change, email_change_token_current, reauthentication_token,
  phone_change, phone_change_token,
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
  '', '', '', '', '', '', '', '',
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub":"fac5a9c9-0dc1-427c-aab4-db097ab8fa16","city":"Neuss","email":"elke.leven@arcor.de","phone":"01794959236","street":"Melissenstraße ","last_name":"Leven","first_name":"Elke","postal_code":"41466","house_number":"1","email_verified":true,"phone_verified":false,"tenant_id":"892370b8-49a1-4699-b480-2f722e4f9fe3","role":"user"}'::jsonb,
  '2026-02-22 12:41:58.686075+00'::timestamptz,
  '2026-05-28 13:57:55.313827+00'::timestamptz,
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
  '2026-05-28 13:57:55.313827+00'::timestamptz,
  '2026-02-22 12:41:58.765788+00'::timestamptz
) ON CONFLICT (id) DO NOTHING;

-- auth: andrethaller@icloud.de
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
  'ffd06ae6-242c-4ea2-a5a5-76f219740548'::uuid,
  'authenticated',
  'authenticated',
  'andrethaller@icloud.de',
  '$2a$10$3K5xtlGaQcAM07AOOX4iA.8oGd.h9eNlBvR8Ifj/djOFoaZ8bKn8q',
  '2026-02-06 13:26:14.294605+00'::timestamptz,
  '', '', '', '', '', '', '', '',
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
