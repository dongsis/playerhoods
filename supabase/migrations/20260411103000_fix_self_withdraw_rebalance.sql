CREATE OR REPLACE FUNCTION public.perform_match_roster_rebalance(p_match_id uuid)
RETURNS TABLE(promoted_participant_id uuid, promoted_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match public.matches%rowtype;
  v_row record;
  v_confirmed_count integer := 0;
  v_to_demote integer := 0;
  v_current_male integer := 0;
  v_current_female integer := 0;
  v_target_male integer := 0;
  v_target_female integer := 0;
  v_need_male integer := 0;
  v_need_female integer := 0;
  v_candidate record;
BEGIN
  SELECT *
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  FOR v_row IN
    SELECT id
    FROM public.match_participants
    WHERE match_id = p_match_id
  LOOP
    PERFORM public.match_participant_reconcile_status(v_row.id);
  END LOOP;

  UPDATE public.match_participants
  SET waiting_list_at = NULL
  WHERE match_id = p_match_id
    AND status::text <> 'waiting_list'
    AND waiting_list_at IS NOT NULL;

  SELECT COUNT(*)
  INTO v_confirmed_count
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND removed_at IS NULL
    AND status::text = 'confirmed';

  IF v_confirmed_count > v_match.required_count THEN
    v_to_demote := v_confirmed_count - v_match.required_count;

    UPDATE public.match_participants mp
    SET
      status = 'waiting_list',
      waiting_list_at = COALESCE(mp.waiting_list_at, now()),
      confirmed_at = NULL
    WHERE mp.id IN (
      SELECT id
      FROM public.match_participants
      WHERE match_id = p_match_id
        AND removed_at IS NULL
        AND status::text = 'confirmed'
      ORDER BY COALESCE(confirmed_at, created_at) DESC, created_at DESC
      LIMIT v_to_demote
    );
  END IF;

  LOOP
    SELECT COUNT(*)
    INTO v_confirmed_count
    FROM public.match_participants
    WHERE match_id = p_match_id
      AND removed_at IS NULL
      AND status::text = 'confirmed';

    EXIT WHEN v_confirmed_count >= v_match.required_count;

    SELECT
      COUNT(*) FILTER (WHERE COALESCE(p.gender, 'unspecified') = 'male')::integer,
      COUNT(*) FILTER (WHERE COALESCE(p.gender, 'unspecified') = 'female')::integer
    INTO
      v_current_male,
      v_current_female
    FROM public.match_participants mp
    LEFT JOIN public.profiles p
      ON p.id = mp.user_id
    WHERE mp.match_id = p_match_id
      AND mp.removed_at IS NULL
      AND mp.status::text = 'confirmed';

    IF v_match.game_type <> 'doubles' OR v_match.doubles_format IS NULL OR v_match.doubles_format::text = 'open' THEN
      SELECT
        mp.id,
        mp.user_id
      INTO v_candidate
      FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND mp.status::text = 'waiting_list'
      ORDER BY COALESCE(mp.waiting_list_at, mp.created_at) ASC, mp.created_at ASC
      LIMIT 1;
    ELSIF v_match.doubles_format::text = 'mens_doubles' THEN
      IF v_current_male >= v_match.required_count THEN
        EXIT;
      END IF;

      SELECT
        mp.id,
        mp.user_id
      INTO v_candidate
      FROM public.match_participants mp
      LEFT JOIN public.profiles p
        ON p.id = mp.user_id
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND mp.status::text = 'waiting_list'
        AND COALESCE(p.gender, 'unspecified') = 'male'
      ORDER BY COALESCE(mp.waiting_list_at, mp.created_at) ASC, mp.created_at ASC
      LIMIT 1;
    ELSIF v_match.doubles_format::text = 'womens_doubles' THEN
      IF v_current_female >= v_match.required_count THEN
        EXIT;
      END IF;

      SELECT
        mp.id,
        mp.user_id
      INTO v_candidate
      FROM public.match_participants mp
      LEFT JOIN public.profiles p
        ON p.id = mp.user_id
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND mp.status::text = 'waiting_list'
        AND COALESCE(p.gender, 'unspecified') = 'female'
      ORDER BY COALESCE(mp.waiting_list_at, mp.created_at) ASC, mp.created_at ASC
      LIMIT 1;
    ELSE
      v_target_male := v_match.required_count / 2;
      v_target_female := v_match.required_count - v_target_male;
      v_need_male := GREATEST(v_target_male - v_current_male, 0);
      v_need_female := GREATEST(v_target_female - v_current_female, 0);

      IF v_need_male <= 0 AND v_need_female <= 0 THEN
        EXIT;
      END IF;

      SELECT
        mp.id,
        mp.user_id
      INTO v_candidate
      FROM public.match_participants mp
      LEFT JOIN public.profiles p
        ON p.id = mp.user_id
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND mp.status::text = 'waiting_list'
        AND (
          (v_need_male > 0 AND COALESCE(p.gender, 'unspecified') = 'male')
          OR (v_need_female > 0 AND COALESCE(p.gender, 'unspecified') = 'female')
        )
      ORDER BY COALESCE(mp.waiting_list_at, mp.created_at) ASC, mp.created_at ASC
      LIMIT 1;
    END IF;

    EXIT WHEN NOT FOUND;

    UPDATE public.match_participants
    SET
      status = 'confirmed',
      confirmed_at = COALESCE(confirmed_at, now()),
      waiting_list_at = NULL
    WHERE id = v_candidate.id;

    IF v_candidate.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_user_id,
        kind,
        match_id,
        match_participant_id,
        actor_user_id,
        note
      ) VALUES (
        v_candidate.user_id,
        'waiting_list_promoted',
        p_match_id,
        v_candidate.id,
        v_match.organizer_id,
        'A spot opened up and you are now in the match.'
      );
    END IF;

    promoted_participant_id := v_candidate.id;
    promoted_user_id := v_candidate.user_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

ALTER FUNCTION public.perform_match_roster_rebalance(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.perform_match_roster_rebalance(uuid)
IS 'Internal helper: rebalances confirmed and waiting-list participants without actor authorization checks. Used by authorized public RPCs and write paths that must rebalance after the actor is removed.';

CREATE OR REPLACE FUNCTION public.rpc_match_rebalance_roster(p_match_id uuid)
RETURNS TABLE(promoted_participant_id uuid, promoted_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_match public.matches%rowtype;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF NOT (
    v_match.organizer_id = v_actor_id
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND mp.user_id = v_actor_id
        AND mp.status::text IN ('pending', 'confirmed', 'waiting_list')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.perform_match_roster_rebalance(p_match_id);
END;
$$;

ALTER FUNCTION public.rpc_match_rebalance_roster(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_rebalance_roster(uuid)
IS 'Rebalances the active roster and waiting list for a match. Uses FIFO by default, with doubles_format as a lightweight auto-fill guide. Host approvals remain permissive.';

CREATE OR REPLACE FUNCTION public.rpc_match_user_withdraw(p_match_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mp public.match_participants%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  v_mp := public.apply_participant_exit(v_mp.id, auth.uid(), 'withdraw', NULL);

  PERFORM public.perform_match_roster_rebalance(p_match_id);

  RETURN v_mp;
END;
$$;

ALTER FUNCTION public.rpc_match_user_withdraw(uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.rpc_match_user_withdraw(uuid)
IS 'v1.5: User withdraws (decline invite or leave). Sets removed_at + removed_by, reconciles to removed, and rebalances the roster so waiting-list promotion does not depend on a follow-up client RPC.';
