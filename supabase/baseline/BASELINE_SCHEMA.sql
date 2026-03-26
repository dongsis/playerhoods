-- Baseline schema layer
-- Baseline commit: 03522d7
-- Baseline patch: 20260328153000_staging_gate_fix_invitation_get_and_guest_ambiguity.sql
-- Bootstrap dependencies for empty-db execution.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE SCHEMA IF NOT EXISTS "auth";
CREATE TABLE IF NOT EXISTS "auth"."users" (
    "id" "uuid" NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE OR REPLACE FUNCTION "auth"."uid"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."group_member_status" AS ENUM (
    'pending',
    'active',
    'removed'
);


ALTER TYPE "public"."group_member_status" OWNER TO "postgres";


CREATE TYPE "public"."match_admission_mode" AS ENUM (
    'invite',
    'request'
);


ALTER TYPE "public"."match_admission_mode" OWNER TO "postgres";


CREATE TYPE "public"."match_join_method" AS ENUM (
    'invited',
    'requested',
    'guest_add',
    'nominated',
    'manual'
);


ALTER TYPE "public"."match_join_method" OWNER TO "postgres";


CREATE TYPE "public"."match_participant_status" AS ENUM (
    'pending',
    'confirmed',
    'removed'
);


ALTER TYPE "public"."match_participant_status" OWNER TO "postgres";


CREATE TYPE "public"."match_status" AS ENUM (
    'active',
    'cancelled',
    'archived'
);


ALTER TYPE "public"."match_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.match_participants
  SET
    participant_accepted_at  = now(),
    participant_accepted_via = CASE WHEN p_is_self THEN 'in_app' ELSE 'delegate_manual' END,
    manual_confirmed_by     = CASE WHEN p_is_self THEN NULL ELSE p_actor_id END
  WHERE id = p_mp_id;

  PERFORM public.match_participant_reconcile_status(p_mp_id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  SELECT mp.match_id, p_mp_id, p_action_type, NULL, p_actor_id
  FROM public.match_participants mp
  WHERE mp.id = p_mp_id;
END;
$$;


ALTER FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") IS 'Phase 4A: Internal write core for participant-side acceptance. Self: in_app, manual_confirmed_by=NULL. Delegate: delegate_manual, manual_confirmed_by=actor.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."match_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "status" "public"."match_participant_status" DEFAULT 'pending'::"public"."match_participant_status" NOT NULL,
    "join_method" "public"."match_join_method" NOT NULL,
    "user_id" "uuid",
    "guest_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone,
    "removed_at" timestamp with time zone,
    "org_approved_at" timestamp with time zone,
    "org_approved_by" "uuid",
    "nominated_by" "uuid",
    "removed_by" "uuid",
    "removal_note" "text",
    "participant_accepted_at" timestamp with time zone,
    "participant_accepted_via" "text",
    "manual_confirmed_by" "uuid",
    CONSTRAINT "chk_participant_accepted_via" CHECK ((("participant_accepted_via" IS NULL) OR ("participant_accepted_via" = ANY (ARRAY['in_app'::"text", 'manual'::"text", 'delegate_manual'::"text", 'email_invitation'::"text"])))),
    CONSTRAINT "match_participants_exactly_one_identity" CHECK (((("user_id" IS NOT NULL) AND ("guest_id" IS NULL)) OR (("user_id" IS NULL) AND ("guest_id" IS NOT NULL))))
);


ALTER TABLE "public"."match_participants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."match_participants"."org_approved_at" IS 'v1.3: Timestamp when organizer approved this participant. NULL = not yet approved. Required for all participants to become confirmed.';



COMMENT ON COLUMN "public"."match_participants"."org_approved_by" IS 'v1.3: User ID of the organizer who approved this participant. NULL if not yet approved.';



COMMENT ON COLUMN "public"."match_participants"."nominated_by" IS 'v1.3: User ID of the participant who nominated this user (for join_method=requested with nomination). NULL if not nominated or if direct request/invite.';



COMMENT ON COLUMN "public"."match_participants"."removed_by" IS 'v1.3 CRITICAL: User ID who removed this participant. Must be set when status=removed. Used to distinguish user-withdrawal vs org-removal for reactivation logic.';



COMMENT ON COLUMN "public"."match_participants"."removal_note" IS 'v1.3: Optional note explaining why participant was removed (e.g., "declined", "rejected", "capacity reached").';



COMMENT ON COLUMN "public"."match_participants"."participant_accepted_at" IS 'v1.5: Participant-side confirmation timestamp. Replaces user_accepted_at. Written by: rpc_match_accept_invite (in_app), rpc_match_manual_confirm (manual). Never written directly by UI or non-RPC code.';



COMMENT ON COLUMN "public"."match_participants"."participant_accepted_via" IS 'v1.5: How participant confirmed. in_app = user clicked Accept; manual = organizer confirmed on their behalf. Must be set whenever participant_accepted_at is set. Cleared on reconfirm.';



COMMENT ON COLUMN "public"."match_participants"."manual_confirmed_by" IS 'v1.5: User ID of organizer who manually confirmed this participant. Set only when participant_accepted_via = ''manual''. Cleared on reconfirm.';



CREATE OR REPLACE FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") IS 'Internal helper: centralizes admission write (fresh + re-entry) for request_join, invite, nominate. Re-entry uses removed_at IS NOT NULL (canonical).';



CREATE OR REPLACE FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text" DEFAULT NULL::"text") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp       public.match_participants%rowtype;
  v_log_type text;
  v_log_note text;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id_required';
  END IF;

  IF p_exit_kind IS NULL OR p_exit_kind NOT IN ('remove', 'withdraw') THEN
    RAISE EXCEPTION 'exit_kind_must_be_remove_or_withdraw';
  END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found';
  END IF;

  -- Idempotent: already removed — return current row without logging
  IF v_mp.removed_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  -- Derive action_type and removal_note from participant state and exit_kind
  IF p_removal_note IS NOT NULL THEN
    v_log_note := p_removal_note;
    -- action_type still derived for action log
    IF p_exit_kind = 'remove' THEN
      v_log_type := CASE
        WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'reject_request'
        WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'revoke_invite'
        WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'reject_nomination'
        WHEN v_mp.confirmed_at IS NOT NULL                                 THEN 'remove_confirmed'
        ELSE 'remove'
      END;
    ELSE
      v_log_type := CASE
        WHEN v_mp.join_method IN ('invited', 'nominated') AND v_mp.confirmed_at IS NULL THEN 'decline'
        ELSE 'withdraw'
      END;
    END IF;
  ELSIF p_exit_kind = 'remove' THEN
    v_log_type := CASE
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'reject_request'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'revoke_invite'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'reject_nomination'
      WHEN v_mp.confirmed_at IS NOT NULL                                 THEN 'remove_confirmed'
      ELSE 'remove'
    END;
    v_log_note := CASE
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'requested'  THEN 'Request rejected'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'invited'    THEN 'Invitation revoked'
      WHEN v_mp.confirmed_at IS NULL AND v_mp.join_method = 'nominated'  THEN 'Nomination rejected'
      WHEN v_mp.confirmed_at IS NOT NULL                                 THEN 'Removed by organizer'
      ELSE 'Removed (join_method=' || COALESCE(v_mp.join_method::text, 'unknown') || ')'
    END;
  ELSE
    -- p_exit_kind = 'withdraw'
    v_log_type := CASE
      WHEN v_mp.join_method IN ('invited', 'nominated') AND v_mp.confirmed_at IS NULL THEN 'decline'
      ELSE 'withdraw'
    END;
    v_log_note := CASE
      WHEN v_mp.join_method = 'invited'   AND v_mp.confirmed_at IS NULL THEN 'User declined invitation'
      WHEN v_mp.join_method = 'nominated' AND v_mp.confirmed_at IS NULL THEN 'User declined nomination'
      WHEN v_mp.confirmed_at IS NOT NULL                                THEN 'User left match'
      ELSE 'User withdrew'
    END;
  END IF;

  UPDATE public.match_participants
  SET
    removed_at   = now(),
    removed_by   = p_actor_id,
    removal_note = v_log_note
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions
    (match_id, match_participant_id, action_type, note, created_by)
  VALUES
    (v_mp.match_id, p_match_participant_id, v_log_type, v_log_note, p_actor_id);

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;


ALTER FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text") IS 'Internal helper: centralizes participant exit write (removed_at, removed_by, removal_note), reconcile, action log. exit_kind: remove | withdraw. Callers: rpc_match_remove_participant, rpc_match_user_withdraw.';



CREATE OR REPLACE FUNCTION "public"."can_add_guests"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_match_organizer(p_match_id, p_user_id)
    or (
      exists (select 1 from public.matches m where m.id = p_match_id and m.can_participants_add_guests = true)
      and public.is_match_participant_confirmed(p_match_id, p_user_id)
    );
$$;


ALTER FUNCTION "public"."can_add_guests"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") IS 'Phase 1: Unified predicate for match admission. Re-entry uses removed_at IS NOT NULL (canonical). Path B (non-group): two-layer preferences.';



CREATE OR REPLACE FUNCTION "public"."can_invite_users"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_match_organizer(p_match_id, p_user_id)
    or (
      exists (select 1 from public.matches m where m.id = p_match_id and m.can_participants_invite_users = true)
      and public.is_match_participant_confirmed(p_match_id, p_user_id)
    );
$$;


ALTER FUNCTION "public"."can_invite_users"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_participants"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    public.is_match_organizer(p_match_id, p_user_id)
    or (
      exists (select 1 from public.matches m where m.id = p_match_id and m.can_participants_manage_participants = true)
      and public.is_match_participant_confirmed(p_match_id, p_user_id)
    );
$$;


ALTER FUNCTION "public"."can_manage_participants"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_match_start_at_utc"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_timezone text;
BEGIN
  SELECT timezone INTO v_timezone
  FROM public.clubs
  WHERE id = NEW.club_id;

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'Club timezone not found';
  END IF;

  NEW.start_at_utc :=
    (
      (NEW.match_date::text || ' ' || NEW.start_time::text)::timestamp
      AT TIME ZONE v_timezone
    );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."compute_match_start_at_utc"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm_a
    JOIN public.group_members gm_b
      ON gm_a.group_id = gm_b.group_id
    JOIN public.groups g
      ON g.id = gm_a.group_id
    WHERE gm_a.user_id = p_user_a AND gm_a.status = 'active'
      AND gm_b.user_id = p_user_b AND gm_b.status = 'active'
      AND g.group_kind = 'friend'
  );
$$;


ALTER FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") IS 'v1.6.3: Returns true if both users are active members of at least one common friend group (group_kind=friend). SECURITY DEFINER. Not granted to authenticated directly.';



CREATE OR REPLACE FUNCTION "public"."fn_emit_match_formed_on_formed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_evt_id uuid;
BEGIN
  IF OLD.formed_at IS NULL AND NEW.formed_at IS NOT NULL THEN
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES (
      'match.formed',
      'match',
      NEW.id,
      NULL,
      jsonb_build_object(
        'match_id', NEW.id,
        'game_type', NEW.game_type,
        'match_date', NEW.match_date,
        'club_name', (SELECT c.name FROM public.clubs c WHERE c.id = NEW.club_id),
        'required_count', NEW.required_count
      )
    )
    RETURNING id INTO v_evt_id;
    PERFORM public.rpc_process_domain_event(v_evt_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_emit_match_formed_on_formed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_guard_participant_state"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."fn_guard_participant_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_match_detail_change_reconfirm"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
        manual_confirmed_by     = NULL,
        confirmed_at            = NULL
      WHERE mp.match_id = NEW.id
        AND mp.removed_at IS NULL
        AND mp.confirmed_at IS NOT NULL
        AND (mp.user_id IS NULL OR mp.user_id IS DISTINCT FROM NEW.organizer_id)
      RETURNING mp.id
    LOOP
      PERFORM public.match_participant_reconcile_status(v_id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_match_detail_change_reconfirm"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_match_detail_change_reconfirm"() IS 'v1.7: On match schedule/location change, reset all confirmed participants (users and contact players/guests) to pending. Organizer row excluded. org_approved_at preserved; reconcile derives status.';



CREATE OR REPLACE FUNCTION "public"."group_boundary_keeper_id"("p_group_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select g.boundary_keeper_id
  from public.groups g
  where g.id = p_group_id
$$;


ALTER FUNCTION "public"."group_boundary_keeper_id"("p_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Guard: skip if id is null (defensive against edge-case auth providers)
  IF NEW.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id = auth.uid()
      AND mp.status = 'confirmed'
  );
END;
$$;


ALTER FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") IS 'v1.7: True if caller has a confirmed participant row in this match. Used for RLS.';



CREATE OR REPLACE FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.is_user_in_match_scope(p_match_id, auth.uid());
END;
$$;


ALTER FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") IS 'v1.5: Self-only scope check. Equivalent to is_user_in_match_scope(match_id, auth.uid()). Granted to authenticated for direct RPC use. Replaces the two-arg oracle-risk version for all TypeScript/client-facing calls.';



CREATE OR REPLACE FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.is_user_match_associated(p_match_id, auth.uid());
END;
$$;


ALTER FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_club_admin"("p_club_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
      OR EXISTS (SELECT 1 FROM public.club_admins WHERE club_id = p_club_id AND user_id = auth.uid())
$$;


ALTER FUNCTION "public"."is_club_admin"("p_club_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_active_member"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_group_active_member"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_active_member_any"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_group_active_member_any"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_member_any"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
      and gm.status in ('pending','active')
  );
$$;


ALTER FUNCTION "public"."is_group_member_any"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT FALSE;
$$;


ALTER FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_match_organizer"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id AND m.organizer_id = p_user_id
  );
END;
$$;


ALTER FUNCTION "public"."is_match_organizer"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_match_participant_active"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = p_user_id
      and mp.status in ('pending','confirmed')
  );
$$;


ALTER FUNCTION "public"."is_match_participant_active"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_match_participant_confirmed"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = p_match_id
      and mp.user_id = p_user_id
      and mp.status = 'confirmed'
  );
$$;


ALTER FUNCTION "public"."is_match_participant_confirmed"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_in_match_scope"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.id = p_match_id
      AND EXISTS (
        SELECT 1
        FROM unnest(m.invitation_scope_group_ids) AS gid
        WHERE public.is_group_active_member(gid, p_user_id)
      )
  );
END;
$$;


ALTER FUNCTION "public"."is_user_in_match_scope"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = ANY(p_scope_group_ids)
      AND gm.user_id  = p_user_id
      AND gm.status   = 'active'
  );
$$;


ALTER FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") IS 'v1.5: Internal scope membership predicate. Checks user is active member of ANY of the given groups. SECURITY DEFINER + row_security=off. NOT granted to authenticated — internal RPC use only.';



CREATE OR REPLACE FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id  = p_user_id
      AND mp.removed_at IS NULL
  );
$$;


ALTER FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") IS 'v1.6.3: Returns true if user has an active (non-removed) participant row. removed_at IS NULL is canonical; removed participants are NOT match-associated.';



CREATE OR REPLACE FUNCTION "public"."log_participant_action"("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text" DEFAULT NULL::"text", "p_created_by" "uuid" DEFAULT "auth"."uid"()) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match_id uuid;
BEGIN
  -- Derive match_id from match_participants (guarantees consistency)
  SELECT match_id INTO v_match_id
  FROM match_participants WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found for action log', p_match_participant_id;
  END IF;

  INSERT INTO match_participant_actions (
    match_id, match_participant_id, action_type, note, created_by
  ) VALUES (
    v_match_id, p_match_participant_id, p_action_type, p_note, p_created_by
  );
END;
$$;


