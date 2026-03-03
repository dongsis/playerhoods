-- Migration: v1.6.3 — spec-alignment fixes (restart channels, no direct status writes, remove legacy refs)
BEGIN;

SET check_function_bodies = false;
SET search_path = public;

-- =============================================================================
-- 1) Restart Doctrine: remove unauthorized re-entry (revival) paths
--    from rpc_match_manual_confirm_user and rpc_match_delegate_confirm_user
-- =============================================================================

-- rpc_match_manual_confirm_user: disallow reviving removed participants
CREATE OR REPLACE FUNCTION public.rpc_match_manual_confirm_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match      public.matches%rowtype;
  v_existing   match_participants;
  v_new_mp     match_participants;
  v_constraint text;
  v_scope_ids  uuid[] := '{}'::uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN RAISE EXCEPTION 'Only the match organizer can perform this action'; END IF;
  IF v_match.status <> 'active' THEN RAISE EXCEPTION 'Match is not active (status: %)', v_match.status; END IF;
  IF p_user_id = v_match.organizer_id THEN RAISE EXCEPTION 'Organizer cannot be manually confirmed into their own match'; END IF;
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN RAISE EXCEPTION 'User is already a participant in this match'; END IF;
  IF NOT (public.is_user_in_scope_groups(v_scope_ids, p_user_id) OR public.do_users_share_group(p_user_id, v_match.organizer_id)) THEN
    RAISE EXCEPTION 'Target user is not in scope or shared group';
  END IF;

  -- Removed participants must restart via authorized channels
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'reactivation_not_allowed_use_restart_channels';
  END IF;

  BEGIN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, org_approved_by,
      manual_confirmed_by, created_by
    ) VALUES (
      p_match_id, p_user_id, 'manual',
      now(), 'manual',
      now(), auth.uid(),
      auth.uid(), auth.uid()
    )
    RETURNING * INTO v_new_mp;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_match_participants_active_user' THEN
      RAISE EXCEPTION 'User is already a participant in this match';
    ELSE RAISE; END IF;
  END;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'manual_confirm', NULL, auth.uid());

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_manual_confirm_user(p_match_id uuid, p_user_id uuid) IS 'v1.6.3: ORG manually confirms a user. No revival of removed participants here — use restart channels (rpc_match_invite_user / rpc_match_request_join). Sets participant_accepted_at + via=manual + org_approved_at; reconcile derives status.';

-- rpc_match_delegate_confirm_user: disallow reviving removed participants
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match      public.matches%rowtype;
  v_uid        uuid := auth.uid();
  v_existing   match_participants;
  v_new_mp     match_participants;
  v_constraint text;
  v_scope_ids  uuid[] := '{}'::uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  IF public.is_match_organizer(p_match_id, v_uid) THEN RAISE EXCEPTION 'You are not authorized to delegate-confirm for this match'; END IF;
  IF NOT (public.is_user_in_scope_groups(v_scope_ids, v_uid) OR public.is_user_match_associated(p_match_id, v_uid)) THEN
    RAISE EXCEPTION 'You are not authorized to delegate-confirm for this match';
  END IF;
  IF p_user_id = v_uid THEN RAISE EXCEPTION 'Cannot delegate-confirm yourself'; END IF;
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN RAISE EXCEPTION 'User is already a participant in this match'; END IF;
  IF NOT public.do_users_share_group(p_user_id, v_uid) THEN RAISE EXCEPTION 'Target user is not in your shared groups'; END IF;

  -- Removed participants must restart via authorized channels
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'reactivation_not_allowed_use_restart_channels';
  END IF;

  BEGIN
    INSERT INTO public.match_participants (
      match_id, user_id, join_method,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, org_approved_by,
      nominated_by, manual_confirmed_by,
      created_by
    ) VALUES (
      p_match_id, p_user_id, 'nominated',
      now(), 'delegate_manual',
      NULL, NULL,
      v_uid, v_uid,
      v_uid
    )
    RETURNING * INTO v_new_mp;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'uq_match_participants_active_user' THEN
      RAISE EXCEPTION 'User is already a participant in this match';
    ELSE RAISE; END IF;
  END;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'delegate_manual_confirm', NULL, v_uid);

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_delegate_confirm_user(p_match_id uuid, p_user_id uuid) IS 'v1.6.3: Non-org delegate-confirms a user from friend-share groups. No revival of removed participants here — use restart channels. Sets participant_accepted_at via delegate_manual; organizer approval still required.';

-- =============================================================================
-- 2) Reconfirm trigger: stop writing status directly; only clear timestamps and reconcile
--    Scope: when match_date/start_time/duration_minutes/club_id/court_ids change
--    Affect: confirmed participants (user AND guest), removed participants excluded
-- =============================================================================

