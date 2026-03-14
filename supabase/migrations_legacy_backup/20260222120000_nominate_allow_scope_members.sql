-- =============================================================================
-- Migration: 20260222120000_nominate_allow_scope_members
--
-- Change: rpc_match_nominate_user now allows scope members to nominate
-- even before they have joined the match (previously required active
-- match_participant row).
--
-- New nominator gate:
--   1. match.status = 'active'
--   2. can_participants_invite_users = true  (retained for backward compat)
--   3. caller is in invitation_scope_group_ids
--   4. caller is not currently removed from this match
--      ("currently removed" = has removed rows but no active row)
--   5. caller is not the organizer
--
-- Security:
--   - Function is SECURITY DEFINER, owner = postgres (set at creation)
--   - REVOKE from public, GRANT to authenticated only
--
-- Concurrency:
--   - Partial unique index prevents two concurrent nominations of the
--     same user into the same match.
--   - unique_violation is caught; CONSTRAINT_NAME disambiguates so only
--     our index raises the friendly message; other violations re-raise.
--   - Reenter branch uses SELECT ... FOR UPDATE to prevent concurrent
--     double-audit on the same removed row.
--
-- Reenter semantics (removed → re-nominated):
--   - We target the most recent removed row (ORDER BY created_at DESC).
--   - All confirmation fields are reset (org_approved_at, participant_accepted_at,
--     confirmed_at) because this is a new nomination cycle requiring a new
--     approval decision. History is preserved in match_participant_actions
--     via the 'reenter' + 'nominate' action pair.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Pre-flight: abort if duplicate active rows already exist.
--    Prevents the index creation from failing mid-migration with a cryptic error.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.match_participants
    WHERE removed_at IS NULL AND user_id IS NOT NULL
    GROUP BY match_id, user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create uq_match_participants_active_user: '
      'duplicate (match_id, user_id) rows with removed_at IS NULL exist. '
      'Resolve duplicates before running this migration.';
  END IF;
END $$;


-- B) Partial unique index: at most one active (non-removed) row per (match_id, user_id)
--    for rows where user_id IS NOT NULL.
--    This enforces the invariant for real users; it intentionally does NOT constrain
--    rows with user_id IS NULL (if any such rows exist for non-user participants).
--    Also prevents concurrent nominations from creating duplicate active user participants.
--    Existing removed rows are unaffected (index only covers removed_at IS NULL).

CREATE UNIQUE INDEX IF NOT EXISTS uq_match_participants_active_user
  ON public.match_participants (match_id, user_id)
  WHERE removed_at IS NULL AND user_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- C) Updated RPC
-- ---------------------------------------------------------------------------

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
  v_match      public.matches%rowtype;
  v_existing   match_participants;
  v_new_mp     match_participants;
  v_constraint text;                      -- disambiguates unique_violation source
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  -- Gate 1: match must be active.
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  -- Gate 2: organizer uses Invite, never Nominate.
  IF public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Organizer must use Invite, not Nominate';
  END IF;

  -- Gate 3: nomination flag must be enabled.
  IF NOT v_match.can_participants_invite_users THEN
    RAISE EXCEPTION 'You do not have permission to nominate users';
  END IF;

  -- Gate 4: scope groups must be configured.
  IF v_match.invitation_scope_group_ids IS NULL
     OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'This match has no scope groups configured. Cannot nominate users.';
  END IF;

  -- Gate 5: caller must be in scope.
  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, auth.uid()) THEN
    RAISE EXCEPTION 'You are not in the match scope groups';
  END IF;

  -- Gate 6: caller must not be currently removed from this match.
  -- "Currently removed" = has a removed row but NO active (non-removed) row.
  -- If caller was removed then re-added by organizer they have both; that is allowed.
  IF EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = auth.uid() AND removed_at IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = auth.uid() AND removed_at IS NULL
  )
  THEN
    RAISE EXCEPTION 'You were removed from this match and cannot nominate';
  END IF;

  -- Nominee checks.
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot nominate yourself (use request join instead)';
  END IF;

  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, p_user_id) THEN
    RAISE EXCEPTION 'Nominated user is not in any of the match scope groups';
  END IF;

  -- Check for an active (non-removed) participant row for the nominee.
  IF EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = p_user_id AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- If a removed row exists, reenter it (use most recent). Lock the row to
  -- prevent two concurrent nominations from both entering the reenter branch
  -- and writing duplicate audit actions.
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND removed_at IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Reenter: reset to "nominated" state.
    -- All confirmation fields are cleared — this is a new nomination cycle.
    -- Audit trail is preserved via 'reenter' + 'nominate' action pair below.
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
      nominated_by             = auth.uid(),
      manual_confirmed_by      = NULL
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',  NULL, auth.uid()),
      (p_match_id, v_existing.id, 'nominate', NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh nomination — wrapped in an exception handler for the concurrent case.
  BEGIN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, nominated_by, created_by
    ) VALUES (
      p_match_id, p_user_id, 'nominated',
      NULL, NULL, NULL, auth.uid(), auth.uid()
    )
    RETURNING * INTO v_new_mp;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint = 'uq_match_participants_active_user' THEN
        RAISE EXCEPTION 'User is already a participant in this match';
      ELSE
        RAISE;  -- unexpected constraint — surface the original error
      END IF;
  END;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'nominate', NULL, auth.uid());

  RETURN v_new_mp;
END;
$$;


-- ---------------------------------------------------------------------------
-- D) Lock down execute permissions.
--    CREATE OR REPLACE does not touch existing GRANTs, so we must be explicit.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) TO authenticated;

COMMIT;
