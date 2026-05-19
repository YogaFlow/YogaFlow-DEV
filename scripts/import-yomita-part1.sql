ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;

INSERT INTO public.tenants (id, name, slug) VALUES ('ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid, 'Yomita', 'yomita');

-- auth: stefanie.neck@web.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-05-10 13:00:38.072024+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "0b0fcce2-15cc-4c06-bd84-129d3b35d7d6", "city": "Grevenbroich", "email": "stefanie.neck@web.de", "phone": "1739223711", "street": "Am Reiherbusch", "last_name": "Neck", "first_name": "Stefanie", "postal_code": "41516", "house_number": "12a", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-05-10 13:00:37.976273+00'::timestamptz,
  '2026-05-10 13:00:38.131645+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6'::uuid,
  '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6'::uuid,
  '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6'::text,
  'email',
  jsonb_build_object(
    'sub', '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6',
    'email', 'stefanie.neck@web.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'stefanie.neck@web.de',
  '2026-05-10 13:00:37.976273+00'::timestamptz,
  '2026-05-10 13:00:38.131645+00'::timestamptz,
  '2026-05-10 13:00:38.091401+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '0b0fcce2-15cc-4c06-bd84-129d3b35d7d6'::uuid,
  'stefanie.neck@web.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Stefanie',
  'Neck',
  'Am Reiherbusch',
  '12a',
  '41516',
  'Grevenbroich',
  '1739223711',
  true,
  '2026-05-10 13:00:37.972521+00'::timestamptz,
  true,
  '2026-05-10 13:00:38.072024+00'::timestamptz,
  '2026-05-10 13:00:37.972521+00'::timestamptz,
  '2026-05-10 13:00:37.972521+00'::timestamptz
);

-- auth: gajansen@web.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-22 17:41:15.620699+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "17b9d410-e078-4014-aa4f-5c16e678042b", "city": "Neuss", "email": "gajansen@web.de", "phone": "01727455771", "street": "Dunantstrasse ", "last_name": "Jansen", "first_name": "Gabriele", "postal_code": "41468", "house_number": "21", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-22 17:41:15.525688+00'::timestamptz,
  '2026-05-13 04:11:54.674331+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  '17b9d410-e078-4014-aa4f-5c16e678042b'::text,
  'email',
  jsonb_build_object(
    'sub', '17b9d410-e078-4014-aa4f-5c16e678042b',
    'email', 'gajansen@web.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'gajansen@web.de',
  '2026-02-22 17:41:15.525688+00'::timestamptz,
  '2026-05-13 04:11:54.674331+00'::timestamptz,
  '2026-02-22 17:41:15.644161+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  'gajansen@web.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Gabriele',
  'Jansen',
  'Dunantstrasse ',
  '21',
  '41468',
  'Neuss',
  '01727455771',
  true,
  '2026-02-22 17:41:15.524167+00'::timestamptz,
  true,
  '2026-02-22 17:41:15.620699+00'::timestamptz,
  '2026-02-22 17:41:15.524167+00'::timestamptz,
  '2026-02-22 17:41:15.524167+00'::timestamptz
);

-- auth: tanja@die-thallers.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-01-22 18:01:27.666288+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "2ef0b4bf-69da-480e-9533-2bdf162dfc18", "email": "tanja@die-thallers.de", "last_name": "Thaller", "first_name": "Tanja", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-01-22 18:01:27.545962+00'::timestamptz,
  '2026-05-13 08:39:09.786816+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::text,
  'email',
  jsonb_build_object(
    'sub', '2ef0b4bf-69da-480e-9533-2bdf162dfc18',
    'email', 'tanja@die-thallers.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'tanja@die-thallers.de',
  '2026-01-22 18:01:27.545962+00'::timestamptz,
  '2026-05-13 08:39:09.786816+00'::timestamptz,
  '2026-05-13 08:39:09.736143+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'tanja@die-thallers.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'owner',
  'Tanja',
  'Thaller',
  'Holunderweg',
  '6',
  '41468',
  'Neuss',
  '015209464468',
  true,
  '2026-01-22 18:01:27.734+00'::timestamptz,
  true,
  '2026-01-22 18:01:27.666288+00'::timestamptz,
  '2026-01-22 18:01:27.541951+00'::timestamptz,
  '2026-01-22 18:01:28.068409+00'::timestamptz
);

-- auth: heike.huesgen@web.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-04 19:49:34.152624+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "2f65224e-8ee1-4442-a9b5-56142d1f9413", "city": "Neuss", "email": "heike.huesgen@web.de", "phone": "01729374125", "street": "Konradstraße", "last_name": "Hüsgen ", "first_name": "Heike", "postal_code": "41468", "house_number": "7", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-04 19:49:34.117608+00'::timestamptz,
  '2026-04-22 21:54:11.320038+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::text,
  'email',
  jsonb_build_object(
    'sub', '2f65224e-8ee1-4442-a9b5-56142d1f9413',
    'email', 'heike.huesgen@web.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'heike.huesgen@web.de',
  '2026-02-04 19:49:34.117608+00'::timestamptz,
  '2026-04-22 21:54:11.320038+00'::timestamptz,
  '2026-03-02 13:39:36.581933+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  'heike.huesgen@web.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Heike',
  'Hüsgen ',
  'Konradstraße',
  '7',
  '41468',
  'Neuss',
  '01729374125',
  true,
  '2026-02-04 19:49:34.115335+00'::timestamptz,
  true,
  '2026-02-04 19:49:34.152624+00'::timestamptz,
  '2026-02-04 19:49:34.115335+00'::timestamptz,
  '2026-02-04 19:49:34.115335+00'::timestamptz
);

-- auth: neuetafel@aol.com
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-23 11:17:54.746422+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "30eef8e2-74b1-410a-b1de-decf7d376866", "city": "Neuss", "email": "neuetafel@aol.com", "phone": "01764886497", "street": "Schlehenweg ", "last_name": "Tafel", "first_name": "Sabine ", "postal_code": "41468", "house_number": "10", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-23 11:17:54.623072+00'::timestamptz,
  '2026-04-26 17:32:11.841092+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::text,
  'email',
  jsonb_build_object(
    'sub', '30eef8e2-74b1-410a-b1de-decf7d376866',
    'email', 'neuetafel@aol.com',
    'email_verified', true,
    'phone_verified', false
  ),
  'neuetafel@aol.com',
  '2026-02-23 11:17:54.623072+00'::timestamptz,
  '2026-04-26 17:32:11.841092+00'::timestamptz,
  '2026-04-26 17:32:11.801463+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'neuetafel@aol.com',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Sabine ',
  'Tafel',
  'Schlehenweg ',
  '10',
  '41468',
  'Neuss',
  '01764886497',
  true,
  '2026-02-23 11:17:54.620225+00'::timestamptz,
  true,
  '2026-02-23 11:17:54.746422+00'::timestamptz,
  '2026-02-23 11:17:54.620225+00'::timestamptz,
  '2026-02-23 11:17:54.620225+00'::timestamptz
);

