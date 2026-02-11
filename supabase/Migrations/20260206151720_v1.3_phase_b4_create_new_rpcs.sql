-- Migration: v1.3 Phase B4 - Create New RPCs
-- Description: Create rpc_match_nominate_user, rpc_match_reactivate_participant, and guest RPCs
-- Status: v1.3 New RPCs (Core v1.3 functionality)

-- ============================================================================
-- 1. rpc_match_nominate_user (v1.3 New)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_user(
  p_match_id uuid,
  p_user_id uuid
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_new_mp match_participants;
BEGIN
  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- Check permission: ORG or confirmed participant with can_participants_invite_users
  IF NOT (
    is_match_organizer(p_match_id, auth.uid())
    OR (
      is_match_participant_confirmed(p_match_id, auth.uid())
      AND v_match.can_participants_invite_users
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to nominate users';
  END IF;

  -- v1.3: NO scope check (nominate is NOT restricted by scope)

  -- Check if user is self
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot nominate yourself (use request join instead)';
  END IF;

  -- Check if already participant (except removed)
  IF EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id = p_match_id
      AND user_id = p_user_id
      AND status != 'removed'
  ) THEN
    RAISE EXCEPTION 'User is already a participant';
  END IF;

  -- If was removed, cannot re-nominate (must reactivate first)
  IF EXISTS (
    SELECT 1 FROM match_participants
    WHERE match_id = p_match_id
      AND user_id = p_user_id
      AND status = 'removed'
  ) THEN
    RAISE EXCEPTION 'User was removed. Use reactivate instead.';
  END IF;

  -- Insert new participant (nominated)
  INSERT INTO match_participants (
    match_id,
    user_id,
    join_method,
    status,
    user_accepted_at,  -- v1.3: NULL (waiting for user to accept)
    org_approved_at,   -- v1.3: NULL (waiting for ORG to approve)
    nominated_by,      -- v1.3 KEY: Record nominator
    created_by
  ) VALUES (
    p_match_id,
    p_user_id,
    'requested',       -- Same as request, but nominated_by distinguishes it
    'pending',
    NULL,              -- Waiting for user acceptance
    NULL,              -- Waiting for ORG approval
    auth.uid(),        -- v1.3 KEY: Record who nominated
    auth.uid()
  )
  RETURNING * INTO v_new_mp;

  -- v1.3: Call reconcile (will stay pending until both sides confirm)
  PERFORM match_participant_reconcile_status(v_new_mp.id);

  -- Return updated record
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_nominate_user IS
  'v1.3: Participant nominates user. NOT restricted by scope. Creates pending requested with nominated_by set. Requires user accept + ORG approve.';

-- ============================================================================
-- 2. rpc_match_reactivate_participant (v1.3 New, Critical)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_reactivate_participant(p_match_participant_id uuid)
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

  -- v1.3: ORG ONLY
  IF NOT is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only organizer can reactivate participants';
  END IF;

  -- Check status
  IF v_mp.status != 'removed' THEN
    -- Not removed, idempotent (already active)
    RETURN v_mp;
  END IF;

  -- v1.3 KEY: Only change status to pending
  -- DO NOT modify user_accepted_at or org_approved_at
  -- Preserve historical confirmation facts
  UPDATE match_participants
  SET status = 'pending'
  WHERE id = p_match_participant_id;

  -- v1.3: Call reconcile
  -- If both user_accepted_at and org_approved_at exist, will immediately go to confirmed
  -- If one is missing, will stay pending until that side confirms
  PERFORM match_participant_reconcile_status(p_match_participant_id);

  -- Return updated record
  SELECT * INTO v_mp FROM match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_reactivate_participant IS
  'v1.3 CRITICAL: ORG reactivates removed participant. Only changes status to pending. Does NOT modify confirmation fields. Reconcile determines final status based on existing fields.';

-- ============================================================================
-- 3. rpc_match_add_guest_org (v1.3 New, ORG Only)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_org(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text DEFAULT NULL
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_guest_id uuid;
  v_new_mp match_participants;
BEGIN
  -- Check permission: ORG only
  IF NOT is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only organizer can add guests directly';
  END IF;

  -- Create guest record
  INSERT INTO guests (display_name, notes, created_by)
  VALUES (p_guest_display_name, p_guest_notes, auth.uid())
  RETURNING id INTO v_new_guest_id;

  -- Insert participant (ORG-added guest = immediately confirmed)
  INSERT INTO match_participants (
    match_id,
    guest_id,
    join_method,
    status,
    org_approved_at,   -- v1.3: ORG-added guest = auto-approved
    org_approved_by,
    created_by
  ) VALUES (
    p_match_id,
    v_new_guest_id,
    'guest_add',
    'confirmed',       -- v1.3: ORG-added = immediately confirmed
    now(),
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_new_mp;

  -- v1.3: Call reconcile (will stay confirmed for guest with org_approved_at)
  PERFORM match_participant_reconcile_status(v_new_mp.id);

  -- Return updated record
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_add_guest_org IS
  'v1.3: ORG adds guest. Guest is immediately confirmed (no approval needed).';

-- ============================================================================
-- 4. rpc_match_add_guest_participant (v1.3 New, Participant with Permission)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_participant(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text DEFAULT NULL
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_new_guest_id uuid;
  v_new_mp match_participants;
BEGIN
  -- Get match info
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  -- Check permission: confirmed participant with can_participants_add_guests
  IF NOT (
    is_match_participant_confirmed(p_match_id, auth.uid())
    AND v_match.can_participants_add_guests
  ) THEN
    RAISE EXCEPTION 'You do not have permission to add guests';
  END IF;

  -- Create guest record
  INSERT INTO guests (display_name, notes, created_by)
  VALUES (p_guest_display_name, p_guest_notes, auth.uid())
  RETURNING id INTO v_new_guest_id;

  -- Insert participant (Participant-added guest = pending, needs ORG approval)
  INSERT INTO match_participants (
    match_id,
    guest_id,
    join_method,
    status,
    org_approved_at,   -- v1.3: NULL (waiting for ORG approval)
    created_by
  ) VALUES (
    p_match_id,
    v_new_guest_id,
    'guest_add',
    'pending',         -- v1.3: Participant-added = pending approval
    NULL,              -- Waiting for ORG
    auth.uid()
  )
  RETURNING * INTO v_new_mp;

  -- v1.3: Call reconcile (will stay pending until ORG approves)
  PERFORM match_participant_reconcile_status(v_new_mp.id);

  -- Return updated record
  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION rpc_match_add_guest_participant IS
  'v1.3: Participant adds guest. Guest is pending (requires ORG approval to become confirmed).';

-- ============================================================================
-- Deprecate old rpc_match_add_guest
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_match_add_guest(uuid, text, text);

-- ============================================================================
-- Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION rpc_match_nominate_user TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_match_reactivate_participant TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_match_add_guest_org TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_match_add_guest_participant TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  -- Verify all new functions exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_nominate_user') THEN
    RAISE EXCEPTION 'rpc_match_nominate_user not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_reactivate_participant') THEN
    RAISE EXCEPTION 'rpc_match_reactivate_participant not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_add_guest_org') THEN
    RAISE EXCEPTION 'rpc_match_add_guest_org not created';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_add_guest_participant') THEN
    RAISE EXCEPTION 'rpc_match_add_guest_participant not created';
  END IF;

  RAISE NOTICE 'Phase B4 complete: All new v1.3 RPCs created (nominate, reactivate, add_guest x2)';
END $$;
