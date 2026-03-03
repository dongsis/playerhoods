-- RPC: rpc_group_invite_user
-- Boundary keeper invites a user to a group.
-- Handles re-invite: if user was previously removed, reactivates to pending.

-- Ensure removed_by column exists (idempotent with rpc_group_leave migration)
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.rpc_group_invite_user(
  p_group_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_existing public.group_members%rowtype;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get group
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Only boundary keeper can invite
  IF v_group.boundary_keeper_id != v_caller_id THEN
    RAISE EXCEPTION 'Only boundary keeper can invite users';
  END IF;

  -- Cannot invite self
  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  -- Check for existing membership
  SELECT * INTO v_existing
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  IF FOUND THEN
    -- Already active or pending
    IF v_existing.status IN ('active', 'pending') THEN
      RAISE EXCEPTION 'User is already a member or has a pending invite';
    END IF;

    -- Re-invite: removed → pending (clear removal audit, reset acceptance)
    UPDATE group_members
    SET status = 'pending',
        invited_by = v_caller_id,
        removed_at = NULL,
        removed_by = NULL,
        accepted_at = NULL
    WHERE id = v_existing.id;
  ELSE
    -- Fresh invite
    INSERT INTO group_members (group_id, user_id, status, join_method, invited_by)
    VALUES (p_group_id, p_user_id, 'pending', 'invited', v_caller_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION rpc_group_invite_user IS
  'Boundary keeper invites user to group. Handles re-invite of removed members.';

GRANT EXECUTE ON FUNCTION rpc_group_invite_user TO authenticated;
