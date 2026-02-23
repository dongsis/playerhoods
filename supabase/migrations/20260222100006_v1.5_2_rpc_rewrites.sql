-- Migration: v1.5 Phase 2 — RPC rewrites (merged with 2b fixes)
--
-- Changes from v1.3/unify_restart_participation:
--
-- ALL entry RPCs:
--   - Scope enforcement: invitee/requester/nominee must be in invitation_scope_group_ids
--   - Empty scope → reject (scope is an absolute boundary)
--   - Removed users CAN re-enter via request/invite/nominate (UPDATE existing row,
--     clear removed fields, re-apply fresh join fields, then reconcile)
--   - Re-entry does NOT change created_by (preserves original creator for audit)
--   - Re-entry writes action log: action_type='reenter'
--
-- Acceptance fields:
--   - participant_accepted_at + participant_accepted_via replaces user_accepted_at writes
--   - user_accepted_at cleared on re-entry (prevents stale value affecting reconcile)
--
-- Status writes:
--   - RPCs no longer set status directly
--   - match_participant_reconcile_status() is the sole writer of status and confirmed_at
--
-- join_method changes:
--   - Nominations: 'nominated' (was 'requested' + nominated_by)
--   - ALL guests: 'manual' (unified; org_approved_at presence determines pending vs confirmed)
--   - Both guest RPCs write participant_accepted_at + via='manual'
--   - ORG-added: org_approved_at=now() → reconcile confirms immediately
--   - Participant-added: org_approved_at=NULL → pending ORG approval
--
-- Permission changes:
--   - rpc_match_add_guest_participant: non-removed participant (pending OR confirmed)
--     + can_participants_add_guests (was: confirmed only)
--   - rpc_match_nominate_user: non-removed participant + can_participants_invite_users
--     (was: confirmed only)
--
-- New RPC: rpc_match_manual_confirm — ORG manually confirms a user participant
--   - Scope assert: scope non-empty + user in scope
--   - Writes action log (match_participant_actions) with action_type='manual_confirm' + p_note
-- Dropped: rpc_match_reactivate_participant

BEGIN;

-- ============================================================================
-- 1. rpc_match_request_join — scope required, removed re-entry allowed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_request_join(p_match_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match    record;
  v_existing match_participants;
  v_new_mp   match_participants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.organizer_id = auth.uid() THEN
    RAISE EXCEPTION 'Organizer cannot request to join their own match';
  END IF;

  -- Scope is absolute — empty scope = match not open for requests
  IF v_match.invitation_scope_group_ids IS NULL
     OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'This match is not open for join requests (no scope groups configured)';
  END IF;

  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, auth.uid()) THEN
    RAISE EXCEPTION 'You are not eligible to request to join this match (not in scope groups)';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF FOUND THEN
    IF v_existing.removed_at IS NULL THEN
      RAISE EXCEPTION 'You are already a participant in this match';
    END IF;
    -- Re-entry: clear removed + re-apply as fresh request
    -- created_by intentionally NOT updated — it records the original creator for audit.
    -- Clear user_accepted_at to prevent stale value affecting reconcile COALESCE.
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'requested',
      participant_accepted_at  = now(),
      participant_accepted_via = 'in_app',
      user_accepted_at         = NULL,
      org_approved_at          = NULL,
      org_approved_by          = NULL,
      nominated_by             = NULL,
      manual_confirmed_by      = NULL
    WHERE id = v_existing.id;
    PERFORM public.match_participant_reconcile_status(v_existing.id);
    INSERT INTO public.match_participant_actions (
      match_id, match_participant_id, action_type, note, created_by
    ) VALUES (
      p_match_id, v_existing.id, 'reenter', NULL, auth.uid()
    );
    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh request: user side confirmed at request time
  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, auth.uid(), 'requested',
    now(), 'in_app',
    NULL, NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_request_join(uuid) IS
  'v1.5: User requests to join. Scope required: requester must be in invitation_scope_group_ids. '
  'Empty scope → rejected. Removed users can re-request (clears removed fields, fresh request). '
  'Re-entry: created_by preserved; writes action_type=reenter log. '
  'Sets participant_accepted_at=now() + via=in_app. ORG approval needed to confirm.';

