-- Yomita legacy import (generated)
-- tenant_id: 892370b8-49a1-4699-b480-2f722e4f9fe3
-- auth_csv: C:/Users/49178/Downloads/users_rows (2).csv
-- profiles_csv: C:/Users/49178/Downloads/users_rows (3).csv
-- courses_csv: C:/Users/49178/Downloads/courses_rows (1).csv
-- registrations_csv: C:/Users/49178/Downloads/registrations_rows (1).csv

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
  '6fb5de10-582d-4193-9676-b67bd61ffb3c'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Mittwoch',
  'Hatha/Vinyasa für alle',
  '2026-07-01'::date,
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
  'e45e73a8-f039-4002-b428-4ef40455f0c6'::uuid,
  '2026-05-18 14:57:43.832903+00'::timestamptz,
  '2026-05-18 14:57:43.832903+00'::timestamptz
);
INSERT INTO public.courses (
  id, tenant_id, title, description, date, time, end_time, location, room,
  max_participants, price, teacher_id, status, duration, prerequisites, frequency, series_id,
  created_at, updated_at
) VALUES (
  '8953f8b5-e0eb-4a0c-ad01-f61e2e56147b'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'Yoga am Mittwoch',
  'Hatha/Vinyasa für alle',
  '2026-07-08'::date,
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
  'e45e73a8-f039-4002-b428-4ef40455f0c6'::uuid,
  '2026-05-18 14:57:43.832903+00'::timestamptz,
  '2026-05-18 14:57:43.832903+00'::timestamptz
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
  'd6058a79-91ac-4d04-84c5-2f747cb36330'::uuid,
  '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid,
  'YOGA & AYURVEDA (Tagesrereat)',
  'Gemeinsam mit der kreativen Ayurveda-Köchin Monika im wunderschönen Celebrate Yoga in Leichlingen.',
  '2026-07-12'::date,
  '09:00:00'::time,
  '17:00:00'::time,
  'Celebrate Yoga, Leichlingen',
  NULL,
  10,
  129.00,
  '2ef0b4bf-69da-480e-9533-2bdf162dfc18'::uuid,
  'active',
  480,
  NULL,
  'one_time',
  NULL,
  '2026-05-03 10:37:34.417922+00'::timestamptz,
  '2026-05-31 20:02:23.156358+00'::timestamptz
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
