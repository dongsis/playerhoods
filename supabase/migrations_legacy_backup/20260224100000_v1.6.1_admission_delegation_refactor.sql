-- =============================================================================
-- Migration: 20260224100000_v1.6.1_admission_delegation_refactor
--
-- v1.6.1 introduces ShareGroup as a second trust boundary (beyond InScope),
-- Delegated Manual Confirm for non-organizers, and 3 role-specific roster RPCs.
-- All removed_at IS NULL gates replaced with status-based checks.
--
-- FIXES in this revision:
--  1) Always COALESCE invitation_scope_group_ids to '{}'::uuid[] before passing to
--     is_user_in_scope_groups() or ANY(...), so NULL/empty scope never breaks.
--  2) Add/align uq_match_participants_active_user uniqueness to status-based definition.
--  3) Standardize "match not active" errors to include status.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Section A: Add 'delegate_manual' to participant_accepted_via constraint
-- =============================================================================

ALTER TABLE public.match_participants
  DROP CONSTRAINT IF EXISTS chk_participant_accepted_via;

ALTER TABLE public.match_participants
  ADD CONSTRAINT chk_participant_accepted_via
    CHECK (
      participant_accepted_via IS NULL
      OR participant_accepted_via IN ('in_app', 'manual', 'delegate_manual')
    );

-- =============================================================================
-- Section A2: Status-based uniqueness for active user participants
--   Ensures at most one (match_id, user_id) row with status IN ('pending','confirmed').
--   (Replaces prior removed_at-based uniqueness assumptions.)
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_match_participants_active_user
  ON public.match_participants (match_id, user_id)
  WHERE status IN ('pending','confirmed') AND user_id IS NOT NULL;

-- =============================================================================
-- Section B: do_users_share_group(uuid, uuid) -> boolean
-- Internal helper. SECURITY DEFINER, NOT granted to authenticated.
-- Returns true if both users are active members of at least one common group.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.do_users_share_group(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm_a
    JOIN public.group_members gm_b
      ON gm_a.group_id = gm_b.group_id
    WHERE gm_a.user_id = p_user_a AND gm_a.status = 'active'
      AND gm_b.user_id = p_user_b AND gm_b.status = 'active'
  );
$$;

COMMENT ON FUNCTION public.do_users_share_group(uuid, uuid) IS
  'v1.6.1: Returns true if both users are active members of at least one common group. '
  'SECURITY DEFINER. NOT granted to authenticated — internal RPC use only.';