ALTER FUNCTION "public"."log_participant_action"("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text", "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_organizer_id"("p_match_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_organizer_id uuid;
BEGIN
  SELECT m.organizer_id INTO v_organizer_id
  FROM public.matches m
  WHERE m.id = p_match_id;
  RETURN v_organizer_id;
END;
$$;


ALTER FUNCTION "public"."match_organizer_id"("p_match_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp record;
  v_accepted_at timestamptz;
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

  v_accepted_at := v_mp.participant_accepted_at;

  IF v_mp.status = 'removed'::public.match_participant_status THEN
    UPDATE public.match_participants
    SET confirmed_at = NULL,
        removed_at   = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (confirmed_at IS NOT NULL OR removed_at IS NULL);
    RETURN;
  END IF;

  IF v_mp.guest_id IS NOT NULL THEN
    IF v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed'::public.match_participant_status,
          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (status != 'confirmed'::public.match_participant_status OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET status = 'pending'::public.match_participant_status,
          confirmed_at = NULL
      WHERE id = p_mp_id
        AND (status != 'pending'::public.match_participant_status OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  IF v_mp.user_id IS NOT NULL THEN
    IF v_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL THEN
      UPDATE public.match_participants
      SET status = 'confirmed'::public.match_participant_status,
          confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = p_mp_id
        AND (status != 'confirmed'::public.match_participant_status OR confirmed_at IS NULL);
    ELSE
      UPDATE public.match_participants
      SET status = 'pending'::public.match_participant_status,
          confirmed_at = NULL
      WHERE id = p_mp_id
        AND (status != 'pending'::public.match_participant_status OR confirmed_at IS NOT NULL);
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Invalid participant: neither user_id nor guest_id set for %', p_mp_id;
END;
$$;


ALTER FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") IS 'v1.7: removed_at is canonical for removed; status=removed alone is not (allows re-entry to set pending). confirmed ⇔ participant_accepted_at AND org_approved_at.';



CREATE OR REPLACE FUNCTION "public"."rpc_admin_user_search"("p_query" "text") RETURNS TABLE("user_id" "uuid", "display_name" "text", "email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  p_query := trim(coalesce(p_query, ''));
  IF length(p_query) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.display_name,
    u.email::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE
    p.display_name ILIKE '%' || p_query || '%'
    OR u.email ILIKE '%' || p_query || '%'
  ORDER BY (p.display_name IS NULL), p.display_name, u.email
  LIMIT 20;
END;
$$;


ALTER FUNCTION "public"."rpc_admin_user_search"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_club_admin_grant"("p_user_id" "uuid", "p_club_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'club_not_found';
  END IF;

  INSERT INTO public.club_admins (user_id, club_id, granted_by)
  VALUES (p_user_id, p_club_id, auth.uid())
  ON CONFLICT (user_id, club_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."rpc_club_admin_grant"("p_user_id" "uuid", "p_club_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_club_admin_revoke"("p_user_id" "uuid", "p_club_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.club_admins
  WHERE user_id = p_user_id AND club_id = p_club_id;
END;
$$;


ALTER FUNCTION "public"."rpc_club_admin_revoke"("p_user_id" "uuid", "p_club_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clubs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "location_text" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'America/Toronto'::"text" NOT NULL
);


ALTER TABLE "public"."clubs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clubs"."timezone" IS 'IANA timezone identifier (e.g., America/Toronto). Authoritative timezone for matches at this club.';



CREATE OR REPLACE FUNCTION "public"."rpc_club_create"("p_name" "text", "p_location_text" "text" DEFAULT NULL::"text", "p_timezone" "text" DEFAULT 'America/Toronto'::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."clubs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_club public.clubs;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  INSERT INTO public.clubs (name, location_text, timezone, notes)
  VALUES (trim(p_name), p_location_text, COALESCE(NULLIF(trim(p_timezone), ''), 'America/Toronto'), p_notes)
  RETURNING * INTO v_club;

  RETURN v_club;
END;
$$;


ALTER FUNCTION "public"."rpc_club_create"("p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_club_handle_check"("p_club_id" "uuid", "p_handle" "text") RETURNS TABLE("available" boolean, "suggestions" "text"[])
    LANGUAGE "plpgsql" STABLE
    AS $$
DECLARE
  v_trimmed text;
  v_norm    text;
  v_taken   boolean;
  v_sugg    text[];
  v_cand    text;
  v_cand_n  text;
  i         int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := public.validate_club_handle(p_handle);
  v_norm    := lower(v_trimmed);

  SELECT EXISTS (
    SELECT 1 FROM public.club_identities
    WHERE club_id = p_club_id AND club_handle_norm = v_norm
  ) INTO v_taken;

  IF NOT v_taken THEN
    RETURN QUERY SELECT true, ARRAY[]::text[];
    RETURN;
  END IF;

  -- Try up to 5 candidates to find 3 available suggestions.
  -- Suggestions preserve user input case (e.g. "Alice1", not "alice1").
  v_sugg := ARRAY[]::text[];
  FOR i IN 1..5 LOOP
    v_cand   := v_trimmed || i::text;   -- preserves original case
    v_cand_n := lower(v_cand);          -- uniqueness check uses norm
    IF NOT EXISTS (
      SELECT 1 FROM public.club_identities
      WHERE club_id = p_club_id AND club_handle_norm = v_cand_n
    ) THEN
      v_sugg := v_sugg || v_cand;
    END IF;
    EXIT WHEN array_length(v_sugg, 1) >= 3;
  END LOOP;

  RETURN QUERY SELECT false, v_sugg;
END;
$$;


ALTER FUNCTION "public"."rpc_club_handle_check"("p_club_id" "uuid", "p_handle" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_club_handle_set"("p_club_id" "uuid", "p_new_handle" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_trimmed      text;
  v_norm         text;
  v_old_handle   text;
  v_old_norm     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := public.validate_club_handle(p_new_handle);
  v_norm    := lower(v_trimmed);

  -- Must be a member; fetch current handle + norm together
  SELECT club_handle, club_handle_norm
  INTO v_old_handle, v_old_norm
  FROM public.club_identities
  WHERE club_id = p_club_id AND user_id = auth.uid();

  IF v_old_handle IS NULL THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  -- Exact same handle (including case) → no-op
  IF v_trimmed = v_old_handle THEN
    RETURN;
  END IF;

  -- Check uniqueness when norm changes.
  IF v_norm <> v_old_norm AND EXISTS (
    SELECT 1 FROM public.club_identities
    WHERE club_id = p_club_id AND club_handle_norm = v_norm
  ) THEN
    RAISE EXCEPTION 'handle_taken';
  END IF;

  -- Update club_handle only — norm is auto-recomputed by the generated column
  UPDATE public.club_identities
  SET club_handle = v_trimmed
  WHERE club_id = p_club_id AND user_id = auth.uid();

  -- Removed: syncing profiles.display_name from club handle.
END;
$$;


ALTER FUNCTION "public"."rpc_club_handle_set"("p_club_id" "uuid", "p_new_handle" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_club_handle_set"("p_club_id" "uuid", "p_new_handle" "text") IS 'v1.6.3: Set club-scoped handle for current user. No longer mutates global profiles.display_name. Enforces per-club uniqueness on normalized handle.';



CREATE OR REPLACE FUNCTION "public"."rpc_club_identity_set_preferences"("p_club_id" "uuid", "p_visible_in_club_member_discovery" "text" DEFAULT NULL::"text", "p_accept_non_group_invites_in_club" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.club_identities
  SET
    visible_in_club_member_discovery = CASE
      WHEN p_visible_in_club_member_discovery = 'inherit' THEN NULL
      WHEN p_visible_in_club_member_discovery = 'true' THEN true
      WHEN p_visible_in_club_member_discovery = 'false' THEN false
      ELSE visible_in_club_member_discovery
    END,
    accept_non_group_invites_in_club = CASE
      WHEN p_accept_non_group_invites_in_club = 'inherit' THEN NULL
      WHEN p_accept_non_group_invites_in_club = 'true' THEN true
      WHEN p_accept_non_group_invites_in_club = 'false' THEN false
      ELSE accept_non_group_invites_in_club
    END
  WHERE club_id = p_club_id AND user_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_club_identity_set_preferences"("p_club_id" "uuid", "p_visible_in_club_member_discovery" "text", "p_accept_non_group_invites_in_club" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_club_identity_set_preferences"("p_club_id" "uuid", "p_visible_in_club_member_discovery" "text", "p_accept_non_group_invites_in_club" "text") IS 'Phase 1: Set club-scoped preference overrides. Values: true|false|inherit. inherit = use global (NULL). Only updates own row.';



CREATE OR REPLACE FUNCTION "public"."rpc_club_join"("p_club_id" "uuid", "p_handle" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_trimmed      text;
  v_primary_club uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := public.validate_club_handle(p_handle);

  -- Club must exist
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'club_not_found';
  END IF;

  -- Profile row must exist (trigger creates it on signup; this is defensive)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN
    INSERT INTO public.profiles (id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  END IF;

  -- Prevent double-join
  IF EXISTS (
    SELECT 1 FROM public.club_identities
    WHERE club_id = p_club_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  -- Insert — club_handle_norm is GENERATED (lower(club_handle)), not specified
  -- UNIQUE constraint on (club_id, club_handle_norm) is the race-condition guard
  BEGIN
    INSERT INTO public.club_identities (club_id, user_id, club_handle)
    VALUES (p_club_id, auth.uid(), v_trimmed);
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'handle_taken';
  END;

  -- First club: set primary_club_id + display_name
  SELECT primary_club_id INTO v_primary_club
  FROM public.profiles WHERE id = auth.uid();

  IF v_primary_club IS NULL THEN
    UPDATE public.profiles
    SET primary_club_id = p_club_id,
        display_name    = v_trimmed
    WHERE id = auth.uid();
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_club_join"("p_club_id" "uuid", "p_handle" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_club_members_discovery"("p_club_id" "uuid", "p_search" "text" DEFAULT NULL::"text") RETURNS TABLE("user_id" "uuid", "display_name" "text", "avatar_url" "text", "club_handle" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_identities
    WHERE club_id = p_club_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'not_club_member';
  END IF;

  RETURN QUERY
  SELECT
    ci.user_id,
    p.display_name,
    p.avatar_url,
    ci.club_handle
  FROM public.club_identities ci
  JOIN public.profiles p ON p.id = ci.user_id
  WHERE ci.club_id = p_club_id
    AND ci.user_id <> v_uid
    AND p.show_in_club_member_discovery = true
    AND COALESCE(ci.visible_in_club_member_discovery, true) = true
    AND (
      p_search IS NULL
      OR p_search = ''
      OR p.display_name ILIKE '%' || trim(p_search) || '%'
      OR ci.club_handle ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.club_handle)) NULLS LAST,
           LOWER(ci.club_handle) NULLS LAST,
           ci.user_id;
END;
$$;


ALTER FUNCTION "public"."rpc_club_members_discovery"("p_club_id" "uuid", "p_search" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_club_members_discovery"("p_club_id" "uuid", "p_search" "text") IS 'Phase 1: Club Members discovery. Two-layer: profiles.show_in_club_member_discovery AND COALESCE(club_identities.visible_in_club_member_discovery, true). Caller must be club member.';



CREATE OR REPLACE FUNCTION "public"."rpc_club_update"("p_club_id" "uuid", "p_name" "text" DEFAULT NULL::"text", "p_location_text" "text" DEFAULT NULL::"text", "p_timezone" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_club_admin(p_club_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.clubs
  SET
    name           = COALESCE(p_name, name),
    location_text  = COALESCE(p_location_text, location_text),
    timezone       = COALESCE(p_timezone, timezone),
    notes          = COALESCE(p_notes, notes)
  WHERE id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'club_not_found';
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_club_update"("p_club_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_contact_player_resolution"() RETURNS TABLE("guest_id" "uuid", "display_name" "text", "email" "text", "phone" "text", "notes" "text", "linked_user_id" "uuid", "resolution_state" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    g.id AS guest_id,
    g.display_name,
    g.email,
    g.phone,
    g.notes,
    il.user_id AS linked_user_id,
    CASE WHEN il.user_id IS NOT NULL THEN 'linked_user'::text ELSE 'contact_only'::text END AS resolution_state
  FROM public.user_roster_guests urg
  JOIN public.guests g ON g.id = urg.guest_id
  LEFT JOIN public.identity_links il
    ON il.linked_type = 'contact' AND il.linked_id = g.id
  WHERE urg.owner_user_id = auth.uid()
  ORDER BY g.display_name, g.id;
END;
$$;


ALTER FUNCTION "public"."rpc_contact_player_resolution"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_contact_player_resolution"() IS 'Phase 2: Contact Player resolution. Returns caller roster guests with linked_user_id (nullable) and resolution_state (contact_only | linked_user). Single source for guest vs registered-user logic.';



CREATE TABLE IF NOT EXISTS "public"."courts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "court_code" "text" NOT NULL,
    "surface" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."courts" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_court_create"("p_club_id" "uuid", "p_court_code" "text", "p_surface" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."courts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_court public.courts;
BEGIN
  IF NOT public.is_club_admin(p_club_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_court_code IS NULL OR trim(p_court_code) = '' THEN
    RAISE EXCEPTION 'court_code_required';
  END IF;

  INSERT INTO public.courts (club_id, court_code, surface, notes)
  VALUES (p_club_id, trim(p_court_code), p_surface, p_notes)
  RETURNING * INTO v_court;

  RETURN v_court;
END;
$$;


ALTER FUNCTION "public"."rpc_court_create"("p_club_id" "uuid", "p_court_code" "text", "p_surface" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT club_id INTO v_club_id FROM public.courts WHERE id = p_court_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'court_not_found';
  END IF;

  IF NOT public.is_club_admin(v_club_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.courts WHERE id = p_court_id;
END;
$$;


ALTER FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_court_code" "text" DEFAULT NULL::"text", "p_surface" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_club_id uuid;
BEGIN
  SELECT club_id INTO v_club_id FROM public.courts WHERE id = p_court_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'court_not_found';
  END IF;

  IF NOT public.is_club_admin(v_club_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.courts
  SET
    court_code = COALESCE(p_court_code, court_code),
    surface    = COALESCE(p_surface, surface),
    notes      = COALESCE(p_notes, notes)
  WHERE id = p_court_id;
END;
$$;


ALTER FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_court_code" "text", "p_surface" "text", "p_notes" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inviter_user_id" "uuid" NOT NULL,
    "target_email" "text" NOT NULL,
    "target_name" "text",
    "related_type" "text" NOT NULL,
    "related_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "magic_link_flow_status" "text" DEFAULT 'not_opened'::"text" NOT NULL,
    "accepted_by_user_id" "uuid",
    "accepted_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "match_participant_id" "uuid",
    CONSTRAINT "email_invitations_magic_link_flow_status_check" CHECK (("magic_link_flow_status" = ANY (ARRAY['not_opened'::"text", 'opened'::"text", 'verified_email'::"text", 'landed'::"text"]))),
    CONSTRAINT "email_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."email_invitations" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_invitations" IS 'Email-based invitations. related_type=match for v1. Magic link verifies email; Accept/Decline on invitation page.';



CREATE OR REPLACE FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") RETURNS "public"."email_invitations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_user_email text;
  v_existing_mp uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_uid;
  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF v_inv.related_type = 'match' THEN
    SELECT mp.id INTO v_existing_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_inv.related_id AND mp.user_id = v_uid AND mp.removed_at IS NULL
    LIMIT 1;
    IF FOUND THEN
      UPDATE public.email_invitations SET status = 'accepted', accepted_by_user_id = v_uid, accepted_at = now(), updated_at = now()
      WHERE id = p_invitation_id AND status = 'pending';
      SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
      IF v_inv.status = 'accepted' THEN
        INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
        VALUES (v_inv.id, 'invitation_accepted', v_uid);
      END IF;
      PERFORM public.rpc_reconcile_identity_after_magic_link(v_uid, v_user_email, p_invitation_id);
      RETURN v_inv;
    END IF;
    PERFORM public.rpc_match_accept_email_invitation(v_inv.related_id, v_uid, p_invitation_id);
  END IF;

  UPDATE public.email_invitations
  SET status = 'accepted', accepted_by_user_id = v_uid, accepted_at = now(), updated_at = now()
  WHERE id = p_invitation_id AND status = 'pending';

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF v_inv.status = 'accepted' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_accepted', v_uid);
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES ('invitation.accepted', 'email_invitation', v_inv.id, v_uid, jsonb_build_object('invitation_id', v_inv.id, 'accepted_by_user_id', v_uid));
    PERFORM public.rpc_reconcile_identity_after_magic_link(v_uid, v_user_email, p_invitation_id);
  END IF;
  RETURN v_inv;
END;
$$;


ALTER FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") RETURNS "public"."email_invitations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_mp public.match_participants%rowtype;
  v_match_count int := 0;
  v_match_mp_id uuid := NULL;
BEGIN
  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  IF v_inv.expires_at IS NOT NULL AND v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  IF v_inv.related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF v_inv.match_participant_id IS NOT NULL THEN
    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_inv.match_participant_id
      AND removed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchored_participant_not_found';
    END IF;

    IF v_mp.match_id <> v_inv.related_id THEN
      RAISE EXCEPTION 'anchor_participant_match_mismatch';
    END IF;

    IF v_mp.guest_id IS NULL THEN
      RAISE EXCEPTION 'anchor_not_guest_participant';
    END IF;
  ELSE
    -- Use text cast for uuid min to avoid aggregate resolution errors.
    SELECT COUNT(*), MIN(mp.id::text)::uuid
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(coalesce(g.email, ''))) = lower(trim(v_inv.target_email));

    IF v_match_count = 0 THEN
      RAISE EXCEPTION 'participant_not_found_for_invitation';
    END IF;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'participant_ambiguous_for_invitation';
    END IF;

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_match_mp_id;

    UPDATE public.email_invitations
    SET match_participant_id = v_mp.id,
        updated_at = now()
    WHERE id = v_inv.id
      AND match_participant_id IS NULL;
  END IF;

  UPDATE public.match_participants
  SET participant_accepted_at = COALESCE(participant_accepted_at, now()),
      participant_accepted_via = COALESCE(participant_accepted_via, 'email_invitation')
  WHERE id = v_mp.id;

  PERFORM public.match_participant_reconcile_status(v_mp.id);

  UPDATE public.email_invitations
  SET status = 'accepted',
      accepted_at = COALESCE(accepted_at, now()),
      updated_at = now()
  WHERE id = v_inv.id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = v_inv.id;

  IF v_inv.status = 'accepted' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_accepted', NULL);
  END IF;

  RETURN v_inv;
END;
$$;


ALTER FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_email_invitation_create"("p_target_email" "text", "p_target_name" "text", "p_related_type" "text", "p_related_id" "uuid", "p_expires_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."email_invitations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_anchor_count int := 0;
  v_anchor_mp_id uuid := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_related_id AND m.organizer_id = v_uid) THEN
    RAISE EXCEPTION 'not_match_organizer';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_related_id AND m.status = 'active') THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  -- Use text cast for uuid min to avoid environment-specific aggregate resolution errors.
  SELECT COUNT(*), MIN(mp.id::text)::uuid
  INTO v_anchor_count, v_anchor_mp_id
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_related_id
    AND mp.removed_at IS NULL
    AND lower(trim(coalesce(g.email, ''))) = lower(trim(p_target_email));

  IF v_anchor_count > 1 THEN
    RAISE EXCEPTION 'anchor_ambiguous_guest_participant';
  END IF;

  IF v_anchor_count = 0 THEN
    v_anchor_mp_id := NULL;
  END IF;

  INSERT INTO public.email_invitations (
    inviter_user_id, target_email, target_name, related_type, related_id, expires_at, match_participant_id
  ) VALUES (
    v_uid, trim(lower(p_target_email)), NULLIF(trim(p_target_name), ''), p_related_type, p_related_id, p_expires_at, v_anchor_mp_id
  )
  RETURNING * INTO v_inv;

  INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
  VALUES (
    'invitation.email_invitation_created',
    'email_invitation',
    v_inv.id,
    v_uid,
    jsonb_build_object(
      'invitation_id', v_inv.id,
      'related_type', v_inv.related_type,
      'related_id', v_inv.related_id,
      'target_email', v_inv.target_email,
      'target_name', v_inv.target_name,
      'inviter_user_id', v_inv.inviter_user_id,
      'inviter_display_name', (SELECT display_name FROM public.profiles WHERE id = v_uid),
      'match_participant_id', v_inv.match_participant_id
    )
  );

  PERFORM public.rpc_process_domain_event((
    SELECT id
    FROM public.domain_events
    WHERE aggregate_id = v_inv.id
      AND event_type = 'invitation.email_invitation_created'
    ORDER BY created_at DESC
    LIMIT 1
  ));

  RETURN v_inv;
END;
$$;


ALTER FUNCTION "public"."rpc_email_invitation_create"("p_target_email" "text", "p_target_name" "text", "p_related_type" "text", "p_related_id" "uuid", "p_expires_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") RETURNS "public"."email_invitations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.email_invitations%rowtype;
  v_user_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_uid;
  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  UPDATE public.email_invitations
  SET status = 'declined', declined_at = now(), updated_at = now()
  WHERE id = p_invitation_id AND status = 'pending';

  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF v_inv.status = 'declined' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_declined', v_uid);
    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES ('invitation.declined', 'email_invitation', v_inv.id, v_uid, jsonb_build_object('invitation_id', v_inv.id));
  END IF;
  RETURN v_inv;
END;
$$;


ALTER FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") RETURNS "public"."email_invitations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_mp public.match_participants%rowtype;
  v_match_count int := 0;
  v_match_mp_id uuid := NULL;
BEGIN
  IF p_system_actor_id IS NULL THEN
    RAISE EXCEPTION 'system_actor_required';
  END IF;

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  IF v_inv.related_type <> 'match' THEN
    RAISE EXCEPTION 'related_type_not_supported';
  END IF;

  IF v_inv.match_participant_id IS NOT NULL THEN
    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_inv.match_participant_id
      AND removed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'anchored_participant_not_found';
    END IF;

    IF v_mp.match_id <> v_inv.related_id THEN
      RAISE EXCEPTION 'anchor_participant_match_mismatch';
    END IF;

    IF v_mp.guest_id IS NULL THEN
      RAISE EXCEPTION 'anchor_not_guest_participant';
    END IF;
  ELSE
    -- Use text cast for uuid min to avoid aggregate resolution errors.
    SELECT COUNT(*), MIN(mp.id::text)::uuid
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(coalesce(g.email, ''))) = lower(trim(v_inv.target_email));

    IF v_match_count = 0 THEN
      RAISE EXCEPTION 'participant_not_found_for_invitation';
    END IF;
    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'participant_ambiguous_for_invitation';
    END IF;

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_match_mp_id;

    UPDATE public.email_invitations
    SET match_participant_id = v_mp.id,
        updated_at = now()
    WHERE id = v_inv.id
      AND match_participant_id IS NULL;
  END IF;

  PERFORM public.apply_participant_exit(
    v_mp.id,
    p_system_actor_id,
    'withdraw',
    'Guest declined invitation via email'
  );

  UPDATE public.email_invitations
  SET status = 'declined',
      declined_at = COALESCE(declined_at, now()),
      updated_at = now()
  WHERE id = v_inv.id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = v_inv.id;

  IF v_inv.status = 'declined' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_declined', p_system_actor_id);
  END IF;

  RETURN v_inv;
END;
$$;


ALTER FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_email_invitation_get"("p_invitation_id" "uuid") RETURNS TABLE("id" "uuid", "inviter_user_id" "uuid", "inviter_display_name" "text", "target_email" "text", "target_name" "text", "related_type" "text", "related_id" "uuid", "status" "text", "magic_link_flow_status" "text", "accepted_by_user_id" "uuid", "accepted_at" timestamp with time zone, "declined_at" timestamp with time zone, "expires_at" timestamp with time zone, "created_at" timestamp with time zone, "match_summary" "jsonb", "caller_email_matches" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_inviter_name text;
  v_match jsonb;
  v_caller_email text;
BEGIN
  SELECT *
  INTO v_inv
  FROM public.email_invitations ei
  WHERE ei.id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT p.display_name INTO v_inviter_name
  FROM public.profiles p WHERE p.id = v_inv.inviter_user_id;

  v_match := NULL;
  IF v_inv.related_type = 'match' THEN
    SELECT jsonb_build_object(
      'match_id', m.id,
      'game_type', m.game_type,
      'match_date', m.match_date,
      'start_time', m.start_time,
      'club_name', c.name
    ) INTO v_match
    FROM public.matches m
    LEFT JOIN public.clubs c ON c.id = m.club_id
    WHERE m.id = v_inv.related_id;
  END IF;

  v_caller_email := NULL;
  IF auth.uid() IS NOT NULL THEN
    SELECT u.email INTO v_caller_email FROM auth.users u WHERE u.id = auth.uid();
  END IF;

  RETURN QUERY SELECT
    v_inv.id,
    v_inv.inviter_user_id,
    COALESCE(v_inviter_name, 'Someone'),
    v_inv.target_email,
    v_inv.target_name,
    v_inv.related_type,
    v_inv.related_id,
    v_inv.status,
    v_inv.magic_link_flow_status,
    v_inv.accepted_by_user_id,
    v_inv.accepted_at,
    v_inv.declined_at,
    v_inv.expires_at,
    v_inv.created_at,
    v_match,
    (lower(trim(v_caller_email)) = lower(trim(v_inv.target_email)));
END;
$$;


ALTER FUNCTION "public"."rpc_email_invitation_get"("p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_get_queued_deliveries"("p_limit" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "destination" "text", "payload" "jsonb", "attempt_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  UPDATE public.notification_deliveries d
  SET delivery_status = 'sending', attempt_count = d.attempt_count + 1, last_attempt_at = now()
  WHERE d.id IN (
    SELECT nd.id FROM public.notification_deliveries nd
    WHERE nd.delivery_status = 'queued'
    ORDER BY nd.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING d.id, d.destination, d.payload, d.attempt_count;
END;
$$;


ALTER FUNCTION "public"."rpc_get_queued_deliveries"("p_limit" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "public"."group_member_status" DEFAULT 'pending'::"public"."group_member_status" NOT NULL,
    "join_method" "text" DEFAULT 'invited'::"text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    "removed_at" timestamp with time zone,
    "removed_by" "uuid",
    "group_display_name" "text"
);


ALTER TABLE "public"."group_members" OWNER TO "postgres";


COMMENT ON COLUMN "public"."group_members"."group_display_name" IS 'Identity v1.5: group-scoped alias shown within this group context. Optional.';



CREATE OR REPLACE FUNCTION "public"."rpc_group_accept_invite"("p_group_id" "uuid") RETURNS "public"."group_members"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.group_members;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  update public.group_members gm
  set status = 'active',
      accepted_at = coalesce(gm.accepted_at, now())
  where gm.group_id = p_group_id
    and gm.user_id = auth.uid()
    and gm.status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'no_pending_invite';
  end if;

  return v_row;
end;
$$;


ALTER FUNCTION "public"."rpc_group_accept_invite"("p_group_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "boundary_keeper_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "primary_sport_id" smallint,
    "group_kind" "text" DEFAULT 'friend'::"text" NOT NULL,
    CONSTRAINT "chk_groups_group_kind" CHECK (("group_kind" = ANY (ARRAY['friend'::"text", 'club'::"text"])))
);


ALTER TABLE "public"."groups" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_group_create"("p_name" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS "public"."groups"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_row public.groups;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Create the group
  insert into public.groups (name, description, created_by, boundary_keeper_id)
  values (p_name, p_description, v_user_id, v_user_id)
  returning * into v_row;

  -- Add creator as active member (required by RLS to read the group)
  insert into public.group_members (group_id, user_id, status, join_method, accepted_at)
  values (v_row.id, v_user_id, 'active', 'created', now());

  return v_row;
end;
$$;


ALTER FUNCTION "public"."rpc_group_create"("p_name" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_group public.groups%rowtype;
  v_existing public.group_members%rowtype;
  v_caller_membership public.group_members%rowtype;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get group
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Caller must be boundary keeper OR an active member of this group
  IF v_group.boundary_keeper_id = v_caller_id THEN
    NULL; /* boundary keeper: can invite anyone (subject to rest of checks) */
  ELSE
    SELECT * INTO v_caller_membership
    FROM group_members
    WHERE group_id = p_group_id AND user_id = v_caller_id
      AND status = 'active' AND accepted_at IS NOT NULL AND removed_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only boundary keeper or active members can invite users';
    END IF;
    -- Non-boundary-keeper: may only invite users who share a group with the caller
    IF NOT public.do_users_share_group(v_caller_id, p_user_id) THEN
      RAISE EXCEPTION 'You can only invite users who share a group with you';
    END IF;
  END IF;

  -- Cannot invite self
  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  -- Check for existing membership
  SELECT * INTO v_existing
  FROM group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  IF FOUND THEN
    -- Already active or pending
    IF v_existing.status IN ('active', 'pending') THEN
      RAISE EXCEPTION 'User is already a member or has a pending invite';
    END IF;

    -- Re-invite: removed → pending (clear removal audit, reset acceptance)
    UPDATE group_members
    SET status = 'pending',
        invited_by = v_caller_id,
        removed_at = NULL,
        removed_by = NULL,
        accepted_at = NULL
    WHERE id = v_existing.id;
  ELSE
    -- Fresh invite
    INSERT INTO group_members (group_id, user_id, status, join_method, invited_by)
    VALUES (p_group_id, p_user_id, 'pending', 'invited', v_caller_id);
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") IS 'Boundary keeper can invite any user; active members can invite only users who share a group with them (do_users_share_group). Handles re-invite of removed members.';



CREATE OR REPLACE FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_group groups;
  v_membership group_members;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get group
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Boundary keeper cannot leave
  IF v_group.boundary_keeper_id = v_user_id THEN
    RAISE EXCEPTION 'Boundary keeper cannot leave the group';
  END IF;

  -- Get membership
  SELECT * INTO v_membership
  FROM group_members
  WHERE group_id = p_group_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;

  IF v_membership.status = 'removed' THEN
    -- Already removed, idempotent
    RETURN;
  END IF;

  -- Remove member
  UPDATE group_members
  SET status = 'removed', removed_at = now()
  WHERE id = v_membership.id;
END;
$$;


ALTER FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") IS 'User leaves a group. Sets status to removed. Boundary keeper cannot leave.';



CREATE OR REPLACE FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_affected int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.group_members
  SET status = 'removed',
      removed_at = now(),
      removed_by = auth.uid()
  WHERE group_id = p_group_id
    AND user_id = auth.uid()
    AND status = 'pending'
    AND join_method = 'invited';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'no_pending_invite';
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") IS 'Invitee declines a pending group invite. Sets status=removed, removed_at, removed_by.';



CREATE OR REPLACE FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_trimmed text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Normalize: empty/whitespace → NULL
  v_trimmed := NULLIF(trim(p_display_name), '');

  -- Length guard (32 chars, emoji-safe)
  IF v_trimmed IS NOT NULL AND char_length(v_trimmed) > 32 THEN
    RAISE EXCEPTION 'group_display_name must be at most 32 characters';
  END IF;

  -- (Optional) reject control chars
  

  -- Gate + write in one statement; ensure true active member
  UPDATE public.group_members
  SET group_display_name = v_trimmed
  WHERE group_id = p_group_id
    AND user_id  = auth.uid()
    AND status   = 'active'
    AND removed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not an active member of this group';
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_affected int;
  v_trimmed text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := trim(p_name);
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'Group name must not be empty';
  END IF;

  UPDATE public.groups
  SET name = v_trimmed,
      description = NULLIF(trim(coalesce(p_description, '')), '')
  WHERE id = p_group_id
    AND boundary_keeper_id = auth.uid();

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Group not found or you are not the boundary keeper';
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text") IS 'Boundary keeper updates group name and optional description.';



CREATE OR REPLACE FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ids smallint[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.id = p_guest_id
      AND g.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_guest_creator';
  END IF;

  SELECT array_agg(s.id ORDER BY s.id)
  INTO v_ids
  FROM public.sports s
  WHERE s.is_active = true
    AND s.code = ANY(p_sport_codes);

  DELETE FROM public.guest_sports
  WHERE guest_id = p_guest_id;

  IF v_ids IS NOT NULL THEN
    INSERT INTO public.guest_sports(guest_id, sport_id)
    SELECT p_guest_id, unnest(v_ids);
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_invite_circle_list"() RETURNS TABLE("id" "uuid", "owner_user_id" "uuid", "target_user_id" "uuid", "source" "text", "created_at" timestamp with time zone, "target_display_name" "text", "target_avatar_url" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT
    uic.id,
    uic.owner_user_id,
    uic.target_user_id,
    uic.source,
    uic.created_at,
    p.display_name AS target_display_name,   -- profiles.display_name
    p.avatar_url AS target_avatar_url       -- profiles.avatar_url
  FROM public.user_invite_circle uic
  LEFT JOIN public.profiles p ON p.id = uic.target_user_id
  WHERE uic.owner_user_id = v_uid
  ORDER BY uic.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."rpc_invite_circle_list"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_invite_circle_list"() IS 'Phase 1: List caller Invite Circle. Owner-only. Ordered by created_at desc.';



CREATE OR REPLACE FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") RETURNS TABLE("removed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_del int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  DELETE FROM public.user_invite_circle
  WHERE owner_user_id = v_uid AND target_user_id = p_target_user_id;

  GET DIAGNOSTICS v_del = ROW_COUNT;

  RETURN QUERY SELECT (v_del > 0);
END;
$$;


ALTER FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") IS 'Phase 1: Remove target from caller Invite Circle. Idempotent (no error if not present).';



CREATE TABLE IF NOT EXISTS "public"."user_invite_circle" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_invite_circle_owner_ne_target" CHECK (("owner_user_id" <> "target_user_id")),
    CONSTRAINT "user_invite_circle_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'played_with_auto'::"text"])))
);


ALTER TABLE "public"."user_invite_circle" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_invite_circle" IS 'Phase 1 Play Network Core: Private one-way list. Owner convenience only. Silent (no notification). Not trust/membership/approval.';



COMMENT ON COLUMN "public"."user_invite_circle"."source" IS 'manual = user saved; played_with_auto = future auto-add from played-with (not implemented yet).';



CREATE OR REPLACE FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text" DEFAULT 'manual'::"text") RETURNS "public"."user_invite_circle"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_row   public.user_invite_circle;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  IF p_target_user_id = v_uid THEN
    RAISE EXCEPTION 'cannot_save_self';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('manual', 'played_with_auto') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  -- Idempotent + race-safe: ON CONFLICT DO UPDATE with no-op returns existing row
  INSERT INTO public.user_invite_circle (owner_user_id, target_user_id, source)
  VALUES (v_uid, p_target_user_id, p_source)
  ON CONFLICT (owner_user_id, target_user_id)
  DO UPDATE SET source = user_invite_circle.source  -- no-op: keep existing
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") IS 'Phase 1: Save target to caller Invite Circle. Idempotent. Private, silent, no notification.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_match public.matches%rowtype;
  v_user_email text;
  v_new_mp public.match_participants%rowtype;
BEGIN
  SELECT * INTO v_inv FROM public.email_invitations WHERE id = p_invitation_id;
  IF NOT FOUND OR v_inv.related_type <> 'match' OR v_inv.related_id <> p_match_id THEN
    RAISE EXCEPTION 'invitation_invalid';
  END IF;

  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND OR v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF EXISTS (SELECT 1 FROM public.match_participants WHERE match_id = p_match_id AND user_id = p_user_id AND removed_at IS NULL) THEN
    RETURN (SELECT * FROM public.match_participants WHERE match_id = p_match_id AND user_id = p_user_id AND removed_at IS NULL LIMIT 1);
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, join_method,
    participant_accepted_at, participant_accepted_via,
    org_approved_at, org_approved_by, created_by
  ) VALUES (
    p_match_id, p_user_id, 'invited',
    now(), 'email_invitation',
    now(), v_inv.inviter_user_id, v_inv.inviter_user_id
  )
  RETURNING * INTO v_new_mp;

  PERFORM public.match_participant_reconcile_status(v_new_mp.id);
  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (p_match_id, v_new_mp.id, 'invite', 'email_invitation', v_inv.inviter_user_id);

  RETURN (SELECT * FROM public.match_participants WHERE id = v_new_mp.id);
END;
$$;


ALTER FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp            match_participants;
  v_was_unaccepted boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'You are not a participant in this match'; END IF;
  IF v_mp.removed_at IS NOT NULL THEN RAISE EXCEPTION 'You have been removed from this match'; END IF;

  IF (SELECT status FROM public.matches WHERE id = p_match_id) <> 'active' THEN
    RAISE EXCEPTION 'Match is not active';
  END IF;

  v_was_unaccepted := (v_mp.participant_accepted_at IS NULL);

  IF NOT v_was_unaccepted THEN
    PERFORM public.match_participant_reconcile_status(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
    RETURN v_mp;
  END IF;

  PERFORM public.apply_participant_acceptance(v_mp.id, auth.uid(), true, 'accept');

  SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
  RETURN v_mp;
END;
$$;


ALTER FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") IS 'v1.6.3: User accepts invite/nomination or re-confirms. Sets participant_accepted_at only.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text" DEFAULT NULL::"text") RETURNS TABLE("target_kind" "text", "target_id" "uuid", "display_name" "text", "avatar_url" "text", "club_handle" "text", "source" "text", "action_kind" "text", "can_admit" boolean, "eligible_via" "text", "sort_name" "text", "contact_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    v_match.club_id,
    (SELECT primary_club_id FROM public.profiles WHERE id = v_match.organizer_id)
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
    FROM public.club_identities ci
    JOIN public.profiles p ON p.id = ci.user_id
    WHERE v_club_context IS NOT NULL
      AND ci.club_id = v_club_context
      AND ci.user_id <> v_match.organizer_id
      AND ci.user_id <> v_uid
      AND p.show_in_club_member_discovery = true
      AND COALESCE(ci.visible_in_club_member_discovery, true) = true
      AND ci.user_id NOT IN (SELECT user_id FROM already_active_users)
      AND EXISTS (
        SELECT 1 FROM public.club_identities ci_caller
        WHERE ci_caller.club_id = v_club_context AND ci_caller.user_id = v_uid
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
      ci.club_handle,
      c.src AS source,
      'admit_user'::text AS action_kind,
      public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) AS can_admit,
      CASE
        WHEN public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) THEN 'admit_allowed'
        ELSE 'admit_forbidden'
      END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.club_handle, c.user_id::text)) AS sort_name,
      NULL::text AS contact_email
    FROM deduped_users c
    JOIN public.profiles p ON p.id = c.user_id
    LEFT JOIN public.club_identities ci
      ON ci.user_id = c.user_id AND ci.club_id = v_club_context
    WHERE (
      v_search IS NULL
      OR p.display_name ILIKE '%' || v_search || '%'
      OR ci.club_handle ILIKE '%' || v_search || '%'
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
      NULL::text AS club_handle,
      'roster_contacts'::text AS source,
      'nominate_contact_player'::text AS action_kind,
      (
        public.is_match_organizer(p_match_id, v_uid)
        OR public.is_user_match_associated(p_match_id, v_uid)
      ) AS can_admit,
      CASE
        WHEN (
          public.is_match_organizer(p_match_id, v_uid)
          OR public.is_user_match_associated(p_match_id, v_uid)
        ) THEN 'nominate_allowed'
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
    c.club_handle,
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


ALTER FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text") IS 'Phase 3: Mixed admission targets. Returns users (admit_user) and Contact Players (nominate_contact_player). target_kind, target_id, action_kind tell frontend which write path to use.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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

  IF public.is_user_match_associated(p_match_id, p_target_user_id) THEN
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


ALTER FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") IS 'Phase 1: Unified admission write. Organizer → invite (org_approved_at set). Non-org → nominate (org_approved_at NULL). Uses can_admit_user_to_match.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") RETURNS TABLE("participant_id" "uuid", "email" "text", "contact_channel" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organizer_id INTO v_org_id FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- User participants
  RETURN QUERY
  SELECT
    mp.id,
    COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text),
    COALESCE(NULLIF(trim(p.contact_channel), ''), 'email')
  FROM public.match_participants mp
  JOIN public.profiles p ON p.id = mp.user_id
  JOIN auth.users u ON u.id = mp.user_id
  WHERE mp.match_id = p_match_id
    AND mp.user_id IS NOT NULL
    AND mp.user_id != v_org_id
    AND mp.removed_at IS NULL
    AND mp.status = 'confirmed'
    AND COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) IS NOT NULL;

  -- Guest participants
  RETURN QUERY
  SELECT
    mp.id,
    NULLIF(trim(g.email), ''),
    'email'::text
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_match_id
    AND mp.guest_id IS NOT NULL
    AND mp.removed_at IS NULL
    AND mp.status = 'confirmed'
    AND NULLIF(trim(g.email), '') IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") IS 'Returns email for all confirmed participants (users + guests), excl. organizer. For match_formed notifications.';



CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organizer_id" "uuid" NOT NULL,
    "status" "public"."match_status" DEFAULT 'active'::"public"."match_status" NOT NULL,
    "club_id" "uuid",
    "court_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "match_date" "date" DEFAULT (("now"() AT TIME ZONE 'utc'::"text"))::"date" NOT NULL,
    "start_time" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 90 NOT NULL,
    "game_type" "text" DEFAULT 'doubles'::"text" NOT NULL,
    "required_count" integer DEFAULT 4 NOT NULL,
    "invitation_scope_group_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "can_participants_invite_users" boolean DEFAULT false NOT NULL,
    "can_participants_add_guests" boolean DEFAULT false NOT NULL,
    "can_participants_manage_participants" boolean DEFAULT false NOT NULL,
    "formed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_at_utc" timestamp with time zone,
    "sport_id" smallint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


COMMENT ON COLUMN "public"."matches"."start_at_utc" IS 'Derived UTC timestamp computed from match_date, start_time, and clubs.timezone';



CREATE OR REPLACE FUNCTION "public"."rpc_match_create"("p_required_count" integer DEFAULT 4, "p_game_type" "text" DEFAULT 'doubles'::"text", "p_match_date" "date" DEFAULT NULL::"date", "p_start_time" time without time zone DEFAULT NULL::time without time zone, "p_duration_minutes" integer DEFAULT NULL::integer, "p_club_id" "uuid" DEFAULT NULL::"uuid", "p_court_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_invitation_scope_group_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_can_participants_invite_users" boolean DEFAULT false, "p_can_participants_add_guests" boolean DEFAULT false, "p_can_participants_manage_participants" boolean DEFAULT false) RETURNS "public"."matches"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_club_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_club_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) IS 'v1.5: Creates a match and auto-adds organizer as confirmed participant. Organizer participant: participant_accepted_at + org_approved_at both set at creation. Reconcile confirms organizer immediately. SECURITY DEFINER bypasses RLS.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_delegate_confirm_participant"("p_match_participant_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp    public.match_participants%rowtype;
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
  v_guest_email text;
  v_evt_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_mp.match_id;

  IF v_mp.status <> 'pending' THEN
    RAISE EXCEPTION 'participant_not_pending_or_already_confirmed';
  END IF;
  IF v_mp.participant_accepted_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;
  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  IF v_mp.guest_id IS NOT NULL THEN
    -- Guest branch: any active participant (including organizer)
    IF NOT public.is_user_match_associated(v_mp.match_id, v_uid) THEN
      RAISE EXCEPTION 'You are not a participant in this match';
    END IF;

    PERFORM public.apply_participant_acceptance(p_match_participant_id, v_uid, false, 'delegate_manual_confirm');

    SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;

    -- Guest-only event emission: strictly inside guest branch
    v_guest_email := public.rpc_match_participant_email(v_mp.id);
    IF v_guest_email IS NOT NULL THEN
      INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
      VALUES (
        'match.guest_delegate_confirmed', 'match_participant', v_mp.id, v_uid,
        jsonb_build_object(
          'match_participant_id', v_mp.id, 'match_id', v_mp.match_id, 'target_email', v_guest_email,
          'game_type', v_match.game_type, 'match_date', v_match.match_date,
          'club_name', (SELECT c.name FROM public.clubs c WHERE c.id = v_match.club_id)
        )
      )
      RETURNING id INTO v_evt_id;
      PERFORM public.rpc_process_domain_event(v_evt_id);
    END IF;

    RETURN v_mp;
  END IF;

  -- User branch: organizer may delegate-confirm any pending user; non-org requires invited/nominated + ShareGroup
  IF public.is_match_organizer(v_mp.match_id, v_uid) THEN
    -- Organizer: allowed for any pending user participant (invited, nominated, requested)
    NULL; -- fall through to apply
  ELSE
    IF v_mp.join_method NOT IN ('invited', 'nominated') THEN
      RAISE EXCEPTION 'participant_not_invited_or_nominated';
    END IF;
    IF NOT (
      public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
      OR public.is_user_match_associated(v_mp.match_id, v_uid)
    ) THEN
      RAISE EXCEPTION 'not_authorized_to_delegate_confirm';
    END IF;

    IF NOT public.do_users_share_group(v_mp.user_id, v_uid) THEN
      RAISE EXCEPTION 'target_not_in_shared_groups';
    END IF;
  END IF;

  PERFORM public.apply_participant_acceptance(p_match_participant_id, v_uid, false, 'delegate_manual_confirm');

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  RETURN v_mp;
END;
$$;


ALTER FUNCTION "public"."rpc_match_delegate_confirm_participant"("p_match_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_delegate_confirm_participant"("p_match_participant_id" "uuid") IS 'v1.7: Delegate-confirm an existing pending participant (user or guest). User: organizer OR (non-org + InScope/MatchAssociated + ShareGroup). Guest: any active participant. Sets participant_accepted_at only. Guest branch emits match.guest_delegate_confirmed. Organizer may call for user participants to replace manual_confirm via composed delegate_confirm + org_approve.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  IF p_user_id = (SELECT organizer_id FROM public.matches WHERE id = p_match_id) THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  RETURN public.rpc_match_admit_user(p_match_id, p_user_id);
END;
$$;


ALTER FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") IS 'Phase 1: Organizer-only invite. Thin wrapper around rpc_match_admit_user. Preserves legacy error messages for compatibility.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
  IF NOT (v_is_org OR public.is_user_match_associated(p_match_id, v_uid)) THEN
    RAISE EXCEPTION 'not_authorized_to_nominate_guest';
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
        'club_name', (SELECT c.name FROM public.clubs c WHERE c.id = v_match.club_id)
      )
    )
    RETURNING id INTO v_evt_id;
    PERFORM public.rpc_process_domain_event(v_evt_id);
  END IF;

  RETURN v_mp;
END;
$$;


ALTER FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") IS 'v1.7: Nominate Contact Player. Organizer: auto org_approved_at only; guest stays pending until delegate_confirm_guest. Non-org: org_approved_at NULL.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF NOT v_match.can_participants_invite_users THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to nominate for this match';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot nominate yourself';
  END IF;

  RETURN public.rpc_match_admit_user(p_match_id, p_user_id);
END;
$$;


ALTER FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") IS 'Phase 1: Non-organizer nomination. Thin wrapper around rpc_match_admit_user. Preserves legacy caller-gate errors for compatibility.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp       public.match_participants%rowtype;
  v_match    public.matches%rowtype;
  v_match_id uuid;
  v_guest_email text;
  v_evt_id   uuid;
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
  IF v_mp.confirmed_at IS NOT NULL THEN RETURN v_mp; END IF;

  UPDATE public.match_participants
  SET org_approved_at = COALESCE(org_approved_at, now()), org_approved_by = auth.uid()
  WHERE id = p_match_participant_id;

  PERFORM public.match_participant_reconcile_status(p_match_participant_id);

  INSERT INTO public.match_participant_actions (match_id, match_participant_id, action_type, note, created_by)
  VALUES (v_match_id, p_match_participant_id, 'approve', NULL, auth.uid());

  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;

  IF v_mp.guest_id IS NOT NULL THEN
    v_guest_email := public.rpc_match_participant_email(p_match_participant_id);
    IF v_guest_email IS NOT NULL THEN
      SELECT * INTO v_match FROM public.matches WHERE id = v_match_id;
      INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
      VALUES (
        'match.guest_org_approved', 'match_participant', v_mp.id, auth.uid(),
        jsonb_build_object(
          'match_participant_id', v_mp.id, 'match_id', v_match_id, 'target_email', v_guest_email,
          'game_type', v_match.game_type, 'match_date', v_match.match_date,
          'club_name', (SELECT c.name FROM public.clubs c WHERE c.id = v_match.club_id)
        )
      )
      RETURNING id INTO v_evt_id;
      PERFORM public.rpc_process_domain_event(v_evt_id);
    END IF;
  END IF;

  RETURN v_mp;
END;
$$;


ALTER FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") IS 'v1.5: ORG approves a pending participant. Sets org_approved_at. Does NOT write status directly — reconcile derives status from timestamps. Idempotent (confirmed_at IS NOT NULL check).';



CREATE OR REPLACE FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) RETURNS TABLE("participant_id" "uuid", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Caller must be able to see the match (organizer, participant, or in scope)
  IF NOT (
    public.is_match_organizer(p_match_id, v_uid)
    OR EXISTS (SELECT 1 FROM public.match_participants mp WHERE mp.match_id = p_match_id AND mp.user_id = v_uid)
    OR public.is_caller_in_match_scope(p_match_id)
    OR public.is_caller_match_associated(p_match_id)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    mp.id AS participant_id,
    COALESCE(
      pd.display_name,
      g.display_name::text,
      'Unknown'
    ) AS display_name
  FROM public.match_participants mp
  LEFT JOIN public.profile_display pd ON pd.id = mp.user_id
  LEFT JOIN public.guests g ON g.id = mp.guest_id
  WHERE mp.match_id = p_match_id
    AND mp.id = ANY(p_participant_ids);
END;
$$;


ALTER FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) IS 'v1.7: Resolve participant display names for activity feed. Bypasses participant RLS for lookup. Caller must see match.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp  public.match_participants%rowtype;
  v_email text;
BEGIN
  SELECT * INTO v_mp FROM public.match_participants WHERE id = p_match_participant_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_mp.user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) INTO v_email
    FROM public.profiles p
    JOIN auth.users u ON u.id = v_mp.user_id
    WHERE p.id = v_mp.user_id;
    RETURN v_email;
  END IF;

  IF v_mp.guest_id IS NOT NULL THEN
    SELECT NULLIF(trim(g.email), '') INTO v_email
    FROM public.guests g
    WHERE g.id = v_mp.guest_id;
    RETURN v_email;
  END IF;

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") IS 'Returns email for a participant (user: profile/auth; guest: guests.email). NULL if no email.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") RETURNS TABLE("user_id" "uuid", "email" "text", "contact_channel" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
      AND (
        m.organizer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = p_match_id AND mp.user_id = auth.uid()
            AND mp.status = 'confirmed' AND mp.removed_at IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    mp.user_id,
    COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) AS email,
    COALESCE(NULLIF(trim(p.contact_channel), ''), 'email') AS contact_channel
  FROM public.match_participants mp
  JOIN public.profiles p ON p.id = mp.user_id
  JOIN auth.users u ON u.id = mp.user_id
  WHERE mp.match_id = p_match_id
    AND mp.user_id IS NOT NULL
    AND mp.removed_at IS NULL
    AND mp.user_id != (SELECT organizer_id FROM public.matches WHERE id = p_match_id)
    AND mp.org_approved_at IS NOT NULL
    AND (mp.status = 'confirmed' OR (mp.status = 'pending' AND mp.participant_accepted_at IS NULL))
    AND COALESCE(NULLIF(trim(p.contact_email), ''), u.email::text) IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") IS 'v1.7: Returns email + contact_channel for confirmed user participants (excl. organizer). Caller must be organizer or confirmed participant.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp       public.match_participants%rowtype;
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

  IF NOT (
    public.is_match_organizer(v_match_id, auth.uid())
    OR (
      public.is_match_participant_confirmed(v_match_id, auth.uid())
      AND (SELECT can_participants_manage_participants FROM public.matches WHERE id = v_match_id)
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission to remove participants';
  END IF;

  RETURN public.apply_participant_exit(p_match_participant_id, auth.uid(), 'remove', NULL);
END;
$$;


ALTER FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") IS 'v1.5: ORG (or authorized participant) removes a participant. Sets removed_at + removed_by. Reconcile sets status=removed and clears confirmed_at. No direct status write.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_existing public.match_participants%rowtype;
  v_uid      uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF v_match.organizer_id = v_uid THEN
    RAISE EXCEPTION 'Organizer cannot request to join their own match';
  END IF;

  IF v_match.invitation_scope_group_ids IS NULL
     OR array_length(v_match.invitation_scope_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'This match is not open for join requests (no scope groups configured)';
  END IF;

  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, v_uid) THEN
    RAISE EXCEPTION 'You are not eligible to request to join this match (not in scope groups)';
  END IF;

  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = v_uid;

  IF FOUND AND v_existing.removed_at IS NULL THEN
    RAISE EXCEPTION 'You are already a participant in this match';
  END IF;

  RETURN public.apply_participant_admission(p_match_id, v_uid, v_uid, 'requested');
END;
$$;


ALTER FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") IS 'v1.6.3: User requests to join. Scope required. Removed users can re-request. Sets participant_accepted_at. ORG approval needed to confirm.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp public.match_participants%rowtype;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a participant in this match';
  END IF;

  RETURN public.apply_participant_exit(v_mp.id, auth.uid(), 'withdraw', NULL);
END;
$$;


ALTER FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") IS 'v1.5: User withdraws (decline invite or leave). Sets removed_at + removed_by. Reconcile sets status=removed and clears confirmed_at. No direct status write.';



CREATE OR REPLACE FUNCTION "public"."rpc_process_domain_event"("p_event_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_evt public.domain_events%rowtype;
  v_inv public.email_invitations%rowtype;
  v_payload jsonb;
  v_dest text;
  v_match_id uuid;
  v_rec record;
BEGIN
  SELECT * INTO v_evt FROM public.domain_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  -- invitation.email_invitation_created (existing)
  IF v_evt.event_type = 'invitation.email_invitation_created' THEN
    v_payload := v_evt.payload;
    SELECT * INTO v_inv FROM public.email_invitations WHERE id = (v_payload->>'invitation_id')::uuid;
    IF NOT FOUND THEN
      RETURN;
    END IF;

    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id, metadata)
    VALUES (v_inv.id, 'email_delivery_requested', v_evt.actor_user_id, jsonb_build_object('domain_event_id', p_event_id));

    INSERT INTO public.notification_deliveries (
      email_invitation_id, channel, provider, destination, delivery_status, payload
    ) VALUES (
      v_inv.id, 'email', 'resend', v_inv.target_email, 'queued',
      jsonb_build_object(
        'template_type', 'invitation',
        'invitation_id', v_inv.id,
        'inviter_display_name', v_payload->>'inviter_display_name',
        'target_email', v_inv.target_email,
        'related_type', v_inv.related_type,
        'related_id', v_inv.related_id,
        'match_summary', (SELECT jsonb_build_object('game_type', m.game_type, 'match_date', m.match_date, 'club_name', c.name)
          FROM public.matches m LEFT JOIN public.clubs c ON c.id = m.club_id WHERE m.id = v_inv.related_id)
      )
    );
    RETURN;
  END IF;

  -- match.guest_nominated
  IF v_evt.event_type = 'match.guest_nominated' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NULL OR trim(v_dest) = '' THEN RETURN; END IF;

    INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
    VALUES (
      'email', 'resend', v_dest, 'queued',
      jsonb_build_object(
        'template_type', 'guest_nominated',
        'target_email', v_dest,
        'nominator_display_name', v_payload->>'nominator_display_name',
        'match_id', v_payload->>'match_id',
        'game_type', v_payload->>'game_type',
        'match_date', v_payload->>'match_date',
        'club_name', v_payload->>'club_name'
      )
    );
    RETURN;
  END IF;

  -- match.guest_org_approved
  IF v_evt.event_type = 'match.guest_org_approved' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NULL OR trim(v_dest) = '' THEN RETURN; END IF;

    INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
    VALUES (
      'email', 'resend', v_dest, 'queued',
      jsonb_build_object(
        'template_type', 'guest_org_approved',
        'target_email', v_dest,
        'match_id', v_payload->>'match_id',
        'game_type', v_payload->>'game_type',
        'match_date', v_payload->>'match_date',
        'club_name', v_payload->>'club_name'
      )
    );
    RETURN;
  END IF;

  -- match.guest_delegate_confirmed
  IF v_evt.event_type = 'match.guest_delegate_confirmed' THEN
    v_payload := v_evt.payload;
    v_dest := v_payload->>'target_email';
    IF v_dest IS NULL OR trim(v_dest) = '' THEN RETURN; END IF;

    INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
    VALUES (
      'email', 'resend', v_dest, 'queued',
      jsonb_build_object(
        'template_type', 'guest_delegate_confirmed',
        'target_email', v_dest,
        'match_id', v_payload->>'match_id',
        'game_type', v_payload->>'game_type',
        'match_date', v_payload->>'match_date',
        'club_name', v_payload->>'club_name'
      )
    );
    RETURN;
  END IF;

  -- match.formed: one delivery per confirmed participant (user + guest) with email
  IF v_evt.event_type = 'match.formed' THEN
    v_payload := v_evt.payload;
    v_match_id := (v_payload->>'match_id')::uuid;

    FOR v_rec IN
      SELECT participant_id, email, contact_channel
      FROM public.rpc_match_confirmed_participant_emails(v_match_id)
      WHERE email IS NOT NULL AND trim(email) <> '' AND contact_channel = 'email'
    LOOP
      INSERT INTO public.notification_deliveries (channel, provider, destination, delivery_status, payload)
      VALUES (
        'email', 'resend', v_rec.email, 'queued',
        jsonb_build_object(
          'template_type', 'match_formed',
          'match_id', v_match_id,
          'game_type', v_payload->>'game_type',
          'match_date', v_payload->>'match_date',
          'club_name', v_payload->>'club_name'
        )
      );
    END LOOP;
    RETURN;
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_process_domain_event"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_trimmed      text;
  v_current_name text;
  v_first        text;
  v_last         text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := trim(p_display_name);
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'display_name must not be empty';
  END IF;

  -- Use '' for first/last when not provided (profiles columns are NOT NULL)
  v_first := COALESCE(NULLIF(trim(coalesce(p_first_name, '')), ''), '');
  v_last  := COALESCE(NULLIF(trim(coalesce(p_last_name,  '')), ''), '');

  SELECT display_name INTO v_current_name
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_current_name IS NOT NULL AND v_current_name <> '' THEN
    RAISE EXCEPTION 'already_initialized';
  END IF;

  INSERT INTO public.profiles (id, display_name, first_name, last_name)
  VALUES (auth.uid(), v_trimmed, v_first, v_last)
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = EXCLUDED.display_name,
    first_name   = EXCLUDED.first_name,
    last_name    = EXCLUDED.last_name;
END;
$$;


ALTER FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
  SET avatar_url = NULLIF(trim(p_avatar_url), ''),
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") IS 'v1.8: Set the current user avatar URL (from storage). NULL to clear.';



CREATE OR REPLACE FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_trimmed text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  v_trimmed := trim(p_display_name);

  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'display_name must not be empty';
  END IF;

  IF char_length(v_trimmed) > 50 THEN
    RAISE EXCEPTION 'display_name must be at most 50 characters';
  END IF;

  -- Reject control characters (non-printable ASCII)
  IF v_trimmed ~ '[\u0000-\u001F]' THEN
    RAISE EXCEPTION 'display_name contains invalid control characters';
  END IF;

  UPDATE public.profiles
  SET display_name = v_trimmed
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_profile_set_primary_club"("p_club_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_handle text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Must be a member
  SELECT club_handle INTO v_handle
  FROM public.club_identities
  WHERE club_id = p_club_id AND user_id = auth.uid();

  IF v_handle IS NULL THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  UPDATE public.profiles
  SET primary_club_id = p_club_id,
      display_name    = v_handle
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_profile_set_primary_club"("p_club_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_profile_update"("p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
  SET
    first_name = NULLIF(trim(coalesce(p_first_name, '')), ''),
    last_name  = NULLIF(trim(coalesce(p_last_name,  '')), '')
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_profile_update"("p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text", "p_contact_channel" "text" DEFAULT NULL::"text", "p_contact_email" "text" DEFAULT NULL::"text", "p_contact_phone" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
  SET
    first_name      = CASE WHEN p_first_name IS NOT NULL THEN NULLIF(trim(p_first_name), '') ELSE first_name END,
    last_name       = CASE WHEN p_last_name IS NOT NULL THEN NULLIF(trim(p_last_name), '') ELSE last_name END,
    contact_channel = CASE WHEN p_contact_channel IN ('email','sms') THEN p_contact_channel ELSE contact_channel END,
    contact_email   = CASE WHEN p_contact_email IS NOT NULL THEN NULLIF(trim(p_contact_email), '') ELSE contact_email END,
    contact_phone   = CASE WHEN p_contact_phone IS NOT NULL THEN NULLIF(trim(p_contact_phone), '') ELSE contact_phone END,
    updated_at      = now()
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text") IS 'v1.7: Update profile. contact_channel: email|sms. contact_email: override or NULL to use auth email. contact_phone for SMS.';



CREATE OR REPLACE FUNCTION "public"."rpc_profile_update"("p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text", "p_contact_channel" "text" DEFAULT NULL::"text", "p_contact_email" "text" DEFAULT NULL::"text", "p_contact_phone" "text" DEFAULT NULL::"text", "p_show_in_club_member_discovery" boolean DEFAULT NULL::boolean, "p_allow_non_group_invites" boolean DEFAULT NULL::boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
  SET
    first_name      = CASE WHEN p_first_name IS NOT NULL THEN NULLIF(trim(p_first_name), '') ELSE first_name END,
    last_name       = CASE WHEN p_last_name IS NOT NULL THEN NULLIF(trim(p_last_name), '') ELSE last_name END,
    contact_channel = CASE WHEN p_contact_channel IN ('email','sms') THEN p_contact_channel ELSE contact_channel END,
    contact_email   = CASE WHEN p_contact_email IS NOT NULL THEN NULLIF(trim(p_contact_email), '') ELSE contact_email END,
    contact_phone   = CASE WHEN p_contact_phone IS NOT NULL THEN NULLIF(trim(p_contact_phone), '') ELSE contact_phone END,
    show_in_club_member_discovery = CASE WHEN p_show_in_club_member_discovery IS NOT NULL THEN p_show_in_club_member_discovery ELSE show_in_club_member_discovery END,
    allow_non_group_invites       = CASE WHEN p_allow_non_group_invites IS NOT NULL THEN p_allow_non_group_invites ELSE allow_non_group_invites END,
    updated_at      = now()
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_club_member_discovery" boolean, "p_allow_non_group_invites" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_club_member_discovery" boolean, "p_allow_non_group_invites" boolean) IS 'v1.7 + Phase 1: Update profile. Includes global preference switches: show_in_club_member_discovery, allow_non_group_invites.';



CREATE OR REPLACE FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_email text := lower(trim(p_verified_email));
BEGIN
  IF v_email = '' OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 1) Link invitation
  INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  VALUES ('email', v_email, p_user_id, 'invitation_target', p_invitation_id, p_user_id)
  ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;

  -- 2) Link guest match participants by email (guests.email = verified_email)
  INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  SELECT 'email', v_email, p_user_id, 'guest_participant', mp.id, p_user_id
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE lower(trim(g.email)) = v_email
    AND mp.removed_at IS NULL
  ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") IS 'Link invitation + guest participants to user after magic link signup. Idempotent.';



CREATE OR REPLACE FUNCTION "public"."rpc_reconcile_identity_guest_participants"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT lower(trim(u.email::text)) INTO v_email
  FROM auth.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL OR v_email = '' THEN
    RETURN;
  END IF;

  -- 1a) Link guest match participants (guest_participant)
  INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  SELECT 'email', v_email, v_uid, 'guest_participant', mp.id, v_uid
  FROM public.match_participants mp
  JOIN public.guests g ON g.id = mp.guest_id
  WHERE lower(trim(g.email)) = v_email
  ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;

  -- 1b) Link guests (contact) — so roster owner can see "已加入" and Invite to Group
  INSERT INTO public.identity_links (provider, verified_email, user_id, linked_type, linked_id, linked_by_user_id)
  SELECT 'email', v_email, v_uid, 'contact', g.id, v_uid
  FROM public.guests g
  WHERE lower(trim(g.email)) = v_email
  ON CONFLICT (user_id, linked_type, linked_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."rpc_reconcile_identity_guest_participants"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_reconcile_identity_guest_participants"() IS 'Link guest participants + contact (guest) to current user by email. Idempotent.';



CREATE OR REPLACE FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) RETURNS TABLE("guest_id" "uuid", "user_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT g.id AS guest_id, il.user_id
  FROM unnest(p_guest_ids) AS gid
  JOIN public.guests g ON g.id = gid
  JOIN public.user_roster_guests urg ON urg.guest_id = g.id AND urg.owner_user_id = auth.uid()
  JOIN public.identity_links il ON il.linked_type = 'contact' AND il.linked_id = g.id
  WHERE il.user_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) IS 'For roster owner: which of my guests have registered (identity_links contact). Returns guest_id, user_id for Invite to Group.';



CREATE TABLE IF NOT EXISTS "public"."guests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "display_name" "text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "phone" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    CONSTRAINT "guests_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."guests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text") RETURNS "public"."guests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_guest public.guests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name_required';
  END IF;

  INSERT INTO public.guests(display_name, email, phone, status, created_at, created_by)
  VALUES (btrim(p_display_name), p_email, p_phone, 'active', now(), auth.uid())
  RETURNING * INTO v_guest;

  INSERT INTO public.user_roster_guests(owner_user_id, guest_id, created_at, created_by)
  VALUES (auth.uid(), v_guest.id, now(), auth.uid());

  RETURN v_guest;
END;
$$;


ALTER FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."guests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_guest public.guests;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name_required';
  END IF;

  INSERT INTO public.guests(
    display_name,
    email,
    phone,
    notes,
    status,
    created_by,
    created_at
  )
  VALUES (
    btrim(p_display_name),
    p_email,
    p_phone,
    p_notes,
    'active',
    auth.uid(),
    now()
  )
  RETURNING * INTO v_guest;

  INSERT INTO public.user_roster_guests(
    owner_user_id,
    guest_id,
    created_by,
    created_at
  )
  VALUES (
    auth.uid(),
    v_guest.id,
    auth.uid(),
    now()
  )
  ON CONFLICT (owner_user_id, guest_id) DO NOTHING;

  RETURN v_guest;
END;
$$;


ALTER FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_roster_guest_list"() RETURNS SETOF "public"."guests"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT g.*
  FROM public.user_roster_guests urg
  JOIN public.guests g
    ON g.id = urg.guest_id
  WHERE urg.owner_user_id = auth.uid()
    AND g.status = 'active';
$$;


ALTER FUNCTION "public"."rpc_roster_guest_list"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sports" (
    "id" smallint NOT NULL,
    "code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sports" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_sports_list"() RETURNS SETOF "public"."sports"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT *
  FROM public.sports
  WHERE is_active = true
  ORDER BY id;
$$;


ALTER FUNCTION "public"."rpc_sports_list"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_update_delivery_result"("p_delivery_id" "uuid", "p_status" "text", "p_provider_message_id" "text" DEFAULT NULL::"text", "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv_id uuid;
BEGIN
  SELECT email_invitation_id INTO v_inv_id FROM public.notification_deliveries WHERE id = p_delivery_id;

  UPDATE public.notification_deliveries
  SET delivery_status = p_status,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
      provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
      error_message = p_error_message
  WHERE id = p_delivery_id;

  IF v_inv_id IS NOT NULL THEN
    IF p_status = 'sent' THEN
      INSERT INTO public.email_invitation_events (invitation_id, event_type, metadata)
      VALUES (v_inv_id, 'email_sent', jsonb_build_object('delivery_id', p_delivery_id));
    ELSIF p_status = 'failed' THEN
      INSERT INTO public.email_invitation_events (invitation_id, event_type, metadata)
      VALUES (v_inv_id, 'email_failed', jsonb_build_object('delivery_id', p_delivery_id, 'error', p_error_message));
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_update_delivery_result"("p_delivery_id" "uuid", "p_status" "text", "p_provider_message_id" "text", "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_user_sports_set"("p_sport_codes" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ids smallint[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT array_agg(s.id ORDER BY s.id)
  INTO v_ids
  FROM public.sports s
  WHERE s.is_active = true
    AND s.code = ANY(p_sport_codes);

  -- Clear existing
  DELETE FROM public.user_sports
  WHERE user_id = auth.uid();

  -- Insert new (ignore null/empty)
  IF v_ids IS NOT NULL THEN
    INSERT INTO public.user_sports(user_id, sport_id)
    SELECT auth.uid(), unnest(v_ids);
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_user_sports_set"("p_sport_codes" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sharegroup_exists"("p_user_a" "uuid", "p_user_b" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.group_members ga
    JOIN public.group_members gb ON gb.group_id = ga.group_id
    WHERE ga.user_id = p_user_a
      AND gb.user_id = p_user_b
      AND ga.status = 'active'
      AND gb.status = 'active'
  );
END;
$$;


ALTER FUNCTION "public"."sharegroup_exists"("p_user_a" "uuid", "p_user_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_runner_v161"() RETURNS TABLE("test_name" "text", "ok" boolean, "details" "text", "match_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  -- Fixed identities from your dataset
  ORG_UID  uuid := '1bb09aac-908c-4746-b904-81c5ff302872'; -- OldChai
  P_UID    uuid := '37c9e087-5b62-43e8-add6-893dec015efd'; -- U3
  REAL_UID uuid := 'a3631e91-27e4-4db1-a64b-4162d86a4a44'; -- Real

  -- Use orc2 as scope
  SCOPE_GID uuid := '17ed4074-6afa-47c7-b9c1-5e110db5859f'; -- orc2

  -- Real club_id
  CLUB_ID uuid := '3802862a-db80-40e5-bed0-c76e8a631fa8'; -- Whiteoak Tennis Club

  v_mid uuid;
  v_mp  public.match_participants%rowtype;

  fn_delegate_exists boolean;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _v161_results(
    test_name text,
    ok boolean,
    details text,
    match_id uuid
  ) ON COMMIT DROP;

  -- ===========================================================================
  -- T00: sanity check ShareGroup helper (should be true for (U3, Real))
  -- ===========================================================================
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    IF public.do_users_share_group(P_UID, REAL_UID) IS TRUE THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T00 ShareGroup(U3, Real) == true', true, 'ok', NULL);
    ELSE
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T00 ShareGroup(U3, Real) == true', false, 'do_users_share_group returned false', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T00 ShareGroup(U3, Real) == true', false, 'exception: ' || SQLERRM, NULL);
  END;

  -- ===========================================================================
  -- T01: NOMINATE should create pending nominated row
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, admission_mode,
      club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', 'invite',
      CLUB_ID, '{}'::uuid[],
      current_date, '10:00'::time, 90,
      'v161_test_nominate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- simulate caller = U3
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT mp.* INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY mp.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T01 Nominate creates pending nominated', false, 'no match_participants row created', v_mid);
    ELSE
      IF v_mp.status::text = 'pending'
         AND v_mp.join_method::text = 'nominated'
         AND v_mp.nominated_by = P_UID
         AND v_mp.org_approved_at IS NULL
         AND v_mp.participant_accepted_at IS NULL
      THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES ('T01 Nominate creates pending nominated', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T01 Nominate creates pending nominated',
          false,
          'got status='||coalesce(v_mp.status::text,'NULL')
          ||', join_method='||coalesce(v_mp.join_method::text,'NULL')
          ||', nominated_by='||coalesce(v_mp.nominated_by::text,'NULL')
          ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL')
          ||', participant_accepted_at='||coalesce(v_mp.participant_accepted_at::text,'NULL'),
          v_mid
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T01 Nominate creates pending nominated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- ===========================================================================
  -- T02: ORG MANUAL CONFIRM should set both timestamps and reconcile to confirmed
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, admission_mode,
      club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', 'invite',
      CLUB_ID, '{}'::uuid[],
      current_date, '11:00'::time, 90,
      'v161_test_org_manual_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- simulate caller = organizer
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    PERFORM public.rpc_match_manual_confirm_user(v_mid, REAL_UID);

    SELECT mp.* INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY mp.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T02 Org manual confirm sets timestamps', false, 'no match_participants row created', v_mid);
    ELSE
      IF v_mp.org_approved_at IS NOT NULL
         AND v_mp.participant_accepted_at IS NOT NULL
         AND v_mp.participant_accepted_via::text = 'manual'
      THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T02 Org manual confirm sets timestamps',
          true,
          'status='||coalesce(v_mp.status::text,'NULL')||', ok',
          v_mid
        );
      ELSE
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T02 Org manual confirm sets timestamps',
          false,
          'got status='||coalesce(v_mp.status::text,'NULL')
          ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL')
          ||', participant_accepted_at='||coalesce(v_mp.participant_accepted_at::text,'NULL')
          ||', participant_accepted_via='||coalesce(v_mp.participant_accepted_via::text,'NULL'),
          v_mid
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T02 Org manual confirm sets timestamps', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- ===========================================================================
  -- T03: Delegated manual confirm keeps pending (no org_approved_at)
  -- - supports either rpc_match_delegate_confirm_user OR rpc_match_delegate_manual_confirm_user
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, admission_mode,
      club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', 'invite',
      CLUB_ID, '{}'::uuid[],
      current_date, '12:00'::time, 90,
      'v161_test_delegate_manual_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- simulate caller = U3 (non-org)
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public'
        AND p.proname IN ('rpc_match_delegate_confirm_user','rpc_match_delegate_manual_confirm_user')
    )
    INTO fn_delegate_exists;

    IF NOT fn_delegate_exists THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES (
        'T03 Delegate confirm keeps pending',
        false,
        'missing function: public.rpc_match_delegate_confirm_user(uuid,uuid) OR public.rpc_match_delegate_manual_confirm_user(uuid,uuid)',
        v_mid
      );
    ELSE
      -- Prefer canonical name if exists
      IF EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname='rpc_match_delegate_manual_confirm_user'
      ) THEN
        EXECUTE 'SELECT public.rpc_match_delegate_manual_confirm_user($1,$2)'
          USING v_mid, REAL_UID;
      ELSE
        EXECUTE 'SELECT public.rpc_match_delegate_confirm_user($1,$2)'
          USING v_mid, REAL_UID;
      END IF;

      SELECT mp.* INTO v_mp
      FROM public.match_participants mp
      WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
      ORDER BY mp.created_at DESC
      LIMIT 1;

      IF NOT FOUND THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES ('T03 Delegate confirm keeps pending', false, 'no match_participants row created', v_mid);
      ELSE
        IF v_mp.participant_accepted_at IS NOT NULL
           AND v_mp.participant_accepted_via::text = 'delegate_manual'
           AND v_mp.org_approved_at IS NULL
           AND v_mp.status::text = 'pending'
        THEN
          INSERT INTO _v161_results(test_name, ok, details, match_id)
          VALUES ('T03 Delegate confirm keeps pending', true, 'ok', v_mid);
        ELSE
          INSERT INTO _v161_results(test_name, ok, details, match_id)
          VALUES (
            'T03 Delegate confirm keeps pending',
            false,
            'got status='||coalesce(v_mp.status::text,'NULL')
            ||', participant_accepted_at='||coalesce(v_mp.participant_accepted_at::text,'NULL')
            ||', participant_accepted_via='||coalesce(v_mp.participant_accepted_via::text,'NULL')
            ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL'),
            v_mid
          );
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T03 Delegate confirm keeps pending', false, 'sqlstate='||SQLSTATE||' err='||SQLERRM, v_mid);
  END;

  -- ===========================================================================
  -- T04: Confirmed integrity: confirmed requires BOTH org_approved_at + participant_accepted_at
  -- ===========================================================================
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_participants mp ON mp.match_id = m.id
      WHERE m.game_type LIKE 'v161_test_%'
        AND m.match_date = current_date
        AND mp.status::text = 'confirmed'
        AND (mp.org_approved_at IS NULL OR mp.participant_accepted_at IS NULL)
    ) THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T04 Confirmed requires both timestamps', false, 'found confirmed row with missing timestamps', NULL);
    ELSE
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T04 Confirmed requires both timestamps', true, 'ok', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T04 Confirmed requires both timestamps', false, 'exception: '||SQLERRM, NULL);
  END;

  -- ===========================================================================
  -- T05: MatchAssociated(any row) includes removed
  -- - create a match, insert a REMOVED row for REAL, verify helper returns true
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, admission_mode,
      club_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', 'invite',
      CLUB_ID, '{}'::uuid[],
      current_date, '13:00'::time, 90,
      'v161_test_match_associated_any_row', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- insert a removed participant row for REAL (status-only world)
    INSERT INTO public.match_participants(
      match_id, user_id, status,
      join_method,
      removed_at, removed_by,
      created_by
    ) VALUES (
      v_mid, REAL_UID, 'removed',
      'invited',
      now(), ORG_UID,
      ORG_UID
    );

    IF public.is_user_match_associated(v_mid, REAL_UID) IS TRUE THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T05 MatchAssociated(any row) includes removed', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T05 MatchAssociated(any row) includes removed', false, 'is_user_match_associated returned false for removed row', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T05 MatchAssociated(any row) includes removed', false, 'exception: '||SQLERRM, v_mid);
  END;

  RETURN QUERY
    SELECT r.test_name, r.ok, r.details, r.match_id
    FROM _v161_results r
    ORDER BY r.test_name;

END;
$_$;


ALTER FUNCTION "public"."test_runner_v161"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_runner_v161_cleanup"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  n int := 0;
begin
  delete from public.match_participant_actions a
  using public.matches m
  where a.match_id = m.id
    and m.game_type like 'v161_test_%'
    and m.match_date = current_date;

  delete from public.match_participants mp
  using public.matches m
  where mp.match_id = m.id
    and m.game_type like 'v161_test_%'
    and m.match_date = current_date;

  delete from public.matches m
  where m.game_type like 'v161_test_%'
    and m.match_date = current_date;

  get diagnostics n = row_count;
  return n;
end;
$$;


ALTER FUNCTION "public"."test_runner_v161_cleanup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_runner_v161_cleanup"("p_run_suffix" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  n int := 0;
BEGIN
  -- actions
  DELETE FROM public.match_participant_actions a
  USING public.matches m
  WHERE a.match_id = m.id
    AND m.game_type LIKE ('v161_test_%_' || p_run_suffix);

  -- participants
  DELETE FROM public.match_participants mp
  USING public.matches m
  WHERE mp.match_id = m.id
    AND m.game_type LIKE ('v161_test_%_' || p_run_suffix);

  -- matches
  DELETE FROM public.matches m
  WHERE m.game_type LIKE ('v161_test_%_' || p_run_suffix);

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;


ALTER FUNCTION "public"."test_runner_v161_cleanup"("p_run_suffix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg__set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tg__set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_email_invitation_anchor_consistency"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp_match_id uuid;
  v_mp_guest_id uuid;
BEGIN
  IF NEW.match_participant_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.related_type <> 'match' THEN
    RAISE EXCEPTION 'anchor_requires_match_related_type';
  END IF;

  SELECT mp.match_id, mp.guest_id
  INTO v_mp_match_id, v_mp_guest_id
  FROM public.match_participants mp
  WHERE mp.id = NEW.match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'anchor_match_participant_not_found';
  END IF;

  IF v_mp_match_id <> NEW.related_id THEN
    RAISE EXCEPTION 'anchor_participant_match_mismatch';
  END IF;

  IF v_mp_guest_id IS NULL THEN
    RAISE EXCEPTION 'anchor_requires_guest_participant';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_email_invitation_anchor_consistency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_delegator_on_mp_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_delegator uuid;
  v_kind text;
  v_actor uuid := auth.uid();
BEGIN
  -- Removed: notify delegator AND the removed user (if user participant)
  IF (NEW.removed_at IS DISTINCT FROM OLD.removed_at) AND NEW.removed_at IS NOT NULL THEN
    v_kind := 'delegate_target_removed';

    -- Notify delegator
    IF NEW.user_id IS NOT NULL AND NEW.manual_confirmed_by IS NOT NULL THEN
      v_delegator := NEW.manual_confirmed_by;
    ELSIF NEW.user_id IS NOT NULL AND NEW.nominated_by IS NOT NULL THEN
      v_delegator := NEW.nominated_by;
    ELSIF NEW.guest_id IS NOT NULL THEN
      SELECT organizer_id INTO v_delegator
      FROM public.matches
      WHERE id = NEW.match_id;
    END IF;

    IF v_delegator IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) VALUES (
        v_delegator, v_kind, NEW.match_id, NEW.id, v_actor, NULL
      );
    END IF;

    -- Notify the removed user (skip when self-removed)
    IF NEW.user_id IS NOT NULL AND NEW.user_id <> v_actor THEN
      INSERT INTO public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) VALUES (
        NEW.user_id, 'removed', NEW.match_id, NEW.id, v_actor, NEW.removal_note
      );
    END IF;

    RETURN NEW;
  END IF;

  -- Confirmed: notify delegator only
  IF (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at) AND NEW.confirmed_at IS NOT NULL THEN
    v_kind := 'delegate_target_confirmed';

    IF NEW.user_id IS NOT NULL AND NEW.manual_confirmed_by IS NOT NULL THEN
      v_delegator := NEW.manual_confirmed_by;
    ELSIF NEW.user_id IS NOT NULL AND NEW.nominated_by IS NOT NULL THEN
      v_delegator := NEW.nominated_by;
    ELSIF NEW.guest_id IS NOT NULL THEN
      SELECT organizer_id INTO v_delegator
      FROM public.matches
      WHERE id = NEW.match_id;
    END IF;

    IF v_delegator IS NOT NULL THEN
      INSERT INTO public.notifications (
        recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
      ) VALUES (
        v_delegator, v_kind, NEW.match_id, NEW.id, v_actor, NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_notify_delegator_on_mp_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_on_invite_nominate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;  -- guests: no user to notify
  END IF;

  IF NEW.join_method = 'invited' THEN
    INSERT INTO public.notifications (
      recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
    ) VALUES (
      NEW.user_id, 'invited', NEW.match_id, NEW.id, COALESCE(NEW.created_by, auth.uid()), NULL
    );
  ELSIF NEW.join_method = 'nominated' THEN
    INSERT INTO public.notifications (
      recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
    ) VALUES (
      NEW.user_id, 'nominated', NEW.match_id, NEW.id, COALESCE(NEW.nominated_by, auth.uid()), NULL
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_notify_on_invite_nominate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_notify_on_match_cancelled"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid;
BEGIN
  IF OLD.status = 'cancelled' OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  FOR v_uid IN
    SELECT DISTINCT u FROM (
      SELECT user_id AS u
      FROM public.match_participants
      WHERE match_id = NEW.id
        AND user_id IS NOT NULL
        AND status IN ('confirmed', 'pending')
      UNION
      SELECT nominated_by AS u
      FROM public.match_participants
      WHERE match_id = NEW.id
        AND nominated_by IS NOT NULL
    ) t
    WHERE u IS NOT NULL
  LOOP
    INSERT INTO public.notifications (
      recipient_user_id, kind, match_id, match_participant_id, actor_user_id, note
    ) VALUES (
      v_uid, 'match_cancelled', NEW.id, NULL, auth.uid(), NULL
    );
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_notify_on_match_cancelled"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_set_formed_at_once"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_required int;
  v_confirmed int;
  v_is_formed boolean;
begin
  -- Recompute for the match affected by participant change
  select m.required_count into v_required
  from public.matches m
  where m.id = new.match_id;

  select count(*)::int into v_confirmed
  from public.match_participants mp
  where mp.match_id = new.match_id
    and mp.status = 'confirmed';

  v_is_formed := (v_confirmed >= v_required);

  -- Write formed_at only once: from NULL -> now() when first formed
  if v_is_formed then
    update public.matches m
    set formed_at = coalesce(m.formed_at, now())
    where m.id = new.match_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_set_formed_at_once"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_set_removed_at_from_status"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'removed'::public.match_participant_status THEN
    IF NEW.removed_at IS NULL THEN
      NEW.removed_at := now();
    END IF;
    -- removed implies not confirmed
    NEW.confirmed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_set_removed_at_from_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_club_handle"("p_handle" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  v_trimmed text;
BEGIN
  v_trimmed := trim(p_handle);

  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'invalid_handle: handle must not be empty';
  END IF;
  IF length(v_trimmed) < 2 THEN
    RAISE EXCEPTION 'invalid_handle: handle must be at least 2 characters';
  END IF;
  IF length(v_trimmed) > 30 THEN
    RAISE EXCEPTION 'invalid_handle: handle must be at most 30 characters';
  END IF;
  IF v_trimmed LIKE '%@%' THEN
    RAISE EXCEPTION 'invalid_handle: handle must not contain @';
  END IF;

  RETURN v_trimmed;
END;
$$;


ALTER FUNCTION "public"."validate_club_handle"("p_handle" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."club_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "club_id" "uuid" NOT NULL,
    "granted_by" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."club_admins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."club_identities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "club_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "club_handle" "text" NOT NULL,
    "club_handle_norm" "text" GENERATED ALWAYS AS ("lower"(TRIM(BOTH FROM "club_handle"))) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visible_in_club_member_discovery" boolean,
    "accept_non_group_invites_in_club" boolean,
    CONSTRAINT "chk_club_handle_length" CHECK ((("length"("club_handle") >= 2) AND ("length"("club_handle") <= 30))),
    CONSTRAINT "chk_club_handle_no_at" CHECK (("club_handle" !~~ '%@%'::"text")),
    CONSTRAINT "chk_club_handle_trimmed" CHECK (("club_handle" = TRIM(BOTH FROM "club_handle")))
);


ALTER TABLE "public"."club_identities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."club_identities"."visible_in_club_member_discovery" IS 'Layer 2: Club-scoped override for discovery. NULL = no override (treat as true). Only applies when profiles.show_in_club_member_discovery is ON.';



COMMENT ON COLUMN "public"."club_identities"."accept_non_group_invites_in_club" IS 'Layer 2: Club-scoped override for non-group invites. NULL = no override (treat as true). Only applies when profiles.allow_non_group_invites is ON.';



CREATE TABLE IF NOT EXISTS "public"."club_sports" (
    "club_id" "uuid" NOT NULL,
    "sport_id" smallint NOT NULL,
    "court_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "club_sports_court_count_check" CHECK (("court_count" >= 0))
);


ALTER TABLE "public"."club_sports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."domain_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "aggregate_type" "text" NOT NULL,
    "aggregate_id" "uuid" NOT NULL,
    "actor_user_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."domain_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."domain_events" IS 'Immutable domain events for invitation/notification architecture. Processed by event processor.';



CREATE TABLE IF NOT EXISTS "public"."email_invitation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invitation_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_invitation_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."email_invitation_events" IS 'Audit events for invitation lifecycle. event_type: invitation_created, email_delivery_requested, email_sent, email_failed, invitation_opened, invitation_verified_email, invitation_landed, invitation_accepted, invitation_declined, invitation_expired.';



CREATE TABLE IF NOT EXISTS "public"."guest_sports" (
    "guest_id" "uuid" NOT NULL,
    "sport_id" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."guest_sports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'email'::"text" NOT NULL,
    "verified_email" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "linked_type" "text" NOT NULL,
    "linked_id" "uuid" NOT NULL,
    "linked_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "identity_links_linked_type_check" CHECK (("linked_type" = ANY (ARRAY['guest_participant'::"text", 'contact'::"text", 'invitation_target'::"text"])))
);


ALTER TABLE "public"."identity_links" OWNER TO "postgres";


COMMENT ON TABLE "public"."identity_links" IS 'Maps verified email to user_id and legacy rows (guest participants, invitations). Link-first: no in-place mutation of historical records.';



CREATE OR REPLACE VIEW "public"."match_counts" AS
 SELECT "m"."id" AS "match_id",
    "m"."required_count",
    ("count"(*) FILTER (WHERE (("mp"."removed_at" IS NULL) AND ("mp"."confirmed_at" IS NOT NULL))))::integer AS "confirmed_count",
    ("count"(*) FILTER (WHERE (("mp"."removed_at" IS NULL) AND ("mp"."confirmed_at" IS NULL))))::integer AS "pending_count"
   FROM ("public"."matches" "m"
     LEFT JOIN "public"."match_participants" "mp" ON (("mp"."match_id" = "m"."id")))
  GROUP BY "m"."id", "m"."required_count";


ALTER VIEW "public"."match_counts" OWNER TO "postgres";


COMMENT ON VIEW "public"."match_counts" IS 'v1.5: Counts confirmed (confirmed_at IS NOT NULL) and pending (confirmed_at IS NULL) non-removed participants per match. Timestamp-based, not status-based.';



CREATE TABLE IF NOT EXISTS "public"."match_courts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "slot_index" integer NOT NULL,
    "court_label" "text" NOT NULL,
    "court_location" "text",
    "court_notes" "text",
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_slot_index" CHECK ((("slot_index" >= 1) AND ("slot_index" <= 12)))
);


ALTER TABLE "public"."match_courts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."match_formed" AS
 SELECT "match_id",
    "required_count",
    "confirmed_count",
    ("confirmed_count" >= "required_count") AS "is_formed",
    "pending_count"
   FROM "public"."match_counts" "mc";


ALTER VIEW "public"."match_formed" OWNER TO "postgres";


COMMENT ON VIEW "public"."match_formed" IS 'v1.5: Extends match_counts with is_formed flag and exposes pending_count. pending_count allows non-organizer scope members to see pending count without leaking names.';



CREATE TABLE IF NOT EXISTS "public"."match_participant_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "match_participant_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "note" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "match_participant_actions_action_type_chk" CHECK (("action_type" = ANY (ARRAY['invite'::"text", 'nominate'::"text", 'nominate_guest'::"text", 'delegate_confirm_guest'::"text", 'request_join'::"text", 'reenter'::"text", 'accept'::"text", 'approve'::"text", 'withdraw'::"text", 'decline'::"text", 'reject_request'::"text", 'revoke_invite'::"text", 'reject_nomination'::"text", 'remove_confirmed'::"text", 'remove'::"text", 'add_guest_org'::"text", 'add_guest_participant'::"text", 'manual_confirm'::"text", 'invited'::"text", 'nominated'::"text", 'requested'::"text", 'accepted'::"text", 'approved'::"text", 'withdrawn'::"text", 'removed'::"text", 'guest_added'::"text", 'declined'::"text", 'delegate_manual_confirm'::"text"])))
);


ALTER TABLE "public"."match_participant_actions" OWNER TO "postgres";


COMMENT ON TABLE "public"."match_participant_actions" IS 'v1.6.1: Lifecycle event log for match participants. action_type values: reenter, invite, nominate, manual_confirm, delegate_manual_confirm, accept. Written only by SECURITY DEFINER RPCs. Direct insert by authenticated is not permitted.';



CREATE TABLE IF NOT EXISTS "public"."notification_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid",
    "email_invitation_id" "uuid",
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "provider" "text" DEFAULT 'resend'::"text" NOT NULL,
    "destination" "text" NOT NULL,
    "delivery_status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "last_attempt_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "provider_message_id" "text",
    "error_code" "text",
    "error_message" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_deliveries_delivery_status_check" CHECK (("delivery_status" = ANY (ARRAY['queued'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."notification_deliveries" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_deliveries" IS 'Delivery queue. Worker processes queued rows, sends via Resend, updates status.';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "match_id" "uuid",
    "match_participant_id" "uuid",
    "actor_user_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "first_name" "text" DEFAULT ''::"text" NOT NULL,
    "middle_name" "text",
    "last_name" "text" DEFAULT ''::"text" NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "gender" "text" DEFAULT 'unspecified'::"text",
    "level" "text",
    "availability_note" "text",
    "plays_singles" boolean DEFAULT true NOT NULL,
    "plays_doubles" boolean DEFAULT true NOT NULL,
    "primary_club_id" "uuid",
    "secondary_club_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_super_admin" boolean DEFAULT false NOT NULL,
    "contact_channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "contact_email" "text",
    "contact_phone" "text",
    "show_in_club_member_discovery" boolean DEFAULT true NOT NULL,
    "allow_non_group_invites" boolean DEFAULT true NOT NULL,
    "auto_add_played_users_to_invite_circle" boolean DEFAULT false NOT NULL,
    CONSTRAINT "profiles_contact_channel_check" CHECK (("contact_channel" = ANY (ARRAY['email'::"text", 'sms'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."contact_channel" IS 'Preferred contact channel: email or sms';



COMMENT ON COLUMN "public"."profiles"."contact_email" IS 'Contact email. NULL = use auth.users.email. User can override in profile.';



COMMENT ON COLUMN "public"."profiles"."contact_phone" IS 'Contact phone for SMS. Used when contact_channel=sms';



COMMENT ON COLUMN "public"."profiles"."show_in_club_member_discovery" IS 'Phase 1: Discoverability. Whether user appears in club member discovery. Distinct from invite permission.';



COMMENT ON COLUMN "public"."profiles"."allow_non_group_invites" IS 'Phase 1: Invite permission. Whether user may be invited via non-group direct path (Club Members / Invite Circle). Distinct from discoverability.';



COMMENT ON COLUMN "public"."profiles"."auto_add_played_users_to_invite_circle" IS 'Phase 1: Preference for future auto-add. When true, played-with users may be auto-added to Invite Circle. No logic implemented yet.';



CREATE OR REPLACE VIEW "public"."profile_display" AS
 SELECT "id",
    "display_name",
    "avatar_url"
   FROM "public"."profiles";


ALTER VIEW "public"."profile_display" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_personal_remarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "group_id" "uuid",
    "remark" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_personal_remarks" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_personal_remarks" IS 'Identity v1.5: private remark labels (owner-only). Used for display priority in group context.';



COMMENT ON COLUMN "public"."user_personal_remarks"."group_id" IS 'Optional scope. When set, remark applies within that group context.';



CREATE TABLE IF NOT EXISTS "public"."user_roster_guests" (
    "owner_user_id" "uuid" NOT NULL,
    "guest_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL
);


ALTER TABLE "public"."user_roster_guests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_sports" (
    "user_id" "uuid" NOT NULL,
    "sport_id" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_sports" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_group_member_display" AS
 SELECT "gm"."group_id",
    "gm"."user_id" AS "member_user_id",
    COALESCE(NULLIF("upr"."remark", ''::"text"), NULLIF("gm"."group_display_name", ''::"text"), "p"."display_name") AS "effective_display_name",
    "gm"."group_display_name",
    "p"."display_name",
    "upr"."remark" AS "personal_remark"
   FROM (("public"."group_members" "gm"
     JOIN "public"."profiles" "p" ON (("p"."id" = "gm"."user_id")))
     LEFT JOIN "public"."user_personal_remarks" "upr" ON ((("upr"."owner_id" = "auth"."uid"()) AND ("upr"."target_user_id" = "gm"."user_id") AND ("upr"."group_id" = "gm"."group_id"))));


ALTER VIEW "public"."v_group_member_display" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_group_member_display" IS 'Identity v1.5: group-context display resolver. Priority: personal_remark > group_display_name > display_name.';



ALTER TABLE ONLY "public"."club_admins"
    ADD CONSTRAINT "club_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."club_identities"
    ADD CONSTRAINT "club_identities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."club_sports"
    ADD CONSTRAINT "club_sports_pkey" PRIMARY KEY ("club_id", "sport_id");



ALTER TABLE ONLY "public"."clubs"
    ADD CONSTRAINT "clubs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courts"
    ADD CONSTRAINT "courts_club_id_court_code_key" UNIQUE ("club_id", "court_code");



ALTER TABLE ONLY "public"."courts"
    ADD CONSTRAINT "courts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."domain_events"
    ADD CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_invitation_events"
    ADD CONSTRAINT "email_invitation_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_invitations"
    ADD CONSTRAINT "email_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_user_id_key" UNIQUE ("group_id", "user_id");



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_sports"
    ADD CONSTRAINT "guest_sports_pkey" PRIMARY KEY ("guest_id", "sport_id");



ALTER TABLE ONLY "public"."guests"
    ADD CONSTRAINT "guests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "identity_links_user_id_linked_type_linked_id_key" UNIQUE ("user_id", "linked_type", "linked_id");



ALTER TABLE ONLY "public"."match_courts"
    ADD CONSTRAINT "match_courts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_participant_actions"
    ADD CONSTRAINT "match_participant_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sports"
    ADD CONSTRAINT "sports_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."sports"
    ADD CONSTRAINT "sports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."club_admins"
    ADD CONSTRAINT "uq_club_admin" UNIQUE ("user_id", "club_id");



ALTER TABLE ONLY "public"."club_identities"
    ADD CONSTRAINT "uq_club_identity_handle_norm" UNIQUE ("club_id", "club_handle_norm");



ALTER TABLE ONLY "public"."club_identities"
    ADD CONSTRAINT "uq_club_identity_user" UNIQUE ("club_id", "user_id");



ALTER TABLE ONLY "public"."match_courts"
    ADD CONSTRAINT "uq_match_court_slot" UNIQUE ("match_id", "slot_index");



ALTER TABLE ONLY "public"."user_invite_circle"
    ADD CONSTRAINT "user_invite_circle_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_invite_circle"
    ADD CONSTRAINT "user_invite_circle_unique" UNIQUE ("owner_user_id", "target_user_id");



ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_unique" UNIQUE ("owner_id", "target_user_id", "group_id");



ALTER TABLE ONLY "public"."user_roster_guests"
    ADD CONSTRAINT "user_roster_guests_pkey" PRIMARY KEY ("owner_user_id", "guest_id");



ALTER TABLE ONLY "public"."user_sports"
    ADD CONSTRAINT "user_sports_pkey" PRIMARY KEY ("user_id", "sport_id");



CREATE INDEX "idx_domain_events_aggregate" ON "public"."domain_events" USING "btree" ("aggregate_type", "aggregate_id");



CREATE INDEX "idx_domain_events_type_created" ON "public"."domain_events" USING "btree" ("event_type", "created_at" DESC);



CREATE INDEX "idx_email_invitation_events_invitation" ON "public"."email_invitation_events" USING "btree" ("invitation_id", "created_at");



CREATE INDEX "idx_email_invitations_match_participant_id" ON "public"."email_invitations" USING "btree" ("match_participant_id");



CREATE INDEX "idx_email_invitations_related" ON "public"."email_invitations" USING "btree" ("related_type", "related_id");



CREATE INDEX "idx_email_invitations_status_created" ON "public"."email_invitations" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_email_invitations_target_email" ON "public"."email_invitations" USING "btree" ("target_email");



CREATE INDEX "idx_groups_primary_sport_id" ON "public"."groups" USING "btree" ("primary_sport_id");



CREATE INDEX "idx_guest_sports_guest" ON "public"."guest_sports" USING "btree" ("guest_id");



CREATE INDEX "idx_guest_sports_sport" ON "public"."guest_sports" USING "btree" ("sport_id");



CREATE INDEX "idx_identity_links_linked" ON "public"."identity_links" USING "btree" ("linked_type", "linked_id");



CREATE INDEX "idx_identity_links_user_id" ON "public"."identity_links" USING "btree" ("user_id");



CREATE INDEX "idx_identity_links_verified_email" ON "public"."identity_links" USING "btree" ("lower"(TRIM(BOTH FROM "verified_email")));



CREATE INDEX "idx_matches_sport_id" ON "public"."matches" USING "btree" ("sport_id");



CREATE INDEX "idx_mpa_match" ON "public"."match_participant_actions" USING "btree" ("match_id");



CREATE INDEX "idx_mpa_participant" ON "public"."match_participant_actions" USING "btree" ("match_participant_id");



CREATE INDEX "idx_notification_deliveries_queued" ON "public"."notification_deliveries" USING "btree" ("delivery_status", "created_at") WHERE ("delivery_status" = 'queued'::"text");



CREATE INDEX "idx_notifications_recipient_created_at" ON "public"."notifications" USING "btree" ("recipient_user_id", "created_at" DESC);



CREATE INDEX "idx_user_invite_circle_owner_created" ON "public"."user_invite_circle" USING "btree" ("owner_user_id", "created_at" DESC);



CREATE INDEX "idx_user_roster_guests_guest" ON "public"."user_roster_guests" USING "btree" ("guest_id");



CREATE INDEX "idx_user_roster_guests_owner" ON "public"."user_roster_guests" USING "btree" ("owner_user_id");



CREATE INDEX "idx_user_sports_sport" ON "public"."user_sports" USING "btree" ("sport_id");



CREATE INDEX "idx_user_sports_user" ON "public"."user_sports" USING "btree" ("user_id");



CREATE INDEX "mpa_match_id_created_at_idx" ON "public"."match_participant_actions" USING "btree" ("match_id", "created_at" DESC);



CREATE INDEX "mpa_mp_id_created_at_idx" ON "public"."match_participant_actions" USING "btree" ("match_participant_id", "created_at" DESC);



CREATE UNIQUE INDEX "uq_match_participants_active_user" ON "public"."match_participants" USING "btree" ("match_id", "user_id") WHERE (("user_id" IS NOT NULL) AND ("status" <> 'removed'::"public"."match_participant_status"));



CREATE UNIQUE INDEX "uq_mp_active_guest" ON "public"."match_participants" USING "btree" ("match_id", "guest_id") WHERE (("guest_id" IS NOT NULL) AND ("status" <> 'removed'::"public"."match_participant_status"));



CREATE UNIQUE INDEX "uq_mp_active_user" ON "public"."match_participants" USING "btree" ("match_id", "user_id") WHERE (("user_id" IS NOT NULL) AND ("status" <> 'removed'::"public"."match_participant_status"));



CREATE UNIQUE INDEX "uq_mpa_dedup" ON "public"."match_participant_actions" USING "btree" ("match_participant_id", "action_type", "created_at");



CREATE OR REPLACE TRIGGER "notify_delegator_on_mp_change" AFTER UPDATE OF "confirmed_at", "removed_at" ON "public"."match_participants" FOR EACH ROW WHEN ((("new"."confirmed_at" IS DISTINCT FROM "old"."confirmed_at") OR ("new"."removed_at" IS DISTINCT FROM "old"."removed_at"))) EXECUTE FUNCTION "public"."trg_notify_delegator_on_mp_change"();



CREATE OR REPLACE TRIGGER "notify_on_invite_nominate" AFTER INSERT ON "public"."match_participants" FOR EACH ROW WHEN ((("new"."user_id" IS NOT NULL) AND ("new"."join_method" = ANY (ARRAY['invited'::"public"."match_join_method", 'nominated'::"public"."match_join_method"])))) EXECUTE FUNCTION "public"."trg_notify_on_invite_nominate"();



CREATE OR REPLACE TRIGGER "notify_on_match_cancelled" AFTER UPDATE OF "status" ON "public"."matches" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."trg_notify_on_match_cancelled"();



CREATE OR REPLACE TRIGGER "set_formed_at_once_on_mp" AFTER INSERT OR UPDATE OF "status" ON "public"."match_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_formed_at_once"();



CREATE OR REPLACE TRIGGER "set_updated_at__user_personal_remarks" BEFORE UPDATE ON "public"."user_personal_remarks" FOR EACH ROW EXECUTE FUNCTION "public"."tg__set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_compute_match_start_at_utc" BEFORE INSERT OR UPDATE OF "match_date", "start_time", "club_id" ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."compute_match_start_at_utc"();



CREATE OR REPLACE TRIGGER "trg_email_invitation_anchor_consistency" BEFORE INSERT OR UPDATE OF "match_participant_id", "related_type", "related_id" ON "public"."email_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."trg_email_invitation_anchor_consistency"();



CREATE OR REPLACE TRIGGER "trg_emit_match_formed" AFTER UPDATE OF "formed_at" ON "public"."matches" FOR EACH ROW WHEN ((("old"."formed_at" IS NULL) AND ("new"."formed_at" IS NOT NULL))) EXECUTE FUNCTION "public"."fn_emit_match_formed_on_formed_at"();



CREATE OR REPLACE TRIGGER "trg_guard_participant_state" BEFORE UPDATE ON "public"."match_participants" FOR EACH ROW EXECUTE FUNCTION "public"."fn_guard_participant_state"();



CREATE OR REPLACE TRIGGER "trg_match_detail_change_reconfirm" AFTER UPDATE OF "match_date", "start_time", "duration_minutes", "club_id", "court_ids" ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."fn_match_detail_change_reconfirm"();



CREATE OR REPLACE TRIGGER "trg_set_removed_at_from_status" BEFORE UPDATE OF "status" ON "public"."match_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_removed_at_from_status"();



ALTER TABLE ONLY "public"."club_admins"
    ADD CONSTRAINT "club_admins_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_admins"
    ADD CONSTRAINT "club_admins_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."club_admins"
    ADD CONSTRAINT "club_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_identities"
    ADD CONSTRAINT "club_identities_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_identities"
    ADD CONSTRAINT "club_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_sports"
    ADD CONSTRAINT "club_sports_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."club_sports"
    ADD CONSTRAINT "club_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."courts"
    ADD CONSTRAINT "courts_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."domain_events"
    ADD CONSTRAINT "domain_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_invitation_events"
    ADD CONSTRAINT "email_invitation_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_invitation_events"
    ADD CONSTRAINT "email_invitation_events_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."email_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_invitations"
    ADD CONSTRAINT "email_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_invitations"
    ADD CONSTRAINT "email_invitations_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_invitations"
    ADD CONSTRAINT "email_invitations_match_participant_id_fkey" FOREIGN KEY ("match_participant_id") REFERENCES "public"."match_participants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_boundary_keeper_id_fkey" FOREIGN KEY ("boundary_keeper_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_primary_sport_id_fkey" FOREIGN KEY ("primary_sport_id") REFERENCES "public"."sports"("id");



ALTER TABLE ONLY "public"."guest_sports"
    ADD CONSTRAINT "guest_sports_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guest_sports"
    ADD CONSTRAINT "guest_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id");



ALTER TABLE ONLY "public"."guests"
    ADD CONSTRAINT "guests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "identity_links_linked_by_user_id_fkey" FOREIGN KEY ("linked_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "identity_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_courts"
    ADD CONSTRAINT "match_courts_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_participant_actions"
    ADD CONSTRAINT "match_participant_actions_match_participant_id_fkey" FOREIGN KEY ("match_participant_id") REFERENCES "public"."match_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_manual_confirmed_by_fkey" FOREIGN KEY ("manual_confirmed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id");



ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_email_invitation_id_fkey" FOREIGN KEY ("email_invitation_id") REFERENCES "public"."email_invitations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_primary_club_fk" FOREIGN KEY ("primary_club_id") REFERENCES "public"."clubs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_invite_circle"
    ADD CONSTRAINT "user_invite_circle_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_invite_circle"
    ADD CONSTRAINT "user_invite_circle_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roster_guests"
    ADD CONSTRAINT "user_roster_guests_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_sports"
    ADD CONSTRAINT "user_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id");



ALTER TABLE ONLY "public"."user_sports"
    ADD CONSTRAINT "user_sports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."club_admins" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "club_admins_select" ON "public"."club_admins" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_super_admin" = true))))));



ALTER TABLE "public"."club_identities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "club_identities_select" ON "public"."club_identities" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."clubs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clubs_select_auth" ON "public"."clubs" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."courts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "courts_select_auth" ON "public"."courts" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."domain_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "domain_events_no_select" ON "public"."domain_events" FOR SELECT TO "authenticated" USING (false);



CREATE POLICY "domain_events_service_insert" ON "public"."domain_events" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."email_invitation_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_invitation_events_internal" ON "public"."email_invitation_events" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."email_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "email_invitations_insert_inviter" ON "public"."email_invitations" FOR INSERT TO "authenticated" WITH CHECK (("inviter_user_id" = "auth"."uid"()));



CREATE POLICY "email_invitations_no_direct_select" ON "public"."email_invitations" FOR SELECT TO "authenticated" USING (false);



CREATE POLICY "email_invitations_no_direct_update" ON "public"."email_invitations" FOR UPDATE TO "authenticated" USING (false);



ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "group_members_insert_bk" ON "public"."group_members" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND ("g"."boundary_keeper_id" = "auth"."uid"())))) AND ("invited_by" = "auth"."uid"())));



CREATE POLICY "group_members_select" ON "public"."group_members" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND ("g"."boundary_keeper_id" = "auth"."uid"())))) OR (("status" = 'active'::"public"."group_member_status") AND "public"."is_group_active_member"("group_id", "auth"."uid"())) OR ("user_id" = "auth"."uid"())));



