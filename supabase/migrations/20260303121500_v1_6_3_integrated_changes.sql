-- v1.6.3 integrated changes + product asks
-- 1) Delegator notifications on participant confirmed/removed
-- 2) Venue sports + court counts
-- 3) Remove deprecated admission_mode and user_accepted_at
-- Also unify confirmation invariant (guest requires participant_accepted_at) and stop direct status writes

SET check_function_bodies = false;
SET search_path = public;

-- 1) Notifications table for delegator alerts
CREATE TABLE IF NOT EXISTS public.notifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id  uuid NOT NULL,
  kind               text NOT NULL,
  match_id           uuid NULL,
  match_participant_id uuid NULL,
  actor_user_id      uuid NULL,
  note               text NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  read_at            timestamptz NULL
);

-- RLS: recipients can read their notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'select_own_notifications'
  ) THEN
    CREATE POLICY select_own_notifications ON public.notifications
      FOR SELECT USING (recipient_user_id = auth.uid());
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at
  ON public.notifications (recipient_user_id, created_at DESC);

-- 1.a Trigger: notify delegator when a delegated user/guest becomes confirmed or gets removed
CREATE OR REPLACE FUNCTION public.trg_notify_delegator_on_mp_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delegator uuid := NULL;
  v_kind text;
  v_actor uuid := auth.uid();
  v_org uuid;
BEGIN
  -- Only act on real transitions
  IF (NEW.removed_at IS DISTINCT FROM OLD.removed_at) AND NEW.removed_at IS NOT NULL THEN
    v_kind := 'delegate_target_removed';
  ELSIF (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at) AND NEW.confirmed_at IS NOT NULL THEN
    v_kind := 'delegate_target_confirmed';
  ELSE
    RETURN NEW;
  END IF;

  -- Determine delegator by precedence
  -- Users: delegated-manual > nominated
  IF NEW.user_id IS NOT NULL THEN
    IF NEW.manual_confirmed_by IS NOT NULL THEN
      v_delegator := NEW.manual_confirmed_by;
    ELSIF NEW.nominated_by IS NOT NULL THEN
      v_delegator := NEW.nominated_by;
    END IF;
  ELSIF NEW.guest_id IS NOT NULL THEN
    -- Guests added by a participant (delegated) vs organizer (non-delegated)
    SELECT organizer_id INTO v_org FROM public.matches WHERE id = NEW.match_id;
    IF v_org IS NOT NULL AND NEW.created_by IS DISTINCT FROM v_org THEN
      v_delegator := NEW.created_by;  -- participant who added the guest
    END IF;
  END IF;

  IF v_delegator IS NULL THEN
    RETURN NEW; -- nothing to notify
  END IF;

  INSERT INTO public.notifications (
    recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
  ) VALUES (
    v_delegator, v_kind, NEW.match_id, NEW.id, v_actor, NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_delegator_on_mp_change ON public.match_participants;
CREATE TRIGGER notify_delegator_on_mp_change
AFTER UPDATE OF confirmed_at, removed_at ON public.match_participants
FOR EACH ROW
WHEN (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.removed_at IS DISTINCT FROM OLD.removed_at)
EXECUTE FUNCTION public.trg_notify_delegator_on_mp_change();

-- 2) Venue sports + counts: summary mapping per club
CREATE TABLE IF NOT EXISTS public.club_sports (
  club_id     uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  sport_id    smallint NOT NULL REFERENCES public.sports(id) ON DELETE RESTRICT,
  court_count integer NOT NULL DEFAULT 0 CHECK (court_count >= 0),
  PRIMARY KEY (club_id, sport_id)
);

-- 3) Function updates to remove user_accepted_at dependency and enforce unified confirmation

-- 3.a Unified reconcile: guests require participant_accepted_at too
CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp record;
  v_both boolean;
