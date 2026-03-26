-- Migration: v1.6.3 — unify reconcile semantics + close remaining restart bypass
BEGIN;

SET check_function_bodies = false;
SET search_path = public;
-- =============================================================================
-- A) Unified Confirmation Invariant in reconcile (guest == user)
--    confirmed ⇔ (participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL)
--    No COALESCE with legacy user_accepted_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp record;
  v_both boolean;
BEGIN
  SELECT
    id, status, user_id, guest_id,
    participant_accepted_at,
    org_approved_at, removed_at, confirmed_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  -- Canonical removal branch
  IF v_mp.status = 'removed'::public.match_participant_status OR v_mp.removed_at IS NOT NULL THEN
    UPDATE public.match_participants
    SET confirmed_at = NULL,
        removed_at   = COALESCE(removed_at, now()),
        status       = 'removed'::public.match_participant_status
    WHERE id = p_mp_id
      AND (confirmed_at IS NOT NULL OR removed_at IS NULL OR status <> 'removed'::public.match_participant_status);
    RETURN;
  END IF;

  v_both := (v_mp.participant_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL);

  IF v_both THEN
    UPDATE public.match_participants
    SET status = 'confirmed'::public.match_participant_status,
        confirmed_at = COALESCE(confirmed_at, now())
    WHERE id = p_mp_id
      AND (status <> 'confirmed'::public.match_participant_status OR confirmed_at IS NULL);
  ELSE
    UPDATE public.match_participants
    SET status = 'pending'::public.match_participant_status,
        confirmed_at = NULL
    WHERE id = p_mp_id
      AND (status <> 'pending'::public.match_participant_status OR confirmed_at IS NOT NULL);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.match_participant_reconcile_status(p_mp_id uuid) IS 'v1.6.3: Derives participant status from timestamps. confirmed ⇔ (participant_accepted_at IS NOT NULL AND org_approved_at IS NOT NULL). Writes confirmed_at (snapshot) and status (compat). No legacy user_accepted_at consideration.';
-- =============================================================================
-- B) Close remaining unauthorized restart path in rpc_match_nominate_user
--    Removed participants cannot be re-activated here; must use restart channels
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match     public.matches%rowtype;
  v_uid       uuid := auth.uid();
  v_existing  match_participants;
  v_new_mp    match_participants;
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  -- Auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Fetch match
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  -- Match active gate
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  -- Caller gate: non-org + can_participants_invite_users + (InScope OR MatchAssociated)
  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF NOT v_match.can_participants_invite_users THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  -- Target != caller
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot nominate yourself';
  END IF;

  -- Already active gate
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Target gate: ShareGroup(target, caller)
  IF NOT public.do_users_share_group(p_user_id, v_uid) THEN
    RAISE EXCEPTION 'Target user is not in your shared groups';
  END IF;

  -- Disallow revival via nomination
  SELECT mp.* INTO v_existing
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.user_id  = p_user_id
    AND mp.status   = 'removed'
  ORDER BY mp.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'reactivation_not_allowed_use_restart_channels';
  END IF;

  -- Fresh nomination (both user accept + ORG approve needed)
  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'nominated',
    NULL, NULL,
    NULL, v_uid, v_uid
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'nominate', NULL, v_uid);

  SELECT mp.* INTO v_new_mp
  FROM public.match_participants mp
  WHERE mp.id = v_new_mp.id;

  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid) IS 'v1.6.3: Non-org nomination in friend-share groups. No revival of removed participants — use restart channels (rpc_match_request_join / rpc_match_invite_user).';

-- =============================================================================
-- C) Reconfirm trigger location scope note (documentation only)
--    Current schema uses club_id + court_ids as location determinants for matches.
--    If additional location columns are introduced (e.g., location_text/address/venue_notes),
--    the trigger in 20260304124500 should be amended to include them in the column list and
--    IS DISTINCT FROM checks.
-- =============================================================================

COMMIT;

