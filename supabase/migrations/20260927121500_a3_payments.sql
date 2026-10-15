-- A3 — Zahlungsvermerk bar / PayPal / Überweisung.
--
-- Zweck: Tabelle payments mit dem vollen Zustandsmodell aus Story 2.1.
-- Stripe fügt später nur Zeilen hinzu. Dieser Schritt legt manuelle Vermerke
-- an (provider manual, Status direkt succeeded), setzt die Deckung auf paid
-- und nimmt sie nur über eine Gegenzeile zurück.
--
-- Bezug: A3, Story 2.1, E5, E14, E15, P1–P8.
-- P1: payments.registration_id ON DELETE RESTRICT. Bis 4.3 scheitert das
--     Löschen eines Profils mit Zahlungsvermerk. Kein Lösch-Knopf in der UI.
-- P2: Neue Vermerke auf status cancelled → CANCELLED, auf waitlist →
--     NOT_REGISTERED. Ein bestehender Vermerk überlebt die Stornierung.
-- P3: owner/admin in allen Kursen, teacher nur über is_course_teacher.
--     Ein mitgeschickter Betrag einer Lehrenden wird ignoriert.
-- P4: Rücknahme innerhalb von 15 Minuten durch recorded_by, auch als teacher.
--     Danach nur owner/admin. Ergänzt E15.
-- P5: Gegenzeile mit negativem Betrag, gleicher Methode, reverses_payment_id.
--     Eine Zahlung hat höchstens eine Gegenzeile.
-- P6: Kein Schema für den Hinweis „keine Kasse“. Text kommt in der UI (Schritt 2).
-- P7: Event subject_type payment, subject_id = payments.id, neue causation_id.
--     registration_id nur im Payload. Notiz nicht im Payload und nicht im Audit-Text.
-- P8: Buchung FOR UPDATE, nur bei coverage_status open. Zweiter Tipp → NOT_OPEN.
-- E14: kein Beleg. E5: Lehrende lesen keine Zahlungszeilen.
--
-- Notiz: bleibt auf payments.note. Grund ist Art. 17, wie beim Erlass (A2):
-- Freitext gehört nicht ins append-only audit_log. changed_fields nennt die
-- Spalte, kopiert den Text nicht.
--
-- recorded_by zeigt auf users mit ON DELETE SET NULL. Das ist der Akteur,
-- nicht Teil des Belegs. registration_id, tenant_id und reverses_payment_id
-- bleiben RESTRICT (P1, 4.3).
--
-- Löschschalter: gleicher Weg wie events/audit_log. DELETE auf payments ist
-- für alle Rollen verboten. delete_tenant_complete setzt
-- SET LOCAL yogaflow.allow_payment_delete = 'on'. Der Trigger lässt das nur
-- zu, wenn der Schalter an ist und current_user nicht anon oder authenticated
-- ist. Grund: SET LOCAL einer eigenen Variable kann jede Sitzung. Ohne die
-- Rollenprüfung würde ein späterer Tabellen-GRANT den Schalter umgehen.
-- Die Funktion läuft als SECURITY DEFINER (Eigentümer postgres), deshalb
-- sieht der Trigger dort postgres und nicht die aufrufende Rolle.
--
-- Rückweg (ausführbar; diese Zeilen sind Kommentar und laufen hier nicht).
-- Events und Audit-Zeilen eines echten Vermerks sind dann schon append-only;
-- ein Studio mit Zahlungen lässt sich nur löschen, solange die neue Fassung
-- von delete_tenant_complete noch da ist. Zuerst die Funktion aus
-- 20260925163414 (unten) zurücksetzen, dann die Objekte fallen lassen.
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
--     DELETE FROM public.audit_log WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.events WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.user_notifications WHERE tenant_id = p_tenant_id;
--     DELETE FROM public.messages WHERE tenant_id = p_tenant_id;
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
-- DROP FUNCTION IF EXISTS public.reverse_manual_payment(uuid, text);
-- DROP FUNCTION IF EXISTS public.record_manual_payment(uuid, text, integer, text);
-- DROP TRIGGER IF EXISTS payments_no_delete ON public.payments;
-- DROP TRIGGER IF EXISTS payments_immutable ON public.payments;
-- DROP FUNCTION IF EXISTS yogaflow_private.payments_no_delete();
-- DROP FUNCTION IF EXISTS yogaflow_private.payments_immutable();
-- DROP TABLE IF EXISTS public.payments;
-- DROP TYPE IF EXISTS public.payment_method;
-- DROP TYPE IF EXISTS public.payment_provider;
-- DROP TYPE IF EXISTS public.payment_status;

