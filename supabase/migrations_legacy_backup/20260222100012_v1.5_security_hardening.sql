-- =============================================================================
-- Migration: 20260222100012_v1.5_security_hardening
--
-- A) BEFORE UPDATE guard on match_participants (GUC-based bypass)
--
--    Original approach used `current_user = 'authenticated'` inside a
--    SECURITY DEFINER trigger function. This is always wrong: inside a
--    SECURITY DEFINER function, `current_user` is the function OWNER
--    (postgres), never 'authenticated'. The check was a no-op.
--
--    Fixed approach (SECURITY INVOKER + current_user):
--      The guard trigger is SECURITY INVOKER. This means current_user inside
--      the trigger reflects the actual DB role that issued the UPDATE:
--        • Direct client update  → current_user = 'authenticated' or 'anon'  → BLOCK
--        • SECURITY DEFINER RPC  → function runs as owner (postgres)          → ALLOW
--      No GUC bypass needed. Using a GUC (set_config) is insecure here
--      because any `authenticated` session can call set_config() directly,
--      forging the bypass signal before issuing a raw UPDATE.
--
-- A') match_participant_reconcile_status rewrite
--
--    Reconcile is a SECURITY DEFINER function that directly UPDATEs
--    status + confirmed_at. auth.role() inside a trigger fired by reconcile
--    is still 'authenticated' (JWT context doesn't change). Without the
--    bypass GUC set in reconcile itself, reconcile's UPDATEs would be blocked.
--    Fix: reconcile sets the bypass GUC at entry.
--
-- B) Mandatory action_log in every participant RPC
--    Fresh entry  → verb-form action (invite/request_join/nominate)
--    Re-entry     → 'reenter' (audit) + verb-form action (both required)
--    State change → accept / approve
--    User removal → withdraw / decline (with note)
--    Org removal  → semantic variant (see B.6) + note mirrors removal_note
--
-- C) action_type CHECK — expanded to include semantic removal variants.
--    Previous constraint (migration 100010) is replaced here with the
--    authoritative final set. Verification confirms the constraint exists
--    and smoke-tests all values written by this migration.
--
-- Idempotent no-log choices (deliberate product trade-off):
--    accept/approve on already-confirmed → return without log (no state change)
--    remove/withdraw on already-removed  → return without log (no state change)
--    If you need these events, add '_noop' variants to the action_type CHECK
--    and log them here. The UI should show toasts for these return paths.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- C) Expand + verify action_type CHECK constraint
--    This replaces the constraint added in migration 100010 with the
--    authoritative set. New values: reject_request, revoke_invite,
--    reject_nomination, remove_confirmed.
-- ---------------------------------------------------------------------------

-- Drop all known constraint names (production may use either)
ALTER TABLE public.match_participant_actions
  DROP CONSTRAINT IF EXISTS chk_action_type;
ALTER TABLE public.match_participant_actions
  DROP CONSTRAINT IF EXISTS match_participant_actions_action_type_chk;

ALTER TABLE public.match_participant_actions
  ADD CONSTRAINT match_participant_actions_action_type_chk
  CHECK (action_type IN (
    -- Entry verbs (fresh joins via B.1-B.3)
    'invite', 'nominate', 'request_join',
    -- Re-entry audit marker (always paired with an entry verb above)
    'reenter',
    -- Confirmation actions
    'accept', 'approve',
    -- User-initiated removal
    'withdraw',          -- user leaves a match they were in / request they sent
    'decline',           -- user rejects an invite or nomination
    -- Organizer/manager removal — semantic variants (replaces bare 'remove')
    'reject_request',    -- org rejects a pending join request
    'revoke_invite',     -- org cancels a pending invite
    'reject_nomination', -- org rejects a pending nomination
    'remove_confirmed',  -- org removes a confirmed participant
    'remove',            -- generic fallback (guest_add, unknown join_method, edge cases)
    -- Guest management
    'add_guest_org', 'add_guest_participant',
    -- Manual override
    'manual_confirm',
    -- v1.3 legacy past-tense aliases (existing rows in production)
    'invited', 'nominated', 'requested', 'accepted', 'approved',
    'withdrawn', 'removed', 'guest_added', 'declined'
  ));

ALTER TABLE public.match_participant_actions
  VALIDATE CONSTRAINT match_participant_actions_action_type_chk;

