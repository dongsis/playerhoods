-- identity_links: map verified email (magic link) to user_id and legacy rows
-- Link-first: keep historical guest records intact; app treats them as same person

CREATE TABLE IF NOT EXISTS public.identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'email',
  verified_email text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_type text NOT NULL CHECK (linked_type IN ('guest_participant', 'contact', 'invitation_target')),
  linked_id uuid NOT NULL,
  linked_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, linked_type, linked_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_links_verified_email
  ON public.identity_links (lower(trim(verified_email)));

CREATE INDEX IF NOT EXISTS idx_identity_links_user_id
  ON public.identity_links (user_id);

CREATE INDEX IF NOT EXISTS idx_identity_links_linked
  ON public.identity_links (linked_type, linked_id);

ALTER TABLE public.identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_links_select_own ON public.identity_links
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY identity_links_insert_service ON public.identity_links
  FOR INSERT TO authenticated WITH CHECK (true);

COMMENT ON TABLE public.identity_links IS 'Maps verified email to user_id and legacy rows (guest participants, invitations). Link-first: no in-place mutation of historical records.';
