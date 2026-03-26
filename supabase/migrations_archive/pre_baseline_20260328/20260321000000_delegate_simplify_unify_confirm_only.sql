-- =============================================================================
-- Delegate simplify: unify confirm-only into rpc_match_delegate_confirm_participant
-- - rpc_match_delegate_confirm_participant: handles both user and guest participants
-- - User: non-org, InScope OR MatchAssociated, ShareGroup (unchanged)
-- - Guest: any active participant; guest-only event emission strictly in guest branch
-- - Drops: rpc_match_delegate_confirm_guest, rpc_match_delegate_confirm_user,
--   rpc_match_delegate_manual_confirm_targets, Phase4B helpers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) rpc_match_delegate_confirm_participant — handle both user and guest
-- -----------------------------------------------------------------------------
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
  v_guest_email text;
  v_evt_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_mp.match_id;

  IF v_mp.status <> 'pending' THEN
    RAISE EXCEPTION 'participant_not_pending_or_already_confirmed';
  END IF;
  IF v_mp.participant_accepted_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;
  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  IF v_mp.guest_id IS NOT NULL THEN
    -- Guest branch: any active participant (including organizer)
    IF NOT public.is_user_match_associated(v_mp.match_id, v_uid) THEN
      RAISE EXCEPTION 'You are not a participant in this match';
    END IF;

    PERFORM public.apply_participant_acceptance(p_match_participant_id, v_uid, false, 'delegate_manual_confirm');

    SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;

    -- Guest-only event emission: strictly inside guest branch
    v_guest_email := public.rpc_match_participant_email(v_mp.id);
    IF v_guest_email IS NOT NULL THEN
      INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
      VALUES (
        'match.guest_delegate_confirmed', 'match_participant', v_mp.id, v_uid,
        jsonb_build_object(
          'match_participant_id', v_mp.id, 'match_id', v_mp.match_id, 'target_email', v_guest_email,
          'game_type', v_match.game_type, 'match_date', v_match.match_date,
          'club_name', (SELECT c.name FROM public.clubs c WHERE c.id = v_match.club_id)
        )
      )
      RETURNING id INTO v_evt_id;
      PERFORM public.rpc_process_domain_event(v_evt_id);
    END IF;

    RETURN v_mp;
  END IF;

  -- User branch: non-org, InScope OR MatchAssociated, ShareGroup
  IF v_mp.join_method NOT IN ('invited', 'nominated') THEN
    RAISE EXCEPTION 'participant_not_invited_or_nominated';
  END IF;

  IF public.is_match_organizer(v_mp.match_id, v_uid) THEN
    RAISE EXCEPTION 'organizer_use_manual_confirm_or_approve';
  END IF;
  IF NOT (
    public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
    OR public.is_user_match_associated(v_mp.match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'not_authorized_to_delegate_confirm';
  END IF;

  IF NOT public.do_users_share_group(v_mp.user_id, v_uid) THEN
    RAISE EXCEPTION 'target_not_in_shared_groups';
  END IF;

  PERFORM public.apply_participant_acceptance(p_match_participant_id, v_uid, false, 'delegate_manual_confirm');

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_participant(uuid) IS
'v1.7: Delegate-confirm an existing pending participant (user or guest). User: non-org, InScope/MatchAssociated, ShareGroup. Guest: any active participant. Sets participant_accepted_at only. Guest branch emits match.guest_delegate_confirmed.';


-- -----------------------------------------------------------------------------
-- 2) Drop rpc_match_delegate_confirm_guest
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_match_delegate_confirm_guest(uuid);


-- -----------------------------------------------------------------------------
-- 3) Drop rpc_match_delegate_confirm_user
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_match_delegate_confirm_user(uuid, uuid);


-- -----------------------------------------------------------------------------
-- 4) Drop rpc_match_delegate_manual_confirm_targets
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_match_delegate_manual_confirm_targets(uuid);


-- -----------------------------------------------------------------------------
-- 5) Drop Phase4B helpers (apply_delegate_confirm_user_target depends on others)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.apply_delegate_confirm_user_target(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.check_delegate_confirm_user_target(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.can_delegate_confirm_user_target(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.get_delegate_user_target_state(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_delegate_confirm_user_caller(uuid, uuid);
