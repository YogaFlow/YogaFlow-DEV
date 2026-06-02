-- Remove André's test tenant, then free andre.thaller@outlook.de in auth for Yomita re-import.
-- Test tenant: be5563ad-aec1-4762-a4ea-f80e8ce04e9f (André was sole user)

DO $$
DECLARE
  v_test_tenant uuid := 'be5563ad-aec1-4762-a4ea-f80e8ce04e9f'::uuid;
  v_user_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_user_ids
  FROM public.users
  WHERE tenant_id = v_test_tenant;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = v_test_tenant) THEN
    PERFORM public.delete_tenant_complete(v_test_tenant);
  END IF;

  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    DELETE FROM auth.identities WHERE user_id = ANY(v_user_ids);
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  END IF;
END $$;

DELETE FROM auth.identities
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'andre.thaller@outlook.de');

DELETE FROM auth.users
WHERE email = 'andre.thaller@outlook.de';
