-- =============================================================================
-- Migration: Play Network Core — Step 3: Minimal Club Members discovery
-- Purpose: Read-only discovery surface for discover → save to Invite Circle flow
-- Authoritative: 00_AUTHORITATIVE_INDEX.md, playerhoods_five_pillars_implementation_v1.md
-- Scope: Read/list/search only. No match invite, can_*, or other pillars.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rpc_club_members_discovery
-- Returns club members who opted in via profiles.show_in_club_member_discovery.
-- Caller must be a member of the club. Excludes self.
-- -----------------------------------------------------------------------------

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

  -- Caller must be a member of the club
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
  ORDER BY COALESCE(NULLIF(p.display_name, ''), ci.club_handle) NULLS LAST,
           ci.club_handle;
END;
$$;

COMMENT ON FUNCTION public.rpc_club_members_discovery(uuid, text) IS
'Phase 1: Club Members discovery. Read-only. Respects show_in_club_member_discovery. Caller must be club member. For discover → save to Invite Circle flow.';

GRANT EXECUTE ON FUNCTION public.rpc_club_members_discovery(uuid, text) TO authenticated;