CREATE POLICY "group_members_select_active_roster_for_active_members" ON "public"."group_members" FOR SELECT TO "authenticated" USING ((("status" = 'active'::"public"."group_member_status") AND "public"."is_group_member_any"("group_id", "auth"."uid"())));



CREATE POLICY "group_members_select_bk" ON "public"."group_members" FOR SELECT TO "authenticated" USING (("public"."group_boundary_keeper_id"("group_id") = "auth"."uid"()));



CREATE POLICY "group_members_select_self" ON "public"."group_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "group_members_update_bk" ON "public"."group_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND ("g"."boundary_keeper_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND ("g"."boundary_keeper_id" = "auth"."uid"())))));



CREATE POLICY "group_members_update_self_accept" ON "public"."group_members" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"public"."group_member_status"))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'active'::"public"."group_member_status")));



ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "groups_insert_self" ON "public"."groups" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("boundary_keeper_id" = "auth"."uid"())));



CREATE POLICY "groups_select_member" ON "public"."groups" FOR SELECT TO "authenticated" USING ("public"."is_group_member_any"("id", "auth"."uid"()));



CREATE POLICY "groups_update_bk" ON "public"."groups" FOR UPDATE TO "authenticated" USING (("boundary_keeper_id" = "auth"."uid"())) WITH CHECK (("boundary_keeper_id" = "auth"."uid"()));



