-- Stufe 3c-A: Profil je Login×Studio laden.
-- public.users.id ist seit 20260911182000 nicht mehr der Login.
-- Der Client darf nicht mehr .from('users').eq('id', session.user.id) nutzen.
-- Diese RPC liest die Mitgliedschaft über yogaflow_private.get_my_member_id()
-- (Login = auth.uid(), Studio = Header x-omlify-tenant; ohne Header und
-- genau ein Profil → dieses). RETURNS SETOF, damit 0 Treffer eine leere
-- Menge sind und supabase-js .maybeSingle() data=null liefert — nicht
-- RETURNS public.users (Composite: 0 Zeilen → NULL-Record / ggf. Objekt
-- mit Null-Feldern).

CREATE OR REPLACE FUNCTION public.get_current_member()
RETURNS SETOF public.users
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.*
  FROM public.users u
  WHERE u.id = yogaflow_private.get_my_member_id();
$function$;

REVOKE ALL ON FUNCTION public.get_current_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_member() TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_current_member()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon hat EXECUTE auf public.get_current_member()';
  END IF;
END $$;
