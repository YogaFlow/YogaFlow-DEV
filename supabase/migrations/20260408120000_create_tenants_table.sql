-- Epic E1: central tenants (studios) entity — schema only, no data DML.

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_name_not_empty'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_name_not_empty
      CHECK (name <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tenants_slug_format'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_slug_format
      CHECK (slug ~ '^[a-z0-9]+$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON public.tenants (slug);

CREATE OR REPLACE FUNCTION public.prevent_tenants_slug_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.slug IS DISTINCT FROM NEW.slug THEN
    RAISE EXCEPTION 'tenant slug cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_tenants_slug_change ON public.tenants;
CREATE TRIGGER prevent_tenants_slug_change
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tenants_slug_change();

DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.tenants;
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