BEGIN
  SELECT
    id, status, user_id, guest_id,
    participant_accepted_at,
    org_approved_at, removed_at, confirmed_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  -- Canonical removal branch
  IF v_mp.status = 'removed'::public.match_participant_status OR v_mp.removed_at IS NOT NULL THEN
    UPDATE public.match_participants
    SET confirmed_at = NULL,
        removed_at   = COALESCE(removed_at, now()),
        status       = 'removed'::public.match_participant_status
    WHERE id = p_mp_id
      AND (confirmed_at IS NOT NULL OR removed_at IS NULL OR status <> 'removed'::public.match_participant_status);
    RETURN;
  END IF;

  v_both := (v_mp.participant_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL);

  IF v_both THEN
    UPDATE public.match_participants
    SET status = 'confirmed'::public.match_participant_status,
        confirmed_at = COALESCE(confirmed_at, now())
    WHERE id = p_mp_id
      AND (status <> 'confirmed'::public.match_participant_status OR confirmed_at IS NULL);
  ELSE
    UPDATE public.match_participants
    SET status = 'pending'::public.match_participant_status,
        confirmed_at = NULL
    WHERE id = p_mp_id
      AND (status <> 'pending'::public.match_participant_status OR confirmed_at IS NOT NULL);
  END IF;
END;
$$;

