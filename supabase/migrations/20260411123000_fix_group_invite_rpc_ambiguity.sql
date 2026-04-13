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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_match.organizer_id <> v_uid THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  SELECT * INTO v_group
  FROM public.groups
  WHERE id = p_group_id;

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
    UPDATE public.match_group_invitations
    SET
      invited_by_user_id = v_uid,
      status = 'active',
      revoked_at = NULL,
      updated_at = now()
    WHERE id = v_row.id
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
  END IF;

  RETURN QUERY
  SELECT v_row.group_id, v_group.name, v_row.status, v_row.created_at;
END;
$$;

ALTER FUNCTION public.rpc_match_invite_group(uuid, uuid) OWNER TO postgres;