-- auth: katy-albrecht@t-online.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-03-27 07:46:29.759115+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "3c7289d8-b471-4b29-8877-abaee929764e", "city": "Düsseldorf ", "email": "katy-albrecht@t-online.de", "phone": "17664807595", "street": "Kleverst", "last_name": "Albrecht", "first_name": "Katy", "postal_code": "40477", "house_number": "64", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-03-27 07:46:29.69746+00'::timestamptz,
  '2026-03-27 11:02:31.131231+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '3c7289d8-b471-4b29-8877-abaee929764e'::uuid,
  '3c7289d8-b471-4b29-8877-abaee929764e'::uuid,
  '3c7289d8-b471-4b29-8877-abaee929764e'::text,
  'email',
  jsonb_build_object(
    'sub', '3c7289d8-b471-4b29-8877-abaee929764e',
    'email', 'katy-albrecht@t-online.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'katy-albrecht@t-online.de',
  '2026-03-27 07:46:29.69746+00'::timestamptz,
  '2026-03-27 11:02:31.131231+00'::timestamptz,
  '2026-03-27 07:46:29.771778+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '3c7289d8-b471-4b29-8877-abaee929764e'::uuid,
  'katy-albrecht@t-online.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Katy',
  'Albrecht',
  'Kleverst',
  '64',
  '40477',
  'Düsseldorf ',
  '17664807595',
  true,
  '2026-03-27 07:46:29.695314+00'::timestamptz,
  true,
  '2026-03-27 07:46:29.759115+00'::timestamptz,
  '2026-03-27 07:46:29.695314+00'::timestamptz,
  '2026-03-27 07:46:29.695314+00'::timestamptz
);

-- auth: kathrin.hutmacher@gmx.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-02 17:49:49.863149+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "47b11b34-6853-49e7-8006-4b2009ff711b", "city": "Neuss", "email": "kathrin.hutmacher@gmx.de", "phone": "015229712228", "street": "Hochstr", "last_name": "Päßler ", "first_name": "Kathrin ", "postal_code": "41460", "house_number": "13", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-02 17:49:49.74797+00'::timestamptz,
  '2026-04-28 17:39:38.197791+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  '47b11b34-6853-49e7-8006-4b2009ff711b'::text,
  'email',
  jsonb_build_object(
    'sub', '47b11b34-6853-49e7-8006-4b2009ff711b',
    'email', 'kathrin.hutmacher@gmx.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'kathrin.hutmacher@gmx.de',
  '2026-02-02 17:49:49.74797+00'::timestamptz,
  '2026-04-28 17:39:38.197791+00'::timestamptz,
  '2026-02-17 12:50:18.029332+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  'kathrin.hutmacher@gmx.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Kathrin ',
  'Päßler ',
  'Hochstr',
  '13',
  '41460',
  'Neuss',
  '015229712228',
  true,
  '2026-02-02 17:49:49.745736+00'::timestamptz,
  true,
  '2026-02-02 17:49:49.863149+00'::timestamptz,
  '2026-02-02 17:49:49.745736+00'::timestamptz,
  '2026-02-02 17:49:49.745736+00'::timestamptz
);