-- 3.b Accept invite: stop writing user_accepted_at
CREATE OR REPLACE FUNCTION public.rpc_match_accept_invite(p_match_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp             match_participants;
  v_was_unaccepted boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  PERFORM 1 FROM public.matches WHERE id = p_match_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Match is not active or does not exist'; END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE match_id = p_match_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not a participant in this match'; END IF;
  IF v_mp.removed_at IS NOT NULL THEN RAISE EXCEPTION 'You were removed from this match'; END IF;
  IF v_mp.status NOT IN ('pending','confirmed') THEN
    RAISE EXCEPTION 'Accept is not allowed for participant status: %', v_mp.status;
  END IF;
  IF v_mp.confirmed_at IS NOT NULL THEN RETURN v_mp; END IF;

  -- Self-requested guard (unchanged)
  IF v_mp.join_method = 'requested' AND v_mp.nominated_by IS NULL AND v_mp.participant_accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Self-requested participants have acceptance recorded at request time. Waiting for organizer approval.';
  END IF;
  IF v_mp.join_method NOT IN ('invited','nominated','requested') THEN
    RAISE EXCEPTION 'Accept is not available for join method: %', v_mp.join_method;
  END IF;

  v_was_unaccepted := (v_mp.participant_accepted_at IS NULL);
  IF NOT v_was_unaccepted THEN
    PERFORM public.match_participant_reconcile_status(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
    RETURN v_mp;
  END IF;

  UPDATE public.match_participants
  SET
    participant_accepted_at  = now(),
    participant_accepted_via = 'in_app'
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_mp.id, 'accept', NULL, auth.uid());

  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

-- 3.c Organizer manual confirm user: stop writing user_accepted_at
CREATE OR REPLACE FUNCTION public.rpc_match_manual_confirm_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
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

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'manual',
      participant_accepted_at  = now(),
      participant_accepted_via = 'manual',
      org_approved_at          = now(),
      org_approved_by          = auth.uid(),
      nominated_by             = NULL,
      manual_confirmed_by      = auth.uid()
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
    VALUES (p_match_id, v_existing.id, 'reenter', NULL, auth.uid()),
           (p_match_id, v_existing.id, 'manual_confirm', NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
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

-- 3.d Delegate manual confirm user: stop writing user_accepted_at
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_confirm_user(p_match_id uuid, p_user_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
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

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND THEN
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'nominated',
      participant_accepted_at  = now(),
      participant_accepted_via = 'delegate_manual',
      org_approved_at          = NULL,
      org_approved_by          = NULL,
      nominated_by             = v_uid,
      manual_confirmed_by      = v_uid
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
    VALUES (p_match_id, v_existing.id, 'reenter', NULL, v_uid),
           (p_match_id, v_existing.id, 'delegate_manual_confirm', NULL, v_uid);

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
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

-- 3.e Request join: stop referencing user_accepted_at
CREATE OR REPLACE FUNCTION public.rpc_match_request_join(p_match_id uuid)
RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match    record;
  v_existing match_participants;
  v_new_mp   match_participants;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF v_match.organizer_id = auth.uid() THEN RAISE EXCEPTION 'Organizer cannot request to join their own match'; END IF;
  IF v_match.invitation_scope_group_ids IS NULL OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'This match is not open for join requests (no scope groups configured)';
  END IF;
  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, auth.uid()) THEN
    RAISE EXCEPTION 'You are not eligible to request to join this match (not in scope groups)';
  END IF;

  SELECT * INTO v_existing FROM public.match_participants WHERE match_id = p_match_id AND user_id = auth.uid();

  IF FOUND THEN
    IF v_existing.removed_at IS NULL THEN RAISE EXCEPTION 'You are already a participant in this match'; END IF;

    UPDATE public.match_participants
    SET
      removed_at = NULL, removed_by = NULL, removal_note = NULL,
      confirmed_at = NULL, join_method = 'requested',
      participant_accepted_at = now(), participant_accepted_via = 'in_app',
      org_approved_at = NULL, org_approved_by = NULL,
      nominated_by = NULL, manual_confirmed_by = NULL
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
    VALUES (p_match_id, v_existing.id, 'reenter', NULL, auth.uid()),
           (p_match_id, v_existing.id, 'request_join', NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, auth.uid(), 'requested',
    now(), 'in_app', NULL, NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'request_join', NULL, auth.uid());

  RETURN v_new_mp;
END;
$$;

-- 3.f Guest add (ORG, 4-arg): stop direct status write; set timestamps and let reconcile
CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_org(
  p_match_id uuid,
  p_guest_display_name text,
  p_guest_notes text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text
) RETURNS public.match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_guest_id uuid;
  v_new_mp match_participants;
BEGIN
  IF NOT is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only organizer can add guests directly';
  END IF;

  INSERT INTO guests (display_name, notes, created_by)
  VALUES (p_guest_display_name, p_guest_notes, auth.uid())
  RETURNING id INTO v_new_guest_id;

  INSERT INTO match_participants (
    match_id, guest_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, org_approved_by, created_by
  ) VALUES (
    p_match_id, v_new_guest_id, 'guest_add',
    now(), 'manual',
    now(), auth.uid(), auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM match_participant_reconcile_status(v_new_mp.id);
  PERFORM log_participant_action(v_new_mp.id, 'add_guest_org', p_note);

  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

-- 3.g Match detail change reconfirm: include club_id & court_ids; affect all non-removed participants; remove user_accepted_at
CREATE OR REPLACE FUNCTION public.fn_match_detail_change_reconfirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    OLD.match_date          IS DISTINCT FROM NEW.match_date
    OR OLD.start_time       IS DISTINCT FROM NEW.start_time
    OR OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes
    OR OLD.club_id          IS DISTINCT FROM NEW.club_id
    OR OLD.court_ids        IS DISTINCT FROM NEW.court_ids
  ) THEN
    UPDATE public.match_participants
    SET
      status                   = 'pending',
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      manual_confirmed_by      = NULL,
      confirmed_at             = NULL
    WHERE match_id = NEW.id
      AND removed_at IS NULL; -- includes organizer and guests
  END IF;

  RETURN NEW;
END;
$$;

-- Also update trigger to include club_id and court_ids as change sources
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'trg_match_detail_change_reconfirm'
      AND n.nspname = 'public'
      AND c.relname = 'matches'
  ) THEN
    DROP TRIGGER trg_match_detail_change_reconfirm ON public.matches;
  END IF;
END$$;

CREATE TRIGGER trg_match_detail_change_reconfirm
AFTER UPDATE OF match_date, start_time, duration_minutes, club_id, court_ids ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.fn_match_detail_change_reconfirm();

-- 4) Drop deprecated columns after functions updated
ALTER TABLE public.matches DROP COLUMN IF EXISTS admission_mode;
ALTER TABLE public.match_participants DROP COLUMN IF EXISTS user_accepted_at;
