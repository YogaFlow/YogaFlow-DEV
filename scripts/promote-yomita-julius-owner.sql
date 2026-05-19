-- Promote juliusbne@gmail.com to owner in tenant Yomita
ALTER TABLE public.users DISABLE TRIGGER check_role_escalation;

UPDATE public.users
SET role = 'owner'
WHERE id = 'd54ac880-4600-4e60-ba22-2b07c88ba0e0'::uuid
  AND tenant_id = '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid;

ALTER TABLE public.users ENABLE TRIGGER check_role_escalation;

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "owner"}'::jsonb
WHERE id = 'd54ac880-4600-4e60-ba22-2b07c88ba0e0'::uuid;
