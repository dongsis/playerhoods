CREATE OR REPLACE FUNCTION public.rpc_match_removed_participant_notification_targets(p_match_participant_id uuid)
RETURNS TABLE(participant_id uuid, channel text, destination text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT mp.match_id
  INTO v_match_id
  FROM public.match_participants mp
  WHERE mp.id = p_match_participant_id;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = v_match_id
      AND m.organizer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    mp.id,
    CASE
      WHEN COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms'
        AND NULLIF(trim(p.contact_phone), '') IS NOT NULL
        THEN 'sms'::text
      ELSE 'email'::text
    END,
    CASE
      WHEN COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms'
        AND NULLIF(trim(p.contact_phone), '') IS NOT NULL
        THEN trim(p.contact_phone)
      ELSE COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text)
    END
  FROM public.match_participants mp
  JOIN public.profiles p ON p.id = mp.user_id
  JOIN auth.users u ON u.id = mp.user_id
  WHERE mp.id = p_match_participant_id
    AND mp.user_id IS NOT NULL
    AND (
      (COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') = 'sms' AND NULLIF(trim(p.contact_phone), '') IS NOT NULL)
      OR COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) IS NOT NULL
    );

  RETURN QUERY
  SELECT
    mp.id,
    'email'::text,
    trim(g.email)
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.id = p_match_participant_id
    AND mp.guest_id IS NOT NULL
    AND NULLIF(trim(g.email), '') IS NOT NULL;

  RETURN QUERY
  SELECT
    mp.id,
    'sms'::text,
    trim(g.phone)
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.id = p_match_participant_id
    AND mp.guest_id IS NOT NULL
    AND NULLIF(trim(g.email), '') IS NULL
    AND NULLIF(trim(g.phone), '') IS NOT NULL;
END;
$$;

ALTER FUNCTION public.rpc_match_removed_participant_notification_targets(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_removed_participant_notification_targets(uuid) IS
  'Returns direct notification targets for the organizer-removed participant. Users respect contact_channel; guests fall back from email to SMS.';

GRANT ALL ON FUNCTION public.rpc_match_removed_participant_notification_targets(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_removed_participant_notification_targets(uuid) TO service_role;
