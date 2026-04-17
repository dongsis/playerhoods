CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mp record;
  v_is_ready boolean := false;
BEGIN
  SELECT
    id,
    status,
    user_id,
    guest_id,
    participant_accepted_at,
    org_approved_at,
    removed_at,
    confirmed_at,
    waiting_list_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  -- removed_at is the canonical removal signal. A legacy row with status='removed'
  -- but removed_at cleared should be allowed to reconcile back into the active flow.
  IF v_mp.removed_at IS NOT NULL THEN
    UPDATE public.match_participants
    SET
      status = 'removed',
      confirmed_at = NULL,
      waiting_list_at = NULL,
      removed_at = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (
        status::text <> 'removed'
        OR confirmed_at IS NOT NULL
        OR waiting_list_at IS NOT NULL
        OR removed_at IS NULL
      );
    RETURN;
  END IF;

  IF v_mp.user_id IS NULL AND v_mp.guest_id IS NULL THEN
    RAISE EXCEPTION 'Invalid participant: neither user_id nor guest_id set for %', p_mp_id;
  END IF;

  v_is_ready := v_mp.participant_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL;

  IF v_is_ready THEN
    IF v_mp.status::text = 'waiting_list' THEN
      UPDATE public.match_participants
      SET
        status = 'waiting_list',
        confirmed_at = NULL,
        waiting_list_at = COALESCE(waiting_list_at, now())
      WHERE id = p_mp_id
        AND (
          status::text <> 'waiting_list'
          OR confirmed_at IS NOT NULL
          OR waiting_list_at IS NULL
        );
    ELSE
      UPDATE public.match_participants
      SET
        status = 'confirmed',
        confirmed_at = COALESCE(confirmed_at, now()),
        waiting_list_at = NULL
      WHERE id = p_mp_id
        AND (
          status::text <> 'confirmed'
          OR confirmed_at IS NULL
          OR waiting_list_at IS NOT NULL
        );
    END IF;
    RETURN;
  END IF;

  UPDATE public.match_participants
  SET
    status = 'pending',
    confirmed_at = NULL,
    waiting_list_at = NULL
  WHERE id = p_mp_id
    AND (
      status::text <> 'pending'
      OR confirmed_at IS NOT NULL
      OR waiting_list_at IS NOT NULL
    );
END;
$$;

COMMENT ON FUNCTION public.match_participant_reconcile_status(uuid)
IS 'Canonical participant status reconciliation. Registered users and Contact Players both require participant-side acceptance plus organizer approval to become confirmed; waiting-list state is preserved for ready participants when capacity is full.';
