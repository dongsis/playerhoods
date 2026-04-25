ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.groups.venue_id
IS 'Optional home venue for the Shared Group. Used for club discovery when open_to_club_members is enabled.';

DROP FUNCTION IF EXISTS public.rpc_group_create(text, text, smallint, text);

CREATE OR REPLACE FUNCTION public.rpc_group_create(
  p_name text,
  p_description text DEFAULT NULL,
  p_primary_sport_id smallint DEFAULT NULL,
  p_icon_key text DEFAULT 'spark',
  p_venue_id uuid DEFAULT NULL
) RETURNS public.groups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_row public.groups;
  v_trimmed_name text;
  v_icon_key text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed_name := trim(p_name);
  IF v_trimmed_name IS NULL OR v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Group name must not be empty';
  END IF;

  IF p_primary_sport_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sports s WHERE s.id = p_primary_sport_id AND s.is_active = true
  ) THEN
    RAISE EXCEPTION 'invalid_sport';
  END IF;

  IF p_venue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.venue_identities vi
    WHERE vi.user_id = v_user_id
      AND vi.venue_id = p_venue_id
  ) THEN
    RAISE EXCEPTION 'invalid_group_venue';
  END IF;

  v_icon_key := NULLIF(trim(COALESCE(p_icon_key, 'spark')), '');
  IF v_icon_key IS NULL THEN
    v_icon_key := 'spark';
  END IF;

  INSERT INTO public.groups (
    name,
    description,
    created_by,
    boundary_keeper_id,
    primary_sport_id,
    icon_key,
    venue_id
  )
  VALUES (
    v_trimmed_name,
    NULLIF(trim(COALESCE(p_description, '')), ''),
    v_user_id,
    v_user_id,
    p_primary_sport_id,
    v_icon_key,
    p_venue_id
  )
  RETURNING * INTO v_row;

  INSERT INTO public.group_members (group_id, user_id, status, join_method, accepted_at)
  VALUES (v_row.id, v_user_id, 'active', 'created', now());

  RETURN v_row;
END;
$$;

ALTER FUNCTION public.rpc_group_create(text, text, smallint, text, uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION public.rpc_group_create(text, text, smallint, text, uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_group_create(text, text, smallint, text, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_create(text, text, smallint, text, uuid) TO service_role;

DROP FUNCTION IF EXISTS public.rpc_group_update(uuid, text, text, smallint, boolean, text);

CREATE OR REPLACE FUNCTION public.rpc_group_update(
  p_group_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_primary_sport_id smallint DEFAULT NULL,
  p_open_to_club_members boolean DEFAULT NULL,
  p_icon_key text DEFAULT NULL,
  p_venue_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_affected int;
  v_trimmed text;
  v_icon_key text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := trim(p_name);
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'Group name must not be empty';
  END IF;

  IF p_primary_sport_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sports s WHERE s.id = p_primary_sport_id AND s.is_active = true
  ) THEN
    RAISE EXCEPTION 'invalid_sport';
  END IF;

  IF p_venue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.venue_identities vi
    WHERE vi.user_id = auth.uid()
      AND vi.venue_id = p_venue_id
  ) THEN
    RAISE EXCEPTION 'invalid_group_venue';
  END IF;

  v_icon_key := NULLIF(trim(COALESCE(p_icon_key, '')), '');

  UPDATE public.groups
  SET name = v_trimmed,
      description = NULLIF(trim(COALESCE(p_description, '')), ''),
      primary_sport_id = p_primary_sport_id,
      open_to_club_members = COALESCE(p_open_to_club_members, open_to_club_members),
      icon_key = COALESCE(v_icon_key, icon_key),
      venue_id = p_venue_id
  WHERE id = p_group_id
    AND boundary_keeper_id = auth.uid();

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Group not found or you are not the boundary keeper';
  END IF;
END;
$$;

ALTER FUNCTION public.rpc_group_update(uuid, text, text, smallint, boolean, text, uuid) OWNER TO postgres;
GRANT ALL ON FUNCTION public.rpc_group_update(uuid, text, text, smallint, boolean, text, uuid) TO anon;
GRANT ALL ON FUNCTION public.rpc_group_update(uuid, text, text, smallint, boolean, text, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_group_update(uuid, text, text, smallint, boolean, text, uuid) TO service_role;
