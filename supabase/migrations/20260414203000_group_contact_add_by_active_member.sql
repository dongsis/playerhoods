CREATE OR REPLACE FUNCTION public.rpc_group_add_contact_player(
  p_group_id uuid,
  p_guest_id uuid
)
RETURNS public.group_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.group_contacts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = v_uid
      AND gm.status = 'active'
      AND gm.accepted_at IS NOT NULL
      AND gm.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT public.can_user_view_contact_player(p_guest_id, v_uid) THEN
    RAISE EXCEPTION 'guest_not_accessible';
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  SELECT *
  INTO v_row
  FROM public.group_contacts
  WHERE group_id = p_group_id
    AND person_id = v_person_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.group_contacts
    SET
      membership_type = 'group_contact',
      removed_at = NULL
    WHERE group_contact_id = v_row.group_contact_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.group_contacts (
      group_id,
      person_id,
      membership_type,
      created_by,
      created_at
    )
    VALUES (
      p_group_id,
      v_person_id,
      'group_contact',
      v_uid,
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.person_relationships (actor_user_id, person_id, relationship_type, source_group_id)
  SELECT v_uid, v_person_id, 'group_contact', p_group_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.person_relationships pr
    WHERE pr.actor_user_id = v_uid
      AND pr.person_id = v_person_id
      AND pr.relationship_type = 'group_contact'
      AND pr.source_group_id = p_group_id
  );

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.rpc_group_add_contact_player(uuid, uuid) IS
'Add a Contact Player to a Shared Group as a limited group contact. Any active Shared Group member may add a Contact Player they can already view.';
