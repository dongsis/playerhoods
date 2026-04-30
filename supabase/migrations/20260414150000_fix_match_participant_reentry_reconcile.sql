CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mp record;
  v_accepted_at timestamptz;
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

  v_accepted_at := v_mp.participant_accepted_at;

  -- removed_at is the canonical removal signal. status='removed' alone should
  -- not block re-entry rows that have already cleared removed_at.
  IF v_mp.removed_at IS NOT NULL THEN
    UPDATE public.match_participants
    SET status = 'removed'::public.match_participant_status,
        confirmed_at = NULL,
        removed_at   = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (
        status != 'removed'::public.match_participant_status
        OR confirmed_at IS NOT NULL
        OR removed_at IS NULL
      );
    RETURN;
  END IF;

  IF v_mp.guest_id IS NOT NULL THEN
    IF v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed'::public.match_participant_status,
          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (
          status != 'confirmed'::public.match_participant_status
          OR confirmed_at IS NULL
        );
    ELSE
      UPDATE public.match_participants
      SET status = 'pending'::public.match_participant_status,
          confirmed_at = NULL
      WHERE id = p_mp_id
        AND (
          status != 'pending'::public.match_participant_status
          OR confirmed_at IS NOT NULL
        );
    END IF;
    RETURN;
  END IF;

  IF v_mp.user_id IS NOT NULL THEN
    IF v_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed'::public.match_participant_status,
          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (
          status != 'confirmed'::public.match_participant_status
          OR confirmed_at IS NULL
        );
    ELSE
      UPDATE public.match_participants
      SET status = 'pending'::public.match_participant_status,
          confirmed_at = NULL
      WHERE id = p_mp_id
        AND (
          status != 'pending'::public.match_participant_status
          OR confirmed_at IS NOT NULL
        );
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Invalid participant: neither user_id nor guest_id set for %', p_mp_id;
END;
$$;

COMMENT ON FUNCTION public.match_participant_reconcile_status(uuid)
IS 'v1.7: removed_at is canonical for removed; status=removed alone is not. Re-entry rows that clear removed_at can reconcile back to pending or confirmed.';
