-- K1 — create/update_pass_product + list_online_pass_products.
-- allow: create_pass_product,update_pass_product,list_online_pass_products

DROP FUNCTION IF EXISTS public.create_pass_product(text, integer, integer, text, integer);
DROP FUNCTION IF EXISTS public.update_pass_product(uuid, text, integer, integer, text, integer);

CREATE OR REPLACE FUNCTION public.create_pass_product(
  p_name text,
  p_units integer,
  p_price_cents integer,
  p_validity_rule text,
  p_validity_value integer,
  p_description text DEFAULT NULL,
  p_online_purchasable boolean DEFAULT false
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
  v_desc text;
  v_online boolean := COALESCE(p_online_purchasable, false);
  v_block text;
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

  v_desc := NULLIF(btrim(COALESCE(p_description, '')), '');
  IF v_desc IS NOT NULL AND length(v_desc) > 140 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DESCRIPTION');
  END IF;

  IF v_online THEN
    v_block := yogaflow_private.online_method_block_reason(v_tenant_id, p_price_cents);
    IF v_block IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'error', 'ONLINE_NOT_AVAILABLE',
        'block_reason', v_block
      );
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.pass_products (
      tenant_id,
      name,
      units,
      price_cents,
      validity_rule,
      validity_value,
      description,
      online_purchasable
    ) VALUES (
      v_tenant_id,
      v_name,
      p_units,
      p_price_cents,
      p_validity_rule,
      p_validity_value,
      v_desc,
      v_online
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
      'validity_value', p_validity_value,
      'online_purchasable', v_online
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
      'validity_value',
      'description',
      'online_purchasable'
    ]::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object('success', true, 'id', v_id);
END;
$function$;

COMMENT ON FUNCTION public.create_pass_product(text, integer, integer, text, integer, text, boolean) IS
  'K1: Kartenprodukt anlegen inkl. Beschreibung und Online-Schalter (Guard ≤250 € / online bereit).';

REVOKE ALL ON FUNCTION public.create_pass_product(text, integer, integer, text, integer, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pass_product(text, integer, integer, text, integer, text, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.update_pass_product(
  p_id uuid,
  p_name text,
  p_units integer,
  p_price_cents integer,
  p_validity_rule text,
  p_validity_value integer,
  p_description text DEFAULT NULL,
  p_online_purchasable boolean DEFAULT false
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
  v_desc text;
  v_online boolean := COALESCE(p_online_purchasable, false);
  v_block text;
  v_row public.pass_products%ROWTYPE;
  v_changed text[] := ARRAY[]::text[];
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

  v_desc := NULLIF(btrim(COALESCE(p_description, '')), '');
  IF v_desc IS NOT NULL AND length(v_desc) > 140 THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_DESCRIPTION');
  END IF;

  IF v_online THEN
    v_block := yogaflow_private.online_method_block_reason(v_tenant_id, p_price_cents);
    IF v_block IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'success', false,
        'error', 'ONLINE_NOT_AVAILABLE',
        'block_reason', v_block
      );
    END IF;
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
  IF v_row.description IS DISTINCT FROM v_desc THEN
    v_changed := array_append(v_changed, 'description');
  END IF;
  IF v_row.online_purchasable IS DISTINCT FROM v_online THEN
    v_changed := array_append(v_changed, 'online_purchasable');
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
      validity_value = p_validity_value,
      description = v_desc,
      online_purchasable = v_online
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
      'changed', to_jsonb(v_changed),
      'units', p_units,
      'price_cents', p_price_cents,
      'validity_rule', p_validity_rule,
      'validity_value', p_validity_value,
      'online_purchasable', v_online
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

COMMENT ON FUNCTION public.update_pass_product(uuid, text, integer, integer, text, integer, text, boolean) IS
  'K1: Kartenprodukt ändern inkl. Beschreibung und Online-Schalter.';

REVOKE ALL ON FUNCTION public.update_pass_product(uuid, text, integer, integer, text, integer, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_pass_product(uuid, text, integer, integer, text, integer, text, boolean)
  TO authenticated;

-- Teilnehmende: online kaufbare Produkte des eigenen Studios
CREATE OR REPLACE FUNCTION public.list_online_pass_products()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member uuid := yogaflow_private.get_my_member_id();
  v_tenant uuid := yogaflow_private.get_my_tenant_id();
  v_items jsonb;
BEGIN
  IF v_member IS NULL OR v_tenant IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'units', p.units,
      'price_cents', p.price_cents,
      'validity_rule', p.validity_rule,
      'validity_value', p.validity_value,
      'description', p.description,
      'price_per_unit_cents', CASE
        WHEN p.units > 0 THEN ROUND(p.price_cents::numeric / p.units::numeric)::integer
        ELSE NULL
      END
    )
    ORDER BY p.units ASC, p.price_cents ASC, p.name ASC
  ), '[]'::jsonb)
    INTO v_items
  FROM public.pass_products p
  WHERE p.tenant_id = v_tenant
    AND p.archived_at IS NULL
    AND p.online_purchasable = true
    AND yogaflow_private.online_method_block_reason(v_tenant, p.price_cents) IS NULL;

  RETURN pg_catalog.jsonb_build_object('success', true, 'products', v_items);
END;
$function$;

COMMENT ON FUNCTION public.list_online_pass_products() IS
  'K1: Online kaufbare Kartenprodukte für Teilnehmende (nur wenn Studio online bereit und ≤250 €).';

REVOKE ALL ON FUNCTION public.list_online_pass_products()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_online_pass_products()
  TO authenticated;

DO $$
BEGIN
  IF NOT has_function_privilege(
    'authenticated',
    'public.create_pass_product(text,integer,integer,text,integer,text,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'K1 products: create_pass_product nicht für authenticated';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.list_online_pass_products()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'K1 products: list_online_pass_products für anon freigegeben';
  END IF;
  IF to_regprocedure('public.create_pass_product(text,integer,integer,text,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'K1 products: alte create_pass_product-Signatur noch da';
  END IF;
END;
$$;
