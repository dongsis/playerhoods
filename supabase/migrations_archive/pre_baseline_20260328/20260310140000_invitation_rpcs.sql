-- RPCs for invitation flow: create, get, accept, decline, update flow status

-- Get invitation by id (for invitation page). Returns public display data.
-- Caller may be unauthenticated (to show "verify email" prompt) or authenticated.
CREATE OR REPLACE FUNCTION public.rpc_email_invitation_get(p_invitation_id uuid)
RETURNS TABLE (
  id uuid,
  inviter_user_id uuid,
  inviter_display_name text,
  target_email text,
  target_name text,
  related_type text,
  related_id uuid,
  status text,
  magic_link_flow_status text,
  accepted_by_user_id uuid,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  match_summary jsonb,
  caller_email_matches boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_inviter_name text;
  v_match jsonb;
  v_caller_email text;
BEGIN
  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT p.display_name INTO v_inviter_name
  FROM public.profiles p WHERE p.id = v_inv.inviter_user_id;

  v_match := NULL;
  IF v_inv.related_type = 'match' THEN
    SELECT jsonb_build_object(
      'match_id', m.id,
      'game_type', m.game_type,
      'match_date', m.match_date,
      'start_time', m.start_time,
      'club_name', c.name
    ) INTO v_match
    FROM public.matches m
    LEFT JOIN public.clubs c ON c.id = m.club_id
    WHERE m.id = v_inv.related_id;
  END IF;

  v_caller_email := NULL;
  IF auth.uid() IS NOT NULL THEN
    SELECT u.email INTO v_caller_email FROM auth.users u WHERE u.id = auth.uid();
  END IF;

  RETURN QUERY SELECT
    v_inv.id,
    v_inv.inviter_user_id,
    COALESCE(v_inviter_name, 'Someone'),
    v_inv.target_email,
    v_inv.target_name,
    v_inv.related_type,
    v_inv.related_id,
    v_inv.status,
    v_inv.magic_link_flow_status,
    v_inv.accepted_by_user_id,
    v_inv.accepted_at,
    v_inv.declined_at,
    v_inv.expires_at,
    v_inv.created_at,
    v_match,
    (lower(trim(v_caller_email)) = lower(trim(v_inv.target_email)));
END;
$$;

-- Create email invitation (organizer only for match)
CREATE OR REPLACE FUNCTION public.rpc_email_invitation_create(
  p_target_email text,
  p_target_name text,
  p_related_type text,
  p_related_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_related_id AND m.organizer_id = v_uid) THEN
    RAISE EXCEPTION 'not_match_organizer';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_related_id AND m.status = 'active') THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  INSERT INTO public.email_invitations (
    inviter_user_id, target_email, target_name, related_type, related_id, expires_at
  ) VALUES (
    v_uid, trim(lower(p_target_email)), NULLIF(trim(p_target_name), ''), p_related_type, p_related_id, p_expires_at
  )
  RETURNING * INTO v_inv;

  INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
  VALUES (
    'invitation.email_invitation_created',
    'email_invitation',
    v_inv.id,
    v_uid,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'related_type', v_inv.related_type,
      'related_id', v_inv.related_id,
      'target_email', v_inv.target_email,
      'target_name', v_inv.target_name,
      'inviter_user_id', v_inv.inviter_user_id,
      'inviter_display_name', (SELECT display_name FROM public.profiles WHERE id = v_uid)
    )
  );

  PERFORM public.rpc_process_domain_event((SELECT id FROM public.domain_events WHERE aggregate_id = v_inv.id AND event_type = 'invitation.email_invitation_created' ORDER BY created_at DESC LIMIT 1));

  RETURN v_inv;
END;
$$;