CREATE OR REPLACE FUNCTION public.fn_match_detail_change_reconfirm()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (
    OLD.match_date          IS DISTINCT FROM NEW.match_date
    OR OLD.start_time       IS DISTINCT FROM NEW.start_time
    OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
    OR OLD.club_id          IS DISTINCT FROM NEW.club_id
    OR OLD.court_ids        IS DISTINCT FROM NEW.court_ids
  ) THEN
    FOR v_id IN
      UPDATE public.match_participants mp
      SET
        participant_accepted_at  = NULL,
        participant_accepted_via = NULL,
        manual_confirmed_by      = NULL,
        confirmed_at             = NULL
      WHERE mp.match_id = NEW.id
        AND mp.removed_at IS NULL
        AND mp.confirmed_at IS NOT NULL
      RETURNING mp.id
    LOOP
      PERFORM public.match_participant_reconcile_status(v_id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_match_detail_change_reconfirm() IS 'v1.6.3: On match schedule/location change, reset confirmed participants (user and guest): clear participant_accepted_at/confirmed_at (org_approved_at preserved). Status is derived by match_participant_reconcile_status; no direct status writes.';

-- Ensure trigger covers all five fields (match_date, start_time, duration_minutes, club_id, court_ids)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'matches' AND t.tgname = 'trg_match_detail_change_reconfirm'
  ) THEN
    DROP TRIGGER trg_match_detail_change_reconfirm ON public.matches;
  END IF;
END$$;

CREATE TRIGGER trg_match_detail_change_reconfirm
AFTER UPDATE OF match_date, start_time, duration_minutes, club_id, court_ids ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.fn_match_detail_change_reconfirm();

-- =============================================================================
-- 3) Remove legacy user_accepted_at references in re-entry paths
-- =============================================================================

-- rpc_match_invite_user: drop legacy user_accepted_at=NULL in re-entry update
CREATE OR REPLACE FUNCTION public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_existing match_participants;
  v_new_mp   match_participants;
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  IF p_user_id = v_match.organizer_id THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, p_user_id)
    OR public.do_users_share_group(p_user_id, v_match.organizer_id)
  ) THEN
    RAISE EXCEPTION 'Target user is not in scope or shared group';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
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
      org_approved_by          = auth.uid(),
      nominated_by             = NULL,
      manual_confirmed_by      = NULL
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter', NULL, auth.uid()),
      (p_match_id, v_existing.id, 'invite',  NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, org_approved_by, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'invited',
    NULL, NULL,
    now(), auth.uid(), NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'invite', NULL, auth.uid());

  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_invite_user(p_match_id uuid, p_user_id uuid) IS 'v1.6.3: ORG-only invite. Re-entry clears removal and sets org_approved_at; user acceptance still required. No legacy user_accepted_at references.';

-- rpc_match_nominate_user: drop legacy user_accepted_at=NULL in re-entry update
CREATE OR REPLACE FUNCTION public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match     public.matches%rowtype;
  v_uid       uuid := auth.uid();
  v_existing  match_participants;
  v_new_mp    match_participants;
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF NOT v_match.can_participants_invite_users THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot nominate yourself';
  END IF;

  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  IF NOT public.do_users_share_group(p_user_id, v_uid) THEN
    RAISE EXCEPTION 'Target user is not in your shared groups';
  END IF;

  SELECT mp.* INTO v_existing
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.user_id  = p_user_id
    AND mp.status   = 'removed'
  ORDER BY mp.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.match_participants mp
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
      nominated_by             = v_uid,
      manual_confirmed_by      = NULL
    WHERE mp.id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',  NULL, v_uid),
      (p_match_id, v_existing.id, 'nominate', NULL, v_uid);

    SELECT mp.* INTO v_new_mp
    FROM public.match_participants mp
    WHERE mp.id = v_existing.id;

    RETURN v_new_mp;
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'nominated',
    NULL, NULL,
    NULL, v_uid, v_uid
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'nominate', NULL, v_uid);

  SELECT mp.* INTO v_new_mp
  FROM public.match_participants mp
  WHERE mp.id = v_new_mp.id;

  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_user(p_match_id uuid, p_user_id uuid) IS 'v1.6.3: Non-org nomination in friend-share groups. Re-entry clears removal and does not reference legacy user_accepted_at; reconcile derives status.';

-- =============================================================================
-- 4) Remove direct status write in rpc_match_add_guest_participant (4-arg variant)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_participant(p_match_id uuid, p_guest_display_name text, p_guest_notes text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
RETURNS public.match_participants
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_new_guest_id uuid;
  v_new_mp match_participants;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match % not found', p_match_id;
  END IF;

  IF NOT (
    is_match_participant_confirmed(p_match_id, auth.uid())
    AND v_match.can_participants_add_guests
  ) THEN
    RAISE EXCEPTION 'You do not have permission to add guests';
  END IF;

  INSERT INTO guests (display_name, notes, created_by)
  VALUES (p_guest_display_name, p_guest_notes, auth.uid())
  RETURNING id INTO v_new_guest_id;

  INSERT INTO match_participants (
    match_id, guest_id, join_method,
    org_approved_at, created_by
  ) VALUES (
    p_match_id, v_new_guest_id, 'guest_add',
    NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM match_participant_reconcile_status(v_new_mp.id);
  PERFORM log_participant_action(v_new_mp.id, 'add_guest_participant', p_note);

  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_add_guest_participant(p_match_id uuid, p_guest_display_name text, p_guest_notes text, p_note text) IS 'v1.6.3: Participant adds a guest. No direct status writes; reconcile derives status from timestamps.';

-- =============================================================================
-- 5) Notifications: allow INSERT via internal SECURITY DEFINER paths under RLS
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'notifications'
      AND policyname = 'insert_internal_notifications'
  ) THEN
    CREATE POLICY insert_internal_notifications ON public.notifications
      FOR INSERT
      WITH CHECK (true);
  END IF;
END$$;

COMMIT;
