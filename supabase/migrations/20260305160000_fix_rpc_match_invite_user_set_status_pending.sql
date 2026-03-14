-- Ensure Invite back transitions removed participants to status='pending'
-- so that clients no longer treat them as removed.

CREATE OR REPLACE FUNCTION public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_existing public.match_participants%rowtype;
  v_new_mp   public.match_participants%rowtype;
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  -- Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Fetch match
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  -- Caller gate: organizer only
  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  -- Match active gate
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  -- Cannot invite self (organizer)
  IF p_user_id = v_match.organizer_id THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  -- Already active gate (non-removed rows only)
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Look at latest participant row (any status). If it's NOT removed, enforce scope gate.
  SELECT *
  INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing.id IS NULL OR v_existing.status <> 'removed' THEN
    -- First-time invite (or non-removed history): must be in scope OR shared group.
    IF NOT (
      public.is_user_in_scope_groups(v_scope_ids, p_user_id)
      OR public.do_users_share_group(p_user_id, v_match.organizer_id)
    ) THEN
      RAISE EXCEPTION 'Target user is not in scope or shared group';
    END IF;
  END IF;

  -- Re-entry: find most recent removed row (status-based)
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Re-invite: clear removed + apply as fresh invite
    -- created_by NOT updated (audit integrity)
    UPDATE public.match_participants
    SET
      status                  = 'pending',
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'invited',
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      org_approved_at          = now(),
      org_approved_by          = auth.uid(),
      nominated_by             = NULL,
      manual_confirmed_by      = NULL
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter', NULL, auth.uid()),
      (p_match_id, v_existing.id, 'invite',  NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh invite: org side approved (user acceptance still needed)
  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, org_approved_by, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'invited',
    NULL, NULL,
    now(), auth.uid(), NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'invite', NULL, auth.uid());

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid) IS
'v1.6.3: ORG-only invite. Target: InScope(target) OR ShareGroup(target, organizer_id) for first-time invites. Removed participants can always be re-invited via re-entry (Invite back). Re-entry sets status=pending and clears removal fields so clients treat them as pending. Status-based gates. Re-entry preserves created_by and writes reenter + invite action logs. Sets org_approved_at; user acceptance required to confirm.';