-- ---------------------------------------------------------------------------
-- 1. Typen
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'payment_status'
  ) THEN
    CREATE TYPE public.payment_status AS ENUM (
      'initiated',
      'processing',
      'succeeded',
      'failed',
      'canceled',
      'refunded_partial',
      'refunded',
      'disputed'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'payment_provider'
  ) THEN
    CREATE TYPE public.payment_provider AS ENUM ('manual', 'stripe');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'payment_method'
  ) THEN
    CREATE TYPE public.payment_method AS ENUM (
      'cash',
      'bank_transfer',
      'paypal_manual',
      'card'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Tabelle
-- ---------------------------------------------------------------------------

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  registration_id uuid,
  provider public.payment_provider NOT NULL,
  provider_ref text,
  method public.payment_method NOT NULL,
  status public.payment_status NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  reverses_payment_id uuid,
  received_at timestamptz NOT NULL,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  expected_settlement_at timestamptz,
  settled_at timestamptz,
  recorded_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT payments_registration_id_fkey
    FOREIGN KEY (registration_id) REFERENCES public.registrations (id) ON DELETE RESTRICT,
  CONSTRAINT payments_recorded_by_fkey
    FOREIGN KEY (recorded_by) REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT payments_reverses_payment_id_fkey
    FOREIGN KEY (reverses_payment_id) REFERENCES public.payments (id) ON DELETE RESTRICT,
  CONSTRAINT payments_amount_nonzero
    CHECK (amount_cents <> 0),
  CONSTRAINT payments_currency_eur
    CHECK (currency = 'EUR'),
  CONSTRAINT payments_subject_type_check
    CHECK (subject_type IN ('registration', 'pass_purchase')),
  CONSTRAINT payments_registration_subject_check
    CHECK (
      (
        subject_type = 'registration'
        AND registration_id IS NOT NULL
        AND registration_id = subject_id
      )
      OR (
        subject_type = 'pass_purchase'
        AND registration_id IS NULL
      )
    ),
  CONSTRAINT payments_manual_method_check
    CHECK (
      provider <> 'manual'::public.payment_provider
      OR method IN (
        'cash'::public.payment_method,
        'bank_transfer'::public.payment_method,
        'paypal_manual'::public.payment_method
      )
    ),
  CONSTRAINT payments_reversal_sign_check
    CHECK ((reverses_payment_id IS NULL) = (amount_cents > 0))
);

CREATE UNIQUE INDEX payments_one_reversal_idx
  ON public.payments (reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

CREATE INDEX payments_tenant_received_at_idx
  ON public.payments (tenant_id, received_at);

CREATE INDEX payments_registration_id_idx
  ON public.payments (registration_id);

COMMENT ON TABLE public.payments IS
  'Zahlungen und manuelle Vermerke. Append-only außer status, status_changed_at, settled_at, provider_ref (für Stripe). Korrektur nur als Gegenzeile. Kein Barbeleg (E14).';

COMMENT ON COLUMN public.payments.note IS
  'Optionale Notiz. Pflicht, wenn owner/admin vom eingefrorenen Preis abweichen. Nicht im Event-Payload.';

COMMENT ON COLUMN public.payments.recorded_by IS
  'Profil, das den Vermerk gesetzt hat. Akteur, nicht Teil des Belegs. ON DELETE SET NULL.';

COMMENT ON COLUMN public.payments.received_at IS
  'Zahlungseingang. Buchungsdatum für das spätere Hauptbuch (A7).';

COMMENT ON COLUMN public.payments.reverses_payment_id IS
  'Gesetzt genau dann, wenn amount_cents negativ ist. Höchstens eine Gegenzeile je Zahlung.';

-- ---------------------------------------------------------------------------
-- 3. Schutz: RLS, kein DELETE, kein stilles UPDATE
-- ---------------------------------------------------------------------------

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT yogaflow_private.get_my_tenant_id())
    AND (
      (SELECT yogaflow_private.is_tenant_manager())
      OR registration_id IN (
        SELECT r.id
        FROM public.registrations r
        WHERE r.user_id = (SELECT yogaflow_private.get_my_member_id())
      )
    )
  );

REVOKE ALL ON TABLE public.payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;

