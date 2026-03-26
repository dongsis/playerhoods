-- Align is_user_match_associated with its documented behavior:
-- removed participants should NOT be considered match-associated.

CREATE OR REPLACE FUNCTION public.is_user_match_associated(p_match_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id  = p_user_id
      AND mp.status  <> 'removed'
  );
$$;

COMMENT ON FUNCTION public.is_user_match_associated(p_match_id uuid, p_user_id uuid)
IS 'v1.6.3: Returns true if user has a non-removed participant row (pending/confirmed). Removed participants are NOT match-associated. SECURITY DEFINER. Not granted to authenticated — internal RPC use only.';

