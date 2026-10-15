-- A4 — Kartenprodukte (Stammdaten).
--
-- Zweck: Tabelle pass_products für 5er-/10er-Karten mit Preis und Gültigkeit.
-- Schreiben nur über RPCs (owner/admin). Kein Löschen, nur Archivieren.
-- Spalte courses.pass_eligible (Default true) für A6.
--
-- Bezug: A4, N2, N7, E16, K1–K6.
-- K1: validity_rule years_to_year_end (Standard, Wert 1–3) oder months (1–60).
-- K2: Nie löschen, nur archivieren. Zurückholen möglich.
-- K3: Lesen/Schreiben nur is_tenant_manager(). Lehrende/Teilnehmende weder
--     SELECT noch Schreib-RPCs (Lesen für A5/A6 später erweitern).
-- K4: courses.pass_eligible NOT NULL DEFAULT true.
-- K5: Navigation „Karten“ unter Einstellungen — Oberfläche Schritt 2.
-- K6: E13 (Lehrende verkaufen) erst in A5.
-- N7: is_scheduled = false (erstes nicht terminiertes Produkt).
-- E16: kurze Fristen — Hinweis ist Sache der Oberfläche (Schritt 2).
--
-- Event-Namen: pass_product.created / .updated / .archived / .unarchived
-- (Muster subjekt.verb_in_vergangenheit wie payment.recorded, course.canceled).
-- Payload ohne name (Freitext). Audit nur Spaltennamen, ohne Werte.
--
-- Löschschalter: wie payments_no_delete. DELETE auf pass_products ist für alle
-- Rollen verboten. delete_tenant_complete setzt
-- SET LOCAL yogaflow.allow_pass_product_delete = 'on'. Der Trigger lässt das
-- nur zu, wenn der Schalter an ist und current_user nicht anon/authenticated.
--
-- Rückweg (ausführbar; diese Zeilen sind Kommentar und laufen hier nicht).
-- Zuerst delete_tenant_complete auf die A3-Fassung zurücksetzen, dann Objekte
-- und courses.pass_eligible entfernen.
--
-- CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
-- RETURNS void
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
--     RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
--       USING ERRCODE = 'P0002';
--   END IF;
--   ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
--   BEGIN
--     SET LOCAL yogaflow.allow_append_only_delete = 'on';
--     SET LOCAL yogaflow.allow_payment_delete = 'on';
--     DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.events WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.payments
--       WHERE tenant_id = p_tenant_id
--         AND reverses_payment_id IS NOT NULL;
--     DELETE FROM public.payments WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.users WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.tenants WHERE id = p_tenant_id;
--   EXCEPTION WHEN OTHERS THEN
--     ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
--     RAISE;
--   END;
--   ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
-- END;
-- $function$;
--
-- DROP FUNCTION IF EXISTS public.set_pass_product_archived(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.update_pass_product(uuid, text, integer, integer, text, integer);
-- DROP FUNCTION IF EXISTS public.create_pass_product(text, integer, integer, text, integer);
-- DROP TRIGGER IF EXISTS pass_products_no_delete ON public.pass_products;
-- DROP TRIGGER IF EXISTS update_pass_products_updated_at ON public.pass_products;
-- DROP FUNCTION IF EXISTS yogaflow_private.pass_products_no_delete();
-- DROP TABLE IF EXISTS public.pass_products;
-- ALTER TABLE public.courses DROP COLUMN IF EXISTS pass_eligible;

-- ---------------------------------------------------------------------------
-- 1. Tabelle public.pass_products
-- ---------------------------------------------------------------------------

CREATE TABLE public.pass_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  name text NOT NULL,
  units integer NOT NULL,
  price_cents integer NOT NULL,
  validity_rule text NOT NULL,
  validity_value integer NOT NULL,
  is_scheduled boolean NOT NULL DEFAULT false,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pass_products_name_length_check
    CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  CONSTRAINT pass_products_units_check
    CHECK (units BETWEEN 1 AND 100),
  CONSTRAINT pass_products_price_check
    CHECK (price_cents > 0 AND price_cents <= 1000000),
  CONSTRAINT pass_products_validity_rule_check
    CHECK (validity_rule IN ('years_to_year_end', 'months')),
  CONSTRAINT pass_products_validity_value_check
    CHECK (
      (validity_rule = 'years_to_year_end' AND validity_value BETWEEN 1 AND 3)
      OR (validity_rule = 'months' AND validity_value BETWEEN 1 AND 60)
    ),
  CONSTRAINT pass_products_is_scheduled_check
    CHECK (is_scheduled = false)
);

