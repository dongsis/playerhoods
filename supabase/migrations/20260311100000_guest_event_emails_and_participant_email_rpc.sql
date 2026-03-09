-- Guest event emails: nominated, org_approved, delegate_confirmed, match_formed
-- RPC to get participant email (user or guest)

-- 1) Get email for a single participant (user: profile/auth; guest: guests.email)
CREATE OR REPLACE FUNCTION public.rpc_match_participant_email(p_match_participant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp  public.match_participants%rowtype;
  v_email text;
BEGIN
  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_mp.user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) INTO v_email
    FROM public.profiles p
    JOIN auth.users u ON u.id = v_mp.user_id
    WHERE p.id = v_mp.user_id;
    RETURN v_email;
  END IF;

  IF v_mp.guest_id IS NOT NULL THEN
    SELECT NULLIF(trim(g.email), '') INTO v_email
    FROM public.guests g
    WHERE g.id = v_mp.guest_id;
    RETURN v_email;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_participant_email(uuid) IS
'Returns email for a participant (user: profile/auth; guest: guests.email). NULL if no email.';

-- 2) Get all confirmed participant emails for a match (users + guests with email, excl. organizer)
CREATE OR REPLACE FUNCTION public.rpc_match_confirmed_participant_emails(p_match_id uuid)
RETURNS TABLE (participant_id uuid, email text, contact_channel text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organizer_id INTO v_org_id FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- User participants
  RETURN QUERY
  SELECT
    mp.id,
    COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text),
    COALESCE(NULLIF(trim(p.contact_channel), ''), 'email')
  FROM public.match_participants mp
  JOIN public.profiles p ON p.id = mp.user_id
  JOIN auth.users u ON u.id = mp.user_id
  WHERE mp.match_id = p_match_id
    AND mp.user_id IS NOT NULL
    AND mp.user_id != v_org_id
    AND mp.removed_at IS NULL
    AND mp.status = 'confirmed'
    AND COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) IS NOT NULL;

  -- Guest participants
  RETURN QUERY
  SELECT
    mp.id,
    NULLIF(trim(g.email), ''),
    'email'::text
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_match_id
    AND mp.guest_id IS NOT NULL
    AND mp.removed_at IS NULL
    AND mp.status = 'confirmed'
    AND NULLIF(trim(g.email), '') IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_confirmed_participant_emails(uuid) IS
'Returns email for all confirmed participants (users + guests), excl. organizer. For match_formed notifications.';

GRANT EXECUTE ON FUNCTION public.rpc_match_participant_email(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_match_confirmed_participant_emails(uuid) TO authenticated, service_role;