CREATE OR REPLACE FUNCTION yogaflow_private.payments_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF pg_catalog.current_setting('yogaflow.allow_payment_delete', true) = 'on'
     AND current_user::text NOT IN ('anon', 'authenticated')
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'payments: DELETE ist nicht erlaubt'
    USING ERRCODE = '42501';
END;
$function$;

CREATE TRIGGER payments_no_delete
  BEFORE DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.payments_no_delete();

CREATE OR REPLACE FUNCTION yogaflow_private.payments_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
     OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
     OR NEW.registration_id IS DISTINCT FROM OLD.registration_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.reverses_payment_id IS DISTINCT FROM OLD.reverses_payment_id
     OR NEW.received_at IS DISTINCT FROM OLD.received_at
     OR NEW.expected_settlement_at IS DISTINCT FROM OLD.expected_settlement_at
     OR NEW.recorded_by IS DISTINCT FROM OLD.recorded_by
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'payments: diese Spalten sind unveränderlich'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER payments_immutable
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION yogaflow_private.payments_immutable();

REVOKE ALL ON FUNCTION yogaflow_private.payments_no_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION yogaflow_private.payments_immutable() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. record_manual_payment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_manual_payment(
  p_registration_id uuid,
  p_method text,
  p_amount_cents integer DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_row public.registrations%ROWTYPE;
  v_manager boolean;
  v_amount integer;
  v_note text;
  v_method public.payment_method;
  v_payment_id uuid;
  v_received timestamptz;
  v_event_id uuid;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_row
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  v_manager := yogaflow_private.is_tenant_manager();
  IF NOT v_manager AND NOT yogaflow_private.is_course_teacher(v_row.course_id) THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF v_row.status = 'cancelled'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'CANCELLED');
  END IF;

  IF v_row.status = 'waitlist'::public.registration_status THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_REGISTERED');
  END IF;

  IF v_row.coverage_status IS DISTINCT FROM 'open'::public.registration_coverage_status THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', false,
      'error', 'NOT_OPEN',
      'coverage_status', v_row.coverage_status::text
    );
  END IF;

  IF p_method IS NULL OR p_method NOT IN ('cash', 'bank_transfer', 'paypal_manual') THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_METHOD');
  END IF;

  v_method := p_method::public.payment_method;
  v_amount := v_row.price_cents_at_booking;
  v_note := NULLIF(pg_catalog.btrim(p_note), '');

  -- Lehrende: mitgeschickter Betrag wird ignoriert (A3-Akzeptanz), kein Fehler.
  -- owner/admin: abweichender Betrag nur > 0 und mit Notiz (mindestens 3 Zeichen).
  IF v_manager
     AND p_amount_cents IS NOT NULL
     AND p_amount_cents IS DISTINCT FROM v_row.price_cents_at_booking
  THEN
    IF p_amount_cents <= 0 THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
    END IF;
    IF v_note IS NULL OR pg_catalog.length(v_note) < 3 THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOTE_REQUIRED');
    END IF;
    v_amount := p_amount_cents;
  END IF;

  v_received := pg_catalog.now();

  INSERT INTO public.payments (
    tenant_id,
    subject_type,
    subject_id,
    registration_id,
    provider,
    method,
    status,
    amount_cents,
    currency,
    received_at,
    recorded_by,
    note
  ) VALUES (
    v_row.tenant_id,
    'registration',
    p_registration_id,
    p_registration_id,
    'manual'::public.payment_provider,
    v_method,
    'succeeded'::public.payment_status,
    v_amount,
    'EUR',
    v_received,
    v_member_id,
    v_note
  )
  RETURNING id INTO v_payment_id;

  UPDATE public.registrations
  SET coverage_status = 'paid'::public.registration_coverage_status
  WHERE id = p_registration_id;

  v_event_id := yogaflow_private.insert_event(
    v_row.tenant_id,
    'payment.recorded',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'registration_id', p_registration_id,
      'amount_cents', v_amount,
      'currency', 'EUR',
      'method', v_method::text,
      'provider', 'manual',
      'received_at', v_received
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_row.tenant_id,
    v_member_id,
    'payment.recorded',
    'payments',
    v_payment_id,
    ARRAY[
      'amount_cents',
      'currency',
      'method',
      'provider',
      'status',
      'received_at',
      'recorded_by',
      'registration_id',
      'note'
    ]::text[],
    v_event_id
  );

  PERFORM yogaflow_private.insert_audit(
    v_row.tenant_id,
    v_member_id,
    'payment.recorded',
    'registrations',
    p_registration_id,
    ARRAY['coverage_status']::text[],
    v_event_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'amount_cents', v_amount,
    'method', v_method::text
  );
