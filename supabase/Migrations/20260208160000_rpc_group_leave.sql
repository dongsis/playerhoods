-- RPC: rpc_group_leave
-- User leaves a group. Sets status to 'removed'.
-- Boundary keeper cannot leave (must transfer ownership first).

-- Add removed_by column for audit (self-leave vs BK-remove)
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.rpc_group_leave(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_membership public.group_members%rowtype;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get group
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Boundary keeper cannot leave
  IF v_group.boundary_keeper_id = v_user_id THEN
    RAISE EXCEPTION 'Boundary keeper cannot leave the group';
  END IF;

  -- Get membership
  SELECT * INTO v_membership
  FROM group_members
  WHERE group_id = p_group_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;

  IF v_membership.status = 'removed' THEN
    -- Already removed, idempotent
    RETURN;
  END IF;

  -- Remove member (self-leave: removed_by = self)
  UPDATE group_members
  SET status = 'removed',
      removed_at = now(),
      removed_by = v_user_id
  WHERE id = v_membership.id;
END;
$$;

COMMENT ON FUNCTION rpc_group_leave IS
  'User leaves a group. Sets status to removed with removed_by for audit. Boundary keeper cannot leave.';

GRANT EXECUTE ON FUNCTION rpc_group_leave TO authenticated;
