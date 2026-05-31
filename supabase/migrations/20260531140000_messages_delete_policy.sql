-- Erlaubt authentifizierten Nutzern das Löschen eigener Nachrichten
-- (gesendet oder empfangen) innerhalb des eigenen Mandanten.

DROP POLICY IF EXISTS "messages_delete_own" ON public.messages;

CREATE POLICY "messages_delete_own"
  ON public.messages FOR DELETE
  TO authenticated
  USING (
    tenant_id = yogaflow_private.get_my_tenant_id()
    AND (sender_id = auth.uid() OR recipient_id = auth.uid())
  );