END;
$function$;

COMMENT ON FUNCTION public.record_manual_payment(uuid, text, integer, text) IS
  'Manueller Zahlungsvermerk. Betrag ist price_cents_at_booking; owner/admin dürfen mit Notiz abweichen. Lehrende nur im eigenen Kurs, mitgeschickter Betrag wird ignoriert. Deckung wird paid.';

-- ---------------------------------------------------------------------------
-- 5. reverse_manual_payment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_manual_payment(
  p_payment_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_member_id uuid;
  v_tenant_id uuid;
  v_pay public.payments%ROWTYPE;
  v_row public.registrations%ROWTYPE;
  v_note text;
  v_payment_id uuid;
  v_received timestamptz;
  v_amount integer;
  v_event_id uuid;
  v_open boolean;
BEGIN
  v_member_id := yogaflow_private.get_my_member_id();
  v_tenant_id := yogaflow_private.get_my_tenant_id();
  IF v_member_id IS NULL OR v_tenant_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
    INTO v_pay
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND OR v_pay.tenant_id IS DISTINCT FROM v_tenant_id OR v_pay.registration_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  SELECT *
    INTO v_row
  FROM public.registrations
  WHERE id = v_pay.registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_tenant_id THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF v_pay.provider IS DISTINCT FROM 'manual'::public.payment_provider
     OR v_pay.reverses_payment_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.payments rev
       WHERE rev.reverses_payment_id = v_pay.id
     )
  THEN
    RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REVERSED');
  END IF;

  -- P4: owner/admin immer. Sonst nur die Person, die den Vermerk gesetzt hat,
  -- und nur innerhalb von 15 Minuten. Danach FORBIDDEN, auch im eigenen Kurs.
  IF NOT yogaflow_private.is_tenant_manager() THEN
    IF v_pay.recorded_by IS DISTINCT FROM v_member_id
       OR v_pay.created_at <= pg_catalog.now() - interval '15 minutes'
    THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'FORBIDDEN');
    END IF;
  END IF;

  v_note := NULLIF(pg_catalog.btrim(p_note), '');
  v_amount := -v_pay.amount_cents;
  v_received := pg_catalog.now();

  BEGIN
    INSERT INTO public.payments (
      tenant_id,
      subject_type,
      subject_id,
      registration_id,
      provider,
      method,
      status,
      amount_cents,
      currency,
      reverses_payment_id,
      received_at,
      recorded_by,
      note
    ) VALUES (
      v_pay.tenant_id,
      'registration',
      v_pay.registration_id,
      v_pay.registration_id,
      'manual'::public.payment_provider,
      v_pay.method,
      'succeeded'::public.payment_status,
      v_amount,
      'EUR',
      v_pay.id,
      v_received,
      v_member_id,
      v_note
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN pg_catalog.jsonb_build_object('success', false, 'error', 'ALREADY_REVERSED');
  END;

  v_open := NOT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.registration_id = v_row.id
      AND p.amount_cents > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.payments rev
        WHERE rev.reverses_payment_id = p.id
      )
  );

  IF v_open AND v_row.coverage_status = 'paid'::public.registration_coverage_status THEN
    UPDATE public.registrations
    SET coverage_status = 'open'::public.registration_coverage_status
    WHERE id = v_row.id;
  END IF;

  v_event_id := yogaflow_private.insert_event(
    v_pay.tenant_id,
    'payment.reversed',
    'payment',
    v_payment_id,
    pg_catalog.jsonb_build_object(
      'payment_id', v_payment_id,
      'registration_id', v_pay.registration_id,
      'amount_cents', v_amount,
      'currency', 'EUR',
      'method', v_pay.method::text,
      'provider', 'manual',
      'received_at', v_received,
      'reverses_payment_id', v_pay.id
    ),
    pg_catalog.gen_random_uuid()
  );

  PERFORM yogaflow_private.insert_audit(
    v_pay.tenant_id,
    v_member_id,
    'payment.reversed',
    'payments',
    v_payment_id,
    ARRAY[
      'amount_cents',
      'method',
      'status',
      'reverses_payment_id',
      'received_at',
      'recorded_by',
      'note'
    ]::text[],
    v_event_id
  );

  IF v_open AND v_row.coverage_status = 'paid'::public.registration_coverage_status THEN
    PERFORM yogaflow_private.insert_audit(
      v_pay.tenant_id,
      v_member_id,
      'payment.reversed',
      'registrations',
      v_row.id,
      ARRAY['coverage_status']::text[],
      v_event_id
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'amount_cents', v_amount,
    'method', v_pay.method::text
  );