-- auth: anne1104@gmx.net
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-15 11:20:50.601013+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "4b249308-86e6-4fab-942f-a36e787534a7", "city": "Meerbusch ", "email": "anne1104@gmx.net", "phone": "01772991649", "street": "Nordstr. ", "last_name": "Jung", "first_name": "Anne-Katrin ", "postal_code": "40667", "house_number": "79", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-15 11:20:50.576121+00'::timestamptz,
  '2026-05-12 19:49:45.168593+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  '4b249308-86e6-4fab-942f-a36e787534a7'::text,
  'email',
  jsonb_build_object(
    'sub', '4b249308-86e6-4fab-942f-a36e787534a7',
    'email', 'anne1104@gmx.net',
    'email_verified', true,
    'phone_verified', false
  ),
  'anne1104@gmx.net',
  '2026-02-15 11:20:50.576121+00'::timestamptz,
  '2026-05-12 19:49:45.168593+00'::timestamptz,
  '2026-05-12 19:49:45.097522+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '4b249308-86e6-4fab-942f-a36e787534a7'::uuid,
  'anne1104@gmx.net',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Anne-Katrin ',
  'Jung',
  'Nordstr. ',
  '79',
  '40667',
  'Meerbusch ',
  '01772991649',
  true,
  '2026-02-15 11:20:50.57515+00'::timestamptz,
  true,
  '2026-02-15 11:20:50.601013+00'::timestamptz,
  '2026-02-15 11:20:50.57515+00'::timestamptz,
  '2026-02-15 11:20:50.57515+00'::timestamptz
);

-- auth: kirsten.nill@yahoo.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-22 12:47:16.427619+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "570d3b6c-7220-4f35-a867-25eca400b2d4", "city": "Neuss", "email": "kirsten.nill@yahoo.de", "phone": "015128974428", "street": "Nixhütter Weg ", "last_name": "Nill", "first_name": "Kirsten", "postal_code": "41468", "house_number": "56", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-22 12:47:16.422327+00'::timestamptz,
  '2026-04-23 06:04:48.931724+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::uuid,
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::uuid,
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::text,
  'email',
  jsonb_build_object(
    'sub', '570d3b6c-7220-4f35-a867-25eca400b2d4',
    'email', 'kirsten.nill@yahoo.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'kirsten.nill@yahoo.de',
  '2026-02-22 12:47:16.422327+00'::timestamptz,
  '2026-04-23 06:04:48.931724+00'::timestamptz,
  '2026-04-23 06:04:48.815939+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '570d3b6c-7220-4f35-a867-25eca400b2d4'::uuid,
  'kirsten.nill@yahoo.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Kirsten',
  'Nill',
  'Nixhütter Weg ',
  '56',
  '41468',
  'Neuss',
  '015128974428',
  true,
  '2026-02-22 12:47:16.421961+00'::timestamptz,
  true,
  '2026-02-22 12:47:16.427619+00'::timestamptz,
  '2026-02-22 12:47:16.421961+00'::timestamptz,
  '2026-02-22 12:47:16.421961+00'::timestamptz
);

-- auth: nahidnadjafi@gmx.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-23 11:45:33.685807+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "65012a0a-cc60-4c73-890f-46a9740c4c52", "city": "Neuss", "email": "nahidnadjafi@gmx.de", "phone": "01731373333", "street": "Pliniusweg ", "last_name": "Nadjafi", "first_name": "Nahid", "postal_code": "41464", "house_number": "36", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-23 11:45:33.651754+00'::timestamptz,
  '2026-05-11 15:37:54.76548+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::text,
  'email',
  jsonb_build_object(
    'sub', '65012a0a-cc60-4c73-890f-46a9740c4c52',
    'email', 'nahidnadjafi@gmx.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'nahidnadjafi@gmx.de',
  '2026-02-23 11:45:33.651754+00'::timestamptz,
  '2026-05-11 15:37:54.76548+00'::timestamptz,
  '2026-04-23 05:49:16.48312+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  'nahidnadjafi@gmx.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Nahid',
  'Nadjafi',
  'Pliniusweg ',
  '36',
  '41464',
  'Neuss',
  '01731373333',
  true,
  '2026-02-23 11:45:33.64907+00'::timestamptz,
  true,
  '2026-02-23 11:45:33.685807+00'::timestamptz,
  '2026-02-23 11:45:33.64907+00'::timestamptz,
  '2026-02-23 11:45:33.64907+00'::timestamptz
);

-- auth: andre@die-thallers.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-01-23 12:54:41.125276+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "6cbcbb0d-02cd-4d88-b44e-9e63a2247242", "city": "Neuss", "email": "andre@die-thallers.de", "phone": "015734673729", "street": "Holunderweg", "last_name": "Thaller", "first_name": "André", "postal_code": "41468", "house_number": "6", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-01-23 12:54:41.086439+00'::timestamptz,
  '2026-01-23 18:56:29.064882+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '6cbcbb0d-02cd-4d88-b44e-9e63a2247242'::uuid,
  '6cbcbb0d-02cd-4d88-b44e-9e63a2247242'::uuid,
  '6cbcbb0d-02cd-4d88-b44e-9e63a2247242'::text,
  'email',
  jsonb_build_object(
    'sub', '6cbcbb0d-02cd-4d88-b44e-9e63a2247242',
    'email', 'andre@die-thallers.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'andre@die-thallers.de',
  '2026-01-23 12:54:41.086439+00'::timestamptz,
  '2026-01-23 18:56:29.064882+00'::timestamptz,
  '2026-01-23 18:56:29.059359+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '6cbcbb0d-02cd-4d88-b44e-9e63a2247242'::uuid,
  'andre@die-thallers.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'André',
  'Thaller',
  'Holunderweg',
  '6',
  '41468',
  'Neuss',
  '015734673729',
  true,
  '2026-01-23 12:54:41.086075+00'::timestamptz,
  true,
  '2026-01-23 12:54:41.125276+00'::timestamptz,
  '2026-01-23 12:54:41.086075+00'::timestamptz,
  '2026-02-06 13:24:52.35908+00'::timestamptz
);

