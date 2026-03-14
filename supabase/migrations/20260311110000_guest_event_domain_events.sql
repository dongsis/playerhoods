-- Emit domain events for guest nominated, org_approved, delegate_confirmed, match_formed
-- Existing trg_set_formed_at_once already sets matches.formed_at. Add trigger to emit match.formed.

CREATE OR REPLACE FUNCTION public.fn_emit_match_formed_on_formed_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_evt_id uuid;
BEGIN
  IF OLD.formed_at IS NULL AND NEW.formed_at IS NOT NULL THEN
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES (
      'match.formed',
      'match',
      NEW.id,
      NULL,
      jsonb_build_object(
        'match_id', NEW.id,
        'game_type', NEW.game_type,
        'match_date', NEW.match_date,
        'club_name', (SELECT c.name FROM public.clubs c WHERE c.id = NEW.club_id),
        'required_count', NEW.required_count
      )
    )
    RETURNING id INTO v_evt_id;
    PERFORM public.rpc_process_domain_event(v_evt_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emit_match_formed ON public.matches;
CREATE TRIGGER trg_emit_match_formed
  AFTER UPDATE OF formed_at ON public.matches
  FOR EACH ROW
  WHEN (OLD.formed_at IS NULL AND NEW.formed_at IS NOT NULL)
  EXECUTE FUNCTION public.fn_emit_match_formed_on_formed_at();

-- Revert match_participant_reconcile_status to original (remove fn_check_match_formed_emit calls)
CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
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

  IF v_mp.status = 'removed'::public.match_participant_status THEN
    UPDATE public.match_participants
    SET confirmed_at = NULL,
        removed_at   = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (confirmed_at IS NOT NULL OR removed_at IS NULL);
    RETURN;
  END IF;

  IF v_mp.guest_id IS NOT NULL THEN
    IF v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed'::public.match_participant_status,
          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (status != 'confirmed'::public.match_participant_status OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET status = 'pending'::public.match_participant_status,
          confirmed_at = NULL
      WHERE id = p_mp_id
        AND (status != 'pending'::public.match_participant_status OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  IF v_mp.user_id IS NOT NULL THEN
    IF v_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed'::public.match_participant_status,
          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (status != 'confirmed'::public.match_participant_status OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET status = 'pending'::public.match_participant_status,
          confirmed_at = NULL
      WHERE id = p_mp_id
        AND (status != 'pending'::public.match_participant_status OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Invalid participant: neither user_id nor guest_id set for %', p_mp_id;
END;
$$;
