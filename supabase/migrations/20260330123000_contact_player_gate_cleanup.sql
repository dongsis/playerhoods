-- Align Contact Player nomination with the same caller gate used for
-- participant nomination, and remove the unused legacy guest_add predicate path.

DROP POLICY IF EXISTS "match_participants_insert_guest" ON public.match_participants;
DROP POLICY IF EXISTS "match_participants_insert_guest_by_org" ON public.match_participants;

DROP FUNCTION IF EXISTS public.can_add_guests(uuid, uuid);

CREATE OR REPLACE FUNCTION public.rpc_match_admission_targets(
  p_match_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  target_kind text,
  target_id uuid,
  display_name text,
  avatar_url text,
  venue_handle text,
  source text,
  action_kind text,
  can_admit boolean,
  eligible_via text,
  sort_name text,
  contact_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE
  v_match        public.matches%rowtype;
  v_uid          uuid := auth.uid();
  v_scope_ids    uuid[] := '{}'::uuid[];
  v_club_context uuid;
  v_can_call     boolean;
  v_search       text := NULLIF(trim(p_search), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_can_call := public.is_match_organizer(p_match_id, v_uid)
    OR (
      v_match.can_participants_invite_users = true
      AND (
        public.is_user_in_scope_groups(
          COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]),
          v_uid
        )
        OR public.is_user_match_associated(p_match_id, v_uid)
      )
    );

  IF NOT v_can_call THEN
    RETURN;
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);
  v_club_context := COALESCE(
    v_match.venue_id,
    (SELECT primary_venue_id FROM public.profiles WHERE id = v_match.organizer_id)
  );

  RETURN QUERY
  WITH already_active_users AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed')
      AND mp.user_id IS NOT NULL
  ),
  already_active_guests AS (
    SELECT mp.guest_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed')
      AND mp.removed_at IS NULL
      AND mp.guest_id IS NOT NULL
  ),
  reentry_src AS (
    SELECT DISTINCT mp.user_id, 'reentry'::text AS src
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id IS NOT NULL
      AND mp.status = 'removed'
      AND mp.user_id <> v_match.organizer_id
      AND mp.user_id <> v_uid
      AND mp.user_id NOT IN (SELECT user_id FROM already_active_users)
  ),
  invite_circle_src AS (
    SELECT uic.target_user_id AS user_id, 'invite_circle'::text AS src
    FROM public.user_invite_circle uic
    WHERE uic.owner_user_id = v_uid
      AND uic.target_user_id <> v_match.organizer_id
      AND uic.target_user_id <> v_uid
      AND uic.target_user_id NOT IN (SELECT user_id FROM already_active_users)
  ),
  club_members_src AS (
    SELECT ci.user_id, 'club_members'::text AS src
    FROM public.venue_identities ci
    JOIN public.profiles p ON p.id = ci.user_id
    WHERE v_club_context IS NOT NULL
      AND ci.venue_id = v_club_context
      AND ci.user_id <> v_match.organizer_id
      AND ci.user_id <> v_uid
      AND p.show_in_venue_member_discovery = true
      AND COALESCE(ci.visible_in_venue_member_discovery, true) = true
      AND ci.user_id NOT IN (SELECT user_id FROM already_active_users)
      AND EXISTS (
        SELECT 1 FROM public.venue_identities ci_caller
        WHERE ci_caller.venue_id = v_club_context AND ci_caller.user_id = v_uid
      )
  ),
  scope_members AS (
    SELECT DISTINCT gm.user_id
    FROM public.group_members gm
    WHERE gm.group_id = ANY(v_scope_ids)
      AND gm.status = 'active'
      AND gm.user_id IS NOT NULL
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
    FROM public.group_members gm_caller
    JOIN public.group_members gm_other ON gm_caller.group_id = gm_other.group_id
    JOIN public.groups g ON g.id = gm_caller.group_id
    WHERE gm_caller.user_id = v_uid
      AND gm_caller.status = 'active'
      AND gm_other.status = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_uid
      AND gm_other.user_id <> v_match.organizer_id
      AND g.group_kind = 'friend'
  ),
  groups_src AS (
    SELECT sm.user_id, 'groups'::text AS src FROM scope_members sm
    UNION
    SELECT sg.user_id, 'groups'::text AS src FROM shared_group_members sg
  ),
  all_user_sources AS (
    SELECT user_id, src, 1 AS pri FROM reentry_src
    UNION ALL
    SELECT user_id, src, 2 AS pri FROM invite_circle_src
    UNION ALL
    SELECT user_id, src, 3 AS pri FROM club_members_src
    UNION ALL
    SELECT user_id, src, 4 AS pri FROM groups_src
  ),
  deduped_users AS (
    SELECT DISTINCT ON (user_id) user_id, src
    FROM all_user_sources
    WHERE user_id <> v_uid
    ORDER BY user_id, pri
  ),
  user_rows AS (
    SELECT
      'user'::text AS target_kind,
      c.user_id AS target_id,
      p.display_name,
      p.avatar_url,
      ci.venue_handle,
      c.src AS source,
      'admit_user'::text AS action_kind,
      public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) AS can_admit,
      CASE
        WHEN public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) THEN 'admit_allowed'
        ELSE 'admit_forbidden'
      END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.venue_handle, c.user_id::text)) AS sort_name,
      NULL::text AS contact_email
    FROM deduped_users c
    JOIN public.profiles p ON p.id = c.user_id
    LEFT JOIN public.venue_identities ci
      ON ci.user_id = c.user_id AND ci.venue_id = v_club_context
    WHERE (
      v_search IS NULL
      OR p.display_name ILIKE '%' || v_search || '%'
      OR ci.venue_handle ILIKE '%' || v_search || '%'
    )
  ),
  roster_contacts_src AS (
    SELECT g.id AS guest_id, g.display_name, g.email, g.phone
    FROM public.user_roster_guests urg
    JOIN public.guests g ON g.id = urg.guest_id
    LEFT JOIN public.identity_links il
      ON il.linked_type = 'contact' AND il.linked_id = g.id
    WHERE urg.owner_user_id = v_uid
      AND g.status = 'active'
      AND il.user_id IS NULL
      AND g.id NOT IN (SELECT guest_id FROM already_active_guests)
  ),
  contact_player_rows AS (
    SELECT
      'contact_player'::text AS target_kind,
      r.guest_id AS target_id,
      r.display_name,
      NULL::text AS avatar_url,
      NULL::text AS venue_handle,
      'roster_contacts'::text AS source,
      'nominate_contact_player'::text AS action_kind,
      v_can_call AS can_admit,
      CASE
        WHEN v_can_call THEN 'nominate_allowed'
        ELSE 'nominate_forbidden'
      END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(r.display_name), ''), r.guest_id::text)) AS sort_name,
      r.email AS contact_email
    FROM roster_contacts_src r
    WHERE (
      v_search IS NULL
      OR r.display_name ILIKE '%' || v_search || '%'
      OR r.email ILIKE '%' || v_search || '%'
      OR r.phone ILIKE '%' || v_search || '%'
    )
  ),
  combined AS (
    SELECT * FROM user_rows
    UNION ALL
    SELECT * FROM contact_player_rows
  )
  SELECT
    c.target_kind,
    c.target_id,
    c.display_name,
    c.avatar_url,
    c.venue_handle,
    c.source,
    c.action_kind,
    c.can_admit,
    c.eligible_via,
    c.sort_name,
    c.contact_email
  FROM combined c
  ORDER BY c.sort_name NULLS LAST, c.target_kind, c.target_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_guest(
  p_match_id uuid,
  p_guest_id uuid
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_uid      uuid := auth.uid();
  v_existing public.match_participants%rowtype;
  v_mp       public.match_participants%rowtype;
  v_is_org   boolean;
  v_guest_email text;
  v_nominator_name text;
  v_evt_id   uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.status <> 'active' THEN RAISE EXCEPTION 'match_not_active (status=%)', v_match.status; END IF;

  v_is_org := (v_match.organizer_id = v_uid);
  IF NOT v_is_org THEN
    IF NOT v_match.can_participants_invite_users THEN
      RAISE EXCEPTION 'not_authorized_to_nominate_guest';
    END IF;

    IF NOT (
      public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
      OR public.is_user_match_associated(p_match_id, v_uid)
    ) THEN
      RAISE EXCEPTION 'not_authorized_to_nominate_guest';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_roster_guests urg WHERE urg.owner_user_id = v_uid AND urg.guest_id = p_guest_id) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.guests g WHERE g.id = p_guest_id AND g.status = 'active') THEN
    RAISE EXCEPTION 'guest_not_found_or_inactive';
  END IF;

  SELECT * INTO v_existing FROM public.match_participants
  WHERE match_id = p_match_id AND guest_id = p_guest_id AND removed_at IS NULL LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'guest_already_active'; END IF;

  INSERT INTO public.match_participants (
    match_id, join_method, guest_id, created_by, created_at, nominated_by,
    participant_accepted_at, participant_accepted_via, org_approved_at, org_approved_by
  ) VALUES (
    p_match_id, 'nominated', p_guest_id, v_uid, now(), v_uid,
    NULL, NULL,
    CASE WHEN v_is_org THEN now() ELSE NULL END,
    CASE WHEN v_is_org THEN v_uid ELSE NULL END
  )
  RETURNING * INTO v_mp;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_mp.id, 'nominate_guest', NULL, v_uid);

  SELECT NULLIF(trim(g.email), '') INTO v_guest_email FROM public.guests g WHERE g.id = p_guest_id;
  SELECT p.display_name INTO v_nominator_name FROM public.profiles p WHERE p.id = v_uid;
  IF v_guest_email IS NOT NULL THEN
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES (
      'match.guest_nominated', 'match_participant', v_mp.id, v_uid,
      jsonb_build_object(
        'match_participant_id', v_mp.id, 'match_id', p_match_id, 'guest_id', p_guest_id,
        'target_email', v_guest_email, 'nominator_user_id', v_uid,
        'nominator_display_name', COALESCE(v_nominator_name, 'Someone'),
        'game_type', v_match.game_type, 'match_date', v_match.match_date,
        'club_name', (SELECT c.name FROM public.venues c WHERE c.id = v_match.venue_id)
      )
    )
    RETURNING id INTO v_evt_id;
    PERFORM public.rpc_process_domain_event(v_evt_id);
  END IF;

  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_guest(uuid, uuid) IS
  'v1.8: Nominate Contact Player. Organizer always allowed. Non-organizer uses the same invite-users capability gate as nominate-user: match.can_participants_invite_users + (InScope OR MatchAssociated). Organizer auto-sets org_approved_at; guest stays pending until participant-side confirmation is recorded.';
