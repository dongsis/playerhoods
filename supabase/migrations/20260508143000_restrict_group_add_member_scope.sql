CREATE OR REPLACE FUNCTION public.rpc_group_add_member(
  p_group_id uuid,
  p_target_user_id uuid,
  p_note text DEFAULT NULL::text
) RETURNS TABLE (
  result text,
  group_id uuid,
  target_user_id uuid,
  request_id uuid,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_existing_member public.group_members%rowtype;
  v_pending_request public.group_join_requests%rowtype;
  v_target_preference text;
  v_requires_approval boolean := true;
  v_sport_name text := NULL;
  v_group_label text;
  v_actor_name text := NULL;
  v_has_add_relationship boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_group
  FROM public.groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  IF p_target_user_id IS NULL OR p_target_user_id = v_actor_id THEN
    RETURN QUERY
    SELECT
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'Choose someone else to add to this Shared Group.'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_actor_id
      AND gm.status = 'active'
      AND gm.accepted_at IS NOT NULL
      AND gm.removed_at IS NULL
  ) THEN
    RETURN QUERY
    SELECT
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'Only active group members can add people to this Shared Group.'::text;
    RETURN;
  END IF;

  SELECT COALESCE(shared_group_join_preference, 'approval_required_all')
  INTO v_target_preference
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF v_target_preference IS NULL THEN
    RAISE EXCEPTION 'target_user_not_found';
  END IF;

  SELECT (
    EXISTS (
      SELECT 1
      FROM public.user_invite_circle uic
      WHERE uic.owner_user_id = v_actor_id
        AND uic.target_user_id = p_target_user_id
    )
    OR public.do_users_share_group(v_actor_id, p_target_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.contact_records cr
      JOIN public.people p
        ON p.person_id = cr.person_id
       AND p.linked_user_id = p_target_user_id
       AND p.status = 'active'
      WHERE cr.owner_user_id = v_actor_id
        AND cr.archived_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.person_relationships pr
      JOIN public.people p
        ON p.person_id = pr.person_id
       AND p.linked_user_id = p_target_user_id
       AND p.status = 'active'
      WHERE pr.actor_user_id = v_actor_id
        AND pr.relationship_type IN ('saved', 'direct_contact', 'group_contact', 'linked', 'imported_by')
    )
  )
  INTO v_has_add_relationship;

  IF NOT COALESCE(v_has_add_relationship, false) THEN
    RETURN QUERY
    SELECT
      'not_allowed'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'You can only add saved players, linked contacts, or players who share a group with you.'::text;
    RETURN;
  END IF;

  SELECT display_name
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  IF v_group.primary_sport_id IS NOT NULL THEN
    SELECT display_name
    INTO v_sport_name
    FROM public.sports
    WHERE id = v_group.primary_sport_id;
  END IF;

  v_group_label := CASE
    WHEN v_sport_name IS NOT NULL AND NULLIF(trim(v_sport_name), '') IS NOT NULL
      THEN trim(v_sport_name) || ' Group "' || v_group.name || '"'
    ELSE 'Group "' || v_group.name || '"'
  END;

  SELECT *
  INTO v_existing_member
  FROM public.group_members gm
  WHERE gm.group_id = p_group_id
    AND gm.user_id = p_target_user_id
  LIMIT 1
  FOR UPDATE;

  IF FOUND
     AND v_existing_member.status = 'active'
     AND v_existing_member.accepted_at IS NOT NULL
     AND v_existing_member.removed_at IS NULL THEN
    RETURN QUERY
    SELECT
      'already_member'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'Already a member of this Shared Group.'::text;
    RETURN;
  END IF;

  IF FOUND
     AND v_existing_member.status = 'pending'
     AND v_existing_member.accepted_at IS NULL
     AND v_existing_member.removed_at IS NULL THEN
    RETURN QUERY
    SELECT
      'already_pending'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'This person already has a pending group invite.'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_pending_request
  FROM public.group_join_requests gjr
  WHERE gjr.group_id = p_group_id
    AND gjr.target_user_id = p_target_user_id
    AND gjr.status = 'pending'
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      'already_pending'::text,
      p_group_id,
      p_target_user_id,
      v_pending_request.id,
      'Approval is already pending for this person.'::text;
    RETURN;
  END IF;

  IF v_target_preference = 'auto_join_all' THEN
    v_requires_approval := false;
  ELSIF v_target_preference = 'auto_join_enabled_sports' THEN
    v_requires_approval := NOT EXISTS (
      SELECT 1
      FROM public.user_sports us
      WHERE us.user_id = p_target_user_id
        AND us.sport_id = v_group.primary_sport_id
    );
  ELSE
    v_requires_approval := true;
  END IF;

  IF v_group.primary_sport_id IS NULL AND v_target_preference = 'auto_join_enabled_sports' THEN
    v_requires_approval := true;
  END IF;

  IF NOT v_requires_approval THEN
    IF v_existing_member.id IS NOT NULL THEN
      UPDATE public.group_members
      SET
        status = 'active',
        join_method = 'added_by_member',
        invited_by = v_actor_id,
        accepted_at = now(),
        removed_at = NULL,
        removed_by = NULL
      WHERE id = v_existing_member.id;
    ELSE
      INSERT INTO public.group_members (
        group_id,
        user_id,
        status,
        join_method,
        invited_by,
        accepted_at
      ) VALUES (
        p_group_id,
        p_target_user_id,
        'active',
        'added_by_member',
        v_actor_id,
        now()
      );
    END IF;

    INSERT INTO public.notifications (
      recipient_user_id,
      kind,
      actor_user_id,
      note
    ) VALUES (
      p_target_user_id,
      'group_added',
      v_actor_id,
      COALESCE(v_actor_name, 'Someone') || ' added you to ' || v_group_label || '.'
    );

    RETURN QUERY
    SELECT
      'direct_add_success'::text,
      p_group_id,
      p_target_user_id,
      NULL::uuid,
      'Added to group.'::text;
    RETURN;
  END IF;

  INSERT INTO public.group_join_requests (
    group_id,
    sport_id,
    requester_user_id,
    target_user_id,
    status,
    note,
    group_name_snapshot,
    sport_name_snapshot,
    requester_display_name_snapshot
  ) VALUES (
    p_group_id,
    v_group.primary_sport_id,
    v_actor_id,
    p_target_user_id,
    'pending',
    NULLIF(trim(p_note), ''),
    v_group.name,
    v_sport_name,
    v_actor_name
  )
  RETURNING * INTO v_pending_request;

  INSERT INTO public.notifications (
    recipient_user_id,
    kind,
    actor_user_id,
    note
  ) VALUES (
    p_target_user_id,
    'group_join_request',
    v_actor_id,
    COALESCE(v_actor_name, 'Someone') || ' requested to add you to ' || v_group_label || '.'
  );

  RETURN QUERY
  SELECT
    'approval_required_request_created'::text,
    p_group_id,
    p_target_user_id,
    v_pending_request.id,
    'Approval requested.'::text;
END;
$$;

ALTER FUNCTION public.rpc_group_add_member(uuid, uuid, text) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_group_add_member(uuid, uuid, text)
IS 'Shared Groups: any active member can initiate add only for saved players, linked contacts, my contacts, or shared-group users. Target join preference decides direct add vs group_join_request.';
