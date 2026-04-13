CREATE OR REPLACE FUNCTION public.rpc_venue_members_discovery(
  p_venue_id uuid,
  p_search text DEFAULT NULL
) RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  venue_handle text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_identities member_vi
    WHERE member_vi.venue_id = p_venue_id
      AND member_vi.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'not_club_member';
  END IF;

  RETURN QUERY
  SELECT
    ci.user_id,
    p.display_name,
    p.avatar_url,
    ci.venue_handle
  FROM public.venue_identities ci
  JOIN public.profiles p
    ON p.id = ci.user_id
  WHERE ci.venue_id = p_venue_id
    AND ci.user_id <> v_uid
    AND p.show_in_venue_member_discovery = true
    AND COALESCE(ci.visible_in_venue_member_discovery, true) = true
    AND (
      p_search IS NULL
      OR p_search = ''
      OR p.display_name ILIKE '%' || trim(p_search) || '%'
      OR ci.venue_handle ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.venue_handle)) NULLS LAST,
           LOWER(ci.venue_handle) NULLS LAST,
           ci.user_id;
END;
$$;
