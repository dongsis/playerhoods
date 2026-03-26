-- Email invitation business object
-- Supports match invite via email + magic link + Accept/Decline

CREATE TABLE IF NOT EXISTS public.email_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_email text NOT NULL,
  target_name text,
  related_type text NOT NULL,
  related_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'canceled')),
  magic_link_flow_status text NOT NULL DEFAULT 'not_opened'
    CHECK (magic_link_flow_status IN ('not_opened', 'opened', 'verified_email', 'landed')),
  accepted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_invitations_target_email
  ON public.email_invitations (target_email);

CREATE INDEX IF NOT EXISTS idx_email_invitations_related
  ON public.email_invitations (related_type, related_id);

CREATE INDEX IF NOT EXISTS idx_email_invitations_status_created
  ON public.email_invitations (status, created_at DESC);

ALTER TABLE public.email_invitations ENABLE ROW LEVEL SECURITY;

-- No direct client SELECT: use server-side getInvitationById
CREATE POLICY email_invitations_no_direct_select ON public.email_invitations
  FOR SELECT TO authenticated USING (false);

-- Inviter can insert
CREATE POLICY email_invitations_insert_inviter ON public.email_invitations
  FOR INSERT TO authenticated WITH CHECK (inviter_user_id = auth.uid());

-- Updates via RPC only (accept/decline/flow status)
CREATE POLICY email_invitations_no_direct_update ON public.email_invitations
  FOR UPDATE TO authenticated USING (false);

COMMENT ON TABLE public.email_invitations IS 'Email-based invitations. related_type=match for v1. Magic link verifies email; Accept/Decline on invitation page.';