-- auth: nicola.schnitzler@sid-marketing.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-02 10:09:16.885751+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "767daf20-2720-461a-a1ba-2c84de4693ae", "city": "Neuss", "email": "nicola.schnitzler@sid-marketing.de", "phone": "01704406924", "street": "Hagebuttenweg", "last_name": "Schnitzler", "first_name": "Schnitzler", "postal_code": "41468", "house_number": "2", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-02 10:09:16.791749+00'::timestamptz,
  '2026-05-12 05:46:20.379774+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  '767daf20-2720-461a-a1ba-2c84de4693ae'::text,
  'email',
  jsonb_build_object(
    'sub', '767daf20-2720-461a-a1ba-2c84de4693ae',
    'email', 'nicola.schnitzler@sid-marketing.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'nicola.schnitzler@sid-marketing.de',
  '2026-02-02 10:09:16.791749+00'::timestamptz,
  '2026-05-12 05:46:20.379774+00'::timestamptz,
  '2026-02-02 10:09:16.908718+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '767daf20-2720-461a-a1ba-2c84de4693ae'::uuid,
  'nicola.schnitzler@sid-marketing.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Nicola',
  'Schnitzler',
  'Hagebuttenweg',
  '2',
  '41468',
  'Neuss',
  '01704406924',
  true,
  '2026-02-02 10:09:16.790482+00'::timestamptz,
  true,
  '2026-02-02 10:09:16.885751+00'::timestamptz,
  '2026-02-02 10:09:16.790482+00'::timestamptz,
  '2026-02-02 10:16:01.010769+00'::timestamptz
);

-- auth: irene.meyers@online.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-03 21:03:53.717326+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc", "city": "Neuss", "email": "irene.meyers@online.de", "phone": "015209897377", "street": "Gagelweg", "last_name": "Meyers", "first_name": "Irene", "postal_code": "41468", "house_number": "17", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-03 21:03:53.603835+00'::timestamptz,
  '2026-05-06 18:02:38.596886+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::text,
  'email',
  jsonb_build_object(
    'sub', '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc',
    'email', 'irene.meyers@online.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'irene.meyers@online.de',
  '2026-02-03 21:03:53.603835+00'::timestamptz,
  '2026-05-06 18:02:38.596886+00'::timestamptz,
  '2026-02-03 21:03:53.740324+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '7f3ddc2d-78f9-4cf8-a318-4fed234cb7cc'::uuid,
  'irene.meyers@online.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Irene',
  'Meyers',
  'Gagelweg',
  '17',
  '41468',
  'Neuss',
  '015209897377',
  true,
  '2026-02-03 21:03:53.602208+00'::timestamptz,
  true,
  '2026-02-03 21:03:53.717326+00'::timestamptz,
  '2026-02-03 21:03:53.602208+00'::timestamptz,
  '2026-02-03 21:03:53.602208+00'::timestamptz
);

-- auth: volkervonderohe@yahoo.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-05-06 06:14:34.542568+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "974cc271-26c9-4f96-a194-453cc61ac93f", "city": "Neuss", "email": "volkervonderohe@yahoo.de", "phone": "01795718397", "street": "Holunderweg", "last_name": "von der Ohe", "first_name": "Barbara", "postal_code": "41468", "house_number": "6a", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-05-06 06:14:34.460549+00'::timestamptz,
  '2026-05-06 06:14:34.603959+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  '974cc271-26c9-4f96-a194-453cc61ac93f'::uuid,
  '974cc271-26c9-4f96-a194-453cc61ac93f'::uuid,
  '974cc271-26c9-4f96-a194-453cc61ac93f'::text,
  'email',
  jsonb_build_object(
    'sub', '974cc271-26c9-4f96-a194-453cc61ac93f',
    'email', 'volkervonderohe@yahoo.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'volkervonderohe@yahoo.de',
  '2026-05-06 06:14:34.460549+00'::timestamptz,
  '2026-05-06 06:14:34.603959+00'::timestamptz,
  '2026-05-06 06:14:34.562768+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  '974cc271-26c9-4f96-a194-453cc61ac93f'::uuid,
  'volkervonderohe@yahoo.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Barbara',
  'von der Ohe',
  'Holunderweg',
  '6a',
  '41468',
  'Neuss',
  '01795718397',
  true,
  '2026-05-06 06:14:34.460198+00'::timestamptz,
  true,
  '2026-05-06 06:14:34.542568+00'::timestamptz,
  '2026-05-06 06:14:34.460198+00'::timestamptz,
  '2026-05-06 06:14:34.460198+00'::timestamptz
);

