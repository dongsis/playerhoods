-- Re-entry (T1 nominates removed T2) clears removed_at and sets nominated; reconcile then
-- was entering the "Removed" branch because status was still 'removed', and re-set removed_at.
-- Fix: treat as removed only when removed_at IS NOT NULL (canonical). So after re-entry
-- reconcile falls through to pending.

CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_mp          record;
  v_accepted_at timestamptz;
BEGIN
  SELECT
    id,
    status,
    user_id,
    guest_id,
    participant_accepted_at,
    org_approved_at,
    removed_at,
    confirmed_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  -- 1) Removed: only when removed_at IS NOT NULL (canonical). Re-entry clears removed_at
  --    so we must not treat status='removed' alone as removed here.
  IF v_mp.removed_at IS NOT NULL THEN
    UPDATE public.match_participants
    SET status       = 'removed'::public.match_participant_status,
        confirmed_at = NULL,
        removed_at   = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (
        status    <> 'removed'::public.match_participant_status
        OR confirmed_at IS NOT NULL
        OR removed_at   IS NULL
      );
    RETURN;
  END IF;

  -- 2) Confirmed ⇔ participant_accepted_at AND org_approved_at
  v_accepted_at := v_mp.participant_accepted_at;

  IF v_accepted_at IS NOT NULL
     AND v_mp.org_approved_at IS NOT NULL
  THEN
    UPDATE public.match_participants
    SET status       = 'confirmed'::public.match_participant_status,
        confirmed_at = COALESCE(
          confirmed_at,
          GREATEST(v_accepted_at, v_mp.org_approved_at)
        )
    WHERE id = p_mp_id
      AND (
        status <> 'confirmed'::public.match_participant_status
        OR confirmed_at IS NULL
      );
    RETURN;
  END IF;

  -- 3) Pending: not removed (removed_at NULL) and not both accepted+approved
  UPDATE public.match_participants
  SET status       = 'pending'::public.match_participant_status,
      confirmed_at = NULL
  WHERE id = p_mp_id
    AND (
      status <> 'pending'::public.match_participant_status
      OR confirmed_at IS NOT NULL
    );

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.match_participant_reconcile_status(p_mp_id uuid) IS
'v1.7: removed_at is canonical for removed; status=removed alone is not (allows re-entry to set pending). confirmed ⇔ participant_accepted_at AND org_approved_at.';
