CREATE OR REPLACE FUNCTION public.can_access_match_communication(
  p_match_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH match_state AS (
    SELECT m.id, m.formed_at
    FROM public.matches m
    WHERE m.id = p_match_id
  ),
  has_any_participation AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
        AND (
          mp.user_id = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public.identity_links il
            WHERE il.linked_type = 'guest_participant'
              AND il.linked_id = mp.id
              AND il.user_id = p_user_id
          )
        )
    ) AS value
  ),
  has_active_participation AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND mp.status IN ('pending', 'confirmed', 'waiting_list')
        AND (
          mp.user_id = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public.identity_links il
            WHERE il.linked_type = 'guest_participant'
              AND il.linked_id = mp.id
              AND il.user_id = p_user_id
          )
        )
    ) AS value
  ),
  has_confirmed_participation AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND mp.status = 'confirmed'
        AND (
          mp.user_id = p_user_id
          OR EXISTS (
            SELECT 1
            FROM public.identity_links il
            WHERE il.linked_type = 'guest_participant'
              AND il.linked_id = mp.id
              AND il.user_id = p_user_id
          )
        )
    ) AS value
  ),
  has_group_invite_preview AS (
    SELECT EXISTS (
      SELECT 1
      FROM public.match_group_invitations mgi
      WHERE mgi.match_id = p_match_id
        AND mgi.status = 'active'
        AND mgi.revoked_at IS NULL
        AND public.is_group_active_member(mgi.group_id, p_user_id)
    ) AS value
  )
  SELECT
    public.is_match_organizer(p_match_id, p_user_id)
    OR (
      EXISTS (SELECT 1 FROM match_state ms WHERE ms.formed_at IS NOT NULL)
      AND (SELECT value FROM has_confirmed_participation)
    )
    OR (
      EXISTS (SELECT 1 FROM match_state ms WHERE ms.formed_at IS NULL)
      AND (
        (SELECT value FROM has_active_participation)
        OR (
          NOT (SELECT value FROM has_any_participation)
          AND (
            public.is_user_in_match_scope(p_match_id, p_user_id)
            OR (SELECT value FROM has_group_invite_preview)
          )
        )
      )
    );
$$;

ALTER FUNCTION public.can_access_match_communication(uuid, uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.can_access_match_communication(uuid, uuid)
IS 'Allows organizer access always. Before formed: active participants plus eligible group-invite/request-scope users without an existing participant row. After formed: confirmed participants only.';
