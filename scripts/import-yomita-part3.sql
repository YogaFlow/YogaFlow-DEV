-- Yomita legacy import (generated)
-- tenant_id: 892370b8-49a1-4699-b480-2f722e4f9fe3
-- auth_csv: C:/Users/49178/Downloads/users_rows (2).csv
-- profiles_csv: C:/Users/49178/Downloads/users_rows (3).csv
-- courses_csv: C:/Users/49178/Downloads/courses_rows (1).csv
-- registrations_csv: C:/Users/49178/Downloads/registrations_rows (1).csv

-- registrations (past-course trigger disabled during import)
ALTER TABLE public.registrations DISABLE TRIGGER prevent_past_course_registration;
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
  '071beee4-851e-4515-988d-b8de94e019ad'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '6fb5de10-582d-4193-9676-b67bd61ffb3c'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'registered'::public.registration_status,
  '2026-05-26 11:26:55.570328+00'::timestamptz,
  '2026-05-26 11:26:55.570328+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '08ab6849-4096-41e8-8816-8b147a0764fd'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'waitlist'::public.registration_status,
  '2026-05-27 16:24:30.893722+00'::timestamptz,
  '2026-05-27 16:24:30.893722+00'::timestamptz,
  '2026-05-27 16:24:34.468808+00'::timestamptz,
  true,
  3
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '0bd0bf3c-c4fc-4a0d-a3fd-d5e2a77ecd10'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8953f8b5-e0eb-4a0c-ad01-f61e2e56147b'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'registered'::public.registration_status,
  '2026-05-27 19:13:09.138246+00'::timestamptz,
  '2026-05-27 19:13:09.138246+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '0dc9478c-036d-4b26-b770-9fbf4d8a04a9'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'e9a23ef7-5424-478c-9a02-8bf2ad6705e3'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'waitlist'::public.registration_status,
  '2026-05-27 16:23:25.506906+00'::timestamptz,
  '2026-05-27 16:23:25.506906+00'::timestamptz,
  NULL,
  true,
  2
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '1093be0f-b654-4960-8b4e-1feb3be40303'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'waitlist'::public.registration_status,
  '2026-05-27 16:17:38.897033+00'::timestamptz,
  '2026-05-27 16:17:38.897033+00'::timestamptz,
  NULL,
  true,
  1
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
  '28a4c312-5fbb-48ff-b679-3ec0658777ca'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8953f8b5-e0eb-4a0c-ad01-f61e2e56147b'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'registered'::public.registration_status,
  '2026-05-28 20:25:38.374946+00'::timestamptz,
  '2026-05-28 20:25:38.374946+00'::timestamptz,
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
  '3962a884-a550-43a5-9019-8c0f534a80bd'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '6fb5de10-582d-4193-9676-b67bd61ffb3c'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'registered'::public.registration_status,
  '2026-05-27 16:19:08.139467+00'::timestamptz,
  '2026-05-27 16:19:08.139467+00'::timestamptz,
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
  '53518c71-e432-482f-9c95-0206aac7c480'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'registered'::public.registration_status,
  '2026-05-17 10:17:17.896201+00'::timestamptz,
  '2026-05-17 10:17:17.896201+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '56e87779-7ee2-4c09-84ee-5e69fe021a10'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '6fb5de10-582d-4193-9676-b67bd61ffb3c'::uuid,
  'c6377894-2826-4efe-84ff-2efeae0aed98'::uuid,
  'registered'::public.registration_status,
  '2026-05-27 19:13:01.51228+00'::timestamptz,
  '2026-05-27 19:13:01.51228+00'::timestamptz,
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
  '64f5ec07-6f8e-4d7f-a313-42cd3bda3d02'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8f600c58-3a57-4506-98fc-f2d4ef08e4a8'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'waitlist'::public.registration_status,
  '2026-05-27 16:24:40.888359+00'::timestamptz,
  '2026-05-27 16:24:40.888359+00'::timestamptz,
  '2026-05-27 16:24:46.107856+00'::timestamptz,
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
  '69bbed05-4d7c-412f-9bfb-b339ef42f7fd'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8953f8b5-e0eb-4a0c-ad01-f61e2e56147b'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'registered'::public.registration_status,
  '2026-05-23 17:58:24.573825+00'::timestamptz,
  '2026-05-23 17:58:24.573825+00'::timestamptz,
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
  '2026-05-27 16:25:22.188633+00'::timestamptz,
  '2026-05-27 16:25:22.188633+00'::timestamptz,
  '2026-05-27 16:25:27.965728+00'::timestamptz,
  true,
  2
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '6c24ff42-e368-4f3f-80d5-7c877c23679c'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '6fb5de10-582d-4193-9676-b67bd61ffb3c'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  'registered'::public.registration_status,
  '2026-05-27 16:07:43.844433+00'::timestamptz,
  '2026-05-27 16:07:43.844433+00'::timestamptz,
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
  '7368d427-20e7-4d63-9cde-a4ef252a6d65'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  '493b0cfd-1cf7-4d9a-9b82-5bd5e4c40be4'::uuid,
  'registered'::public.registration_status,
  '2026-05-28 17:38:22.775824+00'::timestamptz,
  '2026-05-28 17:38:22.775824+00'::timestamptz,
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
  '80e9609a-602d-465b-ab5d-dc67f65e0212'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8953f8b5-e0eb-4a0c-ad01-f61e2e56147b'::uuid,
  'fac5a9c9-0dc1-427c-aab4-db097ab8fa16'::uuid,
  'registered'::public.registration_status,
  '2026-05-28 13:58:28.602484+00'::timestamptz,
  '2026-05-28 13:58:28.602484+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '83dd7ad9-a0b6-48de-9938-11764493754b'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8953f8b5-e0eb-4a0c-ad01-f61e2e56147b'::uuid,
  '65012a0a-cc60-4c73-890f-46a9740c4c52'::uuid,
  'registered'::public.registration_status,
  '2026-05-27 16:06:54.366218+00'::timestamptz,
  '2026-05-27 16:06:54.366218+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  '9084773f-4fc0-4d03-b678-cbfe9f3db1e6'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8953f8b5-e0eb-4a0c-ad01-f61e2e56147b'::uuid,
  '30eef8e2-74b1-410a-b1de-decf7d376866'::uuid,
  'registered'::public.registration_status,
  '2026-05-27 16:26:19.085092+00'::timestamptz,
  '2026-05-27 16:26:19.085092+00'::timestamptz,
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
  '2026-05-27 16:22:04.953005+00'::timestamptz,
  '2026-05-27 16:22:04.953005+00'::timestamptz,
  '2026-05-27 16:22:13.309971+00'::timestamptz,
  true,
  1
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
  'aab7c9b2-7c89-460e-84d9-773f23b99cd3'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8953f8b5-e0eb-4a0c-ad01-f61e2e56147b'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'registered'::public.registration_status,
  '2026-05-26 07:53:41.33501+00'::timestamptz,
  '2026-05-26 07:53:41.33501+00'::timestamptz,
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
  'df2b7655-1128-4e9f-967f-614f57e1de51'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'registered'::public.registration_status,
  '2026-05-13 22:13:11.859087+00'::timestamptz,
  '2026-05-13 22:13:11.859087+00'::timestamptz,
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
  'e9cbb8f6-3dd5-4588-b136-a1ef31cbfad5'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '8953f8b5-e0eb-4a0c-ad01-f61e2e56147b'::uuid,
  'ac7a314f-6903-47b8-9096-243d6b24842e'::uuid,
  'registered'::public.registration_status,
  '2026-05-26 11:27:06.100106+00'::timestamptz,
  '2026-05-26 11:27:06.100106+00'::timestamptz,
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
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'efa75bcd-c8c2-4cc8-abe0-66fbe3d8b193'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '6fb5de10-582d-4193-9676-b67bd61ffb3c'::uuid,
  'a3856216-c52c-41e3-9d61-2c20bcdb02ab'::uuid,
  'registered'::public.registration_status,
  '2026-05-26 07:53:33.739524+00'::timestamptz,
  '2026-05-26 07:53:33.739524+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'f1f1ed98-62a7-4cd8-ba53-26ada7acdf21'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  '2f65224e-8ee1-4442-a9b5-56142d1f9413'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 20:36:38.076179+00'::timestamptz,
  '2026-04-22 20:36:38.076179+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'f68f79a4-3d94-449d-a06a-9580b9662825'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '5617adc0-3247-438f-99ce-70bc36e871b3'::uuid,
  'f63447c3-a2b4-4064-97fe-22428a032a2d'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 21:18:09.341207+00'::timestamptz,
  '2026-04-22 21:18:09.341207+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'f6a82344-27e1-4e79-93f9-55e8fb702dab'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '6fb5de10-582d-4193-9676-b67bd61ffb3c'::uuid,
  'e4a096c1-8fc5-4979-950f-89b90d986133'::uuid,
  'registered'::public.registration_status,
  '2026-05-28 20:25:28.714478+00'::timestamptz,
  '2026-05-28 20:25:28.714478+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'f71434e8-84b6-464e-9968-e74d06684613'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '33f3a7f7-57b2-45e2-be39-f62dc171bb84'::uuid,
  '47b11b34-6853-49e7-8006-4b2009ff711b'::uuid,
  'registered'::public.registration_status,
  '2026-04-28 17:41:19.72146+00'::timestamptz,
  '2026-04-28 17:41:19.72146+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'fb142b03-67fc-43f8-b087-82626c185ff5'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'f2f1dfcb-61eb-4b94-86db-61539a60ea96'::uuid,
  'c6e80666-7afb-40e7-922a-26ac14f43024'::uuid,
  'registered'::public.registration_status,
  '2026-04-22 21:02:20.777788+00'::timestamptz,
  '2026-04-22 21:02:20.777788+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'fe6f68a4-1272-415f-b92d-5da3b3c68fcf'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '6fb5de10-582d-4193-9676-b67bd61ffb3c'::uuid,
  'e2d34978-a240-4e01-9794-1859b0e6ba29'::uuid,
  'registered'::public.registration_status,
  '2026-05-23 17:57:26.561715+00'::timestamptz,
  '2026-05-23 17:57:26.561715+00'::timestamptz,
  NULL,
  false,
  NULL
);
INSERT INTO public.registrations (
  id, tenant_id, course_id, user_id, status,
  registered_at, signup_timestamp, cancellation_timestamp,
  is_waitlist, waitlist_position
) VALUES (
  'feb1b6c8-997a-45ee-a6cf-358596c5ece8'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  '2a877fe9-c5d5-4075-b496-98fd3d9956c3'::uuid,
  '17b9d410-e078-4014-aa4f-5c16e678042b'::uuid,
  'waitlist'::public.registration_status,
  '2026-04-23 08:23:03.16236+00'::timestamptz,
  '2026-04-23 08:23:03.16236+00'::timestamptz,
  NULL,
  true,
  1
);
ALTER TABLE public.registrations ENABLE TRIGGER prevent_past_course_registration;