-- auth: akoehler4@gmx.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-15 11:14:15.524363+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "a3856216-c52c-41e3-9d61-2c20bcdb02ab", "city": "Neuss", "email": "akoehler4@gmx.de", "phone": "01794610499", "street": "Weissdornweg ", "last_name": "Köhler", "first_name": "Andrea", "postal_code": "41468", "house_number": "22", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-15 11:14:15.428418+00'::timestamptz,
  '2026-05-12 15:21:58.234962+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::text,
  'email',
  jsonb_build_object(
    'sub', 'a3856216-c52c-41e3-9d61-2c20bcdb02ab',
    'email', 'akoehler4@gmx.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'akoehler4@gmx.de',
  '2026-02-15 11:14:15.428418+00'::timestamptz,
  '2026-05-12 15:21:58.234962+00'::timestamptz,
  '2026-02-15 11:14:15.542171+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'akoehler4@gmx.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Andrea',
  'Köhler',
  'Weissdornweg ',
  '22',
  '41468',
  'Neuss',
  '01794610499',
  true,
  '2026-02-15 11:14:15.428093+00'::timestamptz,
  true,
  '2026-02-15 11:14:15.524363+00'::timestamptz,
  '2026-02-15 11:14:15.428093+00'::timestamptz,
  '2026-02-15 11:14:15.428093+00'::timestamptz
);

-- auth: lara.becker1985@gmail.com
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-22 13:51:08.200018+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "aa8af330-e808-4e39-87a9-131aef59079a", "city": "Neuss", "email": "lara.becker1985@gmail.com", "phone": "01779352228", "street": "Grüner Weg", "last_name": "Becker", "first_name": "Lara", "postal_code": "41468", "house_number": "12A", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-22 13:51:08.117876+00'::timestamptz,
  '2026-04-24 07:39:38.4047+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'aa8af330-e808-4e39-87a9-131aef59079a'::text,
  'email',
  jsonb_build_object(
    'sub', 'aa8af330-e808-4e39-87a9-131aef59079a',
    'email', 'lara.becker1985@gmail.com',
    'email_verified', true,
    'phone_verified', false
  ),
  'lara.becker1985@gmail.com',
  '2026-02-22 13:51:08.117876+00'::timestamptz,
  '2026-04-24 07:39:38.4047+00'::timestamptz,
  '2026-02-22 13:51:08.217484+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'aa8af330-e808-4e39-87a9-131aef59079a'::uuid,
  'lara.becker1985@gmail.com',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Lara',
  'Becker',
  'Grüner Weg',
  '12A',
  '41468',
  'Neuss',
  '01779352228',
  true,
  '2026-02-22 13:51:08.116973+00'::timestamptz,
  true,
  '2026-02-22 13:51:08.200018+00'::timestamptz,
  '2026-02-22 13:51:08.116973+00'::timestamptz,
  '2026-02-22 13:51:08.116973+00'::timestamptz
);

-- auth: kirsten.schoenstein-nill1@currenta.biz
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-04-23 06:25:12.5882+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "ac7a314f-6903-47b8-9096-243d6b24842e", "city": "Neuss", "email": "kirsten.schoenstein-nill1@currenta.biz", "phone": "015128974428", "street": "Nixhütter Weg", "last_name": "Nill", "first_name": "Kirsten", "postal_code": "41468", "house_number": "56", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-04-23 06:25:12.50197+00'::timestamptz,
  '2026-05-01 05:45:09.696909+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::text,
  'email',
  jsonb_build_object(
    'sub', 'ac7a314f-6903-47b8-9096-243d6b24842e',
    'email', 'kirsten.schoenstein-nill1@currenta.biz',
    'email_verified', true,
    'phone_verified', false
  ),
  'kirsten.schoenstein-nill1@currenta.biz',
  '2026-04-23 06:25:12.50197+00'::timestamptz,
  '2026-05-01 05:45:09.696909+00'::timestamptz,
  '2026-04-23 09:10:06.195519+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'kirsten.schoenstein-nill1@currenta.biz',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Kirsten',
  'Nill',
  'Nixhütter Weg',
  '56',
  '41468',
  'Neuss',
  '015128974428',
  true,
  '2026-04-23 06:25:12.501605+00'::timestamptz,
  true,
  '2026-04-23 06:25:12.5882+00'::timestamptz,
  '2026-04-23 06:25:12.501605+00'::timestamptz,
  '2026-04-23 06:25:12.501605+00'::timestamptz
);

-- auth: caroline.pusch@gmx.net
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-22 12:45:23.140916+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "c6377894-2826-4efe-84ff-2efeae0aed98", "city": "Neuss", "email": "caroline.pusch@gmx.net", "phone": "00491608277292", "street": "Fliederweg", "last_name": "Pusch", "first_name": "Caroline", "postal_code": "41468", "house_number": "35", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-22 12:45:23.121962+00'::timestamptz,
  '2026-05-04 14:29:47.586242+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::text,
  'email',
  jsonb_build_object(
    'sub', 'c6377894-2826-4efe-84ff-2efeae0aed98',
    'email', 'caroline.pusch@gmx.net',
    'email_verified', true,
    'phone_verified', false
  ),
  'caroline.pusch@gmx.net',
  '2026-02-22 12:45:23.121962+00'::timestamptz,
  '2026-05-04 14:29:47.586242+00'::timestamptz,
  '2026-02-22 12:45:23.145177+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'caroline.pusch@gmx.net',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Caroline',
  'Pusch',
  'Fliederweg',
  '35',
  '41468',
  'Neuss',
  '00491608277292',
  true,
  '2026-02-22 12:45:23.1216+00'::timestamptz,
  true,
  '2026-02-22 12:45:23.140916+00'::timestamptz,
  '2026-02-22 12:45:23.1216+00'::timestamptz,
  '2026-02-22 12:45:23.1216+00'::timestamptz
);

