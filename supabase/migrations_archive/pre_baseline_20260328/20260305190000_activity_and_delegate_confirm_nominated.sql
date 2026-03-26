-- v1.7: Activity visibility + delegate confirm for nominated users
-- 1) Allow in-scope/match-associated users to see all match_participant_actions (so nomination shows in Activity)
-- 2) Allow viewing pending nominated user participants when caller can delegate confirm (share group)
-- 3) Add rpc_match_delegate_confirm_participant for delegate-confirming an existing nominated user

-- =============================================================================
-- 1) match_participant_actions: allow in-scope and match-associated to see all
-- =============================================================================
CREATE POLICY mpa_select_in_scope
ON public.match_participant_actions FOR SELECT TO authenticated
USING (
  public.is_caller_in_match_scope(match_id)
  OR public.is_caller_match_associated(match_id)
);

-- =============================================================================
-- 2) match_participants: allow viewing pending nominated users when caller can
--    delegate confirm (shares group with participant, in scope or match-associated)
-- =============================================================================
-- Add clause to match_participants_select: pending user, nominated, needs delegate confirm,
-- and caller shares group with participant.
CREATE POLICY match_participants_select_pending_nominated
ON public.match_participants FOR SELECT TO authenticated
USING (
  status = 'pending'
  AND user_id IS NOT NULL
  AND join_method = 'nominated'
  AND participant_accepted_at IS NULL
  AND removed_at IS NULL
  AND public.sharegroup_exists(auth.uid(), user_id)
  AND (
    public.is_caller_in_match_scope(match_id)
    OR public.is_caller_match_associated(match_id)
  )
);

-- =============================================================================
-- 3) rpc_match_delegate_confirm_participant(p_match_participant_id)
--    Delegate-confirm an existing nominated user participant (sets participant_accepted_at)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_participant(p_match_participant_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp    public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_mp.match_id;

  -- User participant only (guests use rpc_match_delegate_confirm_guest)
  IF v_mp.user_id IS NULL THEN
    RAISE EXCEPTION 'use_rpc_match_delegate_confirm_guest_for_guests';
  END IF;

  -- Must be pending, nominated, not yet accepted
  IF v_mp.status <> 'pending' OR v_mp.join_method <> 'nominated' THEN
    RAISE EXCEPTION 'participant_not_nominated_or_already_confirmed';
  END IF;
  IF v_mp.participant_accepted_at IS NOT NULL THEN
    RETURN v_mp; -- idempotent
  END IF;
  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  -- Caller: non-org + (InScope OR MatchAssociated)
  IF public.is_match_organizer(v_mp.match_id, v_uid) THEN
    RAISE EXCEPTION 'organizer_use_manual_confirm_or_approve';
  END IF;
  IF NOT (
    public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, v_uid)
    OR public.is_user_match_associated(v_mp.match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'not_authorized_to_delegate_confirm';
  END IF;

  -- Caller must share group with participant
  IF NOT public.do_users_share_group(v_mp.user_id, v_uid) THEN
    RAISE EXCEPTION 'target_not_in_shared_groups';
  END IF;

  -- Update participant_accepted_at
  UPDATE public.match_participants
  SET
    participant_accepted_at  = now(),
    participant_accepted_via = 'delegate_manual'
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (v_mp.match_id, p_match_participant_id, 'delegate_manual_confirm', NULL, v_uid);

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_participant(uuid) IS
'v1.7: Non-org delegate-confirms an existing nominated user participant. Sets participant_accepted_at. Caller must share group with participant and be in scope or match-associated.';

GRANT EXECUTE ON FUNCTION public.rpc_match_delegate_confirm_participant(uuid) TO authenticated;
