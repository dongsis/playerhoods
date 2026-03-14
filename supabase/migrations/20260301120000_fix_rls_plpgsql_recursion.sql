-- Fix RLS infinite recursion: convert cross-table helper functions from LANGUAGE sql to LANGUAGE plpgsql.
--
-- Root cause: PostgreSQL inlines LANGUAGE sql functions during query planning.
-- When matches RLS -> subquery on match_participants -> match_participants RLS -> sql function querying matches,
-- the planner detects the cross-table cycle and raises "infinite recursion detected in policy".
-- LANGUAGE plpgsql functions are NOT inlined, so the planner treats them as black boxes, breaking the cycle.
-- SECURITY DEFINER + postgres(BYPASSRLS) correctly bypasses RLS at execution time.

-- 1. is_match_organizer: used in match_participants SELECT policy, queries matches
CREATE OR REPLACE FUNCTION public.is_match_organizer(p_match_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id AND m.organizer_id = p_user_id
  );
END;
$$;

-- 2. is_user_in_match_scope: queries matches for scope group IDs
CREATE OR REPLACE FUNCTION public.is_user_in_match_scope(p_match_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = p_match_id
      AND EXISTS (
        SELECT 1
        FROM unnest(m.invitation_scope_group_ids) AS gid
        WHERE public.is_group_active_member(gid, p_user_id)
      )
  );
END;
$$;

-- 3. is_caller_in_match_scope: thin wrapper around is_user_in_match_scope
CREATE OR REPLACE FUNCTION public.is_caller_in_match_scope(p_match_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.is_user_in_match_scope(p_match_id, auth.uid());
END;
$$;

-- 4. match_organizer_id: new helper to replace inline subquery in match_participants policy
CREATE OR REPLACE FUNCTION public.match_organizer_id(p_match_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_organizer_id uuid;
BEGIN
  SELECT m.organizer_id INTO v_organizer_id
  FROM public.matches m
  WHERE m.id = p_match_id;
  RETURN v_organizer_id;
END;
$$;

-- 5. is_user_match_associated: queries match_participants
CREATE OR REPLACE FUNCTION public.is_user_match_associated(p_match_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id AND mp.user_id = p_user_id
  );
END;
$$;

-- 6. is_caller_match_associated: thin wrapper
CREATE OR REPLACE FUNCTION public.is_caller_match_associated(p_match_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.is_user_match_associated(p_match_id, auth.uid());
END;
$$;

-- 7. sharegroup_exists: queries group_members (cross-referenced from match_participants policy)
CREATE OR REPLACE FUNCTION public.sharegroup_exists(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.group_members ga
    JOIN public.group_members gb ON gb.group_id = ga.group_id
    WHERE ga.user_id = p_user_a
      AND gb.user_id = p_user_b
      AND ga.status = 'active'
      AND gb.status = 'active'
  );
END;
$$;

-- 8. Replace match_participants SELECT policy: use function calls instead of inline subqueries
DROP POLICY IF EXISTS match_participants_select_v1_6_1 ON public.match_participants;

CREATE POLICY match_participants_select_v1_6_1 ON public.match_participants
  FOR SELECT TO authenticated
  USING (
    is_match_organizer(match_id, auth.uid())
    OR (user_id = auth.uid())
    OR (
      (status = 'confirmed'::match_participant_status)
      AND (
        is_caller_in_match_scope(match_id)
        OR sharegroup_exists(auth.uid(), match_organizer_id(match_id))
        OR is_caller_match_associated(match_id)
      )
    )
  );