ALTER TABLE "public"."guest_sports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "guest_sports_delete_by_creator" ON "public"."guest_sports" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."guests" "g"
  WHERE (("g"."id" = "guest_sports"."guest_id") AND ("g"."created_by" = "auth"."uid"())))));



CREATE POLICY "guest_sports_select_all_auth" ON "public"."guest_sports" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "guest_sports_write_by_creator" ON "public"."guest_sports" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."guests" "g"
  WHERE (("g"."id" = "guest_sports"."guest_id") AND ("g"."created_by" = "auth"."uid"())))));



ALTER TABLE "public"."guests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "guests_insert_auth" ON "public"."guests" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));



CREATE POLICY "guests_select_authenticated" ON "public"."guests" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "guests_select_for_match_people" ON "public"."guests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."match_participants" "mp"
     JOIN "public"."matches" "m" ON (("m"."id" = "mp"."match_id")))
  WHERE (("mp"."guest_id" = "guests"."id") AND (("m"."organizer_id" = "auth"."uid"()) OR "public"."is_match_participant_active"("m"."id", "auth"."uid"()))))));



CREATE POLICY "guests_write_none" ON "public"."guests" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."identity_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "identity_links_insert_service" ON "public"."identity_links" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "identity_links_select_own" ON "public"."identity_links" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "insert_internal_notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);



