-- Fix UTF-8 first_name corrupted by PowerShell pipe (Andr?? → André)
-- Uses Unicode escape to avoid shell encoding issues.

UPDATE public.users
SET first_name = U&'Andr\00e9'
WHERE id = '0f9b2bd1-a780-48fc-9973-59fcddc801f1'::uuid
  AND tenant_id = '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid;

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  raw_user_meta_data,
  '{first_name}',
  to_jsonb(U&'Andr\00e9'::text)
)
WHERE id = '0f9b2bd1-a780-48fc-9973-59fcddc801f1'::uuid;
