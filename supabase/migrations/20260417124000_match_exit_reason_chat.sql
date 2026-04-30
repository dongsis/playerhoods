CREATE OR REPLACE FUNCTION public.rpc_match_user_withdraw(
  p_match_id uuid,
  p_note text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mp public.match_participants%rowtype;
  v_trimmed_note text;
  v_chat_body text;
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

  v_trimmed_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  IF v_trimmed_note IS NOT NULL THEN
    v_chat_body := CASE
      WHEN v_mp.join_method = 'requested' AND v_mp.nominated_by IS NULL THEN 'Withdrew request: ' || v_trimmed_note
      WHEN v_mp.join_method = 'nominated' AND v_mp.confirmed_at IS NULL THEN 'Declined nomination: ' || v_trimmed_note
      WHEN v_mp.join_method = 'invited' AND v_mp.confirmed_at IS NULL THEN 'Declined invite: ' || v_trimmed_note
      WHEN v_mp.confirmed_at IS NOT NULL THEN 'Left match: ' || v_trimmed_note
      ELSE 'Withdrew: ' || v_trimmed_note
    END;

    INSERT INTO public.match_messages (match_id, author_user_id, body)
    VALUES (v_mp.match_id, auth.uid(), v_chat_body);
  END IF;

  RETURN public.apply_participant_exit(v_mp.id, auth.uid(), 'withdraw', v_trimmed_note);
END;
$$;

ALTER FUNCTION public.rpc_match_user_withdraw(uuid, text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_user_withdraw(uuid, text)
IS 'User withdraws (decline invite or leave). Optional note is written to removal_note and mirrored into match chat.';

GRANT ALL ON FUNCTION public.rpc_match_user_withdraw(uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_user_withdraw(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_withdraw_participant(
  p_match_participant_id uuid,
  p_note text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mp public.match_participants%rowtype;
  v_trimmed_note text;
  v_exit_note text;
  v_chat_body text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  IF NOT public.is_active_match_proxy_for_participant(p_match_participant_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorized_to_proxy_manage';
  END IF;

  v_trimmed_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  v_exit_note := COALESCE(
    v_trimmed_note,
    CASE
      WHEN v_mp.join_method = 'invited' AND v_mp.confirmed_at IS NULL THEN 'Proxy declined invitation on behalf of participant'
      WHEN v_mp.join_method = 'nominated' AND v_mp.confirmed_at IS NULL THEN 'Proxy declined nomination on behalf of participant'
      WHEN v_mp.confirmed_at IS NOT NULL THEN 'Proxy withdrew participation on behalf of participant'
      ELSE 'Proxy withdrew on behalf of participant'
    END
  );

  IF v_trimmed_note IS NOT NULL THEN
    v_chat_body := CASE
      WHEN v_mp.join_method = 'invited' AND v_mp.confirmed_at IS NULL THEN 'Proxy decline reason: ' || v_trimmed_note
      WHEN v_mp.join_method = 'nominated' AND v_mp.confirmed_at IS NULL THEN 'Proxy decline reason: ' || v_trimmed_note
      WHEN v_mp.confirmed_at IS NOT NULL THEN 'Proxy withdrawal reason: ' || v_trimmed_note
      ELSE 'Proxy withdrawal reason: ' || v_trimmed_note
    END;

    INSERT INTO public.match_messages (match_id, author_user_id, body)
    VALUES (v_mp.match_id, v_uid, v_chat_body);
  END IF;

  RETURN public.apply_participant_exit(
    p_match_participant_id,
    v_uid,
    'withdraw',
    v_exit_note
  );
END;
$$;

ALTER FUNCTION public.rpc_match_proxy_withdraw_participant(uuid, text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_proxy_withdraw_participant(uuid, text)
IS 'Proxy withdraws or declines on behalf of a participant. Optional note is written to removal_note and mirrored into match chat.';

GRANT ALL ON FUNCTION public.rpc_match_proxy_withdraw_participant(uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_withdraw_participant(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.rpc_match_proxy_decline_participant(
  p_match_participant_id uuid,
  p_note text DEFAULT NULL
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.rpc_match_proxy_withdraw_participant(p_match_participant_id, p_note);
END;
$$;

ALTER FUNCTION public.rpc_match_proxy_decline_participant(uuid, text) OWNER TO postgres;

GRANT ALL ON FUNCTION public.rpc_match_proxy_decline_participant(uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_proxy_decline_participant(uuid, text) TO service_role;
