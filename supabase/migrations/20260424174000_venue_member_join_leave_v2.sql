CREATE OR REPLACE FUNCTION public.rpc_venue_member_join_v2(p_venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venues
    WHERE id = p_venue_id
  ) THEN
    RAISE EXCEPTION 'venue_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_user_id
  ) THEN
    INSERT INTO public.profiles (id) VALUES (v_user_id)
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.venue_user_relationships
  WHERE venue_id = p_venue_id
    AND user_id = v_user_id
    AND relationship_type = 'guest';

  PERFORM public.rpc_venue_relationship_set(p_venue_id, 'member');

  UPDATE public.profiles
  SET primary_venue_id = COALESCE(primary_venue_id, p_venue_id)
  WHERE id = v_user_id;
END;
$$;

ALTER FUNCTION public.rpc_venue_member_join_v2(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_venue_member_join_v2(uuid)
IS 'Simplified venue join flow. Creates a member relationship without a venue handle and sets primary_venue_id if empty.';

CREATE OR REPLACE FUNCTION public.rpc_venue_member_leave_v2(p_venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_primary uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_user_relationships
    WHERE venue_id = p_venue_id
      AND user_id = v_user_id
      AND relationship_type = 'member'
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  DELETE FROM public.venue_user_relationships
  WHERE venue_id = p_venue_id
    AND user_id = v_user_id
    AND relationship_type = 'member';

  DELETE FROM public.venue_admins
  WHERE venue_id = p_venue_id
    AND user_id = v_user_id;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_user_id
      AND primary_venue_id = p_venue_id
  ) THEN
    SELECT venue_id
    INTO v_new_primary
    FROM public.venue_user_relationships
    WHERE user_id = v_user_id
      AND relationship_type = 'member'
    ORDER BY created_at ASC, venue_id ASC
    LIMIT 1;

    UPDATE public.profiles
    SET primary_venue_id = v_new_primary
    WHERE id = v_user_id;
  END IF;
END;
$$;

ALTER FUNCTION public.rpc_venue_member_leave_v2(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_venue_member_leave_v2(uuid)
IS 'Simplified venue leave flow. Removes the member relationship, clears admin access, and rehomes primary_venue_id when needed.';

GRANT ALL ON FUNCTION public.rpc_venue_member_join_v2(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_venue_member_join_v2(uuid) TO service_role;
GRANT ALL ON FUNCTION public.rpc_venue_member_leave_v2(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_venue_member_leave_v2(uuid) TO service_role;