ALTER TABLE "public"."match_courts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_courts_delete" ON "public"."match_courts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."matches"
  WHERE (("matches"."id" = "match_courts"."match_id") AND ("matches"."organizer_id" = "auth"."uid"())))));



CREATE POLICY "match_courts_insert" ON "public"."match_courts" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."matches"
  WHERE (("matches"."id" = "match_courts"."match_id") AND ("matches"."organizer_id" = "auth"."uid"()))))));



CREATE POLICY "match_courts_select" ON "public"."match_courts" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."matches" "m"
  WHERE (("m"."id" = "match_courts"."match_id") AND ("m"."organizer_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."match_id" = "match_courts"."match_id") AND ("mp"."user_id" = "auth"."uid"()) AND ("mp"."status" = ANY (ARRAY['pending'::"public"."match_participant_status", 'confirmed'::"public"."match_participant_status"])))))));



CREATE POLICY "match_courts_update" ON "public"."match_courts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."matches"
  WHERE (("matches"."id" = "match_courts"."match_id") AND ("matches"."organizer_id" = "auth"."uid"())))));



ALTER TABLE "public"."match_participant_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_participant_actions_select_organizer" ON "public"."match_participant_actions" FOR SELECT TO "authenticated" USING ("public"."is_match_organizer"("match_id", "auth"."uid"()));