-- auth: susafalken@gmx.net
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-22 14:14:12.406846+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "c6e80666-7afb-40e7-922a-26ac14f43024", "city": "Neuss", "email": "susafalken@gmx.net", "phone": "01738103509", "street": "Lupinenstraße", "last_name": "Falkenberg", "first_name": "Susanne", "postal_code": "41466", "house_number": "53", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-22 14:14:12.346338+00'::timestamptz,
  '2026-05-13 05:19:11.85606+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'c6e80666-7afb-40e7-922a-26ac14f43024'::text,
  'email',
  jsonb_build_object(
    'sub', 'c6e80666-7afb-40e7-922a-26ac14f43024',
    'email', 'susafalken@gmx.net',
    'email_verified', true,
    'phone_verified', false
  ),
  'susafalken@gmx.net',
  '2026-02-22 14:14:12.346338+00'::timestamptz,
  '2026-05-13 05:19:11.85606+00'::timestamptz,
  '2026-02-22 14:14:12.425373+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'susafalken@gmx.net',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Susanne',
  'Falkenberg',
  'Lupinenstraße',
  '53',
  '41466',
  'Neuss',
  '01738103509',
  true,
  '2026-02-22 14:14:12.345424+00'::timestamptz,
  true,
  '2026-02-22 14:14:12.406846+00'::timestamptz,
  '2026-02-22 14:14:12.345424+00'::timestamptz,
  '2026-02-22 14:14:12.345424+00'::timestamptz
);

-- auth: txxx@mail.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-01-23 12:18:54.49722+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "d53d3b2d-b59b-4140-acc3-0d7f161565a7", "city": "Neuss", "email": "txxx@mail.de", "phone": "02131123456", "street": "Holunderweg", "last_name": "Thaller", "first_name": "Test", "postal_code": "41468", "house_number": "6", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-01-23 12:18:54.440442+00'::timestamptz,
  '2026-01-23 22:59:42.848966+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'd53d3b2d-b59b-4140-acc3-0d7f161565a7'::uuid,
  'd53d3b2d-b59b-4140-acc3-0d7f161565a7'::uuid,
  'd53d3b2d-b59b-4140-acc3-0d7f161565a7'::text,
  'email',
  jsonb_build_object(
    'sub', 'd53d3b2d-b59b-4140-acc3-0d7f161565a7',
    'email', 'txxx@mail.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'txxx@mail.de',
  '2026-01-23 12:18:54.440442+00'::timestamptz,
  '2026-01-23 22:59:42.848966+00'::timestamptz,
  '2026-01-23 22:59:42.844136+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'd53d3b2d-b59b-4140-acc3-0d7f161565a7'::uuid,
  'txxx@mail.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Test',
  'Thaller',
  'Holunderweg',
  '6',
  '41468',
  'Neuss',
  '02131123456',
  true,
  '2026-01-23 12:18:54.440065+00'::timestamptz,
  true,
  '2026-01-23 12:18:54.49722+00'::timestamptz,
  '2026-01-23 12:18:54.440065+00'::timestamptz,
  '2026-01-23 12:23:32.719303+00'::timestamptz
);

-- auth: drealenk@gmail.com
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-05-11 19:24:21.870344+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "d7e35357-4209-4429-8ecb-86cea5255fc9", "city": "Grevenbroich", "email": "drealenk@gmail.com", "phone": "015174230936", "street": "Brombergestrasse ", "last_name": "Schmitz", "first_name": "Andrea ", "postal_code": "41516", "house_number": "15", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-05-11 19:24:21.767588+00'::timestamptz,
  '2026-05-12 21:25:27.727341+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::uuid,
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::uuid,
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::text,
  'email',
  jsonb_build_object(
    'sub', 'd7e35357-4209-4429-8ecb-86cea5255fc9',
    'email', 'drealenk@gmail.com',
    'email_verified', true,
    'phone_verified', false
  ),
  'drealenk@gmail.com',
  '2026-05-11 19:24:21.767588+00'::timestamptz,
  '2026-05-12 21:25:27.727341+00'::timestamptz,
  '2026-05-11 19:24:21.89286+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'd7e35357-4209-4429-8ecb-86cea5255fc9'::uuid,
  'drealenk@gmail.com',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Andrea ',
  'Schmitz',
  'Brombergestrasse ',
  '15',
  '41516',
  'Grevenbroich',
  '015174230936',
  true,
  '2026-05-11 19:24:21.765776+00'::timestamptz,
  true,
  '2026-05-11 19:24:21.870344+00'::timestamptz,
  '2026-05-11 19:24:21.765776+00'::timestamptz,
  '2026-05-11 19:24:21.765776+00'::timestamptz
);

