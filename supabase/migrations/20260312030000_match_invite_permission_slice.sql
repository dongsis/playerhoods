-- =============================================================================
-- Migration: Play Network Core — Step 4: Minimal match invite permission slice
-- Purpose: Add can_invite_user_to_match predicate; update rpc_match_invite_user
-- Authoritative: 00_AUTHORITATIVE_INDEX.md, Match_Participation_Flows_and_Scope.md
-- Scope: Permission predicate + rpc_match_invite_user only. No lifecycle redesign.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) can_invite_user_to_match — authoritative permission predicate
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_invite_user_to_match(
  p_match_id uuid,
  p_actor_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.profiles p_target ON p_target.id = p_target_user_id
    WHERE m.id = p_match_id
      AND m.status = 'active'
      AND p_target_user_id <> m.organizer_id
      AND p_actor_id = m.organizer_id
      AND NOT public.is_user_match_associated(p_match_id, p_target_user_id)
      AND (
        -- Re-entry: target has removed row → allow
        EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = p_match_id AND mp.user_id = p_target_user_id
            AND mp.status = 'removed'
        )
        OR
        -- Path A: group-based (InScope OR ShareGroup)
        (
          public.is_user_in_scope_groups(
            COALESCE(m.invitation_scope_group_ids, '{}'::uuid[]),
            p_target_user_id
          )
          OR public.do_users_share_group(p_target_user_id, m.organizer_id)
        )
        OR
        -- Path B: non-group direct (Club Members / Invite Circle)
        (p_target.allow_non_group_invites = true)
      )
  );
$$;

COMMENT ON FUNCTION public.can_invite_user_to_match(uuid, uuid, uuid) IS
'Phase 1: Authoritative predicate for direct match invite. Path A: InScope OR ShareGroup. Path B: allow_non_group_invites (Club Members / Invite Circle). Re-entry always allowed. SECURITY DEFINER. Internal RPC use only.';

-- -----------------------------------------------------------------------------
-- 2) Update rpc_match_invite_user to use predicate
-- -----------------------------------------------------------------------------

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  IF p_user_id = v_match.organizer_id THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Authoritative permission gate
  IF NOT public.can_invite_user_to_match(p_match_id, auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Re-entry: find most recent removed row
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.match_participants
    SET
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

  -- Fresh invite
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
'v1.6.3 + Phase 1: ORG-only invite. Uses can_invite_user_to_match for target gate. Paths: InScope/ShareGroup OR allow_non_group_invites (Club Members/Invite Circle). Re-entry preserved.';