GRANT EXECUTE ON FUNCTION public.rpc_match_request_join(uuid) TO authenticated;

-- ============================================================================
-- 2. rpc_match_invite_user — ORG-only, scope enforced, removed re-invite allowed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_invite_user(
  p_match_id uuid,
  p_user_id  uuid
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match    record;
  v_existing match_participants;
  v_new_mp   match_participants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can invite users';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  IF v_match.invitation_scope_group_ids IS NULL
     OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'This match has no scope groups configured. Add scope groups before inviting users.';
  END IF;

  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, p_user_id) THEN
    RAISE EXCEPTION 'User is not in any of the match scope groups';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF FOUND THEN
    IF v_existing.removed_at IS NULL THEN
      RAISE EXCEPTION 'User is already a participant in this match';
    END IF;
    -- Re-invite: clear removed + apply as fresh invite (user acceptance still required)
    -- created_by intentionally NOT updated — it records the original creator for audit.
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'invited',
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      user_accepted_at         = NULL,
      org_approved_at          = now(),
      org_approved_by          = auth.uid(),
      nominated_by             = NULL,
      manual_confirmed_by      = NULL
    WHERE id = v_existing.id;
    PERFORM public.match_participant_reconcile_status(v_existing.id);
    INSERT INTO public.match_participant_actions (
      match_id, match_participant_id, action_type, note, created_by
    ) VALUES (
      p_match_id, v_existing.id, 'reenter', NULL, auth.uid()
    );
    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh invite: org side confirmed (user acceptance still needed)
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
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_invite_user(uuid, uuid) IS
  'v1.5: ORG-only invite. Invited user must be in invitation_scope_group_ids. '
  'Removed users can be re-invited (clears removed fields, fresh invite). '
  'Re-entry: created_by preserved; writes action_type=reenter log. '
  'Sets org_approved_at; user acceptance still required to confirm.';

GRANT EXECUTE ON FUNCTION public.rpc_match_invite_user(uuid, uuid) TO authenticated;

-- ============================================================================
-- 3. rpc_match_accept_invite — writes participant_accepted_at + via=in_app
-- ============================================================================
-- Works for: invited (join_method='invited'), nominated (join_method='nominated'),
--            and legacy nominated (join_method='requested' + nominated_by IS NOT NULL).
-- Blocks: self-requesters — their participant_accepted_at was set at request time.

