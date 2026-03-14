-- =============================================================================
-- Re-entry Admission: Unify removed判定 to removed_at (canonical)
-- Per REENTRY_ADMISSION_AUDIT_2026-03.md
-- Fixes K01/K02/K03: status-based checks replaced with removed_at.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) is_user_match_associated — use removed_at IS NULL for active
-- -----------------------------------------------------------------------------
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
      AND mp.removed_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_user_match_associated(p_match_id uuid, p_user_id uuid)
IS 'v1.6.3: Returns true if user has an active (non-removed) participant row. removed_at IS NULL is canonical; removed participants are NOT match-associated.';


-- -----------------------------------------------------------------------------
-- 2) apply_participant_admission — re-entry lookup use removed_at IS NOT NULL
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_participant_admission(
  p_match_id uuid,
  p_target_user_id uuid,
  p_actor_id uuid,
  p_admission_kind text  -- 'requested' | 'invited' | 'nominated'
)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_existing public.match_participants%rowtype;
  v_new_mp   public.match_participants%rowtype;
  v_action   text;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id_required';
  END IF;

  IF p_admission_kind IS NULL OR p_admission_kind NOT IN ('requested', 'invited', 'nominated') THEN
    RAISE EXCEPTION 'admission_kind_must_be_requested_invited_or_nominated';
  END IF;

  v_action := CASE p_admission_kind
    WHEN 'requested' THEN 'request_join'
    WHEN 'invited'   THEN 'invite'
    WHEN 'nominated' THEN 'nominate'
    ELSE 'nominate'
  END;

  -- Re-entry: find most recent removed row (removed_at canonical)
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND user_id = p_target_user_id
    AND removed_at IS NOT NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Re-entry UPDATE
    IF p_admission_kind = 'requested' THEN
      UPDATE public.match_participants
      SET
        removed_at               = NULL,
        removed_by               = NULL,
        removal_note             = NULL,
        confirmed_at             = NULL,
        join_method              = 'requested',
        participant_accepted_at  = now(),
        participant_accepted_via = 'in_app',
        org_approved_at          = NULL,
        org_approved_by          = NULL,
        nominated_by             = NULL,
        manual_confirmed_by      = NULL
      WHERE id = v_existing.id;
    ELSIF p_admission_kind = 'invited' THEN
      UPDATE public.match_participants
      SET
        removed_at               = NULL,
        removed_by               = NULL,
        removal_note             = NULL,
        confirmed_at             = NULL,
        join_method              = 'invited',
        participant_accepted_at  = NULL,
        participant_accepted_via = NULL,
        org_approved_at          = now(),
        org_approved_by          = p_actor_id,
        nominated_by             = NULL,
        manual_confirmed_by      = NULL
      WHERE id = v_existing.id;
    ELSE
      -- nominated
      UPDATE public.match_participants
      SET
        removed_at               = NULL,
        removed_by               = NULL,
        removal_note             = NULL,
        confirmed_at             = NULL,
        join_method              = 'nominated',
        participant_accepted_at  = NULL,
        participant_accepted_via = NULL,
        org_approved_at          = NULL,
        org_approved_by          = NULL,
        nominated_by             = p_actor_id,
        manual_confirmed_by      = NULL
      WHERE id = v_existing.id;
    END IF;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    -- Use clock_timestamp() so re-entry actions get unique created_at (avoids uq_mpa_dedup
    -- when same action_type was logged earlier in the same transaction with now()).
    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by, created_at)
    VALUES
      (p_match_id, v_existing.id, 'reenter', NULL, p_actor_id, clock_timestamp()),
      (p_match_id, v_existing.id, v_action, NULL, p_actor_id, clock_timestamp() + interval '1 millisecond');

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh INSERT
  IF p_admission_kind = 'requested' THEN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, nominated_by, created_by
    ) VALUES (
      p_match_id, p_target_user_id, 'requested',
      now(), 'in_app',
      NULL, NULL, p_actor_id
    )
    RETURNING * INTO v_new_mp;
  ELSIF p_admission_kind = 'invited' THEN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, org_approved_by, nominated_by, created_by
    ) VALUES (
      p_match_id, p_target_user_id, 'invited',
      NULL, NULL,
      now(), p_actor_id, NULL, p_actor_id
    )
    RETURNING * INTO v_new_mp;
  ELSE
    -- nominated
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, nominated_by, created_by
    ) VALUES (
      p_match_id, p_target_user_id, 'nominated',
      NULL, NULL,
      NULL, p_actor_id, p_actor_id
    )
    RETURNING * INTO v_new_mp;
  END IF;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, v_action, NULL, p_actor_id);

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.apply_participant_admission(uuid, uuid, uuid, text) IS
'Internal helper: centralizes admission write (fresh + re-entry) for request_join, invite, nominate. Re-entry uses removed_at IS NOT NULL (canonical).';


-- -----------------------------------------------------------------------------
-- 3) can_admit_user_to_match — re-entry condition use removed_at IS NOT NULL
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_admit_user_to_match(
  p_match_id uuid,
  p_actor_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    JOIN public.profiles p_target ON p_target.id = p_target_user_id
    WHERE m.id = p_match_id
      AND m.status = 'active'
      AND p_target_user_id <> p_actor_id
      AND NOT public.is_user_match_associated(p_match_id, p_target_user_id)
      -- Caller gate: organizer OR (can_participants_invite + InScope/MatchAssociated)
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
      -- Target eligibility: same for organizer and participant
      AND (
        -- Re-entry (removed_at canonical)
        EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = p_match_id AND mp.user_id = p_target_user_id
            AND mp.removed_at IS NOT NULL
        )
        OR
        -- Path A: group-based (InScope OR ShareGroup with actor)
        (
          public.is_user_in_scope_groups(
            COALESCE(m.invitation_scope_group_ids, '{}'::uuid[]),
            p_target_user_id
          )
          OR public.do_users_share_group(p_target_user_id, p_actor_id)
        )
        OR
        -- Path B: non-group direct. Two-layer: global AND club override.
        (
          p_target.allow_non_group_invites = true
          AND (
            COALESCE(m.club_id, (SELECT primary_club_id FROM public.profiles WHERE id = m.organizer_id)) IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM public.club_identities ci
              WHERE ci.user_id = p_target_user_id
                AND ci.club_id = COALESCE(m.club_id, (SELECT primary_club_id FROM public.profiles WHERE id = m.organizer_id))
                AND ci.accept_non_group_invites_in_club = false
            )
          )
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_admit_user_to_match(uuid, uuid, uuid) IS
'Phase 1: Unified predicate for match admission. Re-entry uses removed_at IS NOT NULL (canonical). Path B (non-group): two-layer preferences.';
