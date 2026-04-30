CREATE TABLE IF NOT EXISTS public.match_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NULL,
  deleted_at timestamptz NULL,
  CONSTRAINT match_messages_body_present CHECK (char_length(btrim(body)) > 0),
  CONSTRAINT match_messages_body_length CHECK (char_length(body) <= 2000)
);

COMMENT ON TABLE public.match_messages IS 'MVP public coordination chat for a match.';
COMMENT ON COLUMN public.match_messages.body IS 'Plain text body for the public match chat.';

CREATE INDEX IF NOT EXISTS idx_match_messages_match_created_at
  ON public.match_messages (match_id, created_at);

CREATE OR REPLACE FUNCTION public.can_access_match_communication(
  p_match_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_match_organizer(p_match_id, p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
        AND mp.user_id = p_user_id
        AND mp.removed_at IS NULL
        AND mp.status IN ('pending', 'confirmed', 'waiting_list')
    )
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp
      JOIN public.identity_links il
        ON il.linked_type = 'guest_participant'
       AND il.linked_id = mp.id
       AND il.user_id = p_user_id
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND mp.status IN ('pending', 'confirmed', 'waiting_list')
    );
$$;

ALTER FUNCTION public.can_access_match_communication(uuid, uuid) OWNER TO postgres;

GRANT ALL ON FUNCTION public.can_access_match_communication(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_match_communication(uuid, uuid) TO service_role;

ALTER TABLE public.match_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY match_messages_select_v1
  ON public.match_messages
  FOR SELECT
  TO authenticated
  USING (public.can_access_match_communication(match_id, auth.uid()));

CREATE POLICY match_messages_insert_v1
  ON public.match_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND deleted_at IS NULL
    AND public.can_access_match_communication(match_id, auth.uid())
  );

GRANT ALL ON TABLE public.match_messages TO authenticated;
GRANT ALL ON TABLE public.match_messages TO service_role;
