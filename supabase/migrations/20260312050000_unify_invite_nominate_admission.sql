-- =============================================================================
-- Migration: Play Network Core — Unify invite + nominate into shared admission
-- Purpose: can_admit_user_to_match + rpc_match_admit_user; thin wrappers
-- Authoritative: 00_AUTHORITATIVE_INDEX.md, Match_Participation_Flows_and_Scope.md
-- Scope: Permission predicate + unified RPC + compatibility wrappers only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) can_admit_user_to_match — unified permission predicate
-- Organizer invite and participant nomination share same target-entry sources.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_admit_user_to_match(
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
      AND p_target_user_id <> p_actor_id
      AND NOT public.is_user_match_associated(p_match_id, p_target_user_id)
      -- Caller gate: organizer OR (can_participants_invite + InScope/MatchAssociated)
      AND (
        p_actor_id = m.organizer_id
        OR (
          m.can_participants_invite_users = true
          AND (
            public.is_user_in_scope_groups(
              COALESCE(m.invitation_scope_group_ids, '{}'::uuid[]),
              p_actor_id
            )
            OR public.is_user_match_associated(p_match_id, p_actor_id)
          )
        )
      )
      -- Target eligibility: same for organizer and participant
      AND (
        -- Re-entry
        EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = p_match_id AND mp.user_id = p_target_user_id
            AND mp.status = 'removed'
        )
        OR
        -- Path A: group-based (InScope OR ShareGroup with actor)
        (
          public.is_user_in_scope_groups(
            COALESCE(m.invitation_scope_group_ids, '{}'::uuid[]),
            p_target_user_id
          )
          OR public.do_users_share_group(p_target_user_id, p_actor_id)
        )
        OR
        -- Path B: non-group direct (allow_non_group_invites)
        (p_target.allow_non_group_invites = true)
      )
  );
$$;

COMMENT ON FUNCTION public.can_admit_user_to_match(uuid, uuid, uuid) IS
'Phase 1: Unified predicate for match admission. Organizer invite and participant nomination share same target-entry sources: re-entry, InScope, ShareGroup(actor), allow_non_group_invites. Non-org: caller must have can_participants_invite_users + (InScope OR MatchAssociated). Implementation note: This is a combined action predicate that includes both caller-gate and target-eligibility logic as an intentional Phase 1 simplification.';

-- -----------------------------------------------------------------------------
-- 2) rpc_match_admit_user — unified admission write
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_match_admit_user(p_match_id uuid, p_target_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_uid      uuid := auth.uid();
  v_existing public.match_participants%rowtype;
  v_new_mp   public.match_participants%rowtype;
  v_is_org   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_admit_self';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  IF public.is_user_match_associated(p_match_id, p_target_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  IF NOT public.can_admit_user_to_match(p_match_id, v_uid, p_target_user_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_is_org := public.is_match_organizer(p_match_id, v_uid);

  -- Re-entry: find most recent removed row
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_target_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_is_org THEN
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
        org_approved_by          = v_uid,
        nominated_by             = NULL,
        manual_confirmed_by      = NULL
      WHERE id = v_existing.id;
    ELSE
      UPDATE public.match_participants
      SET
        removed_at               = NULL,
        removed_by               = NULL,
        removal_note             = NULL,
        confirmed_at             = NULL,
        join_method              = 'nominated',
        participant_accepted_at  = NULL,
        participant_accepted_via = NULL,
        org_approved_at          = NULL,
        org_approved_by          = NULL,
        nominated_by             = v_uid,
        manual_confirmed_by      = NULL
      WHERE id = v_existing.id;
    END IF;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter', NULL, v_uid),
      (p_match_id, v_existing.id, CASE WHEN v_is_org THEN 'invite' ELSE 'nominate' END, NULL, v_uid);

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh admission
  IF v_is_org THEN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, org_approved_by, nominated_by, created_by
    ) VALUES (
      p_match_id, p_target_user_id, 'invited',
      NULL, NULL,
      now(), v_uid, NULL, v_uid
    )
    RETURNING * INTO v_new_mp;
  ELSE
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, nominated_by, created_by
    ) VALUES (
      p_match_id, p_target_user_id, 'nominated',
      NULL, NULL,
      NULL, v_uid, v_uid
    )
    RETURNING * INTO v_new_mp;
  END IF;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, CASE WHEN v_is_org THEN 'invite' ELSE 'nominate' END, NULL, v_uid);

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_admit_user(uuid, uuid) IS
'Phase 1: Unified admission write. Organizer → invite (org_approved_at set). Non-org → nominate (org_approved_at NULL). Uses can_admit_user_to_match.';

GRANT EXECUTE ON FUNCTION public.rpc_match_admit_user(uuid, uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3) rpc_match_invite_user — thin wrapper (organizer-only)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  IF p_user_id = (SELECT organizer_id FROM public.matches WHERE id = p_match_id) THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  RETURN public.rpc_match_admit_user(p_match_id, p_user_id);
END;
$$;

COMMENT ON FUNCTION public.rpc_match_invite_user(uuid, uuid) IS
'Phase 1: Organizer-only invite. Thin wrapper around rpc_match_admit_user. Preserves legacy error messages for compatibility.';

-- -----------------------------------------------------------------------------
-- 4) rpc_match_nominate_user — thin wrapper (non-organizer)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF NOT v_match.can_participants_invite_users THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot nominate yourself';
  END IF;

  RETURN public.rpc_match_admit_user(p_match_id, p_user_id);
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) IS
'Phase 1: Non-organizer nomination. Thin wrapper around rpc_match_admit_user. Preserves legacy caller-gate errors for compatibility.';
