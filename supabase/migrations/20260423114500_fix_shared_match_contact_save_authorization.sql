CREATE OR REPLACE FUNCTION public.rpc_contact_player_save(
  p_guest_id uuid,
  p_source text DEFAULT 'manual',
  p_group_id uuid DEFAULT NULL::uuid,
  p_match_id uuid DEFAULT NULL::uuid
)
RETURNS public.person_relationships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_relationships;
  v_allowed boolean := false;
  v_source text := COALESCE(NULLIF(trim(p_source), ''), 'manual');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  IF v_source NOT IN ('manual', 'direct_contact', 'shared_match', 'group_contact') THEN
    v_source := 'manual';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = v_uid
      AND urg.guest_id = p_guest_id
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed
     AND p_match_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.match_participants mp_target
       LEFT JOIN public.guests g
         ON g.id = mp_target.guest_id
       WHERE mp_target.match_id = p_match_id
         AND (
           mp_target.guest_id = p_guest_id
           OR g.person_id = v_person_id
         )
     )
     AND (
       public.is_caller_in_match_scope(p_match_id)
       OR public.is_user_match_associated(p_match_id, v_uid)
       OR EXISTS (
         SELECT 1
         FROM public.matches m
         WHERE m.id = p_match_id
           AND m.organizer_id = v_uid
       )
     ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed
     AND p_group_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.group_contacts gc
       JOIN public.group_members gm
         ON gm.group_id = gc.group_id
        AND gm.user_id = v_uid
        AND gm.status = 'active'
        AND gm.accepted_at IS NOT NULL
        AND gm.removed_at IS NULL
       WHERE gc.group_id = p_group_id
         AND gc.person_id = v_person_id
         AND gc.removed_at IS NULL
     ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not_authorized_to_save_contact_player';
  END IF;

  SELECT *
  INTO v_row
  FROM public.person_relationships pr
  WHERE pr.actor_user_id = v_uid
    AND pr.person_id = v_person_id
    AND pr.relationship_type = 'saved'
  ORDER BY pr.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.person_relationships (
    actor_user_id,
    person_id,
    relationship_type,
    source_group_id,
    source_match_id
  )
  VALUES (
    v_uid,
    v_person_id,
    'saved',
    CASE WHEN v_source = 'group_contact' THEN p_group_id ELSE NULL END,
    CASE WHEN v_source = 'shared_match' THEN p_match_id ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.rpc_contact_player_save(uuid, text, uuid, uuid) IS
'Save a Contact Player person node after owner, shared-match, or group-contact trust exposure. Shared match saves accept direct guest identity or resolved person identity.';

GRANT ALL ON FUNCTION public.rpc_contact_player_save(uuid, text, uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_contact_player_save(uuid, text, uuid, uuid) TO service_role;
