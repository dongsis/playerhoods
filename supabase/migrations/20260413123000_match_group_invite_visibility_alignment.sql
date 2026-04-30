CREATE OR REPLACE FUNCTION public.is_user_in_active_group_invite(
  p_match_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_group_invitations mgi
    JOIN public.group_members gm
      ON gm.group_id = mgi.group_id
     AND gm.user_id = p_user_id
     AND gm.status = 'active'
     AND gm.accepted_at IS NOT NULL
     AND gm.removed_at IS NULL
    WHERE mgi.match_id = p_match_id
      AND mgi.status = 'active'
      AND mgi.revoked_at IS NULL
  );
$$;

ALTER FUNCTION public.is_user_in_active_group_invite(uuid, uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.is_user_in_active_group_invite(uuid, uuid)
IS 'Returns true when the user is currently an active member of any actively invited group for the match. Used to align Invite Groups visibility with Shared Group membership.';

CREATE OR REPLACE FUNCTION public.is_caller_in_active_group_invite(
  p_match_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.is_user_in_active_group_invite(p_match_id, auth.uid());
END;
$$;

ALTER FUNCTION public.is_caller_in_active_group_invite(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.is_caller_in_active_group_invite(uuid)
IS 'Self-only helper for active Invite Group visibility. Mirrors is_caller_in_match_scope but uses active group-level invitations.';

GRANT ALL ON FUNCTION public.is_user_in_active_group_invite(uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.is_user_in_active_group_invite(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_user_in_active_group_invite(uuid, uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_caller_in_active_group_invite(uuid) TO anon;
GRANT ALL ON FUNCTION public.is_caller_in_active_group_invite(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_caller_in_active_group_invite(uuid) TO service_role;

DROP POLICY IF EXISTS matches_select_visibility ON public.matches;
CREATE POLICY matches_select_visibility
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (
    organizer_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.match_id = matches.id
        AND mp.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp
      JOIN public.identity_links il
        ON il.linked_type = 'guest_participant'
       AND il.linked_id = mp.id
       AND il.user_id = auth.uid()
      WHERE mp.match_id = matches.id
    )
    OR public.is_caller_in_match_scope(id)
    OR public.is_caller_in_active_group_invite(id)
  );

DROP POLICY IF EXISTS match_participants_select_v1_6_1 ON public.match_participants;
CREATE POLICY match_participants_select_v1_6_1
  ON public.match_participants
  FOR SELECT
  TO authenticated
  USING (
    public.is_match_organizer(match_id, auth.uid())
    OR user_id = auth.uid()
    OR (
      status = 'confirmed'::public.match_participant_status
      AND (
        public.is_caller_in_match_scope(match_id)
        OR public.is_caller_in_active_group_invite(match_id)
        OR public.sharegroup_exists(auth.uid(), public.match_organizer_id(match_id))
        OR public.is_caller_match_associated(match_id)
      )
    )
  );

DROP POLICY IF EXISTS mpa_select_in_scope ON public.match_participant_actions;
CREATE POLICY mpa_select_in_scope
  ON public.match_participant_actions
  FOR SELECT
  TO authenticated
  USING (
    public.is_caller_in_match_scope(match_id)
    OR public.is_caller_in_active_group_invite(match_id)
    OR public.is_caller_match_associated(match_id)
  );
