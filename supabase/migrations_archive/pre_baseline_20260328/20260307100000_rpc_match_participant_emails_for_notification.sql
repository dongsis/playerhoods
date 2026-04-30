-- v1.7: RPC to fetch participant emails for notifications.
-- Returns user_id, email, contact_channel for confirmed user participants (excluding organizer).
-- Email = COALESCE(profiles.contact_email, auth.users.email).
-- SECURITY DEFINER to read auth.users.
-- Caller must be organizer or confirmed participant.

CREATE OR REPLACE FUNCTION public.rpc_match_participant_emails_for_notification(p_match_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  contact_channel text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
      AND (
        m.organizer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = p_match_id AND mp.user_id = auth.uid()
            AND mp.status = 'confirmed' AND mp.removed_at IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    mp.user_id,
    COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) AS email,
    COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') AS contact_channel
  FROM public.match_participants mp
  JOIN public.profiles p ON p.id = mp.user_id
  JOIN auth.users u ON u.id = mp.user_id
  WHERE mp.match_id = p_match_id
    AND mp.user_id IS NOT NULL
    AND mp.removed_at IS NULL
    AND mp.user_id != (SELECT organizer_id FROM public.matches WHERE id = p_match_id)
    AND mp.org_approved_at IS NOT NULL
    AND (mp.status = 'confirmed' OR (mp.status = 'pending' AND mp.participant_accepted_at IS NULL))
    AND COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_participant_emails_for_notification(uuid) IS
'v1.7: Returns email + contact_channel for confirmed user participants (excl. organizer). Caller must be organizer or confirmed participant.';
