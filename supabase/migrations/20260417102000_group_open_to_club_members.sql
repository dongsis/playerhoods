ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS open_to_club_members boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.groups.open_to_club_members
IS 'When true, the group is intended to be open to people from the same club to join.';

CREATE OR REPLACE FUNCTION public.rpc_group_update(
  p_group_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_primary_sport_id smallint DEFAULT NULL,
  p_open_to_club_members boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  IF p_primary_sport_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sports s
    WHERE s.id = p_primary_sport_id
      AND s.is_active = true
  ) THEN
    RAISE EXCEPTION 'invalid_sport';
  END IF;

  UPDATE public.groups
  SET name = v_trimmed,
      description = NULLIF(trim(coalesce(p_description, '')), ''),
      primary_sport_id = p_primary_sport_id,
      open_to_club_members = COALESCE(p_open_to_club_members, open_to_club_members)
  WHERE id = p_group_id
    AND boundary_keeper_id = auth.uid();

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Group not found or you are not the boundary keeper';
  END IF;
END;
$$;

ALTER FUNCTION public.rpc_group_update(uuid, text, text, smallint, boolean) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_group_update(uuid, text, text, smallint, boolean)
  IS 'Boundary keeper updates group name, optional description, optional primary sport, and whether the group is open to club members.';

GRANT ALL ON FUNCTION public.rpc_group_update(uuid, text, text, smallint, boolean) TO anon;
GRANT ALL ON FUNCTION public.rpc_group_update(uuid, text, text, smallint, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_update(uuid, text, text, smallint, boolean) TO service_role;