REVOKE ALL ON FUNCTION public.do_users_share_group(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.do_users_share_group(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.do_users_share_group(uuid, uuid) FROM anon;

-- =============================================================================
-- Section C: is_user_match_associated(uuid, uuid) -> boolean
-- ANY row: returns true if user has any match_participants row (regardless of status).
-- Internal helper. SECURITY DEFINER, NOT granted to authenticated.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_user_match_associated(p_match_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id  = p_user_id
  );
$$;

COMMENT ON FUNCTION public.is_user_match_associated(uuid, uuid) IS
  'v1.6.1: Returns true if user has ANY match_participants row in the match. '
  'Includes pending, confirmed, and removed rows. '
  'SECURITY DEFINER. NOT granted to authenticated — internal RPC use only.';

REVOKE ALL ON FUNCTION public.is_user_match_associated(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_user_match_associated(uuid, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.is_user_match_associated(uuid, uuid) FROM anon;

-- =============================================================================
-- Section D: rpc_match_invite_user — REWRITE
-- Caller: is_match_organizer + match active
-- Target: InScope(target) OR ShareGroup(target, organizer_id)
-- Freeze: ShareGroup always evaluated against organizer_id, not auth.uid()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_invite_user(
  p_match_id uuid,
  p_user_id  uuid
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_existing match_participants;
  v_new_mp   match_participants;
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

  -- Already active gate (status-based helper)
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Target gate: InScope(target) OR ShareGroup(target, organizer_id)
  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, p_user_id)
    OR public.do_users_share_group(p_user_id, v_match.organizer_id)
  ) THEN
    RAISE EXCEPTION 'Target user is not in scope or shared group';
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
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'invited',
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      user_accepted_at         = NULL,
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

COMMENT ON FUNCTION public.rpc_match_invite_user(uuid, uuid) IS
  'v1.6.1: ORG-only invite. Target: InScope(target) OR ShareGroup(target, organizer_id). '
  'Empty scope does not block — ShareGroup alone sufficient. Status-based gates. '
  'Re-entry: created_by preserved; writes reenter + invite action logs. '
  'Sets org_approved_at; user acceptance required to confirm.';

REVOKE ALL ON FUNCTION public.rpc_match_invite_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_invite_user(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_invite_user(uuid, uuid) TO authenticated;

-- =============================================================================
-- Section E: rpc_match_nominate_user — REWRITE
-- Caller: non-org + match active + can_participants_invite_users
--         + (InScope(caller) OR MatchAssociated(caller))
-- Target: ShareGroup(target, caller) + target != caller
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_user(
  p_match_id uuid,
  p_user_id  uuid
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Already active gate (status-based helper)
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Target gate: ShareGroup(target, caller)
  IF NOT public.do_users_share_group(p_user_id, v_uid) THEN
    RAISE EXCEPTION 'Target user is not in your shared groups';
  END IF;

  -- Re-entry: find most recent removed row (status-based)
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Re-nominate: clear removed + apply as fresh nomination
    -- created_by NOT updated (audit integrity)
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'nominated',
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      user_accepted_at         = NULL,
      org_approved_at          = NULL,
      org_approved_by          = NULL,
      nominated_by             = v_uid,
      manual_confirmed_by      = NULL
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',  NULL, v_uid),
      (p_match_id, v_existing.id, 'nominate', NULL, v_uid);

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
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

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) IS
  'v1.6.1: Non-org nominates a user from shared groups. '
  'Caller: non-org + can_participants_invite_users + (InScope OR MatchAssociated). '
  'Target: ShareGroup(target, caller). Status-based gates. '
  'Re-entry: created_by preserved; writes reenter + nominate action logs. '
  'Requires user acceptance + org approval to confirm.';

REVOKE ALL ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) TO authenticated;

-- =============================================================================
-- Section F: rpc_match_manual_confirm_user — REWRITE
-- Caller: is_match_organizer + match active
-- Target: InScope(target) OR ShareGroup(target, organizer_id) + target != organizer
-- Freeze: ShareGroup always evaluated against organizer_id
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_manual_confirm_user(
  p_match_id uuid,
  p_user_id  uuid
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match      public.matches%rowtype;
  v_existing   match_participants;
  v_new_mp     match_participants;
  v_constraint text;
  v_scope_ids  uuid[] := '{}'::uuid[];
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

  -- Cannot manual-confirm organizer (self)
  IF p_user_id = v_match.organizer_id THEN
    RAISE EXCEPTION 'Organizer cannot be manually confirmed into their own match';
  END IF;

  -- Already active gate (status-based helper)
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Target gate: InScope(target) OR ShareGroup(target, organizer_id)
  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, p_user_id)
    OR public.do_users_share_group(p_user_id, v_match.organizer_id)
  ) THEN
    RAISE EXCEPTION 'Target user is not in scope or shared group';
  END IF;

  -- Re-entry: find most recent removed row (status-based)
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Re-entry: clear removed + manual confirm
    -- created_by NOT updated (audit integrity)
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'manual',
      participant_accepted_at  = now(),
      participant_accepted_via = 'manual',
      user_accepted_at         = now(),
      org_approved_at          = now(),
      org_approved_by          = auth.uid(),
      nominated_by             = NULL,
      manual_confirmed_by      = auth.uid()
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',        NULL, auth.uid()),
      (p_match_id, v_existing.id, 'manual_confirm', NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh manual confirm (concurrent race guard)
  BEGIN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      user_accepted_at,
      org_approved_at, org_approved_by,
      manual_confirmed_by, created_by
    ) VALUES (
      p_match_id, p_user_id, 'manual',
      now(), 'manual',
      now(),
      now(), auth.uid(),
      auth.uid(), auth.uid()
    )
    RETURNING * INTO v_new_mp;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'uq_match_participants_active_user' THEN
        RAISE EXCEPTION 'User is already a participant in this match';
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'manual_confirm', NULL, auth.uid());

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_manual_confirm_user(uuid, uuid) IS
  'v1.6.1: ORG manually confirms a user. Target: InScope(target) OR ShareGroup(target, organizer_id). '
  'Sets participant_accepted_at + via=manual + org_approved_at -> confirmed immediately. '
  'Re-entry: created_by preserved; writes reenter + manual_confirm action logs. '
  'Empty scope does not block — ShareGroup alone sufficient.';

REVOKE ALL ON FUNCTION public.rpc_match_manual_confirm_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_manual_confirm_user(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_manual_confirm_user(uuid, uuid) TO authenticated;

-- =============================================================================
-- Section G: rpc_match_delegate_confirm_user — NEW
-- Caller: non-org + match active + (InScope(caller) OR MatchAssociated(caller))
-- Target: ShareGroup(target, caller) + target != caller
-- join_method='nominated' for reconcile compat, via='delegate_manual' distinguishes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_user(
  p_match_id uuid,
  p_user_id  uuid
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match      public.matches%rowtype;
  v_uid        uuid := auth.uid();
  v_existing   match_participants;
  v_new_mp     match_participants;
  v_constraint text;
  v_scope_ids  uuid[] := '{}'::uuid[];
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

  -- Caller gate: non-org + (InScope OR MatchAssociated)
  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'You are not authorized to delegate-confirm for this match';
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to delegate-confirm for this match';
  END IF;

  -- Target != caller
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot delegate-confirm yourself';
  END IF;

  -- Already active gate (status-based helper)
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Target gate: ShareGroup(target, caller) only — no InScope for target
  IF NOT public.do_users_share_group(p_user_id, v_uid) THEN
    RAISE EXCEPTION 'Target user is not in your shared groups';
  END IF;

  -- Re-entry: find most recent removed row (status-based)
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Re-entry: clear removed + delegate confirm
    -- created_by NOT updated (audit integrity)
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'nominated',
      participant_accepted_at  = now(),
      participant_accepted_via = 'delegate_manual',
      user_accepted_at         = now(),
      org_approved_at          = NULL,
      org_approved_by          = NULL,
      nominated_by             = v_uid,
      manual_confirmed_by      = v_uid
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',                 NULL, v_uid),
      (p_match_id, v_existing.id, 'delegate_manual_confirm', NULL, v_uid);

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh delegate confirm (concurrent race guard)
  BEGIN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      user_accepted_at,
      org_approved_at, org_approved_by,
      nominated_by, manual_confirmed_by,
      created_by
    ) VALUES (
      p_match_id, p_user_id, 'nominated',
      now(), 'delegate_manual',
      now(),
      NULL, NULL,
      v_uid, v_uid,
      v_uid
    )
    RETURNING * INTO v_new_mp;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'uq_match_participants_active_user' THEN
        RAISE EXCEPTION 'User is already a participant in this match';
      ELSE
        RAISE;
      END IF;
  END;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'delegate_manual_confirm', NULL, v_uid);

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_user(uuid, uuid) IS
  'v1.6.1: Non-org delegate-confirms a user from shared groups. '
  'Caller: non-org + (InScope OR MatchAssociated). No can_participants_invite_users. '
  'Target: ShareGroup(target, caller) only — no InScope for target. '
  'join_method=nominated (reconcile compat), via=delegate_manual (distinguishes). '
  'Sets participant_accepted_at but NOT org_approved_at -> pending until ORG approves. '
  'Re-entry: created_by preserved; writes reenter + delegate_manual_confirm logs.';

REVOKE ALL ON FUNCTION public.rpc_match_delegate_confirm_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_delegate_confirm_user(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_delegate_confirm_user(uuid, uuid) TO authenticated;

-- =============================================================================
-- Section H: rpc_match_invite_targets — NEW roster RPC
-- Returns: TABLE (user_id uuid, display_name text)
-- Caller gate: is_match_organizer (RAISE if not — debug-friendly)
-- Target set: InScope UNION ShareGroup(user, organizer_id)
-- Exclusions: self, already active (pending/confirmed)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_invite_targets(p_match_id uuid)
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  -- Caller gate: organizer only (RAISE on failure — debug-friendly admin entry point)
  IF NOT public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  RETURN QUERY
  WITH already_active AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed')
      AND mp.user_id IS NOT NULL
  ),
  scope_members AS (
    SELECT DISTINCT gm.user_id
    FROM public.group_members gm
    WHERE gm.group_id = ANY(v_scope_ids)
      AND gm.status = 'active'
      AND gm.user_id IS NOT NULL
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
    FROM public.group_members gm_org
    JOIN public.group_members gm_other
      ON gm_org.group_id = gm_other.group_id
    WHERE gm_org.user_id = v_match.organizer_id
      AND gm_org.status  = 'active'
      AND gm_other.status = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_match.organizer_id
  ),
  eligible AS (
    SELECT sm.user_id FROM scope_members sm
    UNION
    SELECT sg.user_id FROM shared_group_members sg
  )
  SELECT e.user_id, pd.display_name
  FROM eligible e
  JOIN public.profile_display pd ON pd.id = e.user_id
  WHERE e.user_id NOT IN (SELECT aa.user_id FROM already_active aa)
    AND e.user_id <> v_uid
  ORDER BY pd.display_name NULLS LAST, e.user_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_invite_targets(uuid) IS
  'v1.6.1: Returns eligible invite targets for organizer. '
  'Target set: InScope UNION ShareGroup(*, organizer_id). '
  'Excludes self and already-active (pending/confirmed). '
  'RAISE on unauthorized caller (debug-friendly admin entry point).';

REVOKE ALL ON FUNCTION public.rpc_match_invite_targets(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_invite_targets(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_invite_targets(uuid) TO authenticated;

-- =============================================================================
-- Section I: rpc_match_nominate_targets — NEW roster RPC
-- Returns: TABLE (user_id uuid, display_name text)
-- Caller gate: non-org + can_participants_invite_users + (InScope OR MatchAssociated)
--   Returns empty (not exception) if gate fails.
-- Target set: ShareGroup(user, caller)
-- Exclusions: self, organizer, already active (pending/confirmed)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_targets(p_match_id uuid)
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  -- Caller gate: return empty on failure (UI-friendly, no exception)
  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RETURN;
  END IF;

  IF NOT v_match.can_participants_invite_users THEN
    RETURN;
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH already_active AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed')
      AND mp.user_id IS NOT NULL
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
    FROM public.group_members gm_caller
    JOIN public.group_members gm_other
      ON gm_caller.group_id = gm_other.group_id
    WHERE gm_caller.user_id = v_uid
      AND gm_caller.status  = 'active'
      AND gm_other.status   = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_uid
  )
  SELECT sg.user_id, pd.display_name
  FROM shared_group_members sg
  JOIN public.profile_display pd ON pd.id = sg.user_id
  WHERE sg.user_id NOT IN (SELECT aa.user_id FROM already_active aa)
    AND sg.user_id <> v_match.organizer_id
  ORDER BY pd.display_name NULLS LAST, sg.user_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_targets(uuid) IS
  'v1.6.1: Returns eligible nomination targets for non-org participants. '
  'Caller: non-org + can_participants_invite_users + (InScope OR MatchAssociated). '
  'Returns empty (no exception) if gate fails — UI-friendly. '
  'Target set: ShareGroup(*, caller). Excludes self, organizer, already-active.';

REVOKE ALL ON FUNCTION public.rpc_match_nominate_targets(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_nominate_targets(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_nominate_targets(uuid) TO authenticated;

-- =============================================================================
-- Section J: rpc_match_delegate_confirm_targets — NEW roster RPC
-- Returns: TABLE (user_id uuid, display_name text)
-- Caller gate: non-org + (InScope OR MatchAssociated)
--   Returns empty (not exception) if gate fails.
-- Target set: ShareGroup(user, caller)
-- Exclusions: self, already active (pending/confirmed)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_targets(p_match_id uuid)
RETURNS TABLE (user_id uuid, display_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  -- Caller gate: return empty on failure (UI-friendly, no exception)
  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RETURN;
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH already_active AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed')
      AND mp.user_id IS NOT NULL
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
    FROM public.group_members gm_caller
    JOIN public.group_members gm_other
      ON gm_caller.group_id = gm_other.group_id
    WHERE gm_caller.user_id = v_uid
      AND gm_caller.status  = 'active'
      AND gm_other.status   = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_uid
  )
  SELECT sg.user_id, pd.display_name
  FROM shared_group_members sg
  JOIN public.profile_display pd ON pd.id = sg.user_id
  WHERE sg.user_id NOT IN (SELECT aa.user_id FROM already_active aa)
    AND sg.user_id <> v_uid
  ORDER BY pd.display_name NULLS LAST, sg.user_id;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_targets(uuid) IS
  'v1.6.1: Returns eligible delegate-confirm targets for non-org participants. '
  'Caller: non-org + (InScope OR MatchAssociated). No can_participants_invite_users. '
  'Returns empty (no exception) if gate fails — UI-friendly. '
  'Target set: ShareGroup(*, caller). Excludes self, already-active.';

REVOKE ALL ON FUNCTION public.rpc_match_delegate_confirm_targets(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_delegate_confirm_targets(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_delegate_confirm_targets(uuid) TO authenticated;

-- =============================================================================
-- Section K: Drop rpc_match_scope_users (replaced by role-specific roster RPCs)
-- =============================================================================

DROP FUNCTION IF EXISTS public.rpc_match_scope_users(uuid);

COMMENT ON TABLE public.match_participant_actions IS
  'v1.6.1: Lifecycle event log for match participants. '
  'action_type values: reenter, invite, nominate, manual_confirm, '
  'delegate_manual_confirm, accept. '
  'Written only by SECURITY DEFINER RPCs. Direct insert by authenticated is not permitted.';

-- =============================================================================
-- Section L: Verification
-- =============================================================================

DO $$
DECLARE
  v_count int;
BEGIN
  -- Helpers exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'do_users_share_group' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'v1.6.1: do_users_share_group not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'is_user_match_associated' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'v1.6.1: is_user_match_associated not found';
  END IF;

  -- Helpers NOT granted to authenticated
  SELECT count(*) INTO v_count
  FROM information_schema.role_routine_grants
  WHERE routine_name IN ('do_users_share_group', 'is_user_match_associated')
    AND grantee = 'authenticated';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'v1.6.1: internal helpers incorrectly granted to authenticated (% grants)', v_count;
  END IF;

  -- Roster RPCs exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'rpc_match_invite_targets' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'v1.6.1: rpc_match_invite_targets not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'rpc_match_nominate_targets' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'v1.6.1: rpc_match_nominate_targets not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'rpc_match_delegate_confirm_targets' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'v1.6.1: rpc_match_delegate_confirm_targets not found';
  END IF;

  -- Delegate confirm RPC exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'rpc_match_delegate_confirm_user' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'v1.6.1: rpc_match_delegate_confirm_user not found';
  END IF;

  -- Old scope_users gone
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'rpc_match_scope_users' AND pronamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'v1.6.1: rpc_match_scope_users should have been dropped';
  END IF;

  -- Roster RPCs granted to authenticated
  SELECT count(*) INTO v_count
  FROM information_schema.role_routine_grants
  WHERE routine_name IN ('rpc_match_invite_targets', 'rpc_match_nominate_targets', 'rpc_match_delegate_confirm_targets')
    AND grantee = 'authenticated';
  IF v_count < 3 THEN
    RAISE EXCEPTION 'v1.6.1: not all roster RPCs granted to authenticated (% of 3)', v_count;
  END IF;

  -- Uniqueness index exists (status-based)
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'i' AND c.relname = 'uq_match_participants_active_user' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'v1.6.1: uq_match_participants_active_user index not found';
  END IF;

  RAISE NOTICE 'v1.6.1 complete: admission + delegation refactor applied';
END $$;

COMMIT;