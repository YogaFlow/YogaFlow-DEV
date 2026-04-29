/*
  Resolve PostgREST ambiguity (PGRST203) for course registration RPCs.

  We keep only the explicit two-argument variants:
    - register_for_course(uuid, uuid)
    - unregister_from_course(uuid, uuid)
  and remove legacy one-argument overloads that collide in RPC resolution.
*/

DROP FUNCTION IF EXISTS public.register_for_course(uuid);
DROP FUNCTION IF EXISTS public.unregister_from_course(uuid);

GRANT EXECUTE ON FUNCTION public.register_for_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_from_course(uuid, uuid) TO authenticated;
