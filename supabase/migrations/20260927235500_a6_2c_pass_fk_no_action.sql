-- A6-2c — registrations_pass_id_fkey: NO ACTION statt RESTRICT.
--
-- Zweck: A6-2b machte die FK DEFERRABLE, ließ aber ON DELETE RESTRICT.
-- In Postgres wird RESTRICT nie aufgeschoben (auch nicht bei DEFERRABLE);
-- aufschiebbar ist nur NO ACTION. Deshalb scheiterte delete_tenant_complete
-- weiter an registrations_pass_id_fkey.
--
-- Alltag: INITIALLY IMMEDIATE + NO ACTION verhält sich wie RESTRICT
-- (Prüfung sofort). Nur SET CONSTRAINTS … DEFERRED in delete_tenant_complete
-- (unverändert aus A6-2b) nutzt den Unterschied.
--
-- delete_tenant_complete bleibt wie in A6-2b (kein Ersatz).
--
-- Rückweg (vollständig, läuft nicht):
--
-- ALTER TABLE public.registrations
--   DROP CONSTRAINT IF EXISTS registrations_pass_id_fkey;
-- ALTER TABLE public.registrations
--   ADD CONSTRAINT registrations_pass_id_fkey
--   FOREIGN KEY (pass_id) REFERENCES public.passes (id)
--   ON DELETE RESTRICT
--   DEFERRABLE INITIALLY IMMEDIATE;
-- COMMENT ON CONSTRAINT registrations_pass_id_fkey ON public.registrations IS
--   'A6-2b: DEFERRABLE für delete_tenant_complete; INITIALLY IMMEDIATE = Alltag wie RESTRICT.';

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_pass_id_fkey;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_pass_id_fkey
  FOREIGN KEY (pass_id) REFERENCES public.passes (id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY IMMEDIATE;

COMMENT ON CONSTRAINT registrations_pass_id_fkey ON public.registrations IS
  'A6-2c: ON DELETE NO ACTION DEFERRABLE INITIALLY IMMEDIATE — RESTRICT ist nicht aufschiebbar.';

DO $$
DECLARE
  v_deltype "char";
  v_deferrable boolean;
  v_deferred boolean;
BEGIN
  SELECT c.confdeltype, c.condeferrable, c.condeferred
    INTO v_deltype, v_deferrable, v_deferred
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public'
    AND r.relname = 'registrations'
    AND c.conname = 'registrations_pass_id_fkey'
    AND c.contype = 'f';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A6-2c: registrations_pass_id_fkey fehlt';
  END IF;

  -- 'a' = NO ACTION, 'r' = RESTRICT
  IF v_deltype IS DISTINCT FROM 'a' THEN
    RAISE EXCEPTION 'A6-2c: confdeltype = %, erwartet a (NO ACTION)', v_deltype;
  END IF;

  IF v_deferrable IS NOT TRUE THEN
    RAISE EXCEPTION 'A6-2c: registrations_pass_id_fkey ist nicht DEFERRABLE';
  END IF;

  IF v_deferred IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'A6-2c: muss INITIALLY IMMEDIATE sein (condeferred=false)';
  END IF;

  IF position(
       'SET CONSTRAINTS public.registrations_pass_id_fkey DEFERRED'
       in pg_get_functiondef('public.delete_tenant_complete(uuid)'::regprocedure)
     ) = 0
  THEN
    RAISE EXCEPTION 'A6-2c: delete_tenant_complete ohne SET CONSTRAINTS (A6-2b erwartet)';
  END IF;
END;
$$;