ALTER TABLE "public"."match_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_participants_insert_guest" ON "public"."match_participants" FOR INSERT TO "authenticated" WITH CHECK ((("join_method" = 'guest_add'::"public"."match_join_method") AND ("created_by" = "auth"."uid"()) AND ("guest_id" IS NOT NULL) AND ("user_id" IS NULL) AND (("public"."is_match_organizer"("match_id", "auth"."uid"()) AND ("status" = 'confirmed'::"public"."match_participant_status")) OR ((NOT "public"."is_match_organizer"("match_id", "auth"."uid"())) AND "public"."can_add_guests"("match_id", "auth"."uid"()) AND ("status" = 'pending'::"public"."match_participant_status")))));



COMMENT ON POLICY "match_participants_insert_guest" ON "public"."match_participants" IS 'v1.3: Guest insert. ORG→confirmed, participant→pending. Identity-bound status constraint. No admission_mode dependency.';



CREATE POLICY "match_participants_insert_guest_by_org" ON "public"."match_participants" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_match_organizer"("match_id", "auth"."uid"()) AND ("join_method" = 'guest_add'::"public"."match_join_method") AND ("created_by" = "auth"."uid"()) AND ("guest_id" IS NOT NULL)));



CREATE POLICY "match_participants_insert_invite_by_org" ON "public"."match_participants" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_invite_users"("match_id", "auth"."uid"()) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("status" = 'pending'::"public"."match_participant_status") AND ("created_by" = "auth"."uid"()) AND ("user_id" IS NOT NULL) AND ("guest_id" IS NULL)));



