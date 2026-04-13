CREATE OR REPLACE FUNCTION public.rpc_venue_leave(p_venue_id uuid)
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
    FROM public.venue_identities
    WHERE venue_id = p_venue_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  DELETE FROM public.venue_identities
  WHERE venue_id = p_venue_id
    AND user_id = v_user_id;

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
    FROM public.venue_identities
    WHERE user_id = v_user_id
    ORDER BY created_at ASC
    LIMIT 1;

    UPDATE public.profiles
    SET primary_venue_id = v_new_primary
    WHERE id = v_user_id;
  END IF;
END;
$$;

ALTER FUNCTION public.rpc_venue_leave(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_venue_leave(uuid)
IS 'User leaves a club. Removes their own club identity, clears matching admin role, and rehomes primary_venue_id when needed.';

GRANT ALL ON FUNCTION public.rpc_venue_leave(uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_venue_leave(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_venue_leave(uuid) TO service_role;
