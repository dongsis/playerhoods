-- Allow non-boundary-keeper active members to invite users, but only those who
-- share at least one group with the inviter (do_users_share_group).

CREATE OR REPLACE FUNCTION public.rpc_group_invite_user(p_group_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_existing public.group_members%rowtype;
  v_caller_membership public.group_members%rowtype;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get group
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Caller must be boundary keeper OR an active member of this group
  IF v_group.boundary_keeper_id = v_caller_id THEN
    NULL; /* boundary keeper: can invite anyone (subject to rest of checks) */
  ELSE
    SELECT * INTO v_caller_membership
    FROM group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id
      AND status = 'active' AND accepted_at IS NOT NULL AND removed_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only boundary keeper or active members can invite users';
    END IF;
    -- Non-boundary-keeper: may only invite users who share a group with the caller
    IF NOT public.do_users_share_group(v_caller_id, p_user_id) THEN
      RAISE EXCEPTION 'You can only invite users who share a group with you';
    END IF;
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

COMMENT ON FUNCTION public.rpc_group_invite_user(p_group_id uuid, p_user_id uuid)
IS 'Boundary keeper can invite any user; active members can invite only users who share a group with them (do_users_share_group). Handles re-invite of removed members.';
