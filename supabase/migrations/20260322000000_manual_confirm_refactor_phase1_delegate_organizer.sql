-- =============================================================================
-- Manual Confirm Refactor Phase 1: Allow organizer to call delegate_confirm for user participants
-- Context: manual_confirm / manual_confirm_user are being deprecated in favor of
--   composed calls: delegate_confirm + org_approve (existing participant) and
--   admit_user + delegate_confirm (add+confirm user by id).
-- This migration widens rpc_match_delegate_confirm_participant so organizer may
--   call it for existing user participants (invited, nominated, or requested).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) rpc_match_delegate_confirm_participant — allow organizer for user participants
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

  -- User branch: organizer may delegate-confirm any pending user; non-org requires invited/nominated + ShareGroup
  IF public.is_match_organizer(v_mp.match_id, v_uid) THEN
    -- Organizer: allowed for any pending user participant (invited, nominated, requested)
    NULL; -- fall through to apply
  ELSE
    IF v_mp.join_method NOT IN ('invited', 'nominated') THEN
      RAISE EXCEPTION 'participant_not_invited_or_nominated';
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
  END IF;

  PERFORM public.apply_participant_acceptance(p_match_participant_id, v_uid, false, 'delegate_manual_confirm');

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_participant(uuid) IS
'v1.7: Delegate-confirm an existing pending participant (user or guest). User: organizer OR (non-org + InScope/MatchAssociated + ShareGroup). Guest: any active participant. Sets participant_accepted_at only. Guest branch emits match.guest_delegate_confirmed. Organizer may call for user participants to replace manual_confirm via composed delegate_confirm + org_approve.';