-- auth: eva.neumeister@gmx.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-22 15:21:03.40386+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "df756576-1390-4e27-a37c-1ee086061a16", "city": "Neuss", "email": "eva.neumeister@gmx.de", "phone": "015776455801", "street": "Gagelweg", "last_name": "Vosdellen ", "first_name": "Eva ", "postal_code": "41468", "house_number": "22", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-22 15:21:03.323085+00'::timestamptz,
  '2026-05-04 17:13:43.683323+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'df756576-1390-4e27-a37c-1ee086061a16'::text,
  'email',
  jsonb_build_object(
    'sub', 'df756576-1390-4e27-a37c-1ee086061a16',
    'email', 'eva.neumeister@gmx.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'eva.neumeister@gmx.de',
  '2026-02-22 15:21:03.323085+00'::timestamptz,
  '2026-05-04 17:13:43.683323+00'::timestamptz,
  '2026-02-22 15:21:03.420312+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'df756576-1390-4e27-a37c-1ee086061a16'::uuid,
  'eva.neumeister@gmx.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Eva ',
  'Vosdellen ',
  'Gagelweg',
  '22',
  '41468',
  'Neuss',
  '015776455801',
  true,
  '2026-02-22 15:21:03.322744+00'::timestamptz,
  true,
  '2026-02-22 15:21:03.40386+00'::timestamptz,
  '2026-02-22 15:21:03.322744+00'::timestamptz,
  '2026-02-22 15:21:03.322744+00'::timestamptz
);

-- auth: marianne_cremer@t-online.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-15 11:30:05.545982+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "e2d34978-a240-4e01-9794-1859b0e6ba29", "city": "Neuss", "email": "marianne_cremer@t-online.de", "phone": "01721491133", "street": "Haselweg", "last_name": "Cremer", "first_name": "Marianne", "postal_code": "41468", "house_number": "18", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-15 11:30:05.492655+00'::timestamptz,
  '2026-04-23 05:51:33.217709+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::text,
  'email',
  jsonb_build_object(
    'sub', 'e2d34978-a240-4e01-9794-1859b0e6ba29',
    'email', 'marianne_cremer@t-online.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'marianne_cremer@t-online.de',
  '2026-02-15 11:30:05.492655+00'::timestamptz,
  '2026-04-23 05:51:33.217709+00'::timestamptz,
  '2026-02-15 11:30:05.556236+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'marianne_cremer@t-online.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Marianne',
  'Cremer',
  'Haselweg',
  '18',
  '41468',
  'Neuss',
  '01721491133',
  true,
  '2026-02-15 11:30:05.492278+00'::timestamptz,
  true,
  '2026-02-15 11:30:05.545982+00'::timestamptz,
  '2026-02-15 11:30:05.492278+00'::timestamptz,
  '2026-02-15 11:30:05.492278+00'::timestamptz
);

-- auth: antjebauer@hotmail.com
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-22 12:47:01.108889+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "e4a096c1-8fc5-4979-950f-89b90d986133", "city": "Neuss", "email": "antjebauer@hotmail.com", "phone": "01777639292", "street": "Fliederweg ", "last_name": "Bauer", "first_name": "Antje", "postal_code": "41468", "house_number": "30", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-22 12:47:01.099402+00'::timestamptz,
  '2026-05-12 11:29:25.046347+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::text,
  'email',
  jsonb_build_object(
    'sub', 'e4a096c1-8fc5-4979-950f-89b90d986133',
    'email', 'antjebauer@hotmail.com',
    'email_verified', true,
    'phone_verified', false
  ),
  'antjebauer@hotmail.com',
  '2026-02-22 12:47:01.099402+00'::timestamptz,
  '2026-05-12 11:29:25.046347+00'::timestamptz,
  '2026-03-11 22:32:34.353401+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'antjebauer@hotmail.com',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Antje',
  'Bauer',
  'Fliederweg ',
  '30',
  '41468',
  'Neuss',
  '01777639292',
  true,
  '2026-02-22 12:47:01.099034+00'::timestamptz,
  true,
  '2026-02-22 12:47:01.108889+00'::timestamptz,
  '2026-02-22 12:47:01.099034+00'::timestamptz,
  '2026-02-22 12:47:01.099034+00'::timestamptz
);

-- auth: andrea.karnath@arcor.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-02 10:25:42.280276+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "f63447c3-a2b4-4064-97fe-22428a032a2d", "city": "Neuss", "email": "andrea.karnath@arcor.de", "phone": "01781682285", "street": "Pliniusweg ", "last_name": "Karnath ", "first_name": "Andrea ", "postal_code": "41464", "house_number": "46", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-02 10:25:42.191777+00'::timestamptz,
  '2026-05-05 05:53:28.500384+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::text,
  'email',
  jsonb_build_object(
    'sub', 'f63447c3-a2b4-4064-97fe-22428a032a2d',
    'email', 'andrea.karnath@arcor.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'andrea.karnath@arcor.de',
  '2026-02-02 10:25:42.191777+00'::timestamptz,
  '2026-05-05 05:53:28.500384+00'::timestamptz,
  '2026-04-11 21:16:50.020378+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'andrea.karnath@arcor.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Andrea ',
  'Karnath ',
  'Pliniusweg ',
  '46',
  '41464',
  'Neuss',
  '01781682285',
  true,
  '2026-02-02 10:25:42.190271+00'::timestamptz,
  true,
  '2026-02-02 10:25:42.280276+00'::timestamptz,
  '2026-02-02 10:25:42.190271+00'::timestamptz,
  '2026-02-02 10:25:42.190271+00'::timestamptz
);

