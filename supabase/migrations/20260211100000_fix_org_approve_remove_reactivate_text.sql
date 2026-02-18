-- Migration: Remove stale "reactivate" error from rpc_match_org_approve_participant
-- Simplify status check: only allow approving pending participants

CREATE OR REPLACE FUNCTION public.rpc_match_org_approve_participant(p_match_participant_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp match_participants;
  v_match_id uuid;
BEGIN
  -- Get participant record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_match_participant_id;
  END IF;

  v_match_id := v_mp.match_id;

  -- v1.3: ORG ONLY (no MP approve)
  IF NOT is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only organizer can approve participants';
  END IF;

  -- Only pending participants can be approved
  IF v_mp.status != 'pending' THEN
    RAISE EXCEPTION 'Participant is not pending approval';
  END IF;

  -- v1.3: Set org_approved_at (idempotent with COALESCE)
  UPDATE match_participants
  SET
    org_approved_at = COALESCE(org_approved_at, now()),
    org_approved_by = auth.uid()
  WHERE id = p_match_participant_id;

  -- v1.3: Call reconcile (may transition to confirmed if user_accepted_at exists)
  PERFORM match_participant_reconcile_status(p_match_participant_id);

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_org_approve_participant IS
  'v1.3: ORG approves participant. ORG ONLY. Only pending participants can be approved.';
