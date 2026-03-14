-- Reject pending group invite (invitee declines). Sets status=removed, removed_at, removed_by.
-- Boundary keeper only: update group name and description.

-- rpc_group_reject_invite(p_group_id uuid)
CREATE OR REPLACE FUNCTION public.rpc_group_reject_invite(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.group_members
  SET status = 'removed',
      removed_at = now(),
      removed_by = auth.uid()
  WHERE group_id = p_group_id
    AND user_id = auth.uid()
    AND status = 'pending'
    AND join_method = 'invited';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'no_pending_invite';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.rpc_group_reject_invite(p_group_id uuid) IS 'Invitee declines a pending group invite. Sets status=removed, removed_at, removed_by.';

-- rpc_group_update(p_group_id uuid, p_name text, p_description text): boundary keeper only
CREATE OR REPLACE FUNCTION public.rpc_group_update(
  p_group_id uuid,
  p_name text,
  p_description text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_affected int;
  v_trimmed text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := trim(p_name);
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'Group name must not be empty';
  END IF;

  UPDATE public.groups
  SET name = v_trimmed,
      description = NULLIF(trim(coalesce(p_description, '')), '')
  WHERE id = p_group_id
    AND boundary_keeper_id = auth.uid();

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Group not found or you are not the boundary keeper';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.rpc_group_update(p_group_id uuid, p_name text, p_description text) IS 'Boundary keeper updates group name and optional description.';
