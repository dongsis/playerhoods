-- =============================================================================
-- Migration: 20260223203000_fix_reconfirm_trigger_and_accept_rpc
--
-- Fixes two bugs that prevent "re-confirmation after match edit" from working:
--
-- Bug 1: fn_match_detail_change_reconfirm cleared accepted-side fields but did
--   NOT update match_participants.status → participants kept status='confirmed'
--   even after their participant_accepted_at/confirmed_at were cleared.
--   Fix: also set status='pending' in the trigger UPDATE.
--   Exempt: organizer's own participant (they authored the change), guests
--   (user_id IS NULL, org controls them).
--   Note on manual_confirmed participants: they are also reset — schedule
--   changes require all user participants to re-confirm availability.
--   This is intentional product behaviour and must be documented in contract.
--
-- Bug 2: rpc_match_accept_invite blocked self-requested participants
--   (join_method='requested' AND nominated_by IS NULL) unconditionally,
--   assuming their accepted signal was recorded at request time.
--   But fn_match_detail_change_reconfirm clears participant_accepted_at on
--   schedule changes, leaving self-requesters with no path to re-accept.
--   Fix: block the early-exit only when participant_accepted_at IS NOT NULL.
--   When IS NULL (cleared by edit), fall through and allow re-acceptance.
--
-- Also adds: match.status='active' gate, status field gate, action log write,
--   legacy user_accepted_at sync, and correct REVOKE/GRANT on the RPC.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Fix 1: fn_match_detail_change_reconfirm — also set status='pending',
--   exempt organizer's participant and guests from reset.
-- =============================================================================
-- Alignment with reconcile:
--   match_participant_reconcile_status treats a user participant as:
--     confirmed iff COALESCE(participant_accepted_at, user_accepted_at) IS NOT NULL
--               AND org_approved_at IS NOT NULL
--     otherwise pending
--   After this trigger clears both accepted_at fields, COALESCE → NULL → pending.
--   Setting status='pending' here is consistent with what reconcile would compute.
--   org_approved_at is preserved — ORG approval survives match detail changes.
--   When the participant re-accepts, reconcile will confirm them again immediately
--   if org_approved_at is still set.

CREATE OR REPLACE FUNCTION public.fn_match_detail_change_reconfirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.match_date          IS DISTINCT FROM NEW.match_date
    OR OLD.start_time       IS DISTINCT FROM NEW.start_time
    OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
  ) THEN
    -- Reset all non-organizer user participants back to pending.
    -- status=pending is consistent with reconcile: accepted_at cleared → pending.
    -- org_approved_at preserved: ORG approval survives schedule changes.
    -- Organizer exempt: they authored the change; no re-confirmation needed.
    -- Guests (user_id IS NULL) exempt: org controls guest confirmation.
    UPDATE public.match_participants
    SET
      status               = 'pending',
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      manual_confirmed_by      = NULL,
      user_accepted_at         = NULL,
      confirmed_at             = NULL
    WHERE
      match_id   = NEW.id
      AND removed_at IS NULL
      AND user_id IS NOT NULL
      AND user_id IS DISTINCT FROM NEW.organizer_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_match_detail_change_reconfirm IS
  'v1.5 (fixed): Resets non-organizer user participants to pending when match '
  'scheduling changes (date/time/duration). status=pending is consistent with '
  'reconcile rule (accepted_at cleared → pending). org_approved_at preserved '
  'so re-accept immediately re-confirms. Organizer and guests exempt.';

DROP TRIGGER IF EXISTS trg_match_detail_change_reconfirm ON public.matches;

CREATE TRIGGER trg_match_detail_change_reconfirm
AFTER UPDATE OF match_date, start_time, duration_minutes
ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.fn_match_detail_change_reconfirm();

-- =============================================================================
-- Fix 2: rpc_match_accept_invite — complete rewrite with:
--   • match.status='active' gate
--   • status field gate
--   • self-requester re-accept allowed when participant_accepted_at IS NULL
--   • idempotent: no action log when accepted_at already set
--   • action log insert (action_type='accept') on real state change
--   • legacy user_accepted_at synced alongside participant_accepted_at
--   • correct REVOKE/GRANT
-- =============================================================================