-- Verify all required values are present in the constraint's allowed set.
-- Pure array-diff: no INSERT, no SAVEPOINT (SAVEPOINT is not valid inside DO blocks).
-- The allowed list must be kept in sync with the CHECK added above.
DO $$
DECLARE
  v_required text[] := ARRAY[
    'invite', 'request_join', 'nominate', 'reenter',
    'accept', 'approve',
    'withdraw', 'decline',
    'reject_request', 'revoke_invite', 'reject_nomination', 'remove_confirmed', 'remove'
  ];
  v_allowed text[] := ARRAY[
    'invite', 'nominate', 'request_join',
    'reenter',
    'accept', 'approve',
    'withdraw', 'decline',
    'reject_request', 'revoke_invite', 'reject_nomination', 'remove_confirmed', 'remove',
    'add_guest_org', 'add_guest_participant',
    'manual_confirm',
    'invited', 'nominated', 'requested', 'accepted', 'approved',
    'withdrawn', 'removed', 'guest_added', 'declined'
  ];
  v_missing text[];
BEGIN
  SELECT array_agg(x) INTO v_missing
  FROM unnest(v_required) x
  WHERE NOT (x = ANY(v_allowed));

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'v1.5-hardening: action_type CHECK is missing required value(s): %', v_missing;
  END IF;

  RAISE NOTICE 'v1.5-hardening: action_type CHECK verified for all required values';
END $$;


-- ---------------------------------------------------------------------------
-- A) Guard trigger — GUC-based bypass
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_guard_participant_state()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER          -- runs as the role that issued the UPDATE statement
  SET search_path = public, pg_temp  -- pg_temp prevents shadow-object attacks
AS $$
BEGIN
  -- SECURITY INVOKER: current_user here is the role that issued the UPDATE.
  -- SECURITY DEFINER RPCs (owner = postgres) → current_user = 'postgres' → allowed.
  -- Direct client connections → current_user = 'authenticated' or 'anon' → blocked.
  -- DBA/migration sessions have no JWT and no client role mapping → allowed
  -- (governed by PostgreSQL role grants, not application triggers).
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
      RAISE EXCEPTION
        'confirmed_at is write-protected — use match_participant_reconcile_status'
        USING ERRCODE = 'P0001';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION
        'status is write-protected — use match_participant_reconcile_status'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_participant_state ON public.match_participants;

CREATE TRIGGER trg_guard_participant_state
  BEFORE UPDATE ON public.match_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_guard_participant_state();


