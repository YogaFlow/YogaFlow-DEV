-- Epic E2: Vollständige Schema-Migration für Mehrmandanten-Modell
--
-- ACHTUNG: Diese Migration ist ein "Frischer Start".
-- Alle bestehenden User-, Kurs- und Buchungsdaten werden entfernt.
-- Auth-User müssen separat über Supabase Dashboard > Authentication > Users gelöscht werden.

-- ============================================================================
-- 1. Alle bestehenden Daten entfernen (frischer Start)
-- ============================================================================

TRUNCATE public.messages          CASCADE;
TRUNCATE public.registrations     CASCADE;
TRUNCATE public.courses           CASCADE;
TRUNCATE public.global_settings   CASCADE;
DELETE  FROM public.users;  -- kein TRUNCATE wegen FK-Referenz auf auth.users

-- ============================================================================
-- 2. Alle RLS-Policies auf betroffenen Tabellen entfernen
-- ============================================================================

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN (
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- 3. Alte Trigger + Funktionen entfernen, die roles[] referenzieren
-- ============================================================================

DROP TRIGGER IF EXISTS check_role_escalation           ON public.users;
DROP TRIGGER IF EXISTS on_auth_user_created            ON auth.users;

DROP FUNCTION IF EXISTS public.prevent_role_escalation();
DROP FUNCTION IF EXISTS public.is_admin(uuid);

-- ============================================================================
-- 4. Alte Indizes entfernen
-- ============================================================================

DROP INDEX IF EXISTS public.idx_users_roles;
DROP INDEX IF EXISTS public.idx_users_admin_role;
DROP INDEX IF EXISTS public.idx_admin_emails_created_by;

-- ============================================================================
-- 5. roles[]-Spalte und altes role-Enum entfernen, neue role-Spalte anlegen
-- ============================================================================

ALTER TABLE public.users DROP COLUMN IF EXISTS roles;
ALTER TABLE public.users DROP COLUMN IF EXISTS role;

-- Enum-Typ entfernen (jetzt nicht mehr referenziert)
DROP TYPE IF EXISTS user_role;

ALTER TABLE public.users
  ADD COLUMN role text NOT NULL DEFAULT 'user'
  CONSTRAINT users_role_valid CHECK (role IN ('owner', 'admin', 'teacher', 'user'));

-- ============================================================================
-- 6. tenant_id auf users (NOT NULL, FK → tenants)
-- ============================================================================

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL
  REFERENCES public.tenants(id) ON DELETE CASCADE;

-- E-Mail-Eindeutigkeit pro Tenant statt global
ALTER TABLE public.users
  ADD CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email);

-- Adressfelder nullable machen (im Onboarding-Wizard nicht mehr abgefragt)
ALTER TABLE public.users ALTER COLUMN street       DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN house_number DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN postal_code  DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN city         DROP NOT NULL;
ALTER TABLE public.users ALTER COLUMN phone        DROP NOT NULL;

-- ============================================================================
-- 7. tenant_id auf courses (NOT NULL, FK → tenants)
-- ============================================================================

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL
  REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_courses_tenant_id ON public.courses(tenant_id);

-- ============================================================================
-- 8. tenant_id auf registrations (NOT NULL, FK → tenants)
-- ============================================================================

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL
  REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_registrations_tenant_id ON public.registrations(tenant_id);

-- ============================================================================
-- 9. tenant_id auf messages (nullable — Messages sind Post-MVP)
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS tenant_id uuid
  REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_messages_tenant_id ON public.messages(tenant_id);

-- ============================================================================
-- 10. Performance-Index: users.tenant_id
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role       ON public.users(role);

-- ============================================================================
-- 11. handle_new_user Trigger: neue Felder (tenant_id, role aus Metadata)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Rolle aus Metadata lesen; ungültige Werte auf 'user' zurücksetzen
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  IF v_role NOT IN ('owner', 'admin', 'teacher', 'user') THEN
    v_role := 'user';
  END IF;

  INSERT INTO public.users (
    id, email, tenant_id, role,
    first_name, last_name,
    street, house_number, postal_code, city, phone
  )
  VALUES (
    NEW.id,
    NEW.email,
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    v_role,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name',  ''),
    COALESCE(NEW.raw_user_meta_data->>'street',       NULL),
    COALESCE(NEW.raw_user_meta_data->>'house_number', NULL),
    COALESCE(NEW.raw_user_meta_data->>'postal_code',  NULL),
    COALESCE(NEW.raw_user_meta_data->>'city',         NULL),
    COALESCE(NEW.raw_user_meta_data->>'phone',        NULL)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 12. update_updated_at sicherstellen (falls noch nicht vorhanden)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