END;
$function$;

COMMENT ON FUNCTION public.reverse_manual_payment(uuid, text) IS
  'Gegenzeile zu einem manuellen Vermerk. owner/admin immer; die setzende Person 15 Minuten lang. Deckung wird open, wenn keine positive Zahlung ohne Gegenzeile übrig ist.';

REVOKE ALL ON FUNCTION public.record_manual_payment(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_payment(uuid, text, integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_manual_payment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_manual_payment(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. delete_tenant_complete: Zahlungen vor den Buchungen, Gegenzeilen zuerst
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
  'Löscht einen Mandanten in fester Reihenfolge: audit_log, events (Append-only per SET LOCAL yogaflow.allow_append_only_delete), user_notifications, messages, payments (Gegenzeilen zuerst, Schalter yogaflow.allow_payment_delete), registrations, courses, users, tenants. payments.registration_id und payments.tenant_id sind RESTRICT. prevent_last_owner_delete ist währenddessen pausiert. auth.users separat. Nur postgres/service_role. Jede neue Tabelle mit FK auf tenants/users muss hier ergänzt werden.';

-- ---------------------------------------------------------------------------
-- 7. Selbstprüfung
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_labels text[];
  v_record_oid oid;
  v_reverse_oid oid;
  v_record_definer boolean;
  v_reverse_definer boolean;
  v_def text;
  v_pay integer;
  v_reg integer;
  v_bad bigint;
  v_msg text;
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO v_labels
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'payment_status';

  IF v_labels IS DISTINCT FROM ARRAY[
    'initiated', 'processing', 'succeeded', 'failed', 'canceled',
    'refunded_partial', 'refunded', 'disputed'
  ]::text[] THEN
    RAISE EXCEPTION 'A3: payment_status ist %', v_labels;
  END IF;

  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO v_labels
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'payment_provider';

  IF v_labels IS DISTINCT FROM ARRAY['manual', 'stripe']::text[] THEN
    RAISE EXCEPTION 'A3: payment_provider ist %', v_labels;
  END IF;

  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO v_labels
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typname = 'payment_method';

  IF v_labels IS DISTINCT FROM ARRAY['cash', 'bank_transfer', 'paypal_manual', 'card']::text[] THEN
    RAISE EXCEPTION 'A3: payment_method ist %', v_labels;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'payments' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'A3: RLS auf payments fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_tenant_id_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE RESTRICT%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_registration_id_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE RESTRICT%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_reverses_payment_id_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE RESTRICT%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_recorded_by_fkey'
      AND pg_get_constraintdef(oid) ILIKE '%ON DELETE SET NULL%'
  ) THEN
    RAISE EXCEPTION 'A3: ein FK hat das falsche ON DELETE';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND contype = 'c'
      AND conname IN (
        'payments_amount_nonzero',
        'payments_currency_eur',
        'payments_subject_type_check',
        'payments_registration_subject_check',
        'payments_manual_method_check',
        'payments_reversal_sign_check'
      )
  ) <> 6 THEN
    RAISE EXCEPTION 'A3: CHECKs auf payments unvollständig';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'payments_one_reversal_idx'
      AND indexdef ILIKE '%UNIQUE%'
      AND indexdef ILIKE '%reverses_payment_id IS NOT NULL%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'payments_tenant_received_at_idx'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'payments_registration_id_idx'
  ) THEN
    RAISE EXCEPTION 'A3: ein Index auf payments fehlt';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.payments'::regclass
      AND polname = 'payments_select'
      AND polcmd = 'r'
      AND pg_get_expr(polqual, polrelid) ILIKE '%is_tenant_manager%'
      AND pg_get_expr(polqual, polrelid) ILIKE '%get_my_member_id%'
      AND pg_get_expr(polqual, polrelid) NOT ILIKE '%is_course_teacher%'
  ) THEN
    RAISE EXCEPTION 'A3: Policy payments_select fehlt oder zeigt Lehrenden Zahlungszeilen';
  END IF;

  IF has_table_privilege('anon', 'public.payments', 'SELECT')
     OR has_table_privilege('anon', 'public.payments', 'INSERT')
     OR has_table_privilege('anon', 'public.payments', 'UPDATE')
     OR has_table_privilege('anon', 'public.payments', 'DELETE')
     OR has_table_privilege('authenticated', 'public.payments', 'INSERT')
     OR has_table_privilege('authenticated', 'public.payments', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.payments', 'DELETE')
     OR NOT has_table_privilege('authenticated', 'public.payments', 'SELECT')
  THEN
    RAISE EXCEPTION 'A3: Grants auf payments sind nicht SELECT-only für authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'payments'
      AND t.tgname = 'payments_no_delete'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%BEFORE DELETE%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'payments'
      AND t.tgname = 'payments_immutable'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%BEFORE UPDATE%'
  ) THEN
    RAISE EXCEPTION 'A3: ein Schutz-Trigger fehlt';
  END IF;

  IF has_function_privilege('anon', 'yogaflow_private.payments_no_delete()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'yogaflow_private.payments_no_delete()', 'EXECUTE')
     OR has_function_privilege('anon', 'yogaflow_private.payments_immutable()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'yogaflow_private.payments_immutable()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A3: anon oder authenticated hat EXECUTE auf einen Zahlungs-Trigger';
  END IF;

  SELECT p.oid, p.prosecdef
    INTO v_record_oid, v_record_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'record_manual_payment'
    AND pg_get_function_identity_arguments(p.oid) = 'p_registration_id uuid, p_method text, p_amount_cents integer, p_note text';

  SELECT p.oid, p.prosecdef
    INTO v_reverse_oid, v_reverse_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'reverse_manual_payment'
    AND pg_get_function_identity_arguments(p.oid) = 'p_payment_id uuid, p_note text';

  IF v_record_oid IS NULL OR NOT v_record_definer OR v_reverse_oid IS NULL OR NOT v_reverse_definer THEN
    RAISE EXCEPTION 'A3: eine RPC fehlt oder ist nicht SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_record_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_options_to_table((SELECT proconfig FROM pg_proc WHERE oid = v_reverse_oid))
    WHERE option_name = 'search_path' AND option_value = '""'
  ) THEN
    RAISE EXCEPTION 'A3: search_path einer RPC ist nicht leer';
  END IF;

  IF has_function_privilege('anon', v_record_oid, 'EXECUTE')
     OR has_function_privilege('anon', v_reverse_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A3: anon hat EXECUTE auf eine Zahlungs-RPC';
  END IF;

  IF NOT has_function_privilege('authenticated', v_record_oid, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_reverse_oid, 'EXECUTE')
  THEN
    RAISE EXCEPTION 'A3: authenticated braucht EXECUTE auf beide Zahlungs-RPCs';
  END IF;

  SELECT count(*)
    INTO v_bad
  FROM public.registrations r
  WHERE (r.coverage_status = 'paid'::public.registration_coverage_status)
    IS DISTINCT FROM (
      EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.registration_id = r.id
          AND p.amount_cents > 0
          AND NOT EXISTS (
            SELECT 1
            FROM public.payments rev
            WHERE rev.reverses_payment_id = p.id
          )
      )
    );

  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'A3: % Buchungen verletzen paid <=> positive Zahlung ohne Gegenzeile', v_bad;
  END IF;

  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'delete_tenant_complete';

  v_pay := strpos(v_def, 'DELETE FROM public.payments');
  v_reg := strpos(v_def, 'DELETE FROM public.registrations');
  IF v_def NOT ILIKE '%allow_payment_delete%'
     OR v_pay = 0
     OR v_reg = 0
     OR v_pay > v_reg
  THEN
    RAISE EXCEPTION 'A3: delete_tenant_complete löscht payments nicht vor registrations';
  END IF;

  IF EXISTS (SELECT 1 FROM public.payments) THEN
    BEGIN
      DELETE FROM public.payments;
      RAISE EXCEPTION 'A3: DELETE ohne Schalter hat Zahlungen gelöscht';
    EXCEPTION
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg IS DISTINCT FROM 'payments: DELETE ist nicht erlaubt' THEN
          RAISE;
        END IF;
    END;
  ELSE
    RAISE NOTICE 'A3: keine Zahlungszeile, DELETE-Test übersprungen';
  END IF;
END
$$;