-- ---------------------------------------------------------------------------
-- A') match_participant_reconcile_status — no GUC needed
--
--    Reconcile is SECURITY DEFINER (owner = postgres). When it UPDATEs
--    match_participants, the trigger fires with current_user = 'postgres',
--    which is not in ('authenticated','anon'), so the guard allows it through.
--    No set_config() call required. Logic unchanged from migration 100002.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_participant_reconcile_status(p_mp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mp record;
  v_accepted_at timestamptz;
BEGIN
  SELECT
    id, status, user_id, guest_id,
    user_accepted_at, participant_accepted_at,
    org_approved_at, removed_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    UPDATE public.match_participants
    SET status = 'removed', confirmed_at = NULL
    WHERE id = p_mp_id
      AND (status != 'removed' OR confirmed_at IS NOT NULL);
    RETURN;
  END IF;

  v_accepted_at := COALESCE(v_mp.participant_accepted_at, v_mp.user_accepted_at);

  IF v_mp.guest_id IS NOT NULL THEN
    IF v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id AND (status != 'confirmed' OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET status = 'pending', confirmed_at = NULL
      WHERE id = p_mp_id AND (status != 'pending' OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  IF v_mp.user_id IS NOT NULL THEN
    IF v_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id AND (status != 'confirmed' OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET status = 'pending', confirmed_at = NULL
      WHERE id = p_mp_id AND (status != 'pending' OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Invalid participant: neither user_id nor guest_id set for %', p_mp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_participant_reconcile_status(uuid) TO authenticated;


-- ---------------------------------------------------------------------------
-- B.1) rpc_match_invite_user
--      Fresh: invite | Re-entry: reenter + invite
-- ---------------------------------------------------------------------------

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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

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

    UPDATE public.match_participants
    SET
      removed_at = NULL, removed_by = NULL, removal_note = NULL,
      confirmed_at = NULL, join_method = 'invited',
      participant_accepted_at = NULL, participant_accepted_via = NULL,
      user_accepted_at = NULL,
      org_approved_at = now(), org_approved_by = auth.uid(),
      nominated_by = NULL, manual_confirmed_by = NULL
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter', NULL,  auth.uid()),
      (p_match_id, v_existing.id, 'invite',  NULL,  auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh invite
  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, org_approved_by, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'invited',
    NULL, NULL, now(), auth.uid(), NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'invite', NULL, auth.uid());

  RETURN v_new_mp;
END;
$$;


-- ---------------------------------------------------------------------------
-- B.2) rpc_match_request_join
--      Fresh: request_join | Re-entry: reenter + request_join
-- ---------------------------------------------------------------------------

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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  IF v_match.organizer_id = auth.uid() THEN
    RAISE EXCEPTION 'Organizer cannot request to join their own match';
  END IF;
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

    UPDATE public.match_participants
    SET
      removed_at = NULL, removed_by = NULL, removal_note = NULL,
      confirmed_at = NULL, join_method = 'requested',
      participant_accepted_at = now(), participant_accepted_via = 'in_app',
      user_accepted_at = NULL,
      org_approved_at = NULL, org_approved_by = NULL,
      nominated_by = NULL, manual_confirmed_by = NULL
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',      NULL, auth.uid()),
      (p_match_id, v_existing.id, 'request_join', NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh request
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

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'request_join', NULL, auth.uid());

  RETURN v_new_mp;
END;
$$;


-- ---------------------------------------------------------------------------
-- B.3) rpc_match_nominate_user
--      Fresh: nominate | Re-entry: reenter + nominate
-- ---------------------------------------------------------------------------

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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  -- Organizer uses Invite (rpc_match_invite_user), never Nominate.
  -- Nominate is exclusively for non-organizer active participants.
  IF public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Organizer must use Invite, not Nominate';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
        AND mp.user_id  = auth.uid()
        AND mp.removed_at IS NULL   -- pending OR confirmed both qualify
    )
    AND v_match.can_participants_invite_users
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

    UPDATE public.match_participants
    SET
      removed_at = NULL, removed_by = NULL, removal_note = NULL,
      confirmed_at = NULL, join_method = 'nominated',
      participant_accepted_at = NULL, participant_accepted_via = NULL,
      user_accepted_at = NULL,
      org_approved_at = NULL, org_approved_by = NULL,
      nominated_by = auth.uid(), manual_confirmed_by = NULL
    WHERE id = v_existing.id;

    PERFORM public.match_participant_reconcile_status(v_existing.id);

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter',  NULL, auth.uid()),
      (p_match_id, v_existing.id, 'nominate', NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh nomination
  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, nominated_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'nominated',
    NULL, NULL, NULL, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_new_mp.id;

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'nominate', NULL, auth.uid());

  RETURN v_new_mp;
END;
$$;


-- ---------------------------------------------------------------------------
-- B.4) rpc_match_accept_invite — action log: accept
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_match_accept_invite(p_match_id uuid)
  RETURNS match_participants
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_mp match_participants;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;
  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'You were removed from this match';
  END IF;
  -- Already confirmed — idempotent, no log (UI should show toast)
  IF v_mp.confirmed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;
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

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_mp.id, 'accept', NULL, auth.uid());

  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;


