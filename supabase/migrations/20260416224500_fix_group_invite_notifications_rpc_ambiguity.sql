CREATE OR REPLACE FUNCTION public.rpc_match_invite_group(p_match_id uuid, p_group_id uuid)
RETURNS TABLE(group_id uuid, group_name text, status text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match public.matches%rowtype;
  v_group public.groups%rowtype;
  v_row public.match_group_invitations%rowtype;
  v_should_notify boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_match
  FROM public.matches m
  WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.organizer_id <> v_uid THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  SELECT *
  INTO v_group
  FROM public.groups g
  WHERE g.id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF v_group.primary_sport_id IS NOT NULL AND v_group.primary_sport_id <> v_match.sport_id THEN
    RAISE EXCEPTION 'group_sport_mismatch';
  END IF;

  SELECT *
  INTO v_row
  FROM public.match_group_invitations mgi
  WHERE mgi.match_id = p_match_id
    AND mgi.group_id = p_group_id
  ORDER BY mgi.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_should_notify := v_row.status <> 'active' OR v_row.revoked_at IS NOT NULL;

    UPDATE public.match_group_invitations mgi
    SET
      invited_by_user_id = v_uid,
      status = 'active',
      revoked_at = NULL,
      updated_at = now()
    WHERE mgi.id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.match_group_invitations (
      match_id,
      group_id,
      invited_by_user_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      p_match_id,
      p_group_id,
      v_uid,
      'active',
      now(),
      now()
    )
    RETURNING * INTO v_row;

    v_should_notify := true;
  END IF;

  IF v_should_notify THEN
    PERFORM public.notify_match_group_invite_recipients(p_match_id, p_group_id, v_uid);
  END IF;

  RETURN QUERY
  SELECT v_row.group_id, v_group.name, v_row.status, v_row.created_at;
END;
$$;

ALTER FUNCTION public.rpc_match_invite_group(uuid, uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_invite_group(uuid, uuid)
IS 'Creates or reactivates a group-level invitation for a match and notifies active group members in inbox. No participant rows are created until a registered member accepts.';
