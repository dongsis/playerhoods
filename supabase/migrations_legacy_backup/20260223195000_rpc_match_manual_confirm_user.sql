-- =============================================================================
-- Migration: 20260223195000_rpc_match_manual_confirm_user
--
-- New RPC: rpc_match_manual_confirm_user(p_match_id, p_user_id)
--
-- Purpose: Organizer directly confirms a scope user without requiring the user
-- to Accept first. Both participant_accepted_at and org_approved_at are set in
-- one operation → reconcile → immediately confirmed.
--
-- Gates:
--   1. caller must be the match organizer
--   2. match must be active
--   2b. organizer cannot confirm themselves (they are always a participant via
--       match_create; self-reenter must go through a dedicated organizer path)
--   3. target user must be in invitation_scope_group_ids (if scope is configured).
--      If no scope is configured the organizer may confirm any user — this is
--      intentional; the organizer is the ultimate authority for unconstrained matches.
--   4. target user must not already be an active participant
--
-- Reenter: if the target user has a removed row, that row is reactivated and
-- set to confirmed state. All prior confirmation fields are reset; created_by
-- is preserved (it records who originally created the row, not who re-confirms).
-- Audit: reenter + manual_confirm action pair written.
--
-- Fresh: if no prior row, a new row is inserted directly in confirmed state.
-- Concurrent inserts hitting uq_match_participants_active_user are caught and
-- converted to a friendly error; other unique violations re-raise.
-- Audit: manual_confirm action written.
-- =============================================================================

BEGIN;

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
  v_constraint text;                      -- for unique_violation diagnostics
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  -- Gate 1: caller must be organizer.
  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can manually confirm participants';
  END IF;

  -- Gate 2: match must be active.
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  -- Gate 2b: organizer cannot confirm themselves.
  -- The organizer is automatically a participant at match creation.
  -- If they were removed, their re-join must go through a dedicated path.
  IF p_user_id = v_match.organizer_id THEN
    RAISE EXCEPTION 'Organizer cannot be manually confirmed into their own match';
  END IF;

  -- Gate 3: target user must be in scope (when scope is configured).
  -- If invitation_scope_group_ids is empty/null, this gate is intentionally skipped —
  -- the organizer has full authority over unconstrained matches.
  IF v_match.invitation_scope_group_ids IS NOT NULL
     AND array_length(v_match.invitation_scope_group_ids, 1) IS NOT NULL
     AND NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, p_user_id) THEN
    RAISE EXCEPTION 'User is not in the match scope groups';
  END IF;

  -- Gate 4: target user must not already be an active participant.
  IF EXISTS (
    SELECT 1 FROM public.match_participants
    WHERE match_id = p_match_id AND user_id = p_user_id AND removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Reenter: if a removed row exists, reactivate the most recent one.
  -- created_by is intentionally NOT updated — it records who first created the row.
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND removed_at IS NOT NULL
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
      join_method              = 'manual',
      participant_accepted_at  = now(),
      participant_accepted_via = 'manual',
      user_accepted_at         = now(),
      org_approved_at          = now(),
      org_approved_by          = auth.uid(),
      nominated_by             = NULL,
      manual_confirmed_by      = auth.uid()
      -- created_by preserved: records original row creator, not re-confirmer
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

  -- Fresh: new participant row, directly confirmed.
  -- Wrapped in exception handler for concurrent double-confirm race.
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
        RAISE;  -- unexpected constraint — surface the original error
      END IF;
  END;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'manual_confirm', NULL, auth.uid());

  RETURN v_new_mp;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_match_manual_confirm_user(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_manual_confirm_user(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_manual_confirm_user(uuid, uuid) TO authenticated;

COMMIT;
