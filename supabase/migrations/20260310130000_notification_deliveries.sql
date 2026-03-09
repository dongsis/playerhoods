-- Delivery queue for email/SMS. Worker picks queued rows and sends via provider.

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  email_invitation_id uuid REFERENCES public.email_invitations(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'email',
  provider text NOT NULL DEFAULT 'resend',
  destination text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempt_count int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  error_code text,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_queued
  ON public.notification_deliveries (delivery_status, created_at ASC)
  WHERE delivery_status = 'queued';

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_deliveries_internal ON public.notification_deliveries
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.notification_deliveries IS 'Delivery queue. Worker processes queued rows, sends via Resend, updates status.';