-- Drop any orphan overloads first (same pattern as migration 2d).
-- A 2-param version (uuid, text) may have been added to the DB directly.
DROP FUNCTION IF EXISTS public.rpc_match_accept_invite(uuid, text);

CREATE OR REPLACE FUNCTION public.rpc_match_accept_invite(p_match_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp             match_participants;
  v_was_unaccepted boolean;
BEGIN
  -- ── Auth ────────────────────────────────────────────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- ── Match gate ──────────────────────────────────────────────────────────
  PERFORM 1 FROM public.matches WHERE id = p_match_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match is not active or does not exist';
  END IF;

  -- ── Participant record ──────────────────────────────────────────────────
  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'You were removed from this match';
  END IF;

  -- Status gate: only meaningful for pending/confirmed participants
  IF v_mp.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'Accept is not allowed for participant status: %', v_mp.status;
  END IF;

  -- Already confirmed (idempotent return)
  IF v_mp.confirmed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  -- ── Join method gates ───────────────────────────────────────────────────

  -- Self-requested block: only when participant_accepted_at IS ALREADY SET.
  -- If NULL (cleared by match schedule change), allow re-accept.
  IF v_mp.join_method = 'requested'
     AND v_mp.nominated_by IS NULL
     AND v_mp.participant_accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Self-requested participants have acceptance recorded at request time. Waiting for organizer approval.';
  END IF;

  IF v_mp.join_method NOT IN ('invited', 'nominated', 'requested') THEN
    RAISE EXCEPTION 'Accept is not available for join method: %', v_mp.join_method;
  END IF;

  -- ── Idempotent guard ────────────────────────────────────────────────────
  -- If accepted_at is already set (invited/nominated who accepted but ORG not yet approved),
  -- reconcile in case ORG approved since last reconcile — but skip action log.
  v_was_unaccepted := (v_mp.participant_accepted_at IS NULL);

  IF NOT v_was_unaccepted THEN
    PERFORM public.match_participant_reconcile_status(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
    RETURN v_mp;
  END IF;

  -- ── Write acceptance ────────────────────────────────────────────────────
  UPDATE public.match_participants
  SET
    participant_accepted_at  = now(),
    participant_accepted_via = 'in_app',
    user_accepted_at         = COALESCE(user_accepted_at, now())  -- legacy field sync
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);

  -- ── Action log (only on real state change: NULL → accepted) ────────────
  INSERT INTO public.match_participant_actions (
    match_id, match_participant_id, action_type, note, created_by
  ) VALUES (
    p_match_id, v_mp.id, 'accept', NULL, auth.uid()
  );

  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_accept_invite(uuid) IS
  'v1.5 (fixed): User accepts invitation, nomination, or re-confirms after match '
  'schedule change. Requires match.status=active. Sets participant_accepted_at '
  '+ user_accepted_at (legacy sync). Works for: invited, nominated (v1.5), '
  'legacy requested+nominated_by, and self-requested when participant_accepted_at '
  'IS NULL (cleared by match edit). Blocks self-requesters when already accepted. '
  'Writes action log (action_type=accept) only on real state change. '
  'Reconcile transitions to confirmed when org_approved_at also set.';

REVOKE ALL ON FUNCTION public.rpc_match_accept_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_match_accept_invite(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_match_accept_invite(uuid) TO authenticated;

-- Also update action log table comment to document 'accept' action_type
COMMENT ON TABLE public.match_participant_actions IS
  'v1.5: Lifecycle event log for match participants. '
  'action_type values: reenter (removed user re-entered), '
  'manual_confirm (ORG manual override), '
  'accept (user accepted invite/nomination or re-confirmed after match edit). '
  'Written only by SECURITY DEFINER RPCs. Direct insert by authenticated is not permitted.';

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_match_detail_change_reconfirm'
  ) THEN
    RAISE EXCEPTION '20260223203000: trg_match_detail_change_reconfirm not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_accept_invite'
  ) THEN
    RAISE EXCEPTION '20260223203000: rpc_match_accept_invite not found';
  END IF;

  RAISE NOTICE '20260223203000: reconfirm trigger (status=pending, organizer/guest exempt) '
               'and accept RPC (active gate, status gate, self-requester re-accept, action log) fixed';
END $$;

COMMIT;
