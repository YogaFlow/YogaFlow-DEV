-- GoTrue expects empty string, not NULL, for token columns (else "Database error querying schema")
UPDATE auth.users u
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  reauthentication_token = COALESCE(reauthentication_token, ''),
  phone_change_token = COALESCE(phone_change_token, '')
FROM public.users p
WHERE p.id = u.id
  AND p.tenant_id = '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid;
