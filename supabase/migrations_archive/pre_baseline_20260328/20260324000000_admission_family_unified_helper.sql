-- =============================================================================
-- Admission Family: Unified Helper Refactor
-- Introduces apply_participant_admission and refactors admit_user + request_join.
-- External RPCs remain separate; internal write logic is centralized.
-- nominate_user is a thin wrapper around admit_user — no direct change.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) apply_participant_admission — internal helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_participant_admission(
  p_match_id uuid,
  p_target_user_id uuid,
  p_actor_id uuid,
  p_admission_kind text  -- 'requested' | 'invited' | 'nominated'
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_existing public.match_participants%rowtype;
  v_new_mp   public.match_participants%rowtype;
  v_action   text;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id_required';
  END IF;

  IF p_admission_kind IS NULL OR p_admission_kind NOT IN ('requested', 'invited', 'nominated') THEN
    RAISE EXCEPTION 'admission_kind_must_be_requested_invited_or_nominated';
  END IF;

  v_action := CASE p_admission_kind
    WHEN 'requested' THEN 'request_join'
    WHEN 'invited'   THEN 'invite'
    WHEN 'nominated' THEN 'nominate'
    ELSE 'nominate'
  END;

  -- Re-entry: find most recent removed row
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND user_id = p_target_user_id
    AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Re-entry UPDATE
    IF p_admission_kind = 'requested' THEN
      UPDATE public.match_participants
      SET
        removed_at               = NULL,
        removed_by               = NULL,
        removal_note             = NULL,
        confirmed_at             = NULL,
        join_method              = 'requested',
        participant_accepted_at  = now(),
        participant_accepted_via = 'in_app',
        org_approved_at          = NULL,
        org_approved_by          = NULL,
        nominated_by             = NULL,
        manual_confirmed_by      = NULL
      WHERE id = v_existing.id;
    ELSIF p_admission_kind = 'invited' THEN
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
        org_approved_by          = p_actor_id,
        nominated_by             = NULL,
        manual_confirmed_by      = NULL
      WHERE id = v_existing.id;
    ELSE
      -- nominated
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
        nominated_by             = p_actor_id,
        manual_confirmed_by      = NULL
      WHERE id = v_existing.id;
    END IF;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter', NULL, p_actor_id),
      (p_match_id, v_existing.id, v_action, NULL, p_actor_id);

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh INSERT
  IF p_admission_kind = 'requested' THEN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, nominated_by, created_by
    ) VALUES (
      p_match_id, p_target_user_id, 'requested',
      now(), 'in_app',
      NULL, NULL, p_actor_id
    )
    RETURNING * INTO v_new_mp;
  ELSIF p_admission_kind = 'invited' THEN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, org_approved_by, nominated_by, created_by
    ) VALUES (
      p_match_id, p_target_user_id, 'invited',
      NULL, NULL,
      now(), p_actor_id, NULL, p_actor_id
    )
    RETURNING * INTO v_new_mp;
  ELSE
    -- nominated
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, nominated_by, created_by
    ) VALUES (
      p_match_id, p_target_user_id, 'nominated',
      NULL, NULL,
      NULL, p_actor_id, p_actor_id
    )
    RETURNING * INTO v_new_mp;
  END IF;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, v_action, NULL, p_actor_id);

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.apply_participant_admission(uuid, uuid, uuid, text) IS
'Internal helper: centralizes admission write (fresh + re-entry) for request_join, invite, nominate. admission_kind: requested | invited | nominated. Callers: rpc_match_request_join, rpc_match_admit_user.';


-- -----------------------------------------------------------------------------
-- 2) rpc_match_admit_user — refactored to use helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_match_admit_user(p_match_id uuid, p_target_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match  public.matches%rowtype;
  v_uid    uuid := auth.uid();
  v_is_org boolean;
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

  RETURN public.apply_participant_admission(
    p_match_id,
    p_target_user_id,
    v_uid,
    CASE WHEN v_is_org THEN 'invited' ELSE 'nominated' END
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_match_admit_user(uuid, uuid) IS
'Phase 1: Unified admission write. Organizer → invite (org_approved_at set). Non-org → nominate (org_approved_at NULL). Uses can_admit_user_to_match.';


-- -----------------------------------------------------------------------------
-- 3) rpc_match_request_join — refactored to use helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_match_request_join(p_match_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_existing public.match_participants%rowtype;
  v_uid      uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.organizer_id = v_uid THEN
    RAISE EXCEPTION 'Organizer cannot request to join their own match';
  END IF;

  IF v_match.invitation_scope_group_ids IS NULL
     OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'This match is not open for join requests (no scope groups configured)';
  END IF;

  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, v_uid) THEN
    RAISE EXCEPTION 'You are not eligible to request to join this match (not in scope groups)';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = v_uid;

  IF FOUND AND v_existing.removed_at IS NULL THEN
    RAISE EXCEPTION 'You are already a participant in this match';
  END IF;

  RETURN public.apply_participant_admission(p_match_id, v_uid, v_uid, 'requested');
END;
$$;

COMMENT ON FUNCTION public.rpc_match_request_join(uuid) IS
'v1.6.3: User requests to join. Scope required. Removed users can re-request. Sets participant_accepted_at. ORG approval needed to confirm.';
