CREATE OR REPLACE FUNCTION public.rpc_match_remove_participant(
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
  v_match public.matches%rowtype;
  v_trimmed_note text;
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
    RAISE EXCEPTION 'participant_already_removed';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_mp.match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.organizer_id <> v_uid THEN
    RAISE EXCEPTION 'only_organizer_can_remove_participant';
  END IF;

  IF v_mp.user_id IS NOT NULL AND v_mp.user_id = v_match.organizer_id THEN
    RAISE EXCEPTION 'cannot_remove_organizer';
  END IF;

  v_trimmed_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  IF v_trimmed_note IS NOT NULL THEN
    v_chat_body := CASE
      WHEN v_mp.status = 'pending' AND v_mp.join_method = 'requested' THEN 'Request declined by host: ' || v_trimmed_note
      WHEN v_mp.status = 'pending' AND v_mp.join_method = 'invited' THEN 'Invite revoked by host: ' || v_trimmed_note
      WHEN v_mp.status = 'pending' AND v_mp.join_method = 'nominated' THEN 'Nomination declined by host: ' || v_trimmed_note
      WHEN v_mp.status = 'waiting_list' THEN 'Removed from waiting list by host: ' || v_trimmed_note
      ELSE 'Removed by host: ' || v_trimmed_note
    END;

    INSERT INTO public.match_messages (match_id, author_user_id, body)
    VALUES (v_mp.match_id, v_uid, v_chat_body);
  END IF;

  RETURN public.apply_participant_exit(p_match_participant_id, v_uid, 'remove', v_trimmed_note);
END;
$$;

ALTER FUNCTION public.rpc_match_remove_participant(uuid, text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_remove_participant(uuid, text)
IS 'Organizer removes a participant or declines a pending request. Optional note is written to removal_note and mirrored into match chat.';

GRANT ALL ON FUNCTION public.rpc_match_remove_participant(uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_remove_participant(uuid, text) TO service_role;
