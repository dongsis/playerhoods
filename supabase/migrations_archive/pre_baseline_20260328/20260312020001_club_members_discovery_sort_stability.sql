-- =============================================================================
-- Fix: stable sort for rpc_club_members_discovery
-- - LOWER() for case-insensitive ordering (avoid case drift)
-- - ci.user_id as final tiebreaker when display fields are NULL/equal
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_club_members_discovery(
  p_club_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  club_handle text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_identities
    WHERE club_id = p_club_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'not_club_member';
  END IF;

  RETURN QUERY
  SELECT
    ci.user_id,
    p.display_name,
    p.avatar_url,
    ci.club_handle
  FROM public.club_identities ci
  JOIN public.profiles p ON p.id = ci.user_id
  WHERE ci.club_id = p_club_id
    AND ci.user_id <> v_uid
    AND p.show_in_club_member_discovery = true
    AND (
      p_search IS NULL
      OR p_search = ''
      OR p.display_name ILIKE '%' || trim(p_search) || '%'
      OR ci.club_handle ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.club_handle)) NULLS LAST,
           LOWER(ci.club_handle) NULLS LAST,
           ci.user_id;
END;
$$;