COMMENT ON TABLE public.pass_products IS
  'Kartenprodukte je Studio. Kein Löschen, nur archivieren. Schreiben nur über create/update/set_archived RPCs.';

CREATE UNIQUE INDEX pass_products_tenant_active_name_unique
  ON public.pass_products (tenant_id, lower(btrim(name)))
  WHERE archived_at IS NULL;

CREATE INDEX pass_products_tenant_id_idx
  ON public.pass_products (tenant_id);

DROP TRIGGER IF EXISTS update_pass_products_updated_at ON public.pass_products;
CREATE TRIGGER update_pass_products_updated_at
  BEFORE UPDATE ON public.pass_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Rechte und Sperren
-- ---------------------------------------------------------------------------

ALTER TABLE public.pass_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pass_products_select_manager ON public.pass_products;
CREATE POLICY pass_products_select_manager
  ON public.pass_products FOR SELECT
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND yogaflow_private.is_tenant_manager()
  );

REVOKE ALL ON TABLE public.pass_products FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pass_products TO authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.pass_products_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF pg_catalog.current_setting('yogaflow.allow_pass_product_delete', true) = 'on'
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'pass_products: DELETE ist nicht erlaubt, bitte archivieren'
    USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER pass_products_no_delete
  BEFORE DELETE ON public.pass_products
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.pass_products_no_delete();