CREATE OR REPLACE FUNCTION public.rpc_match_accept_invite(p_match_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp match_participants;
BEGIN
  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'You were removed from this match';
  END IF;

  -- Already confirmed (idempotent)
  IF v_mp.confirmed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  -- Self-requested: participant_accepted_at already set at request time
  IF v_mp.join_method = 'requested' AND v_mp.nominated_by IS NULL THEN
    RAISE EXCEPTION 'Self-requested participants have acceptance recorded at request time. Waiting for organizer approval.';
  END IF;

  IF v_mp.join_method NOT IN ('invited', 'nominated', 'requested') THEN
    RAISE EXCEPTION 'Accept is not available for join method: %', v_mp.join_method;
  END IF;

  UPDATE public.match_participants
  SET
    participant_accepted_at  = COALESCE(participant_accepted_at, now()),
    participant_accepted_via = COALESCE(participant_accepted_via, 'in_app')
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_accept_invite(uuid) IS
  'v1.5: User accepts invitation or nomination. Sets participant_accepted_at + via=in_app. '
  'Works for: invited, nominated (v1.5), legacy requested+nominated_by. '
  'Blocks self-requesters (they have participant_accepted_at from request time). '
  'Reconcile transitions to confirmed when org_approved_at also set.';

GRANT EXECUTE ON FUNCTION public.rpc_match_accept_invite(uuid) TO authenticated;

-- ============================================================================
-- 4. rpc_match_org_approve_participant — no direct status mutation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_org_approve_participant(p_match_participant_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp       match_participants;
  v_match_id uuid;
BEGIN
  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  v_match_id := v_mp.match_id;

  IF NOT public.is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can approve participants';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot approve a removed participant. Re-invite them first.';
  END IF;

  -- Already confirmed (idempotent)
  IF v_mp.confirmed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  UPDATE public.match_participants
  SET
    org_approved_at = COALESCE(org_approved_at, now()),
    org_approved_by = auth.uid()
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_org_approve_participant(uuid) IS
  'v1.5: ORG approves a pending participant. Sets org_approved_at. '
  'Does NOT write status directly — reconcile derives status from timestamps. '
  'Idempotent (confirmed_at IS NOT NULL check).';

GRANT EXECUTE ON FUNCTION public.rpc_match_org_approve_participant(uuid) TO authenticated;

-- ============================================================================
-- 5. rpc_match_user_withdraw — sets removed_at, calls reconcile
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_user_withdraw(p_match_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp match_participants;
BEGIN
  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  -- Already removed (idempotent)
  IF v_mp.removed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  UPDATE public.match_participants
  SET
    removed_at   = now(),
    removed_by   = auth.uid(),
    removal_note = CASE
      WHEN v_mp.join_method = 'invited'   AND v_mp.confirmed_at IS NULL THEN 'User declined invitation'
      WHEN v_mp.join_method = 'nominated' AND v_mp.confirmed_at IS NULL THEN 'User declined nomination'
      WHEN v_mp.confirmed_at IS NOT NULL THEN 'User left match'
      ELSE 'User withdrew'
    END
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_user_withdraw(uuid) IS
  'v1.5: User withdraws (decline invite or leave). Sets removed_at + removed_by. '
  'Reconcile sets status=removed and clears confirmed_at. No direct status write.';

GRANT EXECUTE ON FUNCTION public.rpc_match_user_withdraw(uuid) TO authenticated;

-- ============================================================================
-- 6. rpc_match_remove_participant — sets removed_at, calls reconcile
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_remove_participant(p_match_participant_id uuid)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp       match_participants;
  v_match_id uuid;
BEGIN
  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  v_match_id := v_mp.match_id;

  IF NOT (
    public.is_match_organizer(v_match_id, auth.uid())
    OR (
      public.is_match_participant_confirmed(v_match_id, auth.uid())
      AND (SELECT can_participants_manage_participants FROM public.matches WHERE id = v_match_id)
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to remove participants';
  END IF;

  -- Already removed (idempotent)
  IF v_mp.removed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  UPDATE public.match_participants
  SET
    removed_at   = now(),
    removed_by   = auth.uid(),
    removal_note = CASE
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'Request rejected'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'Invitation revoked'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'Nomination rejected'
      WHEN v_mp.confirmed_at IS NOT NULL                                   THEN 'Removed by organizer'
      ELSE 'Removed'
    END
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);
  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_remove_participant(uuid) IS
  'v1.5: ORG (or authorized participant) removes a participant. Sets removed_at + removed_by. '
  'Reconcile sets status=removed and clears confirmed_at. No direct status write.';

GRANT EXECUTE ON FUNCTION public.rpc_match_remove_participant(uuid) TO authenticated;

-- ============================================================================
-- 7. rpc_match_nominate_user — join_method=nominated, scope enforced, removed re-nomination allowed
-- ============================================================================
-- Permission: ORG or any non-removed participant (pending or confirmed) with can_participants_invite_users.

CREATE OR REPLACE FUNCTION public.rpc_match_nominate_user(
  p_match_id uuid,
  p_user_id  uuid
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match    record;
  v_existing match_participants;
  v_new_mp   match_participants;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- ORG or any non-removed participant with can_participants_invite_users
  IF NOT (
    public.is_match_organizer(p_match_id, auth.uid())
    OR (
      EXISTS (
        SELECT 1 FROM public.match_participants mp
        WHERE mp.match_id = p_match_id
          AND mp.user_id  = auth.uid()
          AND mp.removed_at IS NULL
      )
      AND v_match.can_participants_invite_users
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to nominate users';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot nominate yourself (use request join instead)';
  END IF;

  IF v_match.invitation_scope_group_ids IS NULL
     OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'This match has no scope groups configured. Cannot nominate users.';
  END IF;

  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, p_user_id) THEN
    RAISE EXCEPTION 'Nominated user is not in any of the match scope groups';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id;

  IF FOUND THEN
    IF v_existing.removed_at IS NULL THEN
      RAISE EXCEPTION 'User is already a participant in this match';
    END IF;
    -- Re-nominate: clear removed + apply as fresh nomination
    -- created_by intentionally NOT updated — it records the original creator for audit.
    UPDATE public.match_participants
    SET
      removed_at               = NULL,
      removed_by               = NULL,
      removal_note             = NULL,
      confirmed_at             = NULL,
      join_method              = 'nominated',
      participant_accepted_at  = NULL,
      participant_accepted_via = NULL,
      user_accepted_at         = NULL,
      org_approved_at          = NULL,
      org_approved_by          = NULL,
      nominated_by             = auth.uid(),
      manual_confirmed_by      = NULL
    WHERE id = v_existing.id;
    PERFORM public.match_participant_reconcile_status(v_existing.id);
    INSERT INTO public.match_participant_actions (
      match_id, match_participant_id, action_type, note, created_by
    ) VALUES (
      p_match_id, v_existing.id, 'reenter', NULL, auth.uid()
    );
    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh nomination (user must accept + ORG must approve to confirm)
  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'nominated',
    NULL, NULL,
    NULL, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) IS
  'v1.5: Nominate a user. join_method=nominated. Scope enforced. '
  'Permission: ORG or any non-removed participant (pending or confirmed) with can_participants_invite_users. '
  'Removed users can be re-nominated (clears removed fields, fresh nomination). '
  'Re-entry: created_by preserved; writes action_type=reenter log. '
  'Requires user acceptance + org approval to confirm.';

GRANT EXECUTE ON FUNCTION public.rpc_match_nominate_user(uuid, uuid) TO authenticated;

-- ============================================================================
-- 8. rpc_match_add_guest_org — join_method=manual, both sides set → confirmed immediately
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_org(
  p_match_id           uuid,
  p_guest_display_name text,
  p_guest_notes        text DEFAULT NULL
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_guest_id uuid;
  v_new_mp       match_participants;
BEGIN
  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can add guests directly';
  END IF;

  INSERT INTO public.guests (display_name, notes, created_by)
  VALUES (p_guest_display_name, p_guest_notes, auth.uid())
  RETURNING id INTO v_new_guest_id;

  -- Both sides set → reconcile confirms guest immediately
  INSERT INTO public.match_participants (
    match_id, guest_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, org_approved_by,
    created_by
  ) VALUES (
    p_match_id, v_new_guest_id, 'manual',
    now(), 'manual',
    now(), auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_add_guest_org(uuid, text, text) IS
  'v1.5: ORG adds a guest. join_method=manual. '
  'participant_accepted_at=now() + via=manual + org_approved_at=now(). '
  'Reconcile confirms guest immediately (both sides satisfied).';

GRANT EXECUTE ON FUNCTION public.rpc_match_add_guest_org(uuid, text, text) TO authenticated;

-- ============================================================================
-- 9. rpc_match_add_guest_participant — join_method=manual, pending ORG approval
-- ============================================================================
-- Permission: non-removed participant (pending or confirmed) + can_participants_add_guests.
-- participant_accepted_at set (participant vouches for this guest).
-- org_approved_at=NULL → stays pending until ORG approves.

CREATE OR REPLACE FUNCTION public.rpc_match_add_guest_participant(
  p_match_id           uuid,
  p_guest_display_name text,
  p_guest_notes        text DEFAULT NULL
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match        record;
  v_new_guest_id uuid;
  v_new_mp       match_participants;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- Non-removed participant (pending or confirmed) + can_participants_add_guests
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id  = p_match_id
        AND mp.user_id   = auth.uid()
        AND mp.removed_at IS NULL
    )
    AND v_match.can_participants_add_guests
  ) THEN
    RAISE EXCEPTION 'You do not have permission to add guests';
  END IF;

  INSERT INTO public.guests (display_name, notes, created_by)
  VALUES (p_guest_display_name, p_guest_notes, auth.uid())
  RETURNING id INTO v_new_guest_id;

  -- participant_accepted_at set; org_approved_at=NULL (pending ORG approval)
  INSERT INTO public.match_participants (
    match_id, guest_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, created_by
  ) VALUES (
    p_match_id, v_new_guest_id, 'manual',
    now(), 'manual',
    NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_add_guest_participant(uuid, text, text) IS
  'v1.5: Non-removed participant adds a guest. join_method=manual. '
  'participant_accepted_at=now() + via=manual. org_approved_at=NULL (pending ORG approval). '
  'Permission: non-removed participant (pending or confirmed) + can_participants_add_guests.';

GRANT EXECUTE ON FUNCTION public.rpc_match_add_guest_participant(uuid, text, text) TO authenticated;

-- ============================================================================
-- 10. rpc_match_create — write participant_accepted_at for organizer participant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_match_create(
  p_required_count                      int     DEFAULT 4,
  p_game_type                           text    DEFAULT 'doubles',
  p_match_date                          date    DEFAULT NULL,
  p_start_time                          time    DEFAULT NULL,
  p_duration_minutes                    int     DEFAULT NULL,
  p_club_id                             uuid    DEFAULT NULL,
  p_court_ids                           uuid[]  DEFAULT NULL,
  p_invitation_scope_group_ids          uuid[]  DEFAULT NULL,
  p_can_participants_invite_users       boolean DEFAULT false,
  p_can_participants_add_guests         boolean DEFAULT false,
  p_can_participants_manage_participants boolean DEFAULT false
)
RETURNS matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_match   matches;
  v_mp_id   uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.matches (
    organizer_id,
    required_count,
    game_type,
    match_date,
    start_time,
    duration_minutes,
    club_id,
    court_ids,
    invitation_scope_group_ids,
    can_participants_invite_users,
    can_participants_add_guests,
    can_participants_manage_participants
  ) VALUES (
    v_user_id,
    COALESCE(p_required_count, 4),
    COALESCE(p_game_type, 'doubles'),
    COALESCE(p_match_date, (now() AT TIME ZONE 'utc')::date),
    COALESCE(p_start_time, time '09:00'),
    COALESCE(p_duration_minutes, 90),
    p_club_id,
    COALESCE(p_court_ids, '{}'),
    COALESCE(p_invitation_scope_group_ids, '{}'),
    COALESCE(p_can_participants_invite_users, false),
    COALESCE(p_can_participants_add_guests, false),
    COALESCE(p_can_participants_manage_participants, false)
  )
  RETURNING * INTO v_match;

  -- Auto-add organizer as confirmed participant (both sides satisfied at creation)
  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, org_approved_by, created_by
  ) VALUES (
    v_match.id, v_user_id, 'invited',
    now(), 'in_app',
    now(), v_user_id, v_user_id
  )
  RETURNING id INTO v_mp_id;

  PERFORM public.match_participant_reconcile_status(v_mp_id);

  RETURN v_match;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_create(
  integer,
  text,
  date,
  time without time zone,
  integer,
  uuid,
  uuid[],
  uuid[],
  boolean,
  boolean,
  boolean
) IS
  'v1.5: Creates a match and auto-adds organizer as confirmed participant. '
  'Organizer participant: participant_accepted_at + org_approved_at both set at creation. '
  'Reconcile confirms organizer immediately. SECURITY DEFINER bypasses RLS.';

GRANT EXECUTE ON FUNCTION public.rpc_match_create(
  integer,
  text,
  date,
  time without time zone,
  integer,
  uuid,
  uuid[],
  uuid[],
  boolean,
  boolean,
  boolean
) TO authenticated;

-- ============================================================================
-- 11. rpc_match_manual_confirm (NEW) — ORG manually confirms a user participant
-- ============================================================================
-- Scope assert: match scope must be non-empty + user must be in scope.
-- Writes action log (action_type='manual_confirm', note=p_note).
-- For guests, use rpc_match_org_approve_participant instead.

CREATE OR REPLACE FUNCTION public.rpc_match_manual_confirm(
  p_match_participant_id uuid,
  p_note                 text DEFAULT NULL
)
RETURNS match_participants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp       match_participants;
  v_match    record;
  v_match_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  v_match_id := v_mp.match_id;

  IF NOT public.is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can manually confirm participants';
  END IF;

  -- For user participants only (guests use rpc_match_org_approve_participant)
  IF v_mp.user_id IS NULL THEN
    RAISE EXCEPTION 'Use rpc_match_org_approve_participant for guest participants';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot manually confirm a removed participant';
  END IF;

  -- Fetch match for scope assertion
  SELECT * INTO v_match FROM public.matches WHERE id = v_match_id;

  -- Scope assert: scope must be configured and user must be in scope
  IF v_match.invitation_scope_group_ids IS NULL
     OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Cannot manually confirm: match has no scope groups configured';
  END IF;

  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, v_mp.user_id) THEN
    RAISE EXCEPTION 'Cannot manually confirm: user is not in any of the match scope groups';
  END IF;

  -- Set both sides (idempotent COALESCEs)
  UPDATE public.match_participants
  SET
    participant_accepted_at  = COALESCE(participant_accepted_at, now()),
    participant_accepted_via = COALESCE(participant_accepted_via, 'manual'),
    manual_confirmed_by      = auth.uid(),
    org_approved_at          = COALESCE(org_approved_at, now()),
    org_approved_by          = auth.uid()
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  -- Write action log
  INSERT INTO public.match_participant_actions (
    match_id, match_participant_id, action_type, note, created_by
  ) VALUES (
    v_match_id, p_match_participant_id, 'manual_confirm', p_note, auth.uid()
  );

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;

COMMENT ON FUNCTION public.rpc_match_manual_confirm(uuid, text) IS
  'v1.5: ORG manually confirms a user participant. '
  'Scope assert: scope must be non-empty + user must be in scope. '
  'Sets participant_accepted_at + via=manual + manual_confirmed_by + org_approved_at. '
  'Writes action log (action_type=manual_confirm, note=p_note). '
  'Reconcile transitions to confirmed.';

GRANT EXECUTE ON FUNCTION public.rpc_match_manual_confirm(uuid, text) TO authenticated;

-- ============================================================================
-- 12. Drop rpc_match_reactivate_participant (deprecated in v1.5)
-- ============================================================================

DROP FUNCTION IF EXISTS public.rpc_match_reactivate_participant(uuid);

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_request_join') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_request_join not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_invite_user') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_invite_user not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_accept_invite') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_accept_invite not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_org_approve_participant') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_org_approve_participant not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_user_withdraw') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_user_withdraw not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_remove_participant') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_remove_participant not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_nominate_user') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_nominate_user not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_add_guest_org') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_add_guest_org not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_add_guest_participant') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_add_guest_participant not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_create') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_create not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_manual_confirm') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_manual_confirm not found';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_match_reactivate_participant') THEN
    RAISE EXCEPTION 'v1.5-2: rpc_match_reactivate_participant still exists (should be dropped)';
  END IF;

  RAISE NOTICE 'v1.5-2 complete: all RPC rewrites applied (re-entry, unified guest manual, manual_confirm scope+log)';
END $$;

COMMIT;
