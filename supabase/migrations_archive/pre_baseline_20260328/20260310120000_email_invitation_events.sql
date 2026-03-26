-- Audit trail for invitation state machine

CREATE TABLE IF NOT EXISTS public.email_invitation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL REFERENCES public.email_invitations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_invitation_events_invitation
  ON public.email_invitation_events (invitation_id, created_at ASC);

ALTER TABLE public.email_invitation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_invitation_events_internal ON public.email_invitation_events
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.email_invitation_events IS 'Audit events for invitation lifecycle. event_type: invitation_created, email_delivery_requested, email_sent, email_failed, invitation_opened, invitation_verified_email, invitation_landed, invitation_accepted, invitation_declined, invitation_expired.';