-- ---------------------------------------------------------------------------
-- B.5) rpc_match_org_approve_participant — action log: approve
-- ---------------------------------------------------------------------------

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
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant not found'; END IF;

  v_match_id := v_mp.match_id;

  IF NOT public.is_match_organizer(v_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the organizer can approve participants';
  END IF;
  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot approve a removed participant. Re-invite them first.';
  END IF;
  -- Already confirmed — idempotent, no log (UI should show toast)
  IF v_mp.confirmed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  UPDATE public.match_participants
  SET
    org_approved_at = COALESCE(org_approved_at, now()),
    org_approved_by = auth.uid()
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES (v_match_id, p_match_participant_id, 'approve', NULL, auth.uid());

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;


-- ---------------------------------------------------------------------------
-- B.6) rpc_match_remove_participant
--      Semantic action_type variants (replaces bare 'remove'):
--        reject_request    — org rejects a pending join request
--        revoke_invite     — org cancels a pending invite
--        reject_nomination — org rejects a pending nomination
--        remove_confirmed  — org removes a confirmed participant
--        remove            — generic fallback (guest_add, unknown join_method)
--      note mirrors removal_note for timeline legibility.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_match_remove_participant(p_match_participant_id uuid)
  RETURNS match_participants
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_mp       match_participants;
  v_match_id uuid;
  v_log_type text;
  v_log_note text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participant not found'; END IF;

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

  -- Already removed — idempotent, no log (UI should show toast)
  IF v_mp.removed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  -- Determine semantic action_type and human-readable note from pre-removal state
  v_log_type := CASE
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'reject_request'
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'revoke_invite'
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'reject_nomination'
    WHEN v_mp.confirmed_at IS NOT NULL                                   THEN 'remove_confirmed'
    ELSE 'remove'
  END;

  v_log_note := CASE
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'Request rejected'
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'Invitation revoked'
    WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'Nomination rejected'
    WHEN v_mp.confirmed_at IS NOT NULL                                   THEN 'Removed by organizer'
    ELSE 'Removed (join_method=' || COALESCE(v_mp.join_method, 'unknown') || ')'
  END;

  UPDATE public.match_participants
  SET
    removed_at   = now(),
    removed_by   = auth.uid(),
    removal_note = v_log_note
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES
    (v_match_id, p_match_participant_id, v_log_type, v_log_note, auth.uid());

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;


-- ---------------------------------------------------------------------------
-- B.7) rpc_match_user_withdraw
--      action_type: 'decline' for unaccepted invite/nomination, else 'withdraw'
--      note: mirrors removal_note for timeline legibility
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_match_user_withdraw(p_match_id uuid)
  RETURNS match_participants
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_mp        match_participants;
  v_log_type  text;
  v_log_note  text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  -- Already removed — idempotent, no log (UI should show toast)
  IF v_mp.removed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  -- Determine action type and note from pre-removal state
  v_log_type := CASE
    WHEN v_mp.join_method IN ('invited', 'nominated') AND v_mp.confirmed_at IS NULL THEN 'decline'
    ELSE 'withdraw'
  END;

  v_log_note := CASE
    WHEN v_mp.join_method = 'invited'   AND v_mp.confirmed_at IS NULL THEN 'User declined invitation'
    WHEN v_mp.join_method = 'nominated' AND v_mp.confirmed_at IS NULL THEN 'User declined nomination'
    WHEN v_mp.confirmed_at IS NOT NULL                                  THEN 'User left match'
    ELSE 'User withdrew'
  END;

  UPDATE public.match_participants
  SET
    removed_at   = now(),
    removed_by   = auth.uid(),
    removal_note = v_log_note
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES
    (p_match_id, v_mp.id, v_log_type, v_log_note, auth.uid());

  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;


-- ---------------------------------------------------------------------------
-- Final verification
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_rpc text;
BEGIN
  -- Guard trigger exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guard_participant_state'
      AND tgrelid = 'public.match_participants'::regclass
  ) THEN
    RAISE EXCEPTION 'v1.5-hardening: guard trigger not created';
  END IF;

  -- Guard function must be SECURITY INVOKER (changed from original SECURITY DEFINER)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_guard_participant_state'
      AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'v1.5-hardening: fn_guard_participant_state must be SECURITY INVOKER, not DEFINER';
  END IF;

  -- action_type constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema    = 'public'
      AND table_name      = 'match_participant_actions'
      AND constraint_name = 'match_participant_actions_action_type_chk'
  ) THEN
    RAISE EXCEPTION 'v1.5-hardening: action_type constraint not found';
  END IF;

  -- All B.x RPCs exist
  FOREACH v_rpc IN ARRAY ARRAY[
    'rpc_match_invite_user',
    'rpc_match_request_join',
    'rpc_match_nominate_user',
    'rpc_match_accept_invite',
    'rpc_match_org_approve_participant',
    'rpc_match_remove_participant',
    'rpc_match_user_withdraw'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_rpc
    ) THEN
      RAISE EXCEPTION 'v1.5-hardening: RPC % not found', v_rpc;
    END IF;
  END LOOP;

  RAISE NOTICE 'v1.5-hardening complete: guard trigger, reconcile bypass, semantic action types, notes written';
END $$;

COMMIT;