REVOKE ALL ON FUNCTION yogaflow_private.pass_products_no_delete()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_pass_product(
  p_name text,
  p_units integer,
  p_price_cents integer,
  p_validity_rule text,
  p_validity_value integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_name text;
  v_id uuid;
  v_event_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL
     OR v_tenant_id IS NULL
     OR NOT yogaflow_private.is_tenant_manager()
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_NAME');
  END IF;

  IF p_units IS NULL OR p_units < 1 OR p_units > 100 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_UNITS');
  END IF;

  IF p_price_cents IS NULL OR p_price_cents <= 0 OR p_price_cents > 1000000 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_PRICE');
  END IF;

  IF p_validity_rule IS DISTINCT FROM 'years_to_year_end'
     AND p_validity_rule IS DISTINCT FROM 'months'
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_VALIDITY');
  END IF;

  IF p_validity_rule = 'years_to_year_end'
     AND (p_validity_value IS NULL OR p_validity_value < 1 OR p_validity_value > 3)
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_VALIDITY');
  END IF;

  IF p_validity_rule = 'months'
     AND (p_validity_value IS NULL OR p_validity_value < 1 OR p_validity_value > 60)
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_VALIDITY');
  END IF;

  BEGIN
    INSERT INTO public.pass_products (
      tenant_id,
      name,
      units,
      price_cents,
      validity_rule,
      validity_value
    ) VALUES (
      v_tenant_id,
      v_name,
      p_units,
      p_price_cents,
      p_validity_rule,
      p_validity_value
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'DUPLICATE_NAME');
  END;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    'pass_product.created',
    'pass_product',
    v_id,
    pg_catalog.jsonb_build_object(
      'product_id', v_id,
      'units', p_units,
      'price_cents', p_price_cents,
      'validity_rule', p_validity_rule,
      'validity_value', p_validity_value
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    'pass_product.created',
    'pass_products',
    v_id,
    ARRAY[
      'name',
      'units',
      'price_cents',
      'validity_rule',
      'validity_value'
    ]::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object('success', true, 'id', v_id);
END;
$function$;

COMMENT ON FUNCTION public.create_pass_product(text, integer, integer, text, integer) IS
  'Legt ein Kartenprodukt an. Nur owner/admin. Event pass_product.created ohne name im Payload.';

-- Verkaufte Karten (A5) kopieren die Werte; eine Änderung hier wirkt nur auf künftige Verkäufe.
CREATE OR REPLACE FUNCTION public.update_pass_product(
  p_id uuid,
  p_name text,
  p_units integer,
  p_price_cents integer,
  p_validity_rule text,
  p_validity_value integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_name text;
  v_row public.pass_products%ROWTYPE;
  v_changed text[] := ARRAY[]::text[];
  v_event_id uuid;
BEGIN
  -- Verkaufte Karten (A5) kopieren die Werte, eine Änderung hier wirkt nur auf künftige Verkäufe.
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL
     OR v_tenant_id IS NULL
     OR NOT yogaflow_private.is_tenant_manager()
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_row
  FROM public.pass_products
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_row.archived_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ARCHIVED');
  END IF;

  v_name := btrim(COALESCE(p_name, ''));
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_NAME');
  END IF;

  IF p_units IS NULL OR p_units < 1 OR p_units > 100 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_UNITS');
  END IF;

  IF p_price_cents IS NULL OR p_price_cents <= 0 OR p_price_cents > 1000000 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_PRICE');
  END IF;

  IF p_validity_rule IS DISTINCT FROM 'years_to_year_end'
     AND p_validity_rule IS DISTINCT FROM 'months'
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_VALIDITY');
  END IF;

  IF p_validity_rule = 'years_to_year_end'
     AND (p_validity_value IS NULL OR p_validity_value < 1 OR p_validity_value > 3)
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_VALIDITY');
  END IF;

  IF p_validity_rule = 'months'
     AND (p_validity_value IS NULL OR p_validity_value < 1 OR p_validity_value > 60)
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_VALIDITY');
  END IF;

  IF v_row.name IS DISTINCT FROM v_name THEN
    v_changed := array_append(v_changed, 'name');
  END IF;
  IF v_row.units IS DISTINCT FROM p_units THEN
    v_changed := array_append(v_changed, 'units');
  END IF;
  IF v_row.price_cents IS DISTINCT FROM p_price_cents THEN
    v_changed := array_append(v_changed, 'price_cents');
  END IF;
  IF v_row.validity_rule IS DISTINCT FROM p_validity_rule THEN
    v_changed := array_append(v_changed, 'validity_rule');
  END IF;
  IF v_row.validity_value IS DISTINCT FROM p_validity_value THEN
    v_changed := array_append(v_changed, 'validity_value');
  END IF;

  IF pg_catalog.cardinality(v_changed) = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'id', p_id,
      'unchanged', true
    );
  END IF;

  BEGIN
    UPDATE public.pass_products
    SET
      name = v_name,
      units = p_units,
      price_cents = p_price_cents,
      validity_rule = p_validity_rule,
      validity_value = p_validity_value
    WHERE id = p_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'DUPLICATE_NAME');
  END;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    'pass_product.updated',
    'pass_product',
    p_id,
    pg_catalog.jsonb_build_object(
      'product_id', p_id,
      'units', p_units,
      'price_cents', p_price_cents,
      'validity_rule', p_validity_rule,
      'validity_value', p_validity_value
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    'pass_product.updated',
    'pass_products',
    p_id,
    v_changed,
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

COMMENT ON FUNCTION public.update_pass_product(uuid, text, integer, integer, text, integer) IS
  'Aktualisiert ein aktives Kartenprodukt. Verkaufte Karten (A5) kopieren die Werte; Änderungen wirken nur auf künftige Verkäufe.';

CREATE OR REPLACE FUNCTION public.set_pass_product_archived(
  p_id uuid,
  p_archived boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_row public.pass_products%ROWTYPE;
  v_event_type text;
  v_event_id uuid;
  v_already boolean;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL
     OR v_tenant_id IS NULL
     OR NOT yogaflow_private.is_tenant_manager()
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF p_archived IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT *
    INTO v_row
  FROM public.pass_products
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  v_already := (v_row.archived_at IS NOT NULL) = p_archived;
  IF v_already THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'id', p_id,
      'unchanged', true
    );
  END IF;

  BEGIN
    IF p_archived THEN
      UPDATE public.pass_products
      SET archived_at = pg_catalog.now()
      WHERE id = p_id;
      v_event_type := 'pass_product.archived';
    ELSE
      UPDATE public.pass_products
      SET archived_at = NULL
      WHERE id = p_id;
      v_event_type := 'pass_product.unarchived';
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'DUPLICATE_NAME');
  END;

  v_event_id := yogaflow_private.insert_event(
    v_tenant_id,
    v_event_type,
    'pass_product',
    p_id,
    pg_catalog.jsonb_build_object(
      'product_id', p_id,
      'units', v_row.units,
      'price_cents', v_row.price_cents,
      'validity_rule', v_row.validity_rule,
      'validity_value', v_row.validity_value
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_tenant_id,
    v_member_id,
    v_event_type,
    'pass_products',
    p_id,
    ARRAY['archived_at']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object('success', true, 'id', p_id);
END;
$function$;

COMMENT ON FUNCTION public.set_pass_product_archived(uuid, boolean) IS
  'Archiviert oder holt ein Kartenprodukt zurück. Bereits im Zielzustand → success mit unchanged, ohne Event.';

REVOKE ALL ON FUNCTION public.create_pass_product(text, integer, integer, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pass_product(text, integer, integer, text, integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.update_pass_product(uuid, text, integer, integer, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_pass_product(uuid, text, integer, integer, text, integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_pass_product_archived(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_pass_product_archived(uuid, boolean)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. courses.pass_eligible
-- ---------------------------------------------------------------------------

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS pass_eligible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.courses.pass_eligible IS
  'A6 bucht nur bei true mit Karte. Schreibrecht wie andere Kursfelder (teacher eigener Kurs oder Manager).';

-- Keine Spaltenrechte-Einschränkung auf courses (anders als users): authenticated
-- hat Tabellen-UPDATE; neue Spalten erben das. courses_status_guard greift nur
-- status/canceled_* — pass_eligible bleibt für alle beschreibbar, die Kurse updaten.

-- ---------------------------------------------------------------------------
-- 5. delete_tenant_complete (Basis: 20260927121500_a3_payments.sql)
-- Diff: SET LOCAL yogaflow.allow_pass_product_delete = 'on';
--       DELETE FROM public.pass_products WHERE tenant_id = p_tenant_id;
--       vor DELETE FROM public.users / tenants. Kommentar ergänzt.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_tenant_complete(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND: Kein Tenant mit dieser ID.'
      USING ERRCODE = 'P0002';
  END IF;

  ALTER TABLE public.users DISABLE TRIGGER prevent_last_owner_delete;
  BEGIN
    -- SET LOCAL gilt nur in dieser Transaktion und bleibt danach nicht.
    SET LOCAL yogaflow.allow_append_only_delete = 'on';
    SET LOCAL yogaflow.allow_payment_delete = 'on';
    SET LOCAL yogaflow.allow_pass_product_delete = 'on';

    DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
    DELETE FROM public.events WHERE tenant_id = p_tenant_id;
    DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
    DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.payments
      WHERE tenant_id = p_tenant_id
        AND reverses_payment_id IS NOT NULL;
    DELETE FROM public.payments WHERE tenant_id = p_tenant_id;
    DELETE FROM public.registrations WHERE tenant_id = p_tenant_id;
    DELETE FROM public.courses WHERE tenant_id = p_tenant_id;
    DELETE FROM public.pass_products WHERE tenant_id = p_tenant_id;
    DELETE FROM public.users WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
    RAISE;
  END;

  ALTER TABLE public.users ENABLE TRIGGER prevent_last_owner_delete;
END;
$function$;

COMMENT ON FUNCTION public.delete_tenant_complete(uuid) IS
  'Löscht einen Mandanten in fester Reihenfolge: audit_log, events (Append-only per SET LOCAL yogaflow.allow_append_only_delete), user_notifications, messages, payments (Gegenzeilen zuerst, Schalter yogaflow.allow_payment_delete), registrations, courses, pass_products (Schalter yogaflow.allow_pass_product_delete), users, tenants. payments.registration_id und payments.tenant_id sowie pass_products.tenant_id sind RESTRICT. prevent_last_owner_delete ist währenddessen pausiert. auth.users separat. Nur postgres/service_role. Jede neue Tabelle mit FK auf tenants/users muss hier ergänzt werden.';

REVOKE ALL ON FUNCTION public.delete_tenant_complete(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.delete_tenant_complete(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_create_oid oid;
  v_update_oid oid;
  v_archive_oid oid;
  v_def text;
  v_con text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'pass_products' AND c.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'A4: Tabelle pass_products fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pass_products'::regclass
      AND conname = 'pass_products_validity_value_check'
  ) THEN
    RAISE EXCEPTION 'A4: CHECK pass_products_validity_value_check fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pass_products'::regclass
      AND conname = 'pass_products_is_scheduled_check'
  ) THEN
    RAISE EXCEPTION 'A4: CHECK pass_products_is_scheduled_check fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'pass_products_tenant_active_name_unique'
  ) THEN
    RAISE EXCEPTION 'A4: Unique-Index pass_products_tenant_active_name_unique fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'pass_products' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'A4: RLS auf pass_products ist aus';
  END IF;

  IF has_table_privilege('authenticated', 'public.pass_products', 'INSERT')
     OR has_table_privilege('authenticated', 'public.pass_products', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.pass_products', 'DELETE')
     OR has_table_privilege('anon', 'public.pass_products', 'SELECT')
     OR has_table_privilege('anon', 'public.pass_products', 'INSERT')
     OR has_table_privilege('anon', 'public.pass_products', 'UPDATE')
     OR has_table_privilege('anon', 'public.pass_products', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.pass_products', 'SELECT')
  THEN
    RAISE EXCEPTION 'A4: Schreibrechte für authenticated/anon auf pass_products nicht entzogen oder SELECT fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'pass_products'
      AND t.tgname = 'pass_products_no_delete'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%BEFORE DELETE%'
  ) THEN
    RAISE EXCEPTION 'A4: Trigger pass_products_no_delete fehlt';
  END IF;

  IF has_function_privilege('anon', 'yogaflow_private.pass_products_no_delete()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'yogaflow_private.pass_products_no_delete()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A4: anon/authenticated hat EXECUTE auf pass_products_no_delete';
  END IF;

  SELECT p.oid INTO v_create_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_pass_product'
    AND pg_get_function_identity_arguments(p.oid)
      = 'p_name text, p_units integer, p_price_cents integer, p_validity_rule text, p_validity_value integer'
    AND p.prosecdef;

  SELECT p.oid INTO v_update_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'update_pass_product'
    AND pg_get_function_identity_arguments(p.oid)
      = 'p_id uuid, p_name text, p_units integer, p_price_cents integer, p_validity_rule text, p_validity_value integer'
    AND p.prosecdef;

  SELECT p.oid INTO v_archive_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_pass_product_archived'
    AND pg_get_function_identity_arguments(p.oid) = 'p_id uuid, p_archived boolean'
    AND p.prosecdef;

  IF v_create_oid IS NULL OR v_update_oid IS NULL OR v_archive_oid IS NULL THEN
    RAISE EXCEPTION 'A4: eine RPC fehlt oder ist nicht SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_create_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_update_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_archive_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) THEN
    RAISE EXCEPTION 'A4: search_path einer RPC ist nicht leer';
  END IF;

  IF has_function_privilege('anon', v_create_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_update_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_archive_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A4: anon hat EXECUTE auf eine pass_product-RPC';
  END IF;

  IF NOT has_function_privilege('authenticated', v_create_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_update_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_archive_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A4: authenticated braucht EXECUTE auf die drei RPCs';
  END IF;

  SELECT CASE WHEN a.attnotnull THEN '1' ELSE '0' END
         || '|'
         || COALESCE(pg_get_expr(d.adbin, d.adrelid), '')
    INTO v_con
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.courses'::regclass
    AND a.attname = 'pass_eligible'
    AND NOT a.attisdropped;

  IF v_con IS NULL
     OR split_part(v_con, '|', 1) <> '1'
     OR split_part(v_con, '|', 2) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION 'A4: courses.pass_eligible fehlt oder ist nicht NOT NULL DEFAULT true (% )', v_con;
  END IF;

  SELECT pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
    INTO v_def;
  IF v_def NOT LIKE '%pass_products%'
     OR v_def NOT LIKE '%yogaflow.allow_pass_product_delete%'
  THEN
    RAISE EXCEPTION 'A4: delete_tenant_complete enthält pass_products / Schalter nicht';
  END IF;
END;
$$;