CREATE POLICY "match_participants_insert_request" ON "public"."match_participants" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("join_method" = 'requested'::"public"."match_join_method") AND ("status" = 'pending'::"public"."match_participant_status") AND ("created_by" = "auth"."uid"()) AND "public"."is_user_in_match_scope"("match_id", "auth"."uid"())));



CREATE POLICY "match_participants_select_identity_linked" ON "public"."match_participants" FOR SELECT TO "authenticated" USING ((("guest_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."identity_links" "il"
  WHERE (("il"."linked_type" = 'guest_participant'::"text") AND ("il"."linked_id" = "match_participants"."id") AND ("il"."user_id" = "auth"."uid"()))))));



CREATE POLICY "match_participants_select_pending_guest" ON "public"."match_participants" FOR SELECT TO "authenticated" USING ((("status" = 'pending'::"public"."match_participant_status") AND ("guest_id" IS NOT NULL) AND ("removed_at" IS NULL) AND "public"."is_caller_confirmed_in_match"("match_id") AND ("public"."is_caller_in_match_scope"("match_id") OR "public"."is_caller_match_associated"("match_id"))));



CREATE POLICY "match_participants_select_pending_invited" ON "public"."match_participants" FOR SELECT TO "authenticated" USING ((("status" = 'pending'::"public"."match_participant_status") AND ("user_id" IS NOT NULL) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("participant_accepted_at" IS NULL) AND ("removed_at" IS NULL) AND "public"."sharegroup_exists"("auth"."uid"(), "user_id") AND "public"."is_caller_confirmed_in_match"("match_id") AND ("public"."is_caller_in_match_scope"("match_id") OR "public"."is_caller_match_associated"("match_id"))));



