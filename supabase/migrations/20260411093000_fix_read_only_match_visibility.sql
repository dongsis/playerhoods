CREATE OR REPLACE FUNCTION public.find_person_id_for_user(
  p_user_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.person_id
  FROM public.people p
  WHERE p.linked_user_id = p_user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.find_person_id_for_guest(
  p_guest_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT g.person_id
  FROM public.guests g
  WHERE g.id = p_guest_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.find_person_id_for_user(uuid) IS
'Read-only person lookup for registered users. Returns an existing person_id without creating a people row.';

COMMENT ON FUNCTION public.find_person_id_for_guest(uuid) IS
'Read-only person lookup for Contact Players. Returns an existing person_id without creating a people row.';

CREATE OR REPLACE FUNCTION public.can_user_request_match_proxy_for_guest(
  p_guest_id uuid,
  p_actor_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_guest_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_person_id := public.find_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN
    EXISTS (
      SELECT 1
      FROM public.user_roster_guests urg
      WHERE urg.owner_user_id = p_actor_user_id
        AND urg.guest_id = p_guest_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.person_relationships pr
      WHERE pr.actor_user_id = p_actor_user_id
        AND pr.person_id = v_person_id
        AND pr.relationship_type IN ('saved', 'direct_contact', 'group_contact')
    )
    OR EXISTS (
      SELECT 1
      FROM public.group_contacts gc
      JOIN public.group_members gm
        ON gm.group_id = gc.group_id
       AND gm.user_id = p_actor_user_id
       AND gm.status = 'active'
       AND gm.accepted_at IS NOT NULL
       AND gm.removed_at IS NULL
      WHERE gc.person_id = v_person_id
        AND gc.removed_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp_actor
      JOIN public.match_participants mp_guest
        ON mp_guest.match_id = mp_actor.match_id
       AND mp_guest.guest_id = p_guest_id
       AND mp_guest.removed_at IS NULL
      WHERE mp_actor.user_id = p_actor_user_id
        AND mp_actor.removed_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_participants mp_guest
        ON mp_guest.match_id = m.id
       AND mp_guest.guest_id = p_guest_id
       AND mp_guest.removed_at IS NULL
      WHERE m.organizer_id = p_actor_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.people p
      WHERE p.person_id = v_person_id
        AND p.linked_user_id = p_actor_user_id
    )
    OR public.is_active_match_proxy_for_person(v_person_id, p_actor_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_match_proxy_for_participant(
  p_match_participant_id uuid,
  p_proxy_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_match_participant_id IS NULL OR p_proxy_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    CASE
      WHEN mp.user_id IS NOT NULL THEN public.find_person_id_for_user(mp.user_id)
      WHEN mp.guest_id IS NOT NULL THEN public.find_person_id_for_guest(mp.guest_id)
      ELSE NULL
    END
  INTO v_person_id
  FROM public.match_participants mp
  WHERE mp.id = p_match_participant_id
    AND mp.removed_at IS NULL;

  IF v_person_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.person_match_proxies pmp
    WHERE pmp.principal_person_id = v_person_id
      AND pmp.proxy_user_id = p_proxy_user_id
      AND pmp.scope = 'manage_match_participation'
      AND pmp.status = 'active'
      AND pmp.revoked_at IS NULL
  );
END;
$$;

DROP POLICY IF EXISTS person_match_proxies_select_party ON public.person_match_proxies;

CREATE POLICY person_match_proxies_select_party
  ON public.person_match_proxies
  FOR SELECT
  TO authenticated
  USING (
    proxy_user_id = auth.uid()
    OR principal_person_id = public.find_person_id_for_user(auth.uid())
  );

GRANT ALL ON FUNCTION public.find_person_id_for_user(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.find_person_id_for_user(uuid) TO service_role;
GRANT ALL ON FUNCTION public.find_person_id_for_guest(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.find_person_id_for_guest(uuid) TO service_role;
