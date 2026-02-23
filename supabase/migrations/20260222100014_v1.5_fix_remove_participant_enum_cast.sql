-- Migration: v1.5 Fix rpc_match_remove_participant enum cast error
--
-- Bug: COALESCE(v_mp.join_method, 'unknown') in the ELSE fallback of v_log_note
-- causes PostgreSQL to try to cast the text literal 'unknown' to the
-- match_join_method enum type (type unification in COALESCE). Since 'unknown'
-- is not a valid enum value, any participant with join_method = NULL (or an
-- unmatched combination) triggers:
--   ERROR: invalid input value for enum match_join_method: "unknown"
--
-- Fix: cast the enum column to text first so COALESCE unifies on text.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_match_remove_participant(p_match_participant_id uuid)
  RETURNS match_participants
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_mp       match_participants;
  v_match_id uuid;
  v_log_type text;
  v_log_note text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant not found'; END IF;

  v_match_id := v_mp.match_id;

  IF NOT (
    public.is_match_organizer(v_match_id, auth.uid())
    OR (
      public.is_match_participant_confirmed(v_match_id, auth.uid())
      AND (SELECT can_participants_manage_participants FROM public.matches WHERE id = v_match_id)
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to remove participants';
  END IF;

  -- Already removed — idempotent, no log (UI should show toast)
  IF v_mp.removed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  -- Determine semantic action_type and human-readable note from pre-removal state
  v_log_type := CASE
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'reject_request'
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'revoke_invite'
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'reject_nomination'
    WHEN v_mp.confirmed_at IS NOT NULL                                   THEN 'remove_confirmed'
    ELSE 'remove'
  END;

  v_log_note := CASE
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'Request rejected'
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'Invitation revoked'
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'Nomination rejected'
    WHEN v_mp.confirmed_at IS NOT NULL                                   THEN 'Removed by organizer'
    ELSE 'Removed (join_method=' || COALESCE(v_mp.join_method::text, 'unknown') || ')'
  END;

  UPDATE public.match_participants
  SET
    removed_at   = now(),
    removed_by   = auth.uid(),
    removal_note = v_log_note
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES
    (v_match_id, p_match_participant_id, v_log_type, v_log_note, auth.uid());

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMIT;
