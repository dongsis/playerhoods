-- Self-withdraw participants remain match-associated for caller-gate continuity.
-- Organizer/manager-removed participants remain not match-associated.

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
      AND (
        mp.removed_at IS NULL
        OR (mp.removed_at IS NOT NULL AND mp.removed_by = p_user_id)
      )
  );
$$;

COMMENT ON FUNCTION public.is_user_match_associated(p_match_id uuid, p_user_id uuid)
IS 'Returns true if user has an active participant row, or a self-withdraw/self-decline removed row. Organizer/manager-removed participants are not match-associated.';


CREATE OR REPLACE FUNCTION public.can_admit_user_to_match(p_match_id uuid, p_actor_id uuid, p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.profiles p_target ON p_target.id = p_target_user_id
    WHERE m.id = p_match_id
      AND m.status = 'active'
      AND p_target_user_id <> p_actor_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.match_participants mp_active
        WHERE mp_active.match_id = p_match_id
          AND mp_active.user_id = p_target_user_id
          AND mp_active.removed_at IS NULL
      )
      AND (
        p_actor_id = m.organizer_id
        OR (
          m.can_participants_invite_users = true
          AND (
            public.is_user_in_scope_groups(
              COALESCE(m.invitation_scope_group_ids, '{}'::uuid[]),
              p_actor_id
            )
            OR public.is_user_match_associated(p_match_id, p_actor_id)
          )
        )
      )
      AND (
        EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = p_match_id AND mp.user_id = p_target_user_id
            AND mp.removed_at IS NOT NULL
        )
        OR (
          public.is_user_in_scope_groups(
            COALESCE(m.invitation_scope_group_ids, '{}'::uuid[]),
            p_target_user_id
          )
          OR public.do_users_share_group(p_target_user_id, p_actor_id)
        )
        OR (
          p_target.allow_non_group_invites = true
          AND (
            COALESCE(m.venue_id, (SELECT primary_venue_id FROM public.profiles WHERE id = m.organizer_id)) IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM public.venue_identities ci
              WHERE ci.user_id = p_target_user_id
                AND ci.venue_id = COALESCE(m.venue_id, (SELECT primary_venue_id FROM public.profiles WHERE id = m.organizer_id))
                AND ci.accept_non_group_invites_in_venue = false
            )
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_admit_user_to_match(p_match_id uuid, p_actor_id uuid, p_target_user_id uuid)
IS 'Unified predicate for match admission. Caller gate uses InScope/MatchAssociated; target active-row check uses removed_at IS NULL so removed users remain eligible for re-entry.';


CREATE OR REPLACE FUNCTION public.rpc_match_admit_user(p_match_id uuid, p_target_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match  public.matches%rowtype;
  v_uid    uuid := auth.uid();
  v_is_org boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_admit_self';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id = p_target_user_id
      AND mp.removed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  IF NOT public.can_admit_user_to_match(p_match_id, v_uid, p_target_user_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_is_org := public.is_match_organizer(p_match_id, v_uid);

  RETURN public.apply_participant_admission(
    p_match_id,
    p_target_user_id,
    v_uid,
    CASE WHEN v_is_org THEN 'invited' ELSE 'nominated' END
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_match_admit_user(p_match_id uuid, p_target_user_id uuid)
IS 'Unified admission write. Self-withdrawn users still count as match-associated for caller gates, but removed users remain eligible admission targets via active-row checks.';
