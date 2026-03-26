-- Staging gate hotfix:
-- 1) fix rpc_email_invitation_get ambiguous `id` reference
-- 2) fix uuid aggregation bug in guest invitation fallback resolution
--    (MIN(uuid) is invalid in some environments)

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
  SELECT *
  INTO v_inv
  FROM public.email_invitations ei
  WHERE ei.id = p_invitation_id;

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
  v_anchor_count int := 0;
  v_anchor_mp_id uuid := NULL;
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

  -- Use text cast for uuid min to avoid environment-specific aggregate resolution errors.
  SELECT COUNT(*), MIN(mp.id::text)::uuid
  INTO v_anchor_count, v_anchor_mp_id
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_related_id
    AND mp.removed_at IS NULL
    AND lower(trim(coalesce(g.email, ''))) = lower(trim(p_target_email));

  IF v_anchor_count > 1 THEN
    RAISE EXCEPTION 'anchor_ambiguous_guest_participant';
  END IF;

  IF v_anchor_count = 0 THEN
    v_anchor_mp_id := NULL;
  END IF;

  INSERT INTO public.email_invitations (
    inviter_user_id, target_email, target_name, related_type, related_id, expires_at, match_participant_id
  ) VALUES (
    v_uid, trim(lower(p_target_email)), NULLIF(trim(p_target_name), ''), p_related_type, p_related_id, p_expires_at, v_anchor_mp_id
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
      'inviter_display_name', (SELECT display_name FROM public.profiles WHERE id = v_uid),
      'match_participant_id', v_inv.match_participant_id
    )
  );

  PERFORM public.rpc_process_domain_event((
    SELECT id
    FROM public.domain_events
    WHERE aggregate_id = v_inv.id
      AND event_type = 'invitation.email_invitation_created'
    ORDER BY created_at DESC
    LIMIT 1
  ));

  RETURN v_inv;
END;
$$;


CREATE OR REPLACE FUNCTION public.rpc_email_invitation_accept_as_guest(
  p_invitation_id uuid
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_mp public.match_participants%rowtype;
  v_match_count int := 0;
  v_match_mp_id uuid := NULL;
BEGIN
  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  IF v_inv.related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF v_inv.match_participant_id IS NOT NULL THEN
    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_inv.match_participant_id
      AND removed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchored_participant_not_found';
    END IF;

    IF v_mp.match_id <> v_inv.related_id THEN
      RAISE EXCEPTION 'anchor_participant_match_mismatch';
    END IF;

    IF v_mp.guest_id IS NULL THEN
      RAISE EXCEPTION 'anchor_not_guest_participant';
    END IF;
  ELSE
    -- Use text cast for uuid min to avoid aggregate resolution errors.
    SELECT COUNT(*), MIN(mp.id::text)::uuid
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(coalesce(g.email, ''))) = lower(trim(v_inv.target_email));

    IF v_match_count = 0 THEN
      RAISE EXCEPTION 'participant_not_found_for_invitation';
    END IF;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'participant_ambiguous_for_invitation';
    END IF;

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_match_mp_id;

    UPDATE public.email_invitations
    SET match_participant_id = v_mp.id,
        updated_at = now()
    WHERE id = v_inv.id
      AND match_participant_id IS NULL;
  END IF;

  UPDATE public.match_participants
  SET participant_accepted_at = COALESCE(participant_accepted_at, now()),
      participant_accepted_via = COALESCE(participant_accepted_via, 'email_invitation')
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);

  UPDATE public.email_invitations
  SET status = 'accepted',
      accepted_at = COALESCE(accepted_at, now()),
      updated_at = now()
  WHERE id = v_inv.id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = v_inv.id;

  IF v_inv.status = 'accepted' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_accepted', NULL);
  END IF;

  RETURN v_inv;
END;
$$;


CREATE OR REPLACE FUNCTION public.rpc_email_invitation_decline_as_guest(
  p_invitation_id uuid,
  p_system_actor_id uuid
)
RETURNS public.email_invitations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_mp public.match_participants%rowtype;
  v_match_count int := 0;
  v_match_mp_id uuid := NULL;
BEGIN
  IF p_system_actor_id IS NULL THEN
    RAISE EXCEPTION 'system_actor_required';
  END IF;

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  IF v_inv.related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF v_inv.match_participant_id IS NOT NULL THEN
    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_inv.match_participant_id
      AND removed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchored_participant_not_found';
    END IF;

    IF v_mp.match_id <> v_inv.related_id THEN
      RAISE EXCEPTION 'anchor_participant_match_mismatch';
    END IF;

    IF v_mp.guest_id IS NULL THEN
      RAISE EXCEPTION 'anchor_not_guest_participant';
    END IF;
  ELSE
    -- Use text cast for uuid min to avoid aggregate resolution errors.
    SELECT COUNT(*), MIN(mp.id::text)::uuid
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(coalesce(g.email, ''))) = lower(trim(v_inv.target_email));

    IF v_match_count = 0 THEN
      RAISE EXCEPTION 'participant_not_found_for_invitation';
    END IF;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'participant_ambiguous_for_invitation';
    END IF;

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_match_mp_id;

    UPDATE public.email_invitations
    SET match_participant_id = v_mp.id,
        updated_at = now()
    WHERE id = v_inv.id
      AND match_participant_id IS NULL;
  END IF;

  PERFORM public.apply_participant_exit(
    v_mp.id,
    p_system_actor_id,
    'withdraw',
    'Guest declined invitation via email'
  );

  UPDATE public.email_invitations
  SET status = 'declined',
      declined_at = COALESCE(declined_at, now()),
      updated_at = now()
  WHERE id = v_inv.id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = v_inv.id;

  IF v_inv.status = 'declined' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_declined', p_system_actor_id);
  END IF;

  RETURN v_inv;
END;
$$;