-- auth: spollotzek@web.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-22 15:52:19.073635+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "f81c8ff0-cc12-429b-9e85-8ee8e8a07138", "city": "Neuss", "email": "spollotzek@web.de", "phone": "01604162080", "street": "Fliederweg", "last_name": "Pollotzek", "first_name": "Stefanie", "postal_code": "41468", "house_number": "13a", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-22 15:52:19.021876+00'::timestamptz,
  '2026-05-11 07:28:37.691841+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::text,
  'email',
  jsonb_build_object(
    'sub', 'f81c8ff0-cc12-429b-9e85-8ee8e8a07138',
    'email', 'spollotzek@web.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'spollotzek@web.de',
  '2026-02-22 15:52:19.021876+00'::timestamptz,
  '2026-05-11 07:28:37.691841+00'::timestamptz,
  '2026-02-22 15:52:19.087352+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'f81c8ff0-cc12-429b-9e85-8ee8e8a07138'::uuid,
  'spollotzek@web.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Stefanie',
  'Pollotzek',
  'Fliederweg',
  '13a',
  '41468',
  'Neuss',
  '01604162080',
  true,
  '2026-02-22 15:52:19.021535+00'::timestamptz,
  true,
  '2026-02-22 15:52:19.073635+00'::timestamptz,
  '2026-02-22 15:52:19.021535+00'::timestamptz,
  '2026-02-22 15:52:19.021535+00'::timestamptz
);

-- auth: elke.leven@arcor.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-22 12:41:58.744438+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "fac5a9c9-0dc1-427c-aab4-db097ab8fa16", "city": "Neuss", "email": "elke.leven@arcor.de", "phone": "01794959236", "street": "Melissenstraße ", "last_name": "Leven", "first_name": "Elke", "postal_code": "41466", "house_number": "1", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-22 12:41:58.686075+00'::timestamptz,
  '2026-05-11 17:38:53.590081+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::text,
  'email',
  jsonb_build_object(
    'sub', 'fac5a9c9-0dc1-427c-aab4-db097ab8fa16',
    'email', 'elke.leven@arcor.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'elke.leven@arcor.de',
  '2026-02-22 12:41:58.686075+00'::timestamptz,
  '2026-05-11 17:38:53.590081+00'::timestamptz,
  '2026-02-22 12:41:58.765788+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'elke.leven@arcor.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'Elke',
  'Leven',
  'Melissenstraße ',
  '1',
  '41466',
  'Neuss',
  '01794959236',
  true,
  '2026-02-22 12:41:58.685112+00'::timestamptz,
  true,
  '2026-02-22 12:41:58.744438+00'::timestamptz,
  '2026-02-22 12:41:58.685112+00'::timestamptz,
  '2026-02-22 12:41:58.685112+00'::timestamptz
);

-- auth: andrethaller@icloud.de
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmed_at,
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
  '2026-02-06 13:26:14.294605+00'::timestamptz,
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"sub": "ffd06ae6-242c-4ea2-a5a5-76f219740548", "city": "Neuss", "email": "andrethaller@icloud.de", "phone": "015734673729", "street": "Holunderweg", "last_name": "Thaller", "first_name": "André", "postal_code": "41468", "house_number": "6", "email_verified": true, "phone_verified": false}'::jsonb,
  '2026-02-06 13:26:14.258226+00'::timestamptz,
  '2026-02-06 13:26:14.325594+00'::timestamptz,
  false,
  false
) ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (
  id, user_id, provider_id, provider, identity_data, email,
  created_at, updated_at, last_sign_in_at
) VALUES (
  'ffd06ae6-242c-4ea2-a5a5-76f219740548'::uuid,
  'ffd06ae6-242c-4ea2-a5a5-76f219740548'::uuid,
  'ffd06ae6-242c-4ea2-a5a5-76f219740548'::text,
  'email',
  jsonb_build_object(
    'sub', 'ffd06ae6-242c-4ea2-a5a5-76f219740548',
    'email', 'andrethaller@icloud.de',
    'email_verified', true,
    'phone_verified', false
  ),
  'andrethaller@icloud.de',
  '2026-02-06 13:26:14.258226+00'::timestamptz,
  '2026-02-06 13:26:14.325594+00'::timestamptz,
  '2026-02-06 13:26:14.308168+00'::timestamptz
) ON CONFLICT DO NOTHING;
INSERT INTO public.users (
  id, email, tenant_id, role,
  first_name, last_name, street, house_number, postal_code, city, phone,
  gdpr_consent, gdpr_consent_date,
  email_verified, email_verified_at,
  created_at, updated_at
) VALUES (
  'ffd06ae6-242c-4ea2-a5a5-76f219740548'::uuid,
  'andrethaller@icloud.de',
  'ce92ece2-4181-470e-9e44-48bf77f0d4a3'::uuid,
  'user',
  'André',
  'Thaller',
  'Holunderweg',
  '6',
  '41468',
  'Neuss',
  '015734673729',
  true,
  '2026-02-06 13:26:14.257186+00'::timestamptz,
  true,
  '2026-02-06 13:26:14.294605+00'::timestamptz,
  '2026-02-06 13:26:14.257186+00'::timestamptz,
  '2026-02-06 13:26:14.257186+00'::timestamptz
);
