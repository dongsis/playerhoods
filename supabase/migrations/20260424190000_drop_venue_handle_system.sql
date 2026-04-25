CREATE OR REPLACE FUNCTION public.rpc_profile_set_primary_venue(p_venue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_user_relationships
    WHERE venue_id = p_venue_id
      AND user_id = auth.uid()
      AND relationship_type = 'member'
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  UPDATE public.profiles
  SET primary_venue_id = p_venue_id
  WHERE id = auth.uid();
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_venue_members_discovery(uuid, text);

CREATE FUNCTION public.rpc_venue_members_discovery(
  p_venue_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_search text := NULLIF(trim(p_search), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_user_relationships self_rel
    WHERE self_rel.venue_id = p_venue_id
      AND self_rel.user_id = v_uid
      AND self_rel.relationship_type = 'member'
  ) THEN
    RAISE EXCEPTION 'not_club_member';
  END IF;

  RETURN QUERY
  SELECT
    rel.user_id,
    p.display_name,
    p.avatar_url
  FROM public.venue_user_relationships rel
  JOIN public.profiles p
    ON p.id = rel.user_id
  LEFT JOIN public.venue_identities vi
    ON vi.venue_id = rel.venue_id
   AND vi.user_id = rel.user_id
  WHERE rel.venue_id = p_venue_id
    AND rel.relationship_type = 'member'
    AND rel.user_id <> v_uid
    AND p.show_in_venue_member_discovery = true
    AND COALESCE(vi.visible_in_venue_member_discovery, true) = true
    AND (
      v_search IS NULL
      OR p.display_name ILIKE '%' || v_search || '%'
    )
  ORDER BY LOWER(COALESCE(NULLIF(trim(p.display_name), ''), rel.user_id::text)) NULLS LAST,
           rel.user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_match_admission_targets(uuid, text);

CREATE FUNCTION public.rpc_match_admission_targets(
  p_match_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  target_kind text,
  target_id uuid,
  display_name text,
  avatar_url text,
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
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_scope_ids uuid[] := '{}'::uuid[];
  v_club_context uuid;
  v_can_call boolean;
  v_search text := NULLIF(trim(p_search), '');
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
        public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
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
      AND mp.status IN ('pending', 'confirmed', 'waiting_list')
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
    SELECT rel.user_id, 'club_members'::text AS src
    FROM public.venue_user_relationships rel
    JOIN public.profiles p ON p.id = rel.user_id
    LEFT JOIN public.venue_identities vi
      ON vi.venue_id = rel.venue_id
     AND vi.user_id = rel.user_id
    WHERE v_club_context IS NOT NULL
      AND rel.venue_id = v_club_context
      AND rel.relationship_type = 'member'
      AND rel.user_id <> v_match.organizer_id
      AND rel.user_id <> v_uid
      AND p.show_in_venue_member_discovery = true
      AND COALESCE(vi.visible_in_venue_member_discovery, true) = true
      AND rel.user_id NOT IN (SELECT user_id FROM already_active_users)
      AND EXISTS (
        SELECT 1
        FROM public.venue_user_relationships caller_rel
        WHERE caller_rel.venue_id = v_club_context
          AND caller_rel.user_id = v_uid
          AND caller_rel.relationship_type = 'member'
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
      c.src AS source,
      'admit_user'::text AS action_kind,
      public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) AS can_admit,
      CASE
        WHEN public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) THEN 'admit_allowed'
        ELSE 'admit_forbidden'
      END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(p.display_name), ''), c.user_id::text)) AS sort_name,
      NULL::text AS contact_email
    FROM deduped_users c
    JOIN public.profiles p ON p.id = c.user_id
    WHERE (
      v_search IS NULL
      OR p.display_name ILIKE '%' || v_search || '%'
    )
  ),
  roster_contacts_src AS (
    SELECT
      g.id AS guest_id,
      g.person_id,
      COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''), g.id::text) AS display_name,
      g.email,
      g.phone
    FROM public.user_roster_guests urg
    JOIN public.guests g ON g.id = urg.guest_id
    LEFT JOIN public.people p ON p.person_id = g.person_id
    LEFT JOIN public.identity_links il
      ON il.linked_type = 'contact' AND il.linked_id = g.id
    WHERE urg.owner_user_id = v_uid
      AND g.status = 'active'
      AND il.user_id IS NULL
      AND g.id NOT IN (SELECT guest_id FROM already_active_guests)
  ),
  saved_contact_src AS (
    SELECT DISTINCT ON (pr.person_id)
      g.id AS guest_id,
      pr.person_id,
      COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''), g.id::text) AS display_name,
      NULL::text AS email,
      NULL::text AS phone
    FROM public.person_relationships pr
    JOIN public.people p
      ON p.person_id = pr.person_id
    JOIN public.guests g
      ON g.person_id = pr.person_id
     AND g.status = 'active'
    WHERE pr.actor_user_id = v_uid
      AND pr.relationship_type = 'saved'
      AND g.id NOT IN (SELECT guest_id FROM already_active_guests)
    ORDER BY pr.person_id, g.created_at
  ),
  group_contact_src AS (
    SELECT DISTINCT ON (gc.person_id)
      g.id AS guest_id,
      gc.person_id,
      p.display_name,
      NULL::text AS email,
      NULL::text AS phone
    FROM public.group_contacts gc
    JOIN public.group_members gm
      ON gm.group_id = gc.group_id
     AND gm.user_id = v_uid
     AND gm.status = 'active'
     AND gm.accepted_at IS NOT NULL
     AND gm.removed_at IS NULL
    JOIN public.people p
      ON p.person_id = gc.person_id
    JOIN public.guests g
      ON g.person_id = gc.person_id
     AND g.status = 'active'
    WHERE gc.removed_at IS NULL
      AND g.id NOT IN (SELECT guest_id FROM already_active_guests)
    ORDER BY gc.person_id, g.created_at
  ),
  contact_player_rows AS (
    SELECT
      'contact_player'::text AS target_kind,
      r.guest_id AS target_id,
      r.display_name,
      NULL::text AS avatar_url,
      'roster_contacts'::text AS source,
      'nominate_contact_player'::text AS action_kind,
      v_can_call AS can_admit,
      CASE WHEN v_can_call THEN 'nominate_allowed' ELSE 'nominate_forbidden' END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(r.display_name), ''), r.guest_id::text)) AS sort_name,
      r.email AS contact_email
    FROM roster_contacts_src r
    WHERE (
      v_search IS NULL
      OR r.display_name ILIKE '%' || v_search || '%'
      OR r.email ILIKE '%' || v_search || '%'
      OR r.phone ILIKE '%' || v_search || '%'
    )

    UNION ALL

    SELECT
      'contact_player'::text AS target_kind,
      sc.guest_id AS target_id,
      sc.display_name,
      NULL::text AS avatar_url,
      'saved_contact'::text AS source,
      'nominate_contact_player'::text AS action_kind,
      v_can_call AS can_admit,
      CASE WHEN v_can_call THEN 'nominate_allowed' ELSE 'nominate_forbidden' END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(sc.display_name), ''), sc.guest_id::text)) AS sort_name,
      NULL::text AS contact_email
    FROM saved_contact_src sc
    WHERE NOT EXISTS (
      SELECT 1
      FROM roster_contacts_src rc
      WHERE rc.person_id = sc.person_id
    )
      AND (
        v_search IS NULL
        OR sc.display_name ILIKE '%' || v_search || '%'
      )

    UNION ALL

    SELECT
      'contact_player'::text AS target_kind,
      gc.guest_id AS target_id,
      gc.display_name,
      NULL::text AS avatar_url,
      'group_contact'::text AS source,
      'nominate_contact_player'::text AS action_kind,
      v_can_call AS can_admit,
      CASE WHEN v_can_call THEN 'nominate_allowed' ELSE 'nominate_forbidden' END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(gc.display_name), ''), gc.guest_id::text)) AS sort_name,
      NULL::text AS contact_email
    FROM group_contact_src gc
    WHERE NOT EXISTS (
      SELECT 1
      FROM roster_contacts_src rc
      WHERE rc.person_id = gc.person_id
    )
      AND NOT EXISTS (
        SELECT 1
        FROM saved_contact_src sc
        WHERE sc.person_id = gc.person_id
      )
      AND (
        v_search IS NULL
        OR gc.display_name ILIKE '%' || v_search || '%'
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

DROP FUNCTION IF EXISTS public.rpc_venue_handle_check(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_venue_handle_set(uuid, text);
DROP FUNCTION IF EXISTS public.validate_venue_handle(text);
DROP FUNCTION IF EXISTS public.rpc_venue_join(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_venue_leave(uuid);

ALTER TABLE public.venue_identities
  DROP CONSTRAINT IF EXISTS uq_venue_identity_handle_norm;

ALTER TABLE public.venue_identities
  DROP CONSTRAINT IF EXISTS chk_venue_handle_length,
  DROP CONSTRAINT IF EXISTS chk_venue_handle_no_at,
  DROP CONSTRAINT IF EXISTS chk_venue_handle_trimmed;

ALTER TABLE public.venue_identities
  DROP COLUMN IF EXISTS venue_handle_norm,
  DROP COLUMN IF EXISTS venue_handle;
