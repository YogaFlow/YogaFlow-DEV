-- Slug-Auflösung im Browser läuft mit dem Supabase-Anon-Key (Rolle "anon").
-- Explizite Policy, falls in älteren Umgebungen nur "authenticated" abgedeckt war.

DROP POLICY IF EXISTS "tenants_select_anon_slug_resolve" ON public.tenants;

CREATE POLICY "tenants_select_anon_slug_resolve"
  ON public.tenants
  FOR SELECT
  TO anon
  USING (true);