-- Accept invitation (session user email must match target_email)
CREATE OR REPLACE FUNCTION public.rpc_email_invitation_accept(p_invitation_id uuid)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_user_email text;
  v_existing_mp uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_uid;
  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF v_inv.related_type = 'match' THEN
    SELECT mp.id INTO v_existing_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_inv.related_id AND mp.user_id = v_uid AND mp.removed_at IS NULL
    LIMIT 1;
    IF FOUND THEN
      UPDATE public.email_invitations SET status = 'accepted', accepted_by_user_id = v_uid, accepted_at = now(), updated_at = now()
      WHERE id = p_invitation_id AND status = 'pending';
      SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
      IF v_inv.status = 'accepted' THEN
        INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
        VALUES (v_inv.id, 'invitation_accepted', v_uid);
      END IF;
      RETURN v_inv;
    END IF;
    PERFORM public.rpc_match_accept_email_invitation(v_inv.related_id, v_uid, p_invitation_id);
  END IF;

  UPDATE public.email_invitations
  SET status = 'accepted', accepted_by_user_id = v_uid, accepted_at = now(), updated_at = now()
  WHERE id = p_invitation_id AND status = 'pending';

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF v_inv.status = 'accepted' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_accepted', v_uid);
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES ('invitation.accepted', 'email_invitation', v_inv.id, v_uid, jsonb_build_object('invitation_id', v_inv.id, 'accepted_by_user_id', v_uid));
  END IF;
  RETURN v_inv;
END;
$$;

-- Decline invitation
CREATE OR REPLACE FUNCTION public.rpc_email_invitation_decline(p_invitation_id uuid)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_user_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_uid;
  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  UPDATE public.email_invitations
  SET status = 'declined', declined_at = now(), updated_at = now()
  WHERE id = p_invitation_id AND status = 'pending';

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF v_inv.status = 'declined' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_declined', v_uid);
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES ('invitation.declined', 'email_invitation', v_inv.id, v_uid, jsonb_build_object('invitation_id', v_inv.id));
  END IF;
  RETURN v_inv;
END;
$$;

-- Update magic_link_flow_status (for event processor / opened, verified, landed)
CREATE OR REPLACE FUNCTION public.rpc_email_invitation_update_flow_status(
  p_invitation_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  UPDATE public.email_invitations
  SET magic_link_flow_status = p_status, updated_at = now()
  WHERE id = p_invitation_id
    AND (CASE p_status
      WHEN 'opened' THEN magic_link_flow_status = 'not_opened'
      WHEN 'verified_email' THEN magic_link_flow_status IN ('not_opened', 'opened')
      WHEN 'landed' THEN magic_link_flow_status IN ('not_opened', 'opened', 'verified_email')
      ELSE false
    END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_get(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_create(text, text, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_accept(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_decline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_email_invitation_update_flow_status(uuid, text) TO authenticated;

-- Match admission via email invitation (bypasses scope: organizer explicitly invited this email)
CREATE OR REPLACE FUNCTION public.rpc_match_accept_email_invitation(
  p_match_id uuid,
  p_user_id uuid,
  p_invitation_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_match public.matches%rowtype;
  v_user_email text;
  v_new_mp public.match_participants%rowtype;
BEGIN
  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF NOT FOUND OR v_inv.related_type <> 'match' OR v_inv.related_id <> p_match_id THEN
    RAISE EXCEPTION 'invitation_invalid';
  END IF;

  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND OR v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF EXISTS (SELECT 1 FROM public.match_participants WHERE match_id = p_match_id AND user_id = p_user_id AND removed_at IS NULL) THEN
    RETURN (SELECT * FROM public.match_participants WHERE match_id = p_match_id AND user_id = p_user_id AND removed_at IS NULL LIMIT 1);
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, org_approved_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'invited',
    now(), 'email_invitation',
    now(), v_inv.inviter_user_id, v_inv.inviter_user_id
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'invite', 'email_invitation', v_inv.inviter_user_id);

  RETURN (SELECT * FROM public.match_participants WHERE id = v_new_mp.id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_match_accept_email_invitation(uuid, uuid, uuid) TO authenticated;
