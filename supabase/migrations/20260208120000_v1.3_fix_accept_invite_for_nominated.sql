-- Migration: Fix rpc_match_accept_invite to support nominated users
-- Problem: Nominated users have join_method='requested' but rpc_match_accept_invite
--          only allowed join_method='invited', blocking nominated users from accepting.
-- Fix: Allow both 'invited' AND 'requested' with nominated_by set.

CREATE OR REPLACE FUNCTION public.rpc_match_accept_invite(p_match_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp match_participants;
BEGIN
  -- Get participant record
  SELECT * INTO v_mp
  FROM match_participants
  WHERE match_id = p_match_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  -- Check status
  IF v_mp.status = 'removed' THEN
    RAISE EXCEPTION 'Cannot accept: You were removed from this match. Wait for organizer reactivation.';
  END IF;

  IF v_mp.status = 'confirmed' THEN
    -- Already confirmed, idempotent
    RETURN v_mp;
  END IF;

  -- v1.3: Allow invited users AND nominated users (requested + nominated_by set)
  -- Block self-requested users (they already have user_accepted_at from the request RPC)
  IF v_mp.join_method = 'requested' AND v_mp.nominated_by IS NULL THEN
    RAISE EXCEPTION 'Self-requested participants already have acceptance recorded. Wait for organizer approval.';
  END IF;

  IF v_mp.join_method NOT IN ('invited', 'requested') THEN
    RAISE EXCEPTION 'This action is not available for your join method.';
  END IF;

  -- v1.3: Set user_accepted_at (idempotent with COALESCE)
  UPDATE match_participants
  SET user_accepted_at = COALESCE(user_accepted_at, now())
  WHERE id = v_mp.id;

  -- v1.3: Call reconcile (may transition to confirmed if org_approved_at exists)
  PERFORM match_participant_reconcile_status(v_mp.id);

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_accept_invite IS
  'v1.3: User accepts invitation or nomination. Sets user_accepted_at. Allowed for invited and nominated (requested+nominated_by) participants. Becomes confirmed if ORG already approved.';