CREATE POLICY "match_participants_select_pending_nominated" ON "public"."match_participants" FOR SELECT TO "authenticated" USING ((("status" = 'pending'::"public"."match_participant_status") AND ("user_id" IS NOT NULL) AND ("join_method" = 'nominated'::"public"."match_join_method") AND ("participant_accepted_at" IS NULL) AND ("removed_at" IS NULL) AND "public"."sharegroup_exists"("auth"."uid"(), "user_id") AND ("public"."is_caller_in_match_scope"("match_id") OR "public"."is_caller_match_associated"("match_id"))));



CREATE POLICY "match_participants_select_v1_6_1" ON "public"."match_participants" FOR SELECT TO "authenticated" USING (("public"."is_match_organizer"("match_id", "auth"."uid"()) OR ("user_id" = "auth"."uid"()) OR (("status" = 'confirmed'::"public"."match_participant_status") AND ("public"."is_caller_in_match_scope"("match_id") OR "public"."sharegroup_exists"("auth"."uid"(), "public"."match_organizer_id"("match_id")) OR "public"."is_caller_match_associated"("match_id")))));



CREATE POLICY "match_participants_update_org_only" ON "public"."match_participants" FOR UPDATE TO "authenticated" USING ("public"."is_match_organizer"("match_id", "auth"."uid"())) WITH CHECK ("public"."is_match_organizer"("match_id", "auth"."uid"()));



CREATE POLICY "match_participants_update_self_invite" ON "public"."match_participants" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("status" = 'pending'::"public"."match_participant_status"))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("status" = ANY (ARRAY['confirmed'::"public"."match_participant_status", 'removed'::"public"."match_participant_status"]))));



CREATE POLICY "match_participants_update_self_leave" ON "public"."match_participants" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"public"."match_participant_status", 'confirmed'::"public"."match_participant_status"])))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'removed'::"public"."match_participant_status")));



ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matches_insert_self" ON "public"."matches" FOR INSERT TO "authenticated" WITH CHECK (("organizer_id" = "auth"."uid"()));



CREATE POLICY "matches_select_visibility" ON "public"."matches" FOR SELECT TO "authenticated" USING ((("organizer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."match_id" = "matches"."id") AND ("mp"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."match_participants" "mp"
     JOIN "public"."identity_links" "il" ON ((("il"."linked_type" = 'guest_participant'::"text") AND ("il"."linked_id" = "mp"."id") AND ("il"."user_id" = "auth"."uid"()))))
  WHERE ("mp"."match_id" = "matches"."id"))) OR "public"."is_caller_in_match_scope"("id")));



CREATE POLICY "matches_update_organizer" ON "public"."matches" FOR UPDATE TO "authenticated" USING (("organizer_id" = "auth"."uid"())) WITH CHECK (("organizer_id" = "auth"."uid"()));



CREATE POLICY "mpa_select" ON "public"."match_participant_actions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."id" = "match_participant_actions"."match_participant_id") AND (("mp"."user_id" = "auth"."uid"()) OR "public"."is_match_organizer"("mp"."match_id", "auth"."uid"()))))));



CREATE POLICY "mpa_select_in_scope" ON "public"."match_participant_actions" FOR SELECT TO "authenticated" USING (("public"."is_caller_in_match_scope"("match_id") OR "public"."is_caller_match_associated"("match_id")));



ALTER TABLE "public"."notification_deliveries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notification_deliveries_internal" ON "public"."notification_deliveries" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = "auth"."uid"()) AND (("display_name" IS NULL) OR ("display_name" = ''::"text")) AND (("first_name" IS NULL) OR ("first_name" = ''::"text")) AND (("last_name" IS NULL) OR ("last_name" = ''::"text"))));



CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "select_own_notifications" ON "public"."notifications" FOR SELECT USING (("recipient_user_id" = "auth"."uid"()));



CREATE POLICY "uic_delete_own" ON "public"."user_invite_circle" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "uic_insert_own" ON "public"."user_invite_circle" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "uic_select_own" ON "public"."user_invite_circle" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "update_own_notifications" ON "public"."notifications" FOR UPDATE USING (("recipient_user_id" = "auth"."uid"())) WITH CHECK (("recipient_user_id" = "auth"."uid"()));



CREATE POLICY "upr_delete_own" ON "public"."user_personal_remarks" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "upr_insert_own" ON "public"."user_personal_remarks" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "upr_select_own" ON "public"."user_personal_remarks" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "upr_update_own" ON "public"."user_personal_remarks" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."user_invite_circle" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_personal_remarks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roster_guests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roster_guests_select_owner" ON "public"."user_roster_guests" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "user_roster_guests_write_none" ON "public"."user_roster_guests" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."user_sports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_sports_delete_own" ON "public"."user_sports" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_sports_select_own" ON "public"."user_sports" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "user_sports_write_own" ON "public"."user_sports" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") TO "service_role";



GRANT ALL ON TABLE "public"."match_participants" TO "anon";
GRANT ALL ON TABLE "public"."match_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."match_participants" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_add_guests"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_add_guests"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_add_guests"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_invite_users"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_invite_users"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_invite_users"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_participants"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_participants"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_participants"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_match_start_at_utc"() TO "anon";
GRANT ALL ON FUNCTION "public"."compute_match_start_at_utc"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_match_start_at_utc"() TO "service_role";



GRANT ALL ON FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_emit_match_formed_on_formed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_emit_match_formed_on_formed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_emit_match_formed_on_formed_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_guard_participant_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_guard_participant_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_guard_participant_state"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_match_detail_change_reconfirm"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_match_detail_change_reconfirm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_match_detail_change_reconfirm"() TO "service_role";



GRANT ALL ON FUNCTION "public"."group_boundary_keeper_id"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."group_boundary_keeper_id"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."group_boundary_keeper_id"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_club_admin"("p_club_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_club_admin"("p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_club_admin"("p_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_active_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_active_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_active_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_active_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_active_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_active_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_match_organizer"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_match_organizer"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_match_organizer"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_match_participant_active"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_match_participant_active"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_match_participant_active"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_match_participant_confirmed"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_match_participant_confirmed"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_match_participant_confirmed"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_in_match_scope"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_in_match_scope"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_in_match_scope"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_participant_action"("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text", "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."log_participant_action"("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_participant_action"("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text", "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_organizer_id"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_organizer_id"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_organizer_id"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_admin_user_search"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_admin_user_search"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_admin_user_search"("p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_admin_grant"("p_user_id" "uuid", "p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_admin_grant"("p_user_id" "uuid", "p_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_admin_revoke"("p_user_id" "uuid", "p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_admin_revoke"("p_user_id" "uuid", "p_club_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."clubs" TO "anon";
GRANT ALL ON TABLE "public"."clubs" TO "authenticated";
GRANT ALL ON TABLE "public"."clubs" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_create"("p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_create"("p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_create"("p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_handle_check"("p_club_id" "uuid", "p_handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_handle_check"("p_club_id" "uuid", "p_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_handle_check"("p_club_id" "uuid", "p_handle" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_handle_set"("p_club_id" "uuid", "p_new_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_handle_set"("p_club_id" "uuid", "p_new_handle" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_identity_set_preferences"("p_club_id" "uuid", "p_visible_in_club_member_discovery" "text", "p_accept_non_group_invites_in_club" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_identity_set_preferences"("p_club_id" "uuid", "p_visible_in_club_member_discovery" "text", "p_accept_non_group_invites_in_club" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_identity_set_preferences"("p_club_id" "uuid", "p_visible_in_club_member_discovery" "text", "p_accept_non_group_invites_in_club" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_join"("p_club_id" "uuid", "p_handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_join"("p_club_id" "uuid", "p_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_join"("p_club_id" "uuid", "p_handle" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_members_discovery"("p_club_id" "uuid", "p_search" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_members_discovery"("p_club_id" "uuid", "p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_members_discovery"("p_club_id" "uuid", "p_search" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_update"("p_club_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_update"("p_club_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_update"("p_club_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_contact_player_resolution"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_contact_player_resolution"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_contact_player_resolution"() TO "service_role";



GRANT ALL ON TABLE "public"."courts" TO "anon";
GRANT ALL ON TABLE "public"."courts" TO "authenticated";
GRANT ALL ON TABLE "public"."courts" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_court_create"("p_club_id" "uuid", "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_court_create"("p_club_id" "uuid", "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_court_create"("p_club_id" "uuid", "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON TABLE "public"."email_invitations" TO "anon";
GRANT ALL ON TABLE "public"."email_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."email_invitations" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_email_invitation_create"("p_target_email" "text", "p_target_name" "text", "p_related_type" "text", "p_related_id" "uuid", "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_create"("p_target_email" "text", "p_target_name" "text", "p_related_type" "text", "p_related_id" "uuid", "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_create"("p_target_email" "text", "p_target_name" "text", "p_related_type" "text", "p_related_id" "uuid", "p_expires_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_email_invitation_get"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_get"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_get"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_get_queued_deliveries"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_get_queued_deliveries"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_get_queued_deliveries"("p_limit" integer) TO "service_role";



GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_group_accept_invite"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_accept_invite"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_accept_invite"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_group_create"("p_name" "text", "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_create"("p_name" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_create"("p_name" "text", "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_invite_circle_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_list"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."user_invite_circle" TO "anon";
GRANT ALL ON TABLE "public"."user_invite_circle" TO "authenticated";
GRANT ALL ON TABLE "public"."user_invite_circle" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_club_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_club_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_delegate_confirm_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_delegate_confirm_participant"("p_match_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_process_domain_event"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_process_domain_event"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_process_domain_event"("p_event_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_set_primary_club"("p_club_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_primary_club"("p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_primary_club"("p_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_club_member_discovery" boolean, "p_allow_non_group_invites" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_club_member_discovery" boolean, "p_allow_non_group_invites" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_club_member_discovery" boolean, "p_allow_non_group_invites" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_guest_participants"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_guest_participants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_guest_participants"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) TO "service_role";



GRANT ALL ON TABLE "public"."guests" TO "anon";
GRANT ALL ON TABLE "public"."guests" TO "authenticated";
GRANT ALL ON TABLE "public"."guests" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_roster_guest_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_list"() TO "service_role";



GRANT ALL ON TABLE "public"."sports" TO "anon";
GRANT ALL ON TABLE "public"."sports" TO "authenticated";
GRANT ALL ON TABLE "public"."sports" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_sports_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_sports_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_sports_list"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_update_delivery_result"("p_delivery_id" "uuid", "p_status" "text", "p_provider_message_id" "text", "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_update_delivery_result"("p_delivery_id" "uuid", "p_status" "text", "p_provider_message_id" "text", "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_update_delivery_result"("p_delivery_id" "uuid", "p_status" "text", "p_provider_message_id" "text", "p_error_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_user_sports_set"("p_sport_codes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_user_sports_set"("p_sport_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_user_sports_set"("p_sport_codes" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sharegroup_exists"("p_user_a" "uuid", "p_user_b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sharegroup_exists"("p_user_a" "uuid", "p_user_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sharegroup_exists"("p_user_a" "uuid", "p_user_b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."test_runner_v161"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_runner_v161"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_runner_v161"() TO "service_role";



GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"("p_run_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"("p_run_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"("p_run_suffix" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."tg__set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg__set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg__set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_email_invitation_anchor_consistency"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_email_invitation_anchor_consistency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_email_invitation_anchor_consistency"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_delegator_on_mp_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_delegator_on_mp_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_delegator_on_mp_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_on_invite_nominate"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_on_invite_nominate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_on_invite_nominate"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_notify_on_match_cancelled"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_on_match_cancelled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_on_match_cancelled"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_set_formed_at_once"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_formed_at_once"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_formed_at_once"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_set_removed_at_from_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_removed_at_from_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_removed_at_from_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_club_handle"("p_handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_club_handle"("p_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_club_handle"("p_handle" "text") TO "service_role";



GRANT ALL ON TABLE "public"."club_admins" TO "anon";
GRANT ALL ON TABLE "public"."club_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."club_admins" TO "service_role";



GRANT ALL ON TABLE "public"."club_identities" TO "anon";
GRANT ALL ON TABLE "public"."club_identities" TO "authenticated";
GRANT ALL ON TABLE "public"."club_identities" TO "service_role";



GRANT ALL ON TABLE "public"."club_sports" TO "anon";
GRANT ALL ON TABLE "public"."club_sports" TO "authenticated";
GRANT ALL ON TABLE "public"."club_sports" TO "service_role";



GRANT ALL ON TABLE "public"."domain_events" TO "anon";
GRANT ALL ON TABLE "public"."domain_events" TO "authenticated";
GRANT ALL ON TABLE "public"."domain_events" TO "service_role";



GRANT ALL ON TABLE "public"."email_invitation_events" TO "anon";
GRANT ALL ON TABLE "public"."email_invitation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."email_invitation_events" TO "service_role";



GRANT ALL ON TABLE "public"."guest_sports" TO "anon";
GRANT ALL ON TABLE "public"."guest_sports" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_sports" TO "service_role";



GRANT ALL ON TABLE "public"."identity_links" TO "anon";
GRANT ALL ON TABLE "public"."identity_links" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_links" TO "service_role";



GRANT ALL ON TABLE "public"."match_counts" TO "anon";
GRANT ALL ON TABLE "public"."match_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."match_counts" TO "service_role";



GRANT ALL ON TABLE "public"."match_courts" TO "anon";
GRANT ALL ON TABLE "public"."match_courts" TO "authenticated";
GRANT ALL ON TABLE "public"."match_courts" TO "service_role";



GRANT ALL ON TABLE "public"."match_formed" TO "anon";
GRANT ALL ON TABLE "public"."match_formed" TO "authenticated";
GRANT ALL ON TABLE "public"."match_formed" TO "service_role";



GRANT ALL ON TABLE "public"."match_participant_actions" TO "anon";
GRANT ALL ON TABLE "public"."match_participant_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."match_participant_actions" TO "service_role";



GRANT ALL ON TABLE "public"."notification_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."notification_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profile_display" TO "anon";
GRANT ALL ON TABLE "public"."profile_display" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_display" TO "service_role";



GRANT ALL ON TABLE "public"."user_personal_remarks" TO "anon";
GRANT ALL ON TABLE "public"."user_personal_remarks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_personal_remarks" TO "service_role";



GRANT ALL ON TABLE "public"."user_roster_guests" TO "anon";
GRANT ALL ON TABLE "public"."user_roster_guests" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roster_guests" TO "service_role";



GRANT ALL ON TABLE "public"."user_sports" TO "anon";
GRANT ALL ON TABLE "public"."user_sports" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sports" TO "service_role";



GRANT ALL ON TABLE "public"."v_group_member_display" TO "anon";
GRANT ALL ON TABLE "public"."v_group_member_display" TO "authenticated";
GRANT ALL ON TABLE "public"."v_group_member_display" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







