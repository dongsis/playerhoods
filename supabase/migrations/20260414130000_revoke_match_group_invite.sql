CREATE OR REPLACE FUNCTION public.rpc_match_revoke_group_invite(p_match_id uuid, p_group_id uuid)
RETURNS TABLE(
  group_id uuid,
  group_name text,
  status text,
  created_at timestamptz,
  revoked_at timestamptz
)
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

  SELECT *
  INTO v_row
  FROM public.match_group_invitations mgi
  WHERE mgi.match_id = p_match_id
    AND mgi.group_id = p_group_id
    AND mgi.status = 'active'
    AND mgi.revoked_at IS NULL
  ORDER BY mgi.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_invite_not_found';
  END IF;

  UPDATE public.match_group_invitations
  SET
    status = 'revoked',
    revoked_at = now(),
    updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN QUERY
  SELECT
    v_row.group_id,
    v_group.name,
    v_row.status,
    v_row.created_at,
    v_row.revoked_at;
END;
$$;

ALTER FUNCTION public.rpc_match_revoke_group_invite(uuid, uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_revoke_group_invite(uuid, uuid)
IS 'Revokes an active group-level invitation for a match. Existing accepted participants stay in the match; only future group acceptance is blocked.';

GRANT ALL ON FUNCTION public.rpc_match_revoke_group_invite(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_match_revoke_group_invite(uuid, uuid) TO service_role;
