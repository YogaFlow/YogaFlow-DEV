-- Yomita tenant full wipe (public + auth) before re-import.
-- tenant_id: 892370b8-49a1-4699-b480-2f722e4f9fe3
-- Run on DEV first; PROD only with explicit approval + backup.

DO $$
DECLARE
  v_tenant_id uuid := '892370b8-49a1-4699-b480-2f722e4f9fe3'::uuid;
  v_user_ids uuid[];
  v_tenant_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant_id)
  INTO v_tenant_exists;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_user_ids
  FROM public.users
  WHERE tenant_id = v_tenant_id;

  IF v_tenant_exists THEN
    PERFORM public.delete_tenant_complete(v_tenant_id);
  END IF;

  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    DELETE FROM auth.identities WHERE user_id = ANY(v_user_ids);
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  END IF;

  -- Orphan auth rows tagged with this tenant in metadata (e.g. after partial imports)
  DELETE FROM auth.identities
  WHERE user_id IN (
    SELECT id FROM auth.users
    WHERE raw_user_meta_data->>'tenant_id' = v_tenant_id::text
  );

  DELETE FROM auth.users
  WHERE raw_user_meta_data->>'tenant_id' = v_tenant_id::text;
END $$;
