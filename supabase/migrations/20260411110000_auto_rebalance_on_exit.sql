CREATE OR REPLACE FUNCTION public.apply_participant_exit(
  p_match_participant_id uuid,
  p_actor_id uuid,
  p_exit_kind text,
  p_removal_note text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mp       public.match_participants%rowtype;
  v_log_type text;
  v_log_note text;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id_required';
  END IF;

  IF p_exit_kind IS NULL OR p_exit_kind NOT IN ('remove', 'withdraw') THEN
    RAISE EXCEPTION 'exit_kind_must_be_remove_or_withdraw';
  END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  IF p_removal_note IS NOT NULL THEN
    v_log_note := p_removal_note;
    IF p_exit_kind = 'remove' THEN
      v_log_type := CASE
        WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'reject_request'
        WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'revoke_invite'
        WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'reject_nomination'
        WHEN v_mp.confirmed_at IS NOT NULL                                 THEN 'remove_confirmed'
        ELSE 'remove'
      END;
    ELSE
      v_log_type := CASE
        WHEN v_mp.join_method IN ('invited', 'nominated') AND v_mp.confirmed_at IS NULL THEN 'decline'
        ELSE 'withdraw'
      END;
    END IF;
  ELSIF p_exit_kind = 'remove' THEN
    v_log_type := CASE
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'reject_request'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'revoke_invite'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'reject_nomination'
      WHEN v_mp.confirmed_at IS NOT NULL                                 THEN 'remove_confirmed'
      ELSE 'remove'
    END;
    v_log_note := CASE
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'Request rejected'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'Invitation revoked'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'Nomination rejected'
      WHEN v_mp.confirmed_at IS NOT NULL                                 THEN 'Removed by organizer'
      ELSE 'Removed (join_method=' || COALESCE(v_mp.join_method::text, 'unknown') || ')'
    END;
  ELSE
    v_log_type := CASE
      WHEN v_mp.join_method IN ('invited', 'nominated') AND v_mp.confirmed_at IS NULL THEN 'decline'
      ELSE 'withdraw'
    END;
    v_log_note := CASE
      WHEN v_mp.join_method = 'invited'   AND v_mp.confirmed_at IS NULL THEN 'User declined invitation'
      WHEN v_mp.join_method = 'nominated' AND v_mp.confirmed_at IS NULL THEN 'User declined nomination'
      WHEN v_mp.confirmed_at IS NOT NULL                                THEN 'User left match'
      ELSE 'User withdrew'
    END;
  END IF;

  UPDATE public.match_participants
  SET
    removed_at   = now(),
    removed_by   = p_actor_id,
    removal_note = v_log_note
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES
    (v_mp.match_id, p_match_participant_id, v_log_type, v_log_note, p_actor_id);

  PERFORM public.perform_match_roster_rebalance(v_mp.match_id);

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

ALTER FUNCTION public.apply_participant_exit(uuid, uuid, text, text) OWNER TO postgres;

COMMENT ON FUNCTION public.apply_participant_exit(uuid, uuid, text, text)
IS 'Internal helper: centralizes participant exit write (removed_at, removed_by, removal_note), reconcile, action log, and automatic waiting-list rebalance. exit_kind: remove | withdraw.';

CREATE OR REPLACE FUNCTION public.rpc_match_user_withdraw(p_match_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mp public.match_participants%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  RETURN public.apply_participant_exit(v_mp.id, auth.uid(), 'withdraw', NULL);
END;
$$;

ALTER FUNCTION public.rpc_match_user_withdraw(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_user_withdraw(uuid)
IS 'v1.5: User withdraws (decline invite or leave). Sets removed_at + removed_by, reconciles to removed, and automatically rebalances the roster so waiting-list promotion does not depend on a follow-up client RPC.';
