-- Current local runtime snapshot refreshed from local Supabase on 2026-04-10.
--
-- PostgreSQL database dump
--

-- \restrict YC0Z542C1T0FPIJ3NJgYG78Ssx2PORPmPtj5O5efnkanMfUHuw7pqaqZykmd5NI

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: group_member_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."group_member_status" AS ENUM (
    'pending',
    'active',
    'removed'
);


ALTER TYPE "public"."group_member_status" OWNER TO "postgres";

--
-- Name: match_admission_mode; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."match_admission_mode" AS ENUM (
    'invite',
    'request'
);


ALTER TYPE "public"."match_admission_mode" OWNER TO "postgres";

--
-- Name: match_doubles_format; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."match_doubles_format" AS ENUM (
    'open',
    'mens_doubles',
    'womens_doubles',
    'mixed_doubles'
);


ALTER TYPE "public"."match_doubles_format" OWNER TO "postgres";

--
-- Name: match_join_method; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."match_join_method" AS ENUM (
    'invited',
    'requested',
    'guest_add',
    'nominated',
    'manual'
);


ALTER TYPE "public"."match_join_method" OWNER TO "postgres";

--
-- Name: match_participant_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."match_participant_status" AS ENUM (
    'pending',
    'confirmed',
    'removed',
    'waiting_list'
);


ALTER TYPE "public"."match_participant_status" OWNER TO "postgres";

--
-- Name: match_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."match_status" AS ENUM (
    'active',
    'cancelled',
    'archived'
);


ALTER TYPE "public"."match_status" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: person_match_proxies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."person_match_proxies" (
    "binding_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "principal_person_id" "uuid" NOT NULL,
    "proxy_user_id" "uuid" NOT NULL,
    "scope" "text" DEFAULT 'manage_match_participation'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by_user_id" "uuid",
    "invited_via" "text",
    "invited_to" "text",
    "confirmed_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "person_match_proxies_scope_check" CHECK (("scope" = 'manage_match_participation'::"text")),
    CONSTRAINT "person_match_proxies_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'rejected'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."person_match_proxies" OWNER TO "postgres";

--
-- Name: TABLE "person_match_proxies"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."person_match_proxies" IS 'Explicit Match Proxy bindings. Participant-side authority for another person comes only from active rows here.';


--
-- Name: activate_match_proxy_binding("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."activate_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") RETURNS "public"."person_match_proxies"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.person_match_proxies;
BEGIN
  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  IF v_row.status = 'active' AND v_row.revoked_at IS NULL THEN
    RETURN v_row;
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'binding_not_pending';
  END IF;

  UPDATE public.person_match_proxies
  SET
    status = 'active',
    invited_via = COALESCE(NULLIF(trim(p_invited_via), ''), invited_via),
    invited_to = COALESCE(NULLIF(trim(p_invited_to), ''), invited_to),
    confirmed_at = COALESCE(confirmed_at, now()),
    rejected_at = NULL,
    revoked_at = NULL,
    updated_at = now()
  WHERE binding_id = p_binding_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."activate_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") OWNER TO "postgres";

--
-- Name: apply_participant_acceptance("uuid", "uuid", boolean, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.match_participants
  SET
    participant_accepted_at = now(),
    participant_accepted_via = CASE WHEN p_is_self THEN 'in_app' ELSE 'proxy' END,
    manual_confirmed_by = CASE WHEN p_is_self THEN NULL ELSE p_actor_id END
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

--
-- Name: FUNCTION "apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") IS 'Participant-side acceptance helper. Self writes in_app; non-self writes proxy. Ad-hoc delegate semantics are retired.';


--
-- Name: match_participants; Type: TABLE; Schema: public; Owner: postgres
--

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
    "waiting_list_at" timestamp with time zone,
    CONSTRAINT "chk_participant_accepted_via" CHECK ((("participant_accepted_via" IS NULL) OR ("participant_accepted_via" = ANY (ARRAY['in_app'::"text", 'manual'::"text", 'delegate_manual'::"text", 'email_invitation'::"text", 'proxy'::"text"])))),
    CONSTRAINT "match_participants_exactly_one_identity" CHECK (((("user_id" IS NOT NULL) AND ("guest_id" IS NULL)) OR (("user_id" IS NULL) AND ("guest_id" IS NOT NULL))))
);


ALTER TABLE "public"."match_participants" OWNER TO "postgres";

--
-- Name: COLUMN "match_participants"."org_approved_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."match_participants"."org_approved_at" IS 'v1.3: Timestamp when organizer approved this participant. NULL = not yet approved. Required for all participants to become confirmed.';


--
-- Name: COLUMN "match_participants"."org_approved_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."match_participants"."org_approved_by" IS 'v1.3: User ID of the organizer who approved this participant. NULL if not yet approved.';


--
-- Name: COLUMN "match_participants"."nominated_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."match_participants"."nominated_by" IS 'v1.3: User ID of the participant who nominated this user (for join_method=requested with nomination). NULL if not nominated or if direct request/invite.';


--
-- Name: COLUMN "match_participants"."removed_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."match_participants"."removed_by" IS 'v1.3 CRITICAL: User ID who removed this participant. Must be set when status=removed. Used to distinguish user-withdrawal vs org-removal for reactivation logic.';


--
-- Name: COLUMN "match_participants"."removal_note"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."match_participants"."removal_note" IS 'v1.3: Optional note explaining why participant was removed (e.g., "declined", "rejected", "capacity reached").';


--
-- Name: COLUMN "match_participants"."participant_accepted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."match_participants"."participant_accepted_at" IS 'v1.5: Participant-side confirmation timestamp. Replaces user_accepted_at. Written by: rpc_match_accept_invite (in_app), rpc_match_manual_confirm (manual). Never written directly by UI or non-RPC code.';


--
-- Name: COLUMN "match_participants"."participant_accepted_via"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."match_participants"."participant_accepted_via" IS 'v1.5: How participant confirmed. in_app = user clicked Accept; manual = organizer confirmed on their behalf. Must be set whenever participant_accepted_at is set. Cleared on reconfirm.';


--
-- Name: COLUMN "match_participants"."manual_confirmed_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."match_participants"."manual_confirmed_by" IS 'v1.5: User ID of organizer who manually confirmed this participant. Set only when participant_accepted_via = ''manual''. Cleared on reconfirm.';


--
-- Name: COLUMN "match_participants"."waiting_list_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."match_participants"."waiting_list_at" IS 'Timestamp when a fully-ready participant was moved onto the waiting list.';


--
-- Name: apply_participant_admission("uuid", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") IS 'Internal helper: centralizes admission write (fresh + re-entry) for request_join, invite, nominate. Re-entry uses removed_at IS NOT NULL (canonical).';


--
-- Name: apply_participant_exit("uuid", "uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text") IS 'Internal helper: centralizes participant exit write (removed_at, removed_by, removal_note), reconcile, action log. exit_kind: remove | withdraw. Callers: rpc_match_remove_participant, rpc_match_user_withdraw.';


--
-- Name: can_admit_user_to_match("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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


ALTER FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") IS 'Unified predicate for match admission. Caller gate uses InScope/MatchAssociated; target active-row check uses removed_at IS NULL so removed users remain eligible for re-entry.';


--
-- Name: can_invite_users("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: can_manage_participants("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: can_user_request_match_proxy_for_guest("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."can_user_request_match_proxy_for_guest"("p_guest_id" "uuid", "p_actor_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_guest_id IS NULL OR p_actor_user_id IS NULL THEN
    RETURN false;
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN
    EXISTS (
      SELECT 1
      FROM public.user_roster_guests urg
      WHERE urg.owner_user_id = p_actor_user_id
        AND urg.guest_id = p_guest_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.person_relationships pr
      WHERE pr.actor_user_id = p_actor_user_id
        AND pr.person_id = v_person_id
        AND pr.relationship_type IN ('saved', 'direct_contact', 'group_contact')
    )
    OR EXISTS (
      SELECT 1
      FROM public.group_contacts gc
      JOIN public.group_members gm
        ON gm.group_id = gc.group_id
       AND gm.user_id = p_actor_user_id
       AND gm.status = 'active'
       AND gm.accepted_at IS NOT NULL
       AND gm.removed_at IS NULL
      WHERE gc.person_id = v_person_id
        AND gc.removed_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp_actor
      JOIN public.match_participants mp_guest
        ON mp_guest.match_id = mp_actor.match_id
       AND mp_guest.guest_id = p_guest_id
        AND mp_guest.removed_at IS NULL
      WHERE mp_actor.user_id = p_actor_user_id
        AND mp_actor.removed_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_participants mp_guest
        ON mp_guest.match_id = m.id
       AND mp_guest.guest_id = p_guest_id
       AND mp_guest.removed_at IS NULL
      WHERE m.organizer_id = p_actor_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.people p
      WHERE p.person_id = v_person_id
        AND p.linked_user_id = p_actor_user_id
    )
    OR public.is_active_match_proxy_for_person(v_person_id, p_actor_user_id);
END;
$$;


ALTER FUNCTION "public"."can_user_request_match_proxy_for_guest"("p_guest_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";

--
-- Name: can_user_view_contact_player("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."can_user_view_contact_player"("p_guest_id" "uuid", "p_actor_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.can_user_request_match_proxy_for_guest(p_guest_id, p_actor_user_id);
END;
$$;


ALTER FUNCTION "public"."can_user_view_contact_player"("p_guest_id" "uuid", "p_actor_user_id" "uuid") OWNER TO "postgres";

--
-- Name: compute_match_start_at_utc(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compute_match_start_at_utc"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_timezone text;
BEGIN
  SELECT timezone INTO v_timezone
  FROM public.venues
  WHERE id = NEW.venue_id;

  IF v_timezone IS NULL THEN
    RAISE EXCEPTION 'Venue timezone not found';
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

--
-- Name: do_users_share_group("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") IS 'v1.6.3: Returns true if both users are active members of at least one common friend group (group_kind=friend). SECURITY DEFINER. Not granted to authenticated directly.';


--
-- Name: fn_emit_match_formed_on_formed_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

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
        'club_name', (SELECT c.name FROM public.venues c WHERE c.id = NEW.venue_id),
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

--
-- Name: fn_guard_participant_state(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: fn_match_detail_change_reconfirm(); Type: FUNCTION; Schema: public; Owner: postgres
--

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
    OR OLD.venue_id          IS DISTINCT FROM NEW.venue_id
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

--
-- Name: FUNCTION "fn_match_detail_change_reconfirm"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."fn_match_detail_change_reconfirm"() IS 'v1.7: On match schedule/location change, reset all confirmed participants (users and contact players/guests) to pending. Organizer row excluded. org_approved_at preserved; reconcile derives status.';


--
-- Name: group_boundary_keeper_id("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: is_active_match_proxy_for_participant("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_active_match_proxy_for_participant"("p_match_participant_id" "uuid", "p_proxy_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_match_participant_id IS NULL OR p_proxy_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    CASE
      WHEN mp.user_id IS NOT NULL THEN public.resolve_person_id_for_user(mp.user_id)
      WHEN mp.guest_id IS NOT NULL THEN public.resolve_person_id_for_guest(mp.guest_id)
      ELSE NULL
    END
  INTO v_person_id
  FROM public.match_participants mp
  WHERE mp.id = p_match_participant_id
    AND mp.removed_at IS NULL;

  IF v_person_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.person_match_proxies pmp
    WHERE pmp.principal_person_id = v_person_id
      AND pmp.proxy_user_id = p_proxy_user_id
      AND pmp.scope = 'manage_match_participation'
      AND pmp.status = 'active'
      AND pmp.revoked_at IS NULL
  );
END;
$$;


ALTER FUNCTION "public"."is_active_match_proxy_for_participant"("p_match_participant_id" "uuid", "p_proxy_user_id" "uuid") OWNER TO "postgres";

--
-- Name: is_active_match_proxy_for_person("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_active_match_proxy_for_person"("p_principal_person_id" "uuid", "p_proxy_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.person_match_proxies pmp
    WHERE pmp.principal_person_id = p_principal_person_id
      AND pmp.proxy_user_id = p_proxy_user_id
      AND pmp.scope = 'manage_match_participation'
      AND pmp.status = 'active'
      AND pmp.revoked_at IS NULL
  );
$$;


ALTER FUNCTION "public"."is_active_match_proxy_for_person"("p_principal_person_id" "uuid", "p_proxy_user_id" "uuid") OWNER TO "postgres";

--
-- Name: is_caller_confirmed_in_match("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "is_caller_confirmed_in_match"("p_match_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") IS 'v1.7: True if caller has a confirmed participant row in this match. Used for RLS.';


--
-- Name: is_caller_in_match_scope("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.is_user_in_match_scope(p_match_id, auth.uid());
END;
$$;


ALTER FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "is_caller_in_match_scope"("p_match_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") IS 'v1.5: Self-only scope check. Equivalent to is_user_in_match_scope(match_id, auth.uid()). Granted to authenticated for direct RPC use. Replaces the two-arg oracle-risk version for all TypeScript/client-facing calls.';


--
-- Name: is_caller_match_associated("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.is_user_match_associated(p_match_id, auth.uid());
END;
$$;


ALTER FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") OWNER TO "postgres";

--
-- Name: is_group_active_member("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: is_group_active_member_any("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: is_group_member_any("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: is_guest_in_any_group_roster("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT FALSE;
$$;


ALTER FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") OWNER TO "postgres";

--
-- Name: is_match_court_helper_eligible("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_match_court_helper_eligible"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.is_match_organizer(p_match_id, p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.match_participants mp
      WHERE mp.match_id = p_match_id
        AND mp.user_id = p_user_id
        AND mp.removed_at IS NULL
        AND mp.status IN ('pending', 'confirmed')
    );
$$;


ALTER FUNCTION "public"."is_match_court_helper_eligible"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: is_match_organizer("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: is_match_participant_active("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: is_match_participant_confirmed("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: is_user_in_match_scope("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: is_user_in_scope_groups("uuid"[], "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") IS 'v1.5: Internal scope membership predicate. Checks user is active member of ANY of the given groups. SECURITY DEFINER + row_security=off. NOT granted to authenticated — internal RPC use only.';


--
-- Name: is_user_match_associated("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") IS 'Returns true if user has an active participant row, or a self-withdraw/self-decline removed row. Organizer/manager-removed participants are not match-associated.';


--
-- Name: is_venue_admin("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."is_venue_admin"("p_venue_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
      OR EXISTS (SELECT 1 FROM public.venue_admins WHERE venue_id = p_venue_id AND user_id = auth.uid())
$$;


ALTER FUNCTION "public"."is_venue_admin"("p_venue_id" "uuid") OWNER TO "postgres";

--
-- Name: log_participant_action("uuid", "text", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: match_organizer_id("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: match_participant_reconcile_status("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp record;
  v_is_ready boolean := false;
BEGIN
  SELECT
    id,
    status,
    user_id,
    guest_id,
    participant_accepted_at,
    org_approved_at,
    removed_at,
    confirmed_at,
    waiting_list_at
  INTO v_mp
  FROM public.match_participants
  WHERE id = p_mp_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant % not found', p_mp_id;
  END IF;

  IF v_mp.removed_at IS NOT NULL OR v_mp.status::text = 'removed' THEN
    UPDATE public.match_participants
    SET
      status = 'removed',
      confirmed_at = NULL,
      waiting_list_at = NULL,
      removed_at = COALESCE(removed_at, now())
    WHERE id = p_mp_id
      AND (
        status::text <> 'removed'
        OR confirmed_at IS NOT NULL
        OR waiting_list_at IS NOT NULL
        OR removed_at IS NULL
      );
    RETURN;
  END IF;

  IF v_mp.user_id IS NULL AND v_mp.guest_id IS NULL THEN
    RAISE EXCEPTION 'Invalid participant: neither user_id nor guest_id set for %', p_mp_id;
  END IF;

  v_is_ready := v_mp.participant_accepted_at IS NOT NULL AND v_mp.org_approved_at IS NOT NULL;

  IF v_is_ready THEN
    IF v_mp.status::text = 'waiting_list' THEN
      UPDATE public.match_participants
      SET
        status = 'waiting_list',
        confirmed_at = NULL,
        waiting_list_at = COALESCE(waiting_list_at, now())
      WHERE id = p_mp_id
        AND (
          status::text <> 'waiting_list'
          OR confirmed_at IS NOT NULL
          OR waiting_list_at IS NULL
        );
    ELSE
      UPDATE public.match_participants
      SET
        status = 'confirmed',
        confirmed_at = COALESCE(confirmed_at, now()),
        waiting_list_at = NULL
      WHERE id = p_mp_id
        AND (
          status::text <> 'confirmed'
          OR confirmed_at IS NULL
          OR waiting_list_at IS NOT NULL
        );
    END IF;
    RETURN;
  END IF;

  UPDATE public.match_participants
  SET
    status = 'pending',
    confirmed_at = NULL,
    waiting_list_at = NULL
  WHERE id = p_mp_id
    AND (
      status::text <> 'pending'
      OR confirmed_at IS NOT NULL
      OR waiting_list_at IS NOT NULL
    );
END;
$$;


ALTER FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "match_participant_reconcile_status"("p_mp_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") IS 'Canonical participant status reconciliation for Contact Player + Match Proxy v1.2. Both registered users and Contact Players require participant-side acceptance plus organizer approval to become confirmed.';


--
-- Name: match_proxy_verification_email("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."match_proxy_verification_email"("p_principal_person_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (
      SELECT lower(trim(u.email::text))
      FROM public.people p
      JOIN auth.users u
        ON u.id = p.linked_user_id
      WHERE p.person_id = p_principal_person_id
        AND NULLIF(trim(u.email::text), '') IS NOT NULL
      LIMIT 1
    ),
    (
      SELECT lower(trim(g.email))
      FROM public.guests g
      WHERE g.person_id = p_principal_person_id
        AND g.status = 'active'
        AND NULLIF(trim(g.email), '') IS NOT NULL
      ORDER BY g.created_at
      LIMIT 1
    ),
    (
      SELECT lower(trim(cr.raw_email))
      FROM public.contact_records cr
      WHERE cr.person_id = p_principal_person_id
        AND NULLIF(trim(cr.raw_email), '') IS NOT NULL
      ORDER BY cr.created_at
      LIMIT 1
    )
  );
$$;


ALTER FUNCTION "public"."match_proxy_verification_email"("p_principal_person_id" "uuid") OWNER TO "postgres";

--
-- Name: reject_match_proxy_binding("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reject_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") RETURNS "public"."person_match_proxies"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.person_match_proxies;
BEGIN
  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  IF v_row.status = 'rejected' THEN
    RETURN v_row;
  END IF;

  IF v_row.status = 'active' AND v_row.revoked_at IS NULL THEN
    RAISE EXCEPTION 'binding_already_active';
  END IF;

  UPDATE public.person_match_proxies
  SET
    status = 'rejected',
    invited_via = COALESCE(NULLIF(trim(p_invited_via), ''), invited_via),
    invited_to = COALESCE(NULLIF(trim(p_invited_to), ''), invited_to),
    rejected_at = COALESCE(rejected_at, now()),
    confirmed_at = NULL,
    revoked_at = NULL,
    updated_at = now()
  WHERE binding_id = p_binding_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."reject_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") OWNER TO "postgres";

--
-- Name: resolve_person_id_for_guest("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_person_id_for_guest"("p_guest_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_guest_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT person_id
  INTO v_person_id
  FROM public.guests
  WHERE id = p_guest_id;

  IF v_person_id IS NOT NULL THEN
    RETURN v_person_id;
  END IF;

  INSERT INTO public.people (person_type, display_name, status)
  SELECT
    'limited_contact',
    COALESCE(NULLIF(trim(g.display_name), ''), g.id::text),
    'active'
  FROM public.guests g
  WHERE g.id = p_guest_id
  RETURNING person_id INTO v_person_id;

  UPDATE public.guests
  SET person_id = v_person_id
  WHERE id = p_guest_id;

  RETURN v_person_id;
END;
$$;


ALTER FUNCTION "public"."resolve_person_id_for_guest"("p_guest_id" "uuid") OWNER TO "postgres";

--
-- Name: resolve_person_id_for_user("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."resolve_person_id_for_user"("p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_person_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT person_id
  INTO v_person_id
  FROM public.people
  WHERE linked_user_id = p_user_id
  LIMIT 1;

  IF v_person_id IS NOT NULL THEN
    RETURN v_person_id;
  END IF;

  INSERT INTO public.people (person_type, display_name, avatar_url, linked_user_id, status)
  SELECT
    'registered_user',
    COALESCE(NULLIF(trim(p.display_name), ''), p.id::text),
    p.avatar_url,
    p.id,
    'active'
  FROM public.profiles p
  WHERE p.id = p_user_id
  RETURNING person_id INTO v_person_id;

  RETURN v_person_id;
END;
$$;


ALTER FUNCTION "public"."resolve_person_id_for_user"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: revoke_match_proxy_binding("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."revoke_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") RETURNS "public"."person_match_proxies"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_row public.person_match_proxies;
BEGIN
  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  IF v_row.status = 'revoked' THEN
    RETURN v_row;
  END IF;

  IF v_row.status <> 'active' OR v_row.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'binding_not_active';
  END IF;

  UPDATE public.person_match_proxies
  SET
    status = 'revoked',
    invited_via = COALESCE(NULLIF(trim(p_invited_via), ''), invited_via),
    invited_to = COALESCE(NULLIF(trim(p_invited_to), ''), invited_to),
    revoked_at = COALESCE(revoked_at, now()),
    updated_at = now()
  WHERE binding_id = p_binding_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."revoke_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") OWNER TO "postgres";

--
-- Name: rpc_admin_user_search("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_contact_player_lookup("uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_contact_player_lookup"("p_guest_ids" "uuid"[]) RETURNS TABLE("guest_id" "uuid", "person_id" "uuid", "display_name" "text", "avatar_url" "text", "primary_sport_id" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    g.id AS guest_id,
    g.person_id,
    COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''), g.id::text) AS display_name,
    p.avatar_url,
    p.primary_sport_id
  FROM public.guests g
  LEFT JOIN public.people p
    ON p.person_id = g.person_id
  WHERE g.status = 'active'
    AND g.id = ANY(COALESCE(p_guest_ids, ARRAY[]::uuid[]))
    AND public.can_user_view_contact_player(g.id, auth.uid());
$$;


ALTER FUNCTION "public"."rpc_contact_player_lookup"("p_guest_ids" "uuid"[]) OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_contact_player_lookup"("p_guest_ids" "uuid"[]); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_contact_player_lookup"("p_guest_ids" "uuid"[]) IS 'Scoped Contact Player lookup. Returns minimum display data only for trusted callers with an owner, saved, shared-match, group-contact, linked, organizer, or active Match Proxy path.';


--
-- Name: rpc_contact_player_resolution(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_contact_player_resolution"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_contact_player_resolution"() IS 'Phase 2: Contact Player resolution. Returns caller roster guests with linked_user_id (nullable) and resolution_state (contact_only | linked_user). Single source for guest vs registered-user logic.';


--
-- Name: person_relationships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."person_relationships" (
    "relationship_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "person_id" "uuid" NOT NULL,
    "relationship_type" "text" NOT NULL,
    "source_group_id" "uuid",
    "source_match_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "person_relationships_relationship_type_check" CHECK (("relationship_type" = ANY (ARRAY['saved'::"text", 'shared_match'::"text", 'same_group'::"text", 'group_contact'::"text", 'direct_contact'::"text", 'linked'::"text", 'imported_by'::"text"])))
);


ALTER TABLE "public"."person_relationships" OWNER TO "postgres";

--
-- Name: TABLE "person_relationships"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."person_relationships" IS 'Relationship layer between a user and a canonical person node.';


--
-- Name: rpc_contact_player_save("uuid", "text", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_contact_player_save"("p_guest_id" "uuid", "p_source" "text" DEFAULT 'manual'::"text", "p_group_id" "uuid" DEFAULT NULL::"uuid", "p_match_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."person_relationships"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_relationships;
  v_allowed boolean := false;
  v_source text := COALESCE(NULLIF(trim(p_source), ''), 'manual');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  IF v_source NOT IN ('manual', 'direct_contact', 'shared_match', 'group_contact') THEN
    v_source := 'manual';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = v_uid
      AND urg.guest_id = p_guest_id
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed
     AND p_match_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.match_participants mp_target
       JOIN public.guests g
         ON g.id = mp_target.guest_id
       WHERE mp_target.match_id = p_match_id
         AND g.person_id = v_person_id
     )
     AND (
       public.is_user_match_associated(p_match_id, v_uid)
       OR EXISTS (
         SELECT 1
         FROM public.matches m
         WHERE m.id = p_match_id
           AND m.organizer_id = v_uid
       )
     ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed
     AND p_group_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.group_contacts gc
       JOIN public.group_members gm
         ON gm.group_id = gc.group_id
        AND gm.user_id = v_uid
        AND gm.status = 'active'
        AND gm.accepted_at IS NOT NULL
        AND gm.removed_at IS NULL
       WHERE gc.group_id = p_group_id
         AND gc.person_id = v_person_id
         AND gc.removed_at IS NULL
     ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'not_authorized_to_save_contact_player';
  END IF;

  SELECT *
  INTO v_row
  FROM public.person_relationships pr
  WHERE pr.actor_user_id = v_uid
    AND pr.person_id = v_person_id
    AND pr.relationship_type = 'saved'
  ORDER BY pr.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.person_relationships (
    actor_user_id,
    person_id,
    relationship_type,
    source_group_id,
    source_match_id
  )
  VALUES (
    v_uid,
    v_person_id,
    'saved',
    CASE WHEN v_source = 'group_contact' THEN p_group_id ELSE NULL END,
    CASE WHEN v_source = 'shared_match' THEN p_match_id ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."rpc_contact_player_save"("p_guest_id" "uuid", "p_source" "text", "p_group_id" "uuid", "p_match_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_contact_player_save"("p_guest_id" "uuid", "p_source" "text", "p_group_id" "uuid", "p_match_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_contact_player_save"("p_guest_id" "uuid", "p_source" "text", "p_group_id" "uuid", "p_match_id" "uuid") IS 'Save a Contact Player person node after owner, shared-match, or group-contact trust exposure. Save never creates proxy authority.';


--
-- Name: courts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."courts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "sport_id" integer DEFAULT 1 NOT NULL,
    "court_code" "text" NOT NULL,
    "surface" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."courts" OWNER TO "postgres";

--
-- Name: rpc_court_create("uuid", integer, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_court_create"("p_venue_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."courts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_court public.courts;
BEGIN
  IF NOT public.is_venue_admin(p_venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_court_code IS NULL OR trim(p_court_code) = '' THEN
    RAISE EXCEPTION 'court_code_required';
  END IF;

  INSERT INTO public.courts (venue_id, sport_id, court_code, surface, notes)
  VALUES (p_venue_id, p_sport_id, trim(p_court_code), p_surface, p_notes)
  RETURNING * INTO v_court;

  RETURN v_court;
END;
$$;


ALTER FUNCTION "public"."rpc_court_create"("p_venue_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text") OWNER TO "postgres";

--
-- Name: rpc_court_delete("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  SELECT venue_id INTO v_venue_id FROM public.courts WHERE id = p_court_id;
  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'court_not_found';
  END IF;

  IF NOT public.is_venue_admin(v_venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.courts WHERE id = p_court_id;
END;
$$;


ALTER FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") OWNER TO "postgres";

--
-- Name: rpc_court_update("uuid", integer, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_sport_id" integer DEFAULT NULL::integer, "p_court_code" "text" DEFAULT NULL::"text", "p_surface" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  SELECT venue_id INTO v_venue_id FROM public.courts WHERE id = p_court_id;
  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'court_not_found';
  END IF;

  IF NOT public.is_venue_admin(v_venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.courts
  SET
    sport_id = COALESCE(p_sport_id, sport_id),
    court_code = COALESCE(p_court_code, court_code),
    surface = COALESCE(p_surface, surface),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_court_id;
END;
$$;


ALTER FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text") OWNER TO "postgres";

--
-- Name: email_invitations; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: TABLE "email_invitations"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."email_invitations" IS 'Email-based invitations. related_type=match for v1. Magic link verifies email; Accept/Decline on invitation page.';


--
-- Name: rpc_email_invitation_accept("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") RETURNS "public"."email_invitations"
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

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_uid;

  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF v_inv.related_type = 'match_proxy_binding' THEN
    PERFORM public.activate_match_proxy_binding(
      v_inv.related_id,
      'registered_email_accept',
      trim(lower(v_user_email))
    );
  ELSIF v_inv.related_type = 'match' THEN
    PERFORM public.rpc_match_accept_email_invitation(v_inv.related_id, v_uid, p_invitation_id);
  END IF;

  UPDATE public.email_invitations
  SET status = 'accepted',
      accepted_by_user_id = v_uid,
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_invitation_id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF v_inv.status = 'accepted' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_accepted', v_uid);

    INSERT INTO public.domain_events (event_type, aggregate_type, aggregate_id, actor_user_id, payload)
    VALUES (
      'invitation.accepted',
      'email_invitation',
      v_inv.id,
      v_uid,
      jsonb_build_object('invitation_id', v_inv.id, 'accepted_by_user_id', v_uid)
    );

    PERFORM public.rpc_reconcile_identity_after_magic_link(v_uid, v_user_email, p_invitation_id);
  END IF;

  RETURN v_inv;
END;
$$;


ALTER FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_email_invitation_accept"("p_invitation_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") IS 'Accept an email invitation for the authenticated user. Match acceptance reuses canonical participant rows and leaves organizer approval unchanged. Match Proxy binding invitations activate only after explicit verification acceptance.';


--
-- Name: rpc_email_invitation_accept_as_guest("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

  IF v_inv.related_type = 'match_proxy_binding' THEN
    PERFORM public.activate_match_proxy_binding(
      v_inv.related_id,
      'guest_email_accept',
      trim(lower(v_inv.target_email))
    );

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
    SELECT COUNT(*), MIN(mp.id::text)::uuid
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g
      ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(COALESCE(g.email, ''))) = lower(trim(v_inv.target_email));

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

--
-- Name: FUNCTION "rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") IS 'Accept a private email invitation without registration. Supports both Contact Player match participation and Contact Player Match Proxy verification links.';


--
-- Name: rpc_email_invitation_create("text", "text", "text", "uuid", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_email_invitation_decline("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RETURN v_inv;
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_uid;

  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  IF v_inv.related_type = 'match_proxy_binding' THEN
    PERFORM public.reject_match_proxy_binding(
      v_inv.related_id,
      'registered_email_decline',
      trim(lower(v_user_email))
    );
  END IF;

  UPDATE public.email_invitations
  SET status = 'declined',
      declined_at = now(),
      updated_at = now()
  WHERE id = p_invitation_id
    AND status = 'pending';

  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF v_inv.status = 'declined' THEN
    INSERT INTO public.email_invitation_events (invitation_id, event_type, actor_user_id)
    VALUES (v_inv.id, 'invitation_declined', v_uid);
  END IF;

  RETURN v_inv;
END;
$$;


ALTER FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_email_invitation_decline"("p_invitation_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") IS 'Decline an email invitation as an authenticated user. Match Proxy binding invitations are marked rejected when declined.';


--
-- Name: rpc_email_invitation_decline_as_guest("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

  IF v_inv.related_type = 'match_proxy_binding' THEN
    PERFORM public.reject_match_proxy_binding(
      v_inv.related_id,
      'guest_email_decline',
      trim(lower(v_inv.target_email))
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
    SELECT COUNT(*), MIN(mp.id::text)::uuid
    INTO v_match_count, v_match_mp_id
    FROM public.match_participants mp
    JOIN public.guests g
      ON g.id = mp.guest_id
    WHERE mp.match_id = v_inv.related_id
      AND mp.removed_at IS NULL
      AND lower(trim(COALESCE(g.email, ''))) = lower(trim(v_inv.target_email));

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

--
-- Name: FUNCTION "rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") IS 'Decline a private email invitation without registration. Supports both Contact Player match participation and Contact Player Match Proxy verification links.';


--
-- Name: rpc_email_invitation_get("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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
    LEFT JOIN public.venues c ON c.id = m.venue_id
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

--
-- Name: rpc_get_queued_deliveries(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: group_members; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: COLUMN "group_members"."group_display_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."group_members"."group_display_name" IS 'Identity v1.5: group-scoped alias shown within this group context. Optional.';


--
-- Name: rpc_group_accept_invite("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: group_contacts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."group_contacts" (
    "group_contact_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "membership_type" "text" DEFAULT 'group_contact'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "removed_at" timestamp with time zone,
    CONSTRAINT "group_contacts_membership_type_check" CHECK (("membership_type" = ANY (ARRAY['group_contact'::"text", 'limited_group_member'::"text"])))
);


ALTER TABLE "public"."group_contacts" OWNER TO "postgres";

--
-- Name: TABLE "group_contacts"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."group_contacts" IS 'Contact Players added to groups as limited contacts, not as full registered group members.';


--
-- Name: rpc_group_add_contact_player("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_group_add_contact_player"("p_group_id" "uuid", "p_guest_id" "uuid") RETURNS "public"."group_contacts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.group_contacts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF public.group_boundary_keeper_id(p_group_id) <> v_uid THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = v_uid
      AND urg.guest_id = p_guest_id
  ) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'person_not_found';
  END IF;

  SELECT *
  INTO v_row
  FROM public.group_contacts
  WHERE group_id = p_group_id
    AND person_id = v_person_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.group_contacts
    SET
      membership_type = 'group_contact',
      removed_at = NULL
    WHERE group_contact_id = v_row.group_contact_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.group_contacts (
      group_id,
      person_id,
      membership_type,
      created_by,
      created_at
    )
    VALUES (
      p_group_id,
      v_person_id,
      'group_contact',
      v_uid,
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.person_relationships (actor_user_id, person_id, relationship_type, source_group_id)
  SELECT v_uid, v_person_id, 'group_contact', p_group_id
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.person_relationships pr
    WHERE pr.actor_user_id = v_uid
      AND pr.person_id = v_person_id
      AND pr.relationship_type = 'group_contact'
      AND pr.source_group_id = p_group_id
  );

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."rpc_group_add_contact_player"("p_group_id" "uuid", "p_guest_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_group_add_contact_player"("p_group_id" "uuid", "p_guest_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_group_add_contact_player"("p_group_id" "uuid", "p_guest_id" "uuid") IS 'Add a Contact Player to a group as a limited group contact. Does not create full registered membership or proxy authority.';


--
-- Name: rpc_group_contact_list("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_group_contact_list"("p_group_id" "uuid") RETURNS TABLE("group_contact_id" "uuid", "guest_id" "uuid", "person_id" "uuid", "display_name" "text", "avatar_url" "text", "membership_type" "text", "created_by" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT (
    public.is_group_active_member(p_group_id, auth.uid())
    OR public.group_boundary_keeper_id(p_group_id) = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    gc.group_contact_id,
    g.id AS guest_id,
    gc.person_id,
    p.display_name,
    p.avatar_url,
    gc.membership_type,
    gc.created_by,
    gc.created_at
  FROM public.group_contacts gc
  JOIN LATERAL (
    SELECT g.id
    FROM public.guests g
    WHERE g.person_id = gc.person_id
      AND g.status = 'active'
    ORDER BY g.created_at
    LIMIT 1
  ) g ON TRUE
  JOIN public.people p
    ON p.person_id = gc.person_id
  WHERE gc.group_id = p_group_id
    AND gc.removed_at IS NULL
  ORDER BY p.display_name, gc.created_at;
END;
$$;


ALTER FUNCTION "public"."rpc_group_contact_list"("p_group_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_group_contact_list"("p_group_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_group_contact_list"("p_group_id" "uuid") IS 'List Contact Players included in a group as limited group contacts.';


--
-- Name: groups; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_group_create("text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_group_invite_user("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") IS 'Boundary keeper can invite any user; active members can invite only users who share a group with them (do_users_share_group). Handles re-invite of removed members.';


--
-- Name: rpc_group_leave("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_group_leave"("p_group_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") IS 'User leaves a group. Sets status to removed. Boundary keeper cannot leave.';


--
-- Name: rpc_group_reject_invite("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_group_reject_invite"("p_group_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") IS 'Invitee declines a pending group invite. Sets status=removed, removed_at, removed_by.';


--
-- Name: rpc_group_set_display_name("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_group_update("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text") IS 'Boundary keeper updates group name and optional description.';


--
-- Name: rpc_guest_sports_set("uuid", "text"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_invite_circle_list(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_invite_circle_list"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_invite_circle_list"() IS 'Phase 1: List caller Invite Circle. Owner-only. Ordered by created_at desc.';


--
-- Name: rpc_invite_circle_remove_user("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_invite_circle_remove_user"("p_target_user_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") IS 'Phase 1: Remove target from caller Invite Circle. Idempotent (no error if not present).';


--
-- Name: user_invite_circle; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_invite_circle" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "target_user_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_invite_circle_owner_ne_target" CHECK (("owner_user_id" <> "target_user_id")),
    CONSTRAINT "user_invite_circle_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'venue_member'::"text", 'group_member'::"text", 'match_player'::"text", 'played_with_auto'::"text"])))
);


ALTER TABLE "public"."user_invite_circle" OWNER TO "postgres";

--
-- Name: TABLE "user_invite_circle"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."user_invite_circle" IS 'Phase 1 Play Network Core: Private one-way list. Owner convenience only. Silent (no notification). Not trust/membership/approval.';


--
-- Name: COLUMN "user_invite_circle"."source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_invite_circle"."source" IS 'manual = generic save; venue_member = saved from venue/club discovery; group_member = saved from a group roster; match_player = saved from a shared match; played_with_auto = reserved for future automation.';


--
-- Name: rpc_invite_circle_save_user("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text" DEFAULT 'manual'::"text") RETURNS "public"."user_invite_circle"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.user_invite_circle;
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

  IF p_source IS NULL OR p_source NOT IN (
    'manual',
    'venue_member',
    'group_member',
    'match_player',
    'played_with_auto'
  ) THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'target_not_found';
  END IF;

  INSERT INTO public.user_invite_circle (owner_user_id, target_user_id, source)
  VALUES (v_uid, p_target_user_id, p_source)
  ON CONFLICT (owner_user_id, target_user_id)
  DO UPDATE SET source = user_invite_circle.source
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") IS 'Save target to caller Invite Circle / Saved Players. Idempotent. Private, silent, and source-aware for UI provenance.';


--
-- Name: rpc_match_accept_email_invitation("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv public.email_invitations%rowtype;
  v_match public.matches%rowtype;
  v_user_email text;
  v_target_mp public.match_participants%rowtype;
  v_match_count int := 0;
  v_match_mp_id uuid := NULL;
BEGIN
  SELECT * INTO v_inv
  FROM public.email_invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND OR v_inv.related_type <> 'match' OR v_inv.related_id <> p_match_id THEN
    RAISE EXCEPTION 'invitation_invalid';
  END IF;

  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND OR v_match.status <> 'active' THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF lower(trim(v_user_email)) <> lower(trim(v_inv.target_email)) THEN
    RAISE EXCEPTION 'email_mismatch';
  END IF;

  SELECT * INTO v_target_mp
  FROM public.match_participants
  WHERE match_id = p_match_id
    AND user_id = p_user_id
    AND removed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF v_inv.match_participant_id IS NOT NULL THEN
      SELECT * INTO v_target_mp
      FROM public.match_participants
      WHERE id = v_inv.match_participant_id
        AND match_id = p_match_id
        AND removed_at IS NULL;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'anchored_participant_not_found';
      END IF;
    ELSE
      SELECT COUNT(*), MIN(mp.id::text)::uuid
      INTO v_match_count, v_match_mp_id
      FROM public.match_participants mp
      JOIN public.guests g
        ON g.id = mp.guest_id
      WHERE mp.match_id = p_match_id
        AND mp.removed_at IS NULL
        AND lower(trim(COALESCE(g.email, ''))) = lower(trim(v_inv.target_email));

      IF v_match_count > 1 THEN
        RAISE EXCEPTION 'participant_ambiguous_for_invitation';
      END IF;

      IF v_match_count = 1 THEN
        SELECT * INTO v_target_mp
        FROM public.match_participants
        WHERE id = v_match_mp_id;
      END IF;
    END IF;
  END IF;

  IF v_target_mp.id IS NOT NULL THEN
    UPDATE public.match_participants
    SET participant_accepted_at = COALESCE(participant_accepted_at, now()),
        participant_accepted_via = CASE
          WHEN participant_accepted_at IS NULL THEN 'email_invitation'
          ELSE participant_accepted_via
        END
    WHERE id = v_target_mp.id
    RETURNING * INTO v_target_mp;

    PERFORM public.match_participant_reconcile_status(v_target_mp.id);

    SELECT * INTO v_target_mp
    FROM public.match_participants
    WHERE id = v_target_mp.id;

    RETURN v_target_mp;
  END IF;

  INSERT INTO public.match_participants (
    match_id,
    user_id,
    join_method,
    participant_accepted_at,
    participant_accepted_via,
    org_approved_at,
    org_approved_by,
    created_by
  )
  VALUES (
    p_match_id,
    p_user_id,
    'invited',
    now(),
    'email_invitation',
    NULL,
    NULL,
    v_inv.inviter_user_id
  )
  RETURNING * INTO v_target_mp;

  PERFORM public.match_participant_reconcile_status(v_target_mp.id);

  SELECT * INTO v_target_mp
  FROM public.match_participants
  WHERE id = v_target_mp.id;

  RETURN v_target_mp;
END;
$$;


ALTER FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") IS 'Registered-user email invitation acceptance is participant-side only. It reuses an anchored Contact Player participant when present, avoids duplicate guest/user rows, and never auto-writes organizer approval.';


--
-- Name: rpc_match_accept_invite("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_accept_invite"("p_match_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") IS 'v1.6.3: User accepts invite/nomination or re-confirms. Sets participant_accepted_at only.';


--
-- Name: rpc_match_admission_targets("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text" DEFAULT NULL::"text") RETURNS TABLE("target_kind" "text", "target_id" "uuid", "display_name" "text", "avatar_url" "text", "venue_handle" "text", "source" "text", "action_kind" "text", "can_admit" boolean, "eligible_via" "text", "sort_name" "text", "contact_email" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    SELECT ci.user_id, 'club_members'::text AS src
    FROM public.venue_identities ci
    JOIN public.profiles p ON p.id = ci.user_id
    WHERE v_club_context IS NOT NULL
      AND ci.venue_id = v_club_context
      AND ci.user_id <> v_match.organizer_id
      AND ci.user_id <> v_uid
      AND p.show_in_venue_member_discovery = true
      AND COALESCE(ci.visible_in_venue_member_discovery, true) = true
      AND ci.user_id NOT IN (SELECT user_id FROM already_active_users)
      AND EXISTS (
        SELECT 1 FROM public.venue_identities ci_caller
        WHERE ci_caller.venue_id = v_club_context AND ci_caller.user_id = v_uid
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
      ci.venue_handle,
      c.src AS source,
      'admit_user'::text AS action_kind,
      public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) AS can_admit,
      CASE
        WHEN public.can_admit_user_to_match(p_match_id, v_uid, c.user_id) THEN 'admit_allowed'
        ELSE 'admit_forbidden'
      END AS eligible_via,
      LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.venue_handle, c.user_id::text)) AS sort_name,
      NULL::text AS contact_email
    FROM deduped_users c
    JOIN public.profiles p ON p.id = c.user_id
    LEFT JOIN public.venue_identities ci
      ON ci.user_id = c.user_id AND ci.venue_id = v_club_context
    WHERE (
      v_search IS NULL
      OR p.display_name ILIKE '%' || v_search || '%'
      OR ci.venue_handle ILIKE '%' || v_search || '%'
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
      NULL::text AS venue_handle,
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
      NULL::text AS venue_handle,
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
      NULL::text AS venue_handle,
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
    c.venue_handle,
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

--
-- Name: FUNCTION "rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text") IS 'Phase 3: Mixed admission targets. Returns users (admit_user) and Contact Players (nominate_contact_player). target_kind, target_id, action_kind tell frontend which write path to use.';


--
-- Name: rpc_match_admit_user("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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


ALTER FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") IS 'Unified admission write. Self-withdrawn users still count as match-associated for caller gates, but removed users remain eligible admission targets via active-row checks.';


--
-- Name: rpc_match_confirmed_participant_emails("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_confirmed_participant_emails"("p_match_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") IS 'Returns email for all confirmed participants (users + guests), excl. organizer. For match_formed notifications.';


--
-- Name: matches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organizer_id" "uuid" NOT NULL,
    "status" "public"."match_status" DEFAULT 'active'::"public"."match_status" NOT NULL,
    "venue_id" "uuid",
    "court_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "match_date" "date" DEFAULT (("now"() AT TIME ZONE 'utc'::"text"))::"date" NOT NULL,
    "start_time" time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
    "duration_minutes" integer DEFAULT 90 NOT NULL,
    "game_type" "text" DEFAULT 'doubles'::"text" NOT NULL,
    "required_count" integer DEFAULT 4 NOT NULL,
    "invitation_scope_group_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "can_participants_invite_users" boolean DEFAULT true NOT NULL,
    "can_participants_add_guests" boolean DEFAULT false NOT NULL,
    "can_participants_manage_participants" boolean DEFAULT false NOT NULL,
    "formed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_at_utc" timestamp with time zone,
    "sport_id" smallint DEFAULT 1 NOT NULL,
    "court_plan_mode" "text" DEFAULT 'self_book_later'::"text" NOT NULL,
    "court_note" "text",
    "final_court_label" "text",
    "finalized_by_user_id" "uuid",
    "finalized_at" timestamp with time zone,
    "doubles_format" "public"."match_doubles_format" DEFAULT 'open'::"public"."match_doubles_format",
    CONSTRAINT "matches_court_plan_mode_check" CHECK (("court_plan_mode" = ANY (ARRAY['secured'::"text", 'walk_in'::"text", 'self_book_later'::"text", 'needs_help_booking'::"text"])))
);


ALTER TABLE "public"."matches" OWNER TO "postgres";

--
-- Name: COLUMN "matches"."start_at_utc"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."matches"."start_at_utc" IS 'Derived UTC timestamp computed from match_date, start_time, and venues.timezone';


--
-- Name: COLUMN "matches"."doubles_format"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."matches"."doubles_format" IS 'Organizer-set doubles roster target. Guides needed display and waiting-list auto-fill, but does not hard-block approvals.';


--
-- Name: rpc_match_create(integer, "text", "date", time without time zone, integer, "uuid", "uuid"[], "uuid"[], boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_create"("p_required_count" integer DEFAULT 4, "p_game_type" "text" DEFAULT 'doubles'::"text", "p_match_date" "date" DEFAULT NULL::"date", "p_start_time" time without time zone DEFAULT NULL::time without time zone, "p_duration_minutes" integer DEFAULT NULL::integer, "p_venue_id" "uuid" DEFAULT NULL::"uuid", "p_court_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_invitation_scope_group_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_can_participants_invite_users" boolean DEFAULT true, "p_can_participants_add_guests" boolean DEFAULT false, "p_can_participants_manage_participants" boolean DEFAULT false) RETURNS "public"."matches"
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
    venue_id,
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
    p_venue_id,
    COALESCE(p_court_ids, '{}'),
    COALESCE(p_invitation_scope_group_ids, '{}'),
    COALESCE(p_can_participants_invite_users, true),
    COALESCE(p_can_participants_add_guests, false),
    COALESCE(p_can_participants_manage_participants, false)
  )
  RETURNING * INTO v_match;

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


ALTER FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_venue_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_venue_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_venue_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) IS 'v1.8.2: Match creation keeps participant nomination enabled by default. can_participants_invite_users is always-on for canonical product flow; manage/remove remains separately configurable.';


--
-- Name: rpc_match_invite_user("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") IS 'Phase 1: Organizer-only invite. Thin wrapper around rpc_match_admit_user. Preserves legacy error messages for compatibility.';


--
-- Name: rpc_match_nominate_guest("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match public.matches%rowtype;
  v_uid uuid := auth.uid();
  v_existing public.match_participants%rowtype;
  v_mp public.match_participants%rowtype;
  v_is_org boolean;
  v_guest_email text;
  v_guest_name text;
  v_nominator_name text;
  v_evt_id uuid;
  v_inv public.email_invitations%rowtype;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_match.status <> 'active' THEN RAISE EXCEPTION 'match_not_active (status=%)', v_match.status; END IF;

  v_is_org := (v_match.organizer_id = v_uid);
  IF NOT v_is_org THEN
    IF NOT v_match.can_participants_invite_users THEN
      RAISE EXCEPTION 'not_authorized_to_nominate_guest';
    END IF;

    IF NOT (
      public.is_user_in_scope_groups(COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]), v_uid)
      OR public.is_user_match_associated(p_match_id, v_uid)
    ) THEN
      RAISE EXCEPTION 'not_authorized_to_nominate_guest';
    END IF;
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.user_roster_guests urg
      WHERE urg.owner_user_id = v_uid
        AND urg.guest_id = p_guest_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.guests g
      JOIN public.group_contacts gc
        ON gc.person_id = g.person_id
       AND gc.removed_at IS NULL
      JOIN public.group_members gm
        ON gm.group_id = gc.group_id
       AND gm.user_id = v_uid
       AND gm.status = 'active'
       AND gm.accepted_at IS NOT NULL
       AND gm.removed_at IS NULL
      WHERE g.id = p_guest_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.person_relationships pr
      JOIN public.guests g
        ON g.person_id = pr.person_id
      WHERE pr.actor_user_id = v_uid
        AND pr.relationship_type = 'saved'
        AND g.id = p_guest_id
    )
  ) THEN
    RAISE EXCEPTION 'guest_not_accessible';
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

  SELECT
    NULLIF(trim(g.email), ''),
    COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''))
  INTO v_guest_email, v_guest_name
  FROM public.guests g
  LEFT JOIN public.people p
    ON p.person_id = g.person_id
  WHERE g.id = p_guest_id;

  IF v_guest_email IS NOT NULL THEN
    SELECT p.display_name INTO v_nominator_name FROM public.profiles p WHERE p.id = v_uid;

    INSERT INTO public.email_invitations (
      inviter_user_id, target_email, target_name, related_type, related_id, expires_at, match_participant_id
    ) VALUES (
      v_uid,
      trim(lower(v_guest_email)),
      v_guest_name,
      'match',
      p_match_id,
      NULL,
      v_mp.id
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
        'inviter_display_name', COALESCE(v_nominator_name, 'Someone'),
        'match_participant_id', v_inv.match_participant_id
      )
    )
    RETURNING id INTO v_evt_id;

    PERFORM public.rpc_process_domain_event(v_evt_id);
  END IF;

  RETURN v_mp;
END;
$$;


ALTER FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") IS 'v1.8.1: Nominate Contact Player. If the contact has an email, create an anchored email invitation so the recipient can accept/decline via invitation link without creating an account. Organizer always allowed. Non-organizer uses match.can_participants_invite_users + (InScope OR MatchAssociated). Organizer auto-sets org_approved_at; guest stays pending until participant-side confirmation is recorded.';


--
-- Name: rpc_match_nominate_user("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") IS 'Phase 1: Non-organizer nomination. Thin wrapper around rpc_match_admit_user. Preserves legacy caller-gate errors for compatibility.';


--
-- Name: rpc_match_org_approve_participant("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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
          'club_name', (SELECT c.name FROM public.venues c WHERE c.id = v_match.venue_id)
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

--
-- Name: FUNCTION "rpc_match_org_approve_participant"("p_match_participant_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") IS 'v1.5: ORG approves a pending participant. Sets org_approved_at. Does NOT write status directly — reconcile derives status from timestamps. Idempotent (confirmed_at IS NOT NULL check).';


--
-- Name: rpc_match_participant_display_names("uuid", "uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) IS 'v1.7: Resolve participant display names for activity feed. Bypasses participant RLS for lookup. Caller must see match.';


--
-- Name: rpc_match_participant_email("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_participant_email"("p_match_participant_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") IS 'Returns email for a participant (user: profile/auth; guest: guests.email). NULL if no email.';


--
-- Name: rpc_match_participant_emails_for_notification("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_participant_emails_for_notification"("p_match_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") IS 'v1.7: Returns email + contact_channel for confirmed user participants (excl. organizer). Caller must be organizer or confirmed participant.';


--
-- Name: rpc_match_proxy_confirm_participant("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_proxy_confirm_participant"("p_match_participant_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_mp public.match_participants%rowtype;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  IF v_mp.participant_accepted_at IS NOT NULL THEN
    RETURN v_mp;
  END IF;

  IF NOT public.is_active_match_proxy_for_participant(p_match_participant_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorized_to_proxy_confirm';
  END IF;

  PERFORM public.apply_participant_acceptance(
    p_match_participant_id,
    v_uid,
    false,
    'proxy_confirm'
  );

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = p_match_participant_id;

  RETURN v_mp;
END;
$$;


ALTER FUNCTION "public"."rpc_match_proxy_confirm_participant"("p_match_participant_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_match_proxy_confirm_participant"("p_match_participant_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_proxy_confirm_participant"("p_match_participant_id" "uuid") IS 'Canonical Match Proxy confirm RPC. Active Match Proxy records participant-side confirmation for a principal. Shared-group and ad-hoc delegate semantics are retired.';


--
-- Name: rpc_match_proxy_decline_participant("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_proxy_decline_participant"("p_match_participant_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.rpc_match_proxy_withdraw_participant(p_match_participant_id);
END;
$$;


ALTER FUNCTION "public"."rpc_match_proxy_decline_participant"("p_match_participant_id" "uuid") OWNER TO "postgres";

--
-- Name: rpc_match_proxy_manageable_participants("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_proxy_manageable_participants"("p_match_id" "uuid") RETURNS TABLE("match_participant_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT mp.id
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.removed_at IS NULL
    AND public.is_active_match_proxy_for_participant(mp.id, auth.uid());
$$;


ALTER FUNCTION "public"."rpc_match_proxy_manageable_participants"("p_match_id" "uuid") OWNER TO "postgres";

--
-- Name: rpc_match_proxy_request_contact_player("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_proxy_request_contact_player"("p_guest_id" "uuid") RETURNS "public"."person_match_proxies"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_match_proxies;
  v_verification_email text;
  v_target_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_guest_id IS NULL THEN
    RAISE EXCEPTION 'guest_required';
  END IF;

  IF NOT public.can_user_request_match_proxy_for_guest(p_guest_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorized_to_request_contact_proxy';
  END IF;

  v_person_id := public.resolve_person_id_for_guest(p_guest_id);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'principal_person_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.people p
    WHERE p.person_id = v_person_id
      AND p.linked_user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'cannot_proxy_self';
  END IF;

  v_verification_email := public.match_proxy_verification_email(v_person_id);
  IF v_verification_email IS NULL THEN
    RAISE EXCEPTION 'principal_verification_email_required';
  END IF;

  SELECT COALESCE(NULLIF(trim(p.display_name), ''), NULLIF(trim(g.display_name), ''), p_guest_id::text)
  INTO v_target_name
  FROM public.guests g
  LEFT JOIN public.people p
    ON p.person_id = g.person_id
  WHERE g.id = p_guest_id;

  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE principal_person_id = v_person_id
    AND proxy_user_id = v_uid
    AND scope = 'manage_match_participation'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_row.status = 'active' AND v_row.revoked_at IS NULL THEN
      RETURN v_row;
    END IF;

    UPDATE public.person_match_proxies
    SET
      status = 'pending',
      requested_by_user_id = v_uid,
      invited_via = 'contact_email_verification',
      invited_to = v_verification_email,
      confirmed_at = NULL,
      rejected_at = NULL,
      revoked_at = NULL,
      updated_at = now()
    WHERE binding_id = v_row.binding_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.person_match_proxies (
      principal_person_id,
      proxy_user_id,
      scope,
      status,
      requested_by_user_id,
      invited_via,
      invited_to,
      created_at,
      updated_at
    )
    VALUES (
      v_person_id,
      v_uid,
      'manage_match_participation',
      'pending',
      v_uid,
      'contact_email_verification',
      v_verification_email,
      now(),
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.email_invitations (
    inviter_user_id,
    target_email,
    target_name,
    related_type,
    related_id,
    expires_at,
    match_participant_id
  )
  VALUES (
    v_uid,
    v_verification_email,
    NULLIF(trim(v_target_name), ''),
    'match_proxy_binding',
    v_row.binding_id,
    NULL,
    NULL
  );

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."rpc_match_proxy_request_contact_player"("p_guest_id" "uuid") OWNER TO "postgres";

--
-- Name: rpc_match_proxy_request_self("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_proxy_request_self"("p_proxy_user_id" "uuid") RETURNS "public"."person_match_proxies"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_match_proxies;
  v_verification_email text;
  v_target_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_proxy_user_id IS NULL OR p_proxy_user_id = v_uid THEN
    RAISE EXCEPTION 'invalid_proxy_user';
  END IF;

  v_person_id := public.resolve_person_id_for_user(v_uid);
  IF v_person_id IS NULL THEN
    RAISE EXCEPTION 'principal_person_not_found';
  END IF;

  v_verification_email := public.match_proxy_verification_email(v_person_id);
  IF v_verification_email IS NULL THEN
    RAISE EXCEPTION 'principal_verification_email_required';
  END IF;

  SELECT COALESCE(NULLIF(trim(p.display_name), ''), v_uid::text)
  INTO v_target_name
  FROM public.people p
  WHERE p.person_id = v_person_id;

  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE principal_person_id = v_person_id
    AND proxy_user_id = p_proxy_user_id
    AND scope = 'manage_match_participation'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_row.status = 'active' AND v_row.revoked_at IS NULL THEN
      RETURN v_row;
    END IF;

    UPDATE public.person_match_proxies
    SET
      status = 'pending',
      requested_by_user_id = v_uid,
      invited_via = 'principal_email_verification',
      invited_to = v_verification_email,
      confirmed_at = NULL,
      rejected_at = NULL,
      revoked_at = NULL,
      updated_at = now()
    WHERE binding_id = v_row.binding_id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.person_match_proxies (
      principal_person_id,
      proxy_user_id,
      scope,
      status,
      requested_by_user_id,
      invited_via,
      invited_to,
      created_at,
      updated_at
    )
    VALUES (
      v_person_id,
      p_proxy_user_id,
      'manage_match_participation',
      'pending',
      v_uid,
      'principal_email_verification',
      v_verification_email,
      now(),
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.email_invitations (
    inviter_user_id,
    target_email,
    target_name,
    related_type,
    related_id,
    expires_at,
    match_participant_id
  )
  VALUES (
    v_uid,
    v_verification_email,
    NULLIF(trim(v_target_name), ''),
    'match_proxy_binding',
    v_row.binding_id,
    NULL,
    NULL
  );

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."rpc_match_proxy_request_self"("p_proxy_user_id" "uuid") OWNER TO "postgres";

--
-- Name: rpc_match_proxy_revoke_self("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_proxy_revoke_self"("p_binding_id" "uuid") RETURNS "public"."person_match_proxies"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_person_id uuid;
  v_row public.person_match_proxies;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_person_id := public.resolve_person_id_for_user(v_uid);

  SELECT * INTO v_row
  FROM public.person_match_proxies
  WHERE binding_id = p_binding_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'binding_not_found';
  END IF;

  IF v_row.principal_person_id <> v_person_id THEN
    RAISE EXCEPTION 'not_binding_principal';
  END IF;

  RETURN public.revoke_match_proxy_binding(
    p_binding_id,
    'self_authenticated',
    'in_app_revocation'
  );
END;
$$;


ALTER FUNCTION "public"."rpc_match_proxy_revoke_self"("p_binding_id" "uuid") OWNER TO "postgres";

--
-- Name: rpc_match_proxy_withdraw_participant("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_proxy_withdraw_participant"("p_match_participant_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mp public.match_participants%rowtype;
  v_note text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_mp
  FROM public.match_participants
  WHERE id = p_match_participant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'participant_not_found';
  END IF;

  IF v_mp.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'participant_removed';
  END IF;

  IF NOT public.is_active_match_proxy_for_participant(p_match_participant_id, v_uid) THEN
    RAISE EXCEPTION 'not_authorized_to_proxy_manage';
  END IF;

  v_note := CASE
    WHEN v_mp.join_method = 'invited' AND v_mp.confirmed_at IS NULL THEN 'Proxy declined invitation on behalf of participant'
    WHEN v_mp.join_method = 'nominated' AND v_mp.confirmed_at IS NULL THEN 'Proxy declined nomination on behalf of participant'
    WHEN v_mp.confirmed_at IS NOT NULL THEN 'Proxy withdrew participation on behalf of participant'
    ELSE 'Proxy withdrew on behalf of participant'
  END;

  RETURN public.apply_participant_exit(
    p_match_participant_id,
    v_uid,
    'withdraw',
    v_note
  );
END;
$$;


ALTER FUNCTION "public"."rpc_match_proxy_withdraw_participant"("p_match_participant_id" "uuid") OWNER TO "postgres";

--
-- Name: rpc_match_rebalance_roster("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_match_rebalance_roster"("p_match_id" "uuid") RETURNS TABLE("promoted_participant_id" "uuid", "promoted_user_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor_id uuid := auth.uid();
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
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

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


ALTER FUNCTION "public"."rpc_match_rebalance_roster"("p_match_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_match_rebalance_roster"("p_match_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_rebalance_roster"("p_match_id" "uuid") IS 'Rebalances the active roster and waiting list for a match. Uses FIFO by default, with doubles_format as a lightweight auto-fill guide. Host approvals remain permissive.';


--
-- Name: rpc_match_remove_participant("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_remove_participant"("p_match_participant_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") IS 'v1.5: ORG (or authorized participant) removes a participant. Sets removed_at + removed_by. Reconcile sets status=removed and clears confirmed_at. No direct status write.';


--
-- Name: rpc_match_request_join("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_request_join"("p_match_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") IS 'v1.6.3: User requests to join. Scope required. Removed users can re-request. Sets participant_accepted_at. ORG approval needed to confirm.';


--
-- Name: rpc_match_user_withdraw("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_match_user_withdraw"("p_match_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") IS 'v1.5: User withdraws (decline invite or leave). Sets removed_at + removed_by. Reconcile sets status=removed and clears confirmed_at. No direct status write.';


--
-- Name: rpc_player_profile_get("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_player_profile_get"("p_target_user_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text", "avatar_url" "text", "looking_to_play" "text", "preferred_play_times" "text"[], "sport_profiles" "jsonb", "shared_venue_names" "text"[], "shared_group_names" "text"[], "shared_match_count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  RETURN QUERY
  WITH target_profile AS (
    SELECT
      p.id,
      p.display_name,
      p.avatar_url,
      p.looking_to_play,
      p.preferred_play_times
    FROM public.profiles p
    WHERE p.id = p_target_user_id
  ),
  sport_rows AS (
    SELECT
      s.id AS sport_id,
      s.code AS sport_code,
      s.display_name AS sport_name,
      usp.level,
      usp.years_playing,
      COALESCE(usp.preferred_formats, '{}'::text[]) AS preferred_formats,
      usp.current_frequency,
      usp.play_style,
      usp.competition_experience,
      usp.teams_played_on,
      usp.line_played,
      usp.highlights,
      usp.gear_primary,
      usp.gear_secondary,
      usp.gear_shoes
    FROM public.user_sports us
    JOIN public.sports s
      ON s.id = us.sport_id
    LEFT JOIN public.user_sport_profiles usp
      ON usp.user_id = us.user_id
     AND usp.sport_id = us.sport_id
    WHERE us.user_id = p_target_user_id
    ORDER BY s.id
  ),
  shared_venues AS (
    SELECT DISTINCT v.name
    FROM public.venue_identities self_vi
    JOIN public.venue_identities target_vi
      ON target_vi.venue_id = self_vi.venue_id
    JOIN public.venues v
      ON v.id = self_vi.venue_id
    WHERE self_vi.user_id = auth.uid()
      AND target_vi.user_id = p_target_user_id
  ),
  shared_groups AS (
    SELECT DISTINCT g.name
    FROM public.group_members gm_self
    JOIN public.group_members gm_target
      ON gm_target.group_id = gm_self.group_id
    JOIN public.groups g
      ON g.id = gm_self.group_id
    WHERE gm_self.user_id = auth.uid()
      AND gm_self.status = 'active'
      AND gm_self.accepted_at IS NOT NULL
      AND gm_self.removed_at IS NULL
      AND gm_target.user_id = p_target_user_id
      AND gm_target.status = 'active'
      AND gm_target.accepted_at IS NOT NULL
      AND gm_target.removed_at IS NULL
  ),
  shared_matches AS (
    SELECT COUNT(DISTINCT mp_self.match_id)::integer AS match_count
    FROM public.match_participants mp_self
    JOIN public.match_participants mp_target
      ON mp_target.match_id = mp_self.match_id
    WHERE mp_self.user_id = auth.uid()
      AND mp_target.user_id = p_target_user_id
      AND mp_self.status <> 'removed'
      AND mp_target.status <> 'removed'
  )
  SELECT
    tp.id AS user_id,
    tp.display_name,
    tp.avatar_url,
    tp.looking_to_play,
    COALESCE(tp.preferred_play_times, '{}'::text[]) AS preferred_play_times,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'sport_id', sr.sport_id,
            'sport_code', sr.sport_code,
            'sport_name', sr.sport_name,
            'level', sr.level,
            'years_playing', sr.years_playing,
            'preferred_formats', sr.preferred_formats,
            'current_frequency', sr.current_frequency,
            'play_style', sr.play_style,
            'competition_experience', sr.competition_experience,
            'teams_played_on', sr.teams_played_on,
            'line_played', sr.line_played,
            'highlights', sr.highlights,
            'gear_primary', sr.gear_primary,
            'gear_secondary', sr.gear_secondary,
            'gear_shoes', sr.gear_shoes
          )
          ORDER BY sr.sport_id
        )
        FROM sport_rows sr
      ),
      '[]'::jsonb
    ) AS sport_profiles,
    COALESCE((SELECT array_agg(name ORDER BY name) FROM shared_venues), '{}'::text[]) AS shared_venue_names,
    COALESCE((SELECT array_agg(name ORDER BY name) FROM shared_groups), '{}'::text[]) AS shared_group_names,
    COALESCE((SELECT sm.match_count FROM shared_matches sm), 0) AS shared_match_count
  FROM target_profile tp;
END;
$$;


ALTER FUNCTION "public"."rpc_player_profile_get"("p_target_user_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_player_profile_get"("p_target_user_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_player_profile_get"("p_target_user_id" "uuid") IS 'Returns the caller-facing public player profile plus natural shared-connection signals. Does not expose private saved-player logic.';


--
-- Name: rpc_process_domain_event("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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
          FROM public.matches m LEFT JOIN public.venues c ON c.id = m.venue_id WHERE m.id = v_inv.related_id)
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

--
-- Name: rpc_profile_init("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_profile_set_avatar_url("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_profile_set_avatar_url"("p_avatar_url" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") IS 'v1.8: Set the current user avatar URL (from storage). NULL to clear.';


--
-- Name: rpc_profile_set_display_name("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_profile_set_primary_venue("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_profile_set_primary_venue"("p_venue_id" "uuid") RETURNS "void"
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
  SELECT venue_handle INTO v_handle
  FROM public.venue_identities
  WHERE venue_id = p_venue_id AND user_id = auth.uid();

  IF v_handle IS NULL THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  UPDATE public.profiles
  SET primary_venue_id = p_venue_id,
      display_name    = v_handle
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_profile_set_primary_venue"("p_venue_id" "uuid") OWNER TO "postgres";

--
-- Name: rpc_profile_update("text", "text", "text", "text", "text", boolean, boolean, "text", "text"[], "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_profile_update"("p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text", "p_contact_channel" "text" DEFAULT NULL::"text", "p_contact_email" "text" DEFAULT NULL::"text", "p_contact_phone" "text" DEFAULT NULL::"text", "p_show_in_venue_member_discovery" boolean DEFAULT NULL::boolean, "p_allow_non_group_invites" boolean DEFAULT NULL::boolean, "p_looking_to_play" "text" DEFAULT NULL::"text", "p_preferred_play_times" "text"[] DEFAULT NULL::"text"[], "p_gender" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_preferred_play_times text[] := NULL;
  v_gender text := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_looking_to_play IS NOT NULL
    AND NULLIF(trim(p_looking_to_play), '') IS NOT NULL
    AND trim(p_looking_to_play) NOT IN (
      'very_open',
      'open',
      'occasional',
      'quite_full',
      'not_looking'
    ) THEN
    RAISE EXCEPTION 'invalid_looking_to_play';
  END IF;

  IF p_preferred_play_times IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(p_preferred_play_times) AS raw_value
    WHERE NULLIF(trim(raw_value), '') IS NOT NULL
      AND trim(raw_value) NOT IN (
        'weekday_mornings',
        'weekday_afternoons',
        'weekday_evenings',
        'saturday_mornings',
        'saturday_afternoons',
        'sunday_mornings',
        'sunday_afternoons',
        'flexible'
      )
  ) THEN
    RAISE EXCEPTION 'invalid_preferred_play_times';
  END IF;

  IF p_gender IS NOT NULL THEN
    v_gender := NULLIF(trim(lower(p_gender)), '');
    IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female', 'unspecified') THEN
      RAISE EXCEPTION 'invalid_gender';
    END IF;
  END IF;

  IF p_preferred_play_times IS NOT NULL THEN
    SELECT COALESCE(array_agg(value ORDER BY value), '{}'::text[])
      INTO v_preferred_play_times
    FROM (
      SELECT DISTINCT trim(raw_value) AS value
      FROM unnest(p_preferred_play_times) AS raw_value
      WHERE NULLIF(trim(raw_value), '') IS NOT NULL
    ) deduped;
  END IF;

  UPDATE public.profiles
  SET
    first_name = CASE WHEN p_first_name IS NOT NULL THEN NULLIF(trim(p_first_name), '') ELSE first_name END,
    last_name = CASE WHEN p_last_name IS NOT NULL THEN NULLIF(trim(p_last_name), '') ELSE last_name END,
    contact_channel = CASE WHEN p_contact_channel IN ('email', 'sms') THEN p_contact_channel ELSE contact_channel END,
    contact_email = CASE WHEN p_contact_email IS NOT NULL THEN NULLIF(trim(p_contact_email), '') ELSE contact_email END,
    contact_phone = CASE WHEN p_contact_phone IS NOT NULL THEN NULLIF(trim(p_contact_phone), '') ELSE contact_phone END,
    show_in_venue_member_discovery = CASE
      WHEN p_show_in_venue_member_discovery IS NOT NULL THEN p_show_in_venue_member_discovery
      ELSE show_in_venue_member_discovery
    END,
    allow_non_group_invites = CASE
      WHEN p_allow_non_group_invites IS NOT NULL THEN p_allow_non_group_invites
      ELSE allow_non_group_invites
    END,
    looking_to_play = CASE
      WHEN p_looking_to_play IS NOT NULL THEN NULLIF(trim(p_looking_to_play), '')
      ELSE looking_to_play
    END,
    preferred_play_times = CASE
      WHEN p_preferred_play_times IS NOT NULL THEN v_preferred_play_times
      ELSE preferred_play_times
    END,
    gender = CASE
      WHEN p_gender IS NOT NULL THEN COALESCE(v_gender, 'unspecified')
      ELSE gender
    END,
    updated_at = now()
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_venue_member_discovery" boolean, "p_allow_non_group_invites" boolean, "p_looking_to_play" "text", "p_preferred_play_times" "text"[], "p_gender" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_venue_member_discovery" boolean, "p_allow_non_group_invites" boolean, "p_looking_to_play" "text", "p_preferred_play_times" "text"[], "p_gender" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_venue_member_discovery" boolean, "p_allow_non_group_invites" boolean, "p_looking_to_play" "text", "p_preferred_play_times" "text"[], "p_gender" "text") IS 'Canonical profile update RPC. Includes contact preferences, trust-building profile fields, and gender for doubles roster guidance.';


--
-- Name: rpc_reconcile_identity_after_magic_link("uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") IS 'Link invitation + guest participants to user after magic link signup. Idempotent.';


--
-- Name: rpc_reconcile_identity_guest_participants(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_reconcile_identity_guest_participants"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_reconcile_identity_guest_participants"() IS 'Link guest participants + contact (guest) to current user by email. Idempotent.';


--
-- Name: rpc_roster_guest_contact_links("uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: FUNCTION "rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) IS 'For roster owner: which of my guests have registered (identity_links contact). Returns guest_id, user_id for Invite to Group.';


--
-- Name: guests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."guests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "display_name" "text" NOT NULL,
    "notes" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "phone" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "person_id" "uuid",
    CONSTRAINT "guests_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."guests" OWNER TO "postgres";

--
-- Name: rpc_roster_guest_create("text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_roster_guest_create("text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text") RETURNS "public"."guests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_guest public.guests;
  v_person_id uuid;
  v_matched_user_id uuid;
  v_norm_email text := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
  v_norm_phone text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'display_name_required';
  END IF;

  IF v_norm_email IS NOT NULL THEN
    SELECT u.id
    INTO v_matched_user_id
    FROM auth.users u
    WHERE lower(trim(u.email::text)) = v_norm_email
    LIMIT 1;
  END IF;

  IF v_matched_user_id IS NOT NULL THEN
    v_person_id := public.resolve_person_id_for_user(v_matched_user_id);
  END IF;

  IF v_person_id IS NULL THEN
    SELECT g.person_id
    INTO v_person_id
    FROM public.guests g
    WHERE g.person_id IS NOT NULL
      AND (
        (v_norm_email IS NOT NULL AND lower(trim(COALESCE(g.email, ''))) = v_norm_email)
        OR (
          v_norm_phone IS NOT NULL
          AND regexp_replace(COALESCE(g.phone, ''), '\D', '', 'g') = v_norm_phone
        )
      )
    ORDER BY g.created_at
    LIMIT 1;
  END IF;

  IF v_person_id IS NULL THEN
    INSERT INTO public.people (
      person_type,
      display_name,
      linked_user_id,
      status
    )
    VALUES (
      CASE WHEN v_matched_user_id IS NOT NULL THEN 'linked_hybrid' ELSE 'limited_contact' END,
      btrim(p_display_name),
      v_matched_user_id,
      'active'
    )
    RETURNING person_id INTO v_person_id;
  END IF;

  INSERT INTO public.guests(
    display_name,
    email,
    phone,
    notes,
    status,
    created_by,
    created_at,
    person_id
  )
  VALUES (
    btrim(p_display_name),
    p_email,
    p_phone,
    p_notes,
    'active',
    auth.uid(),
    now(),
    v_person_id
  )
  RETURNING * INTO v_guest;

  INSERT INTO public.user_roster_guests(
    owner_user_id,
    guest_id,
    created_by,
    created_at
  )
  SELECT
    auth.uid(),
    v_guest.id,
    auth.uid(),
    now()
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = auth.uid()
      AND urg.guest_id = v_guest.id
  );

  INSERT INTO public.contact_records (
    owner_user_id,
    person_id,
    guest_id,
    raw_name,
    raw_phone,
    raw_email,
    owner_notes,
    source
  )
  VALUES (
    auth.uid(),
    v_person_id,
    v_guest.id,
    v_guest.display_name,
    v_guest.phone,
    v_guest.email,
    v_guest.notes,
    'manual'
  );

  INSERT INTO public.person_relationships (actor_user_id, person_id, relationship_type)
  SELECT auth.uid(), v_person_id, 'direct_contact'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.person_relationships pr
    WHERE pr.actor_user_id = auth.uid()
      AND pr.person_id = v_person_id
      AND pr.relationship_type = 'direct_contact'
  );

  RETURN v_guest;
END;
$$;


ALTER FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text") IS 'Create a Contact Player private record and link it to the canonical person layer. High-confidence email/phone matches reuse the existing person node.';


--
-- Name: rpc_roster_guest_list(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: sports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."sports" (
    "id" smallint NOT NULL,
    "code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sports" OWNER TO "postgres";

--
-- Name: rpc_sports_list(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_update_delivery_result("uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_user_sport_profile_upsert(smallint, "text", smallint, "text"[], "text", "text", "text", "text", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_user_sport_profile_upsert"("p_sport_id" smallint, "p_level" "text" DEFAULT NULL::"text", "p_years_playing" smallint DEFAULT NULL::smallint, "p_preferred_formats" "text"[] DEFAULT NULL::"text"[], "p_current_frequency" "text" DEFAULT NULL::"text", "p_play_style" "text" DEFAULT NULL::"text", "p_competition_experience" "text" DEFAULT NULL::"text", "p_teams_played_on" "text" DEFAULT NULL::"text", "p_line_played" "text" DEFAULT NULL::"text", "p_highlights" "text" DEFAULT NULL::"text", "p_gear_primary" "text" DEFAULT NULL::"text", "p_gear_secondary" "text" DEFAULT NULL::"text", "p_gear_shoes" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_preferred_formats text[] := '{}'::text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sports WHERE id = p_sport_id AND is_active = true) THEN
    RAISE EXCEPTION 'sport_not_found';
  END IF;

  IF p_years_playing IS NOT NULL AND (p_years_playing < 0 OR p_years_playing > 80) THEN
    RAISE EXCEPTION 'invalid_years_playing';
  END IF;

  IF p_current_frequency IS NOT NULL
    AND NULLIF(trim(p_current_frequency), '') IS NOT NULL
    AND trim(p_current_frequency) NOT IN (
      'occasionally',
      'few_times_a_month',
      'weekly',
      'multiple_times_a_week'
    ) THEN
    RAISE EXCEPTION 'invalid_current_frequency';
  END IF;

  IF p_preferred_formats IS NOT NULL THEN
    SELECT COALESCE(array_agg(value ORDER BY value), '{}'::text[])
      INTO v_preferred_formats
    FROM (
      SELECT DISTINCT trim(raw_value) AS value
      FROM unnest(p_preferred_formats) AS raw_value
      WHERE NULLIF(trim(raw_value), '') IS NOT NULL
    ) deduped;
  END IF;

  INSERT INTO public.user_sport_profiles (
    user_id,
    sport_id,
    level,
    years_playing,
    preferred_formats,
    current_frequency,
    play_style,
    competition_experience,
    teams_played_on,
    line_played,
    highlights,
    gear_primary,
    gear_secondary,
    gear_shoes,
    updated_at
  ) VALUES (
    auth.uid(),
    p_sport_id,
    NULLIF(trim(p_level), ''),
    p_years_playing,
    v_preferred_formats,
    NULLIF(trim(p_current_frequency), ''),
    NULLIF(trim(p_play_style), ''),
    NULLIF(trim(p_competition_experience), ''),
    NULLIF(trim(p_teams_played_on), ''),
    NULLIF(trim(p_line_played), ''),
    NULLIF(trim(p_highlights), ''),
    NULLIF(trim(p_gear_primary), ''),
    NULLIF(trim(p_gear_secondary), ''),
    NULLIF(trim(p_gear_shoes), ''),
    now()
  )
  ON CONFLICT (user_id, sport_id)
  DO UPDATE SET
    level = EXCLUDED.level,
    years_playing = EXCLUDED.years_playing,
    preferred_formats = EXCLUDED.preferred_formats,
    current_frequency = EXCLUDED.current_frequency,
    play_style = EXCLUDED.play_style,
    competition_experience = EXCLUDED.competition_experience,
    teams_played_on = EXCLUDED.teams_played_on,
    line_played = EXCLUDED.line_played,
    highlights = EXCLUDED.highlights,
    gear_primary = EXCLUDED.gear_primary,
    gear_secondary = EXCLUDED.gear_secondary,
    gear_shoes = EXCLUDED.gear_shoes,
    updated_at = now();
END;
$$;


ALTER FUNCTION "public"."rpc_user_sport_profile_upsert"("p_sport_id" smallint, "p_level" "text", "p_years_playing" smallint, "p_preferred_formats" "text"[], "p_current_frequency" "text", "p_play_style" "text", "p_competition_experience" "text", "p_teams_played_on" "text", "p_line_played" "text", "p_highlights" "text", "p_gear_primary" "text", "p_gear_secondary" "text", "p_gear_shoes" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_user_sport_profile_upsert"("p_sport_id" smallint, "p_level" "text", "p_years_playing" smallint, "p_preferred_formats" "text"[], "p_current_frequency" "text", "p_play_style" "text", "p_competition_experience" "text", "p_teams_played_on" "text", "p_line_played" "text", "p_highlights" "text", "p_gear_primary" "text", "p_gear_secondary" "text", "p_gear_shoes" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_user_sport_profile_upsert"("p_sport_id" smallint, "p_level" "text", "p_years_playing" smallint, "p_preferred_formats" "text"[], "p_current_frequency" "text", "p_play_style" "text", "p_competition_experience" "text", "p_teams_played_on" "text", "p_line_played" "text", "p_highlights" "text", "p_gear_primary" "text", "p_gear_secondary" "text", "p_gear_shoes" "text") IS 'Upsert the caller''s per-sport social profile details.';


--
-- Name: rpc_user_sports_set("text"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: rpc_venue_admin_grant("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_admin_grant"("p_user_id" "uuid", "p_venue_id" "uuid") RETURNS "void"
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

  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id) THEN
    RAISE EXCEPTION 'club_not_found';
  END IF;

  INSERT INTO public.venue_admins (user_id, venue_id, granted_by)
  VALUES (p_user_id, p_venue_id, auth.uid())
  ON CONFLICT (user_id, venue_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."rpc_venue_admin_grant"("p_user_id" "uuid", "p_venue_id" "uuid") OWNER TO "postgres";

--
-- Name: rpc_venue_admin_revoke("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_admin_revoke"("p_user_id" "uuid", "p_venue_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.venue_admins
  WHERE user_id = p_user_id AND venue_id = p_venue_id;
END;
$$;


ALTER FUNCTION "public"."rpc_venue_admin_revoke"("p_user_id" "uuid", "p_venue_id" "uuid") OWNER TO "postgres";

--
-- Name: venues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."venues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "location_text" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "timezone" "text" DEFAULT 'America/Toronto'::"text" NOT NULL,
    "venue_kind" "text" DEFAULT 'club'::"text" NOT NULL,
    "access_type" "text" DEFAULT 'members'::"text" NOT NULL,
    CONSTRAINT "venues_access_type_check" CHECK (("access_type" = ANY (ARRAY['public'::"text", 'members'::"text", 'private'::"text", 'restricted'::"text"]))),
    CONSTRAINT "venues_venue_kind_check" CHECK (("venue_kind" = ANY (ARRAY['club'::"text", 'park'::"text", 'community_centre'::"text", 'condo'::"text", 'school'::"text", 'private_facility'::"text"])))
);


ALTER TABLE "public"."venues" OWNER TO "postgres";

--
-- Name: COLUMN "venues"."timezone"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."venues"."timezone" IS 'IANA timezone identifier (e.g., America/Toronto). Authoritative timezone for matches at this club.';


--
-- Name: rpc_venue_create("text", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_create"("p_name" "text", "p_location_text" "text" DEFAULT NULL::"text", "p_timezone" "text" DEFAULT 'America/Toronto'::"text", "p_notes" "text" DEFAULT NULL::"text", "p_venue_kind" "text" DEFAULT 'club'::"text", "p_access_type" "text" DEFAULT 'members'::"text") RETURNS "public"."venues"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_venue public.venues;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  IF p_venue_kind NOT IN ('club', 'park', 'community_centre', 'condo', 'school', 'private_facility') THEN
    RAISE EXCEPTION 'invalid_venue_kind';
  END IF;

  IF p_access_type NOT IN ('public', 'members', 'private', 'restricted') THEN
    RAISE EXCEPTION 'invalid_access_type';
  END IF;

  INSERT INTO public.venues (name, location_text, timezone, notes, venue_kind, access_type)
  VALUES (
    trim(p_name),
    p_location_text,
    COALESCE(NULLIF(trim(p_timezone), ''), 'America/Toronto'),
    p_notes,
    p_venue_kind,
    p_access_type
  )
  RETURNING * INTO v_venue;

  RETURN v_venue;
END;
$$;


ALTER FUNCTION "public"."rpc_venue_create"("p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text") OWNER TO "postgres";

--
-- Name: rpc_venue_handle_check("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_handle_check"("p_venue_id" "uuid", "p_handle" "text") RETURNS TABLE("available" boolean, "suggestions" "text"[])
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

  v_trimmed := public.validate_venue_handle(p_handle);
  v_norm    := lower(v_trimmed);

  SELECT EXISTS (
    SELECT 1 FROM public.venue_identities
    WHERE venue_id = p_venue_id AND venue_handle_norm = v_norm
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
      SELECT 1 FROM public.venue_identities
      WHERE venue_id = p_venue_id AND venue_handle_norm = v_cand_n
    ) THEN
      v_sugg := v_sugg || v_cand;
    END IF;
    EXIT WHEN array_length(v_sugg, 1) >= 3;
  END LOOP;

  RETURN QUERY SELECT false, v_sugg;
END;
$$;


ALTER FUNCTION "public"."rpc_venue_handle_check"("p_venue_id" "uuid", "p_handle" "text") OWNER TO "postgres";

--
-- Name: rpc_venue_handle_set("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_handle_set"("p_venue_id" "uuid", "p_new_handle" "text") RETURNS "void"
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

  v_trimmed := public.validate_venue_handle(p_new_handle);
  v_norm    := lower(v_trimmed);

  -- Must be a member; fetch current handle + norm together
  SELECT venue_handle, venue_handle_norm
  INTO v_old_handle, v_old_norm
  FROM public.venue_identities
  WHERE venue_id = p_venue_id AND user_id = auth.uid();

  IF v_old_handle IS NULL THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  -- Exact same handle (including case) → no-op
  IF v_trimmed = v_old_handle THEN
    RETURN;
  END IF;

  -- Check uniqueness when norm changes.
  IF v_norm <> v_old_norm AND EXISTS (
    SELECT 1 FROM public.venue_identities
    WHERE venue_id = p_venue_id AND venue_handle_norm = v_norm
  ) THEN
    RAISE EXCEPTION 'handle_taken';
  END IF;

  -- Update venue_handle only — norm is auto-recomputed by the generated column
  UPDATE public.venue_identities
  SET venue_handle = v_trimmed
  WHERE venue_id = p_venue_id AND user_id = auth.uid();

  -- Removed: syncing profiles.display_name from club handle.
END;
$$;


ALTER FUNCTION "public"."rpc_venue_handle_set"("p_venue_id" "uuid", "p_new_handle" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_venue_handle_set"("p_venue_id" "uuid", "p_new_handle" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_venue_handle_set"("p_venue_id" "uuid", "p_new_handle" "text") IS 'v1.6.3: Set club-scoped handle for current user. No longer mutates global profiles.display_name. Enforces per-club uniqueness on normalized handle.';


--
-- Name: rpc_venue_identity_set_preferences("uuid", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_identity_set_preferences"("p_venue_id" "uuid", "p_visible_in_venue_member_discovery" "text" DEFAULT NULL::"text", "p_accept_non_group_invites_in_venue" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.venue_identities
  SET
    visible_in_venue_member_discovery = CASE
      WHEN p_visible_in_venue_member_discovery = 'inherit' THEN NULL
      WHEN p_visible_in_venue_member_discovery = 'true' THEN true
      WHEN p_visible_in_venue_member_discovery = 'false' THEN false
      ELSE visible_in_venue_member_discovery
    END,
    accept_non_group_invites_in_venue = CASE
      WHEN p_accept_non_group_invites_in_venue = 'inherit' THEN NULL
      WHEN p_accept_non_group_invites_in_venue = 'true' THEN true
      WHEN p_accept_non_group_invites_in_venue = 'false' THEN false
      ELSE accept_non_group_invites_in_venue
    END
  WHERE venue_id = p_venue_id AND user_id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_venue_identity_set_preferences"("p_venue_id" "uuid", "p_visible_in_venue_member_discovery" "text", "p_accept_non_group_invites_in_venue" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_venue_identity_set_preferences"("p_venue_id" "uuid", "p_visible_in_venue_member_discovery" "text", "p_accept_non_group_invites_in_venue" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_venue_identity_set_preferences"("p_venue_id" "uuid", "p_visible_in_venue_member_discovery" "text", "p_accept_non_group_invites_in_venue" "text") IS 'Phase 1: Set club-scoped preference overrides. Values: true|false|inherit. inherit = use global (NULL). Only updates own row.';


--
-- Name: rpc_venue_join("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_join"("p_venue_id" "uuid", "p_handle" "text") RETURNS "void"
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

  v_trimmed := public.validate_venue_handle(p_handle);

  -- Venue must exist
  IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id) THEN
    RAISE EXCEPTION 'club_not_found';
  END IF;

  -- Profile row must exist (trigger creates it on signup; this is defensive)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN
    INSERT INTO public.profiles (id) VALUES (auth.uid()) ON CONFLICT DO NOTHING;
  END IF;

  -- Prevent double-join
  IF EXISTS (
    SELECT 1 FROM public.venue_identities
    WHERE venue_id = p_venue_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  -- Insert — venue_handle_norm is GENERATED (lower(venue_handle)), not specified
  -- UNIQUE constraint on (venue_id, venue_handle_norm) is the race-condition guard
  BEGIN
    INSERT INTO public.venue_identities (venue_id, user_id, venue_handle)
    VALUES (p_venue_id, auth.uid(), v_trimmed);
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'handle_taken';
  END;

  -- First club: set primary_venue_id + display_name
  SELECT primary_venue_id INTO v_primary_club
  FROM public.profiles WHERE id = auth.uid();

  IF v_primary_club IS NULL THEN
    UPDATE public.profiles
    SET primary_venue_id = p_venue_id,
        display_name    = v_trimmed
    WHERE id = auth.uid();
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_venue_join"("p_venue_id" "uuid", "p_handle" "text") OWNER TO "postgres";

--
-- Name: rpc_venue_leave("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_leave"("p_venue_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_new_primary uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.venue_identities
    WHERE venue_id = p_venue_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'not_member';
  END IF;

  DELETE FROM public.venue_identities
  WHERE venue_id = p_venue_id
    AND user_id = v_user_id;

  DELETE FROM public.venue_admins
  WHERE venue_id = p_venue_id
    AND user_id = v_user_id;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_user_id
      AND primary_venue_id = p_venue_id
  ) THEN
    SELECT venue_id
    INTO v_new_primary
    FROM public.venue_identities
    WHERE user_id = v_user_id
    ORDER BY created_at ASC
    LIMIT 1;

    UPDATE public.profiles
    SET primary_venue_id = v_new_primary
    WHERE id = v_user_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_venue_leave"("p_venue_id" "uuid") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_venue_leave"("p_venue_id" "uuid"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_venue_leave"("p_venue_id" "uuid") IS 'User leaves a club. Removes their own club identity, clears matching admin role, and rehomes primary_venue_id when needed.';


--
-- Name: rpc_venue_members_discovery("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_members_discovery"("p_venue_id" "uuid", "p_search" "text" DEFAULT NULL::"text") RETURNS TABLE("user_id" "uuid", "display_name" "text", "avatar_url" "text", "venue_handle" "text")
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
    SELECT 1
    FROM public.venue_identities member_vi
    WHERE member_vi.venue_id = p_venue_id
      AND member_vi.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'not_club_member';
  END IF;

  RETURN QUERY
  SELECT
    ci.user_id,
    p.display_name,
    p.avatar_url,
    ci.venue_handle
  FROM public.venue_identities ci
  JOIN public.profiles p
    ON p.id = ci.user_id
  WHERE ci.venue_id = p_venue_id
    AND ci.user_id <> v_uid
    AND p.show_in_venue_member_discovery = true
    AND COALESCE(ci.visible_in_venue_member_discovery, true) = true
    AND (
      p_search IS NULL
      OR p_search = ''
      OR p.display_name ILIKE '%' || trim(p_search) || '%'
      OR ci.venue_handle ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY LOWER(COALESCE(NULLIF(trim(p.display_name), ''), ci.venue_handle)) NULLS LAST,
           LOWER(ci.venue_handle) NULLS LAST,
           ci.user_id;
END;
$$;


ALTER FUNCTION "public"."rpc_venue_members_discovery"("p_venue_id" "uuid", "p_search" "text") OWNER TO "postgres";

--
-- Name: FUNCTION "rpc_venue_members_discovery"("p_venue_id" "uuid", "p_search" "text"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."rpc_venue_members_discovery"("p_venue_id" "uuid", "p_search" "text") IS 'Phase 1: Venue Members discovery. Two-layer: profiles.show_in_venue_member_discovery AND COALESCE(venue_identities.visible_in_venue_member_discovery, true). Caller must be club member.';


--
-- Name: rpc_venue_update("uuid", "text", "text", "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."rpc_venue_update"("p_venue_id" "uuid", "p_name" "text" DEFAULT NULL::"text", "p_location_text" "text" DEFAULT NULL::"text", "p_timezone" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_venue_kind" "text" DEFAULT NULL::"text", "p_access_type" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_venue_admin(p_venue_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_venue_kind IS NOT NULL AND p_venue_kind NOT IN ('club', 'park', 'community_centre', 'condo', 'school', 'private_facility') THEN
    RAISE EXCEPTION 'invalid_venue_kind';
  END IF;

  IF p_access_type IS NOT NULL AND p_access_type NOT IN ('public', 'members', 'private', 'restricted') THEN
    RAISE EXCEPTION 'invalid_access_type';
  END IF;

  UPDATE public.venues
  SET
    name           = COALESCE(p_name, name),
    location_text  = COALESCE(p_location_text, location_text),
    timezone       = COALESCE(p_timezone, timezone),
    notes          = COALESCE(p_notes, notes),
    venue_kind     = COALESCE(p_venue_kind, venue_kind),
    access_type    = COALESCE(p_access_type, access_type)
  WHERE id = p_venue_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'club_not_found';
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_venue_update"("p_venue_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text") OWNER TO "postgres";

--
-- Name: sharegroup_exists("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: test_runner_match_regression_v2(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."test_runner_match_regression_v2"() RETURNS TABLE("test_name" "text", "ok" boolean, "details" "text", "match_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  -- Fixed identities from dataset
  ORG_UID      uuid := '1bb09aac-908c-4746-b904-81c5ff302872'; -- OldChai
  P_UID        uuid := '37c9e087-5b62-43e8-add6-893dec015efd'; -- U3
  REAL_UID     uuid := 'a3631e91-27e4-4db1-a64b-4162d86a4a44'; -- Real
  OUTSIDER_UID uuid := 'b0000000-0000-0000-0000-000000000001'; -- Outsider (not in orc2)

  -- Scope / club
  SCOPE_GID uuid := '17ed4074-6afa-47c7-b9c1-5e110db5859f'; -- orc2
  CLUB_ID   uuid := '3802862a-db80-40e5-bed0-c76e8a631fa8'; -- Whiteoak Tennis Venue

  v_mid uuid;
  v_mp  public.match_participants%rowtype;
  v_binding public.person_match_proxies%rowtype;
  v_inv public.email_invitations%rowtype;
  v_cnt integer;
  v_ok  boolean;
  v_msg text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _v2_results(
    test_name text,
    ok boolean,
    details text,
    match_id uuid
  ) ON COMMIT DROP;

  DELETE FROM public.person_match_proxies
  WHERE principal_person_id IN (
    public.resolve_person_id_for_user(ORG_UID),
    public.resolve_person_id_for_user(P_UID),
    public.resolve_person_id_for_user(REAL_UID)
  );

  -- =========================================================
  -- A. Helper / invariant tests
  -- =========================================================

  -- A01 ShareGroup positive
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    IF public.do_users_share_group(P_UID, REAL_UID) IS TRUE THEN
      INSERT INTO _v2_results VALUES ('A01 ShareGroup(U3, Real) positive', true, 'ok', NULL);
    ELSE
      INSERT INTO _v2_results VALUES ('A01 ShareGroup(U3, Real) positive', false, 'expected true', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('A01 ShareGroup(U3, Real) positive', false, 'exception: '||SQLERRM, NULL);
  END;

  -- A02 Organizer-removed user is not match-associated
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '08:00'::time, 90,
      'tr_v2_A02_match_associated_removed', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(
      match_id, user_id, status, join_method,
      removed_at, removed_by, created_by
    ) VALUES (
      v_mid, REAL_UID, 'removed', 'invited',
      now(), ORG_UID, ORG_UID
    );

    IF public.is_user_match_associated(v_mid, REAL_UID) IS FALSE THEN
      INSERT INTO _v2_results VALUES ('A02 Organizer-removed excludes associated', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('A02 Organizer-removed excludes associated', false, 'expected false for organizer-removed row', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('A02 Organizer-removed excludes associated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- A03 Self-withdrawn user remains match-associated
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '08:30'::time, 90,
      'tr_v2_A03_self_withdraw_associated', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(
      match_id, user_id, status, join_method,
      removed_at, removed_by, created_by
    ) VALUES (
      v_mid, REAL_UID, 'removed', 'requested',
      now(), REAL_UID, REAL_UID
    );

    IF public.is_user_match_associated(v_mid, REAL_UID) IS TRUE THEN
      INSERT INTO _v2_results VALUES ('A03 Self-withdraw remains associated', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('A03 Self-withdraw remains associated', false, 'expected true for self-withdraw row', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('A03 Self-withdraw remains associated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- B. Admission / nominate / request
  -- =========================================================

  -- B01 Nominate creates pending nominated
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '09:00'::time, 90,
      'tr_v2_B01_nominate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO _v2_results VALUES ('B01 Nominate creates pending nominated', false, 'no row', v_mid);
    ELSIF v_mp.status::text = 'pending'
       AND v_mp.join_method::text = 'nominated'
       AND v_mp.nominated_by = P_UID
       AND v_mp.org_approved_at IS NULL
       AND v_mp.participant_accepted_at IS NULL
    THEN
      INSERT INTO _v2_results VALUES ('B01 Nominate creates pending nominated', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'B01 Nominate creates pending nominated',
        false,
        'unexpected: status='||coalesce(v_mp.status::text,'NULL')
        ||', join_method='||coalesce(v_mp.join_method::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('B01 Nominate creates pending nominated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- B02 Admit user (organizer) creates invited row with org_approved_at
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '09:30'::time, 90,
      'tr_v2_B02_admit_user', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp
    FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    IF v_mp.id IS NULL THEN
      INSERT INTO _v2_results VALUES ('B02 Admit user creates row', false, 'no row returned', v_mid);
    ELSIF v_mp.org_approved_at IS NOT NULL AND v_mp.join_method::text = 'invited' THEN
      INSERT INTO _v2_results VALUES (
        'B02 Admit user creates row',
        true,
        'status='||coalesce(v_mp.status::text,'NULL')
        ||', org_approved_at set',
        v_mid
      );
    ELSE
      INSERT INTO _v2_results VALUES (
        'B02 Admit user creates row',
        false,
        'org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL')
        ||', join_method='||coalesce(v_mp.join_method::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('B02 Admit user creates row', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- B03 Request join creates pending requested
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '09:45'::time, 90,
      'tr_v2_B03_request_join', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp
    FROM public.rpc_match_request_join(v_mid);

    IF v_mp.id IS NULL THEN
      INSERT INTO _v2_results VALUES ('B03 Request join creates pending requested', false, 'no row returned', v_mid);
    ELSIF v_mp.status::text = 'pending'
       AND v_mp.join_method::text = 'requested'
       AND v_mp.participant_accepted_at IS NOT NULL
    THEN
      INSERT INTO _v2_results VALUES ('B03 Request join creates pending requested', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'B03 Request join creates pending requested',
        false,
        'status='||coalesce(v_mp.status::text,'NULL')
        ||', join_method='||coalesce(v_mp.join_method::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('B03 Request join creates pending requested', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- C. Proxy / approve / retired composed confirm
  -- =========================================================

  -- C01 Organizer cannot confirm admitted participant without explicit proxy binding
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '10:00'::time, 90,
      'tr_v2_C01_org_proxy', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp
    FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('C01 Organizer cannot proxy-confirm without binding', false, 'expected not_authorized_to_proxy_confirm', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _v2_results VALUES (
        'C01 Organizer cannot proxy-confirm without binding',
        SQLERRM = 'not_authorized_to_proxy_confirm',
        SQLERRM,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C01 Organizer cannot proxy-confirm without binding', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- C02 Explicit Match Proxy confirm on nominated participant stays pending
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '10:30'::time, 90,
      'tr_v2_C02_non_org_proxy', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    IF v_mp.participant_accepted_at IS NOT NULL
       AND v_mp.org_approved_at IS NULL
       AND v_mp.participant_accepted_via::text = 'proxy'
       AND v_mp.status::text = 'pending'
    THEN
      INSERT INTO _v2_results VALUES ('C02 Active Match Proxy keeps nominated participant pending', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'C02 Active Match Proxy keeps nominated participant pending',
        false,
        'status='||coalesce(v_mp.status::text,'NULL')
        ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL')
        ||', via='||coalesce(v_mp.participant_accepted_via::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C02 Active Match Proxy keeps nominated participant pending', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- C03 Organizer approve completes confirmed state after explicit Match Proxy confirm
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '11:00'::time, 90,
      'tr_v2_C03_org_approve', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_org_approve_participant(v_mp.id);

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    IF v_mp.org_approved_at IS NOT NULL
       AND v_mp.participant_accepted_at IS NOT NULL
       AND v_mp.status::text = 'confirmed'
    THEN
      INSERT INTO _v2_results VALUES ('C03 Organizer approve completes confirmed', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES (
        'C03 Organizer approve completes confirmed',
        false,
        'status='||coalesce(v_mp.status::text,'NULL')
        ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL'),
        v_mid
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C03 Organizer approve completes confirmed', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- C04 Old organizer add+confirm composition is blocked without explicit proxy binding
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '11:15'::time, 90,
      'tr_v2_C04_composed_add_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('C04 Old add+confirm composition is blocked', false, 'expected not_authorized_to_proxy_confirm', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _v2_results VALUES (
        'C04 Old add+confirm composition is blocked',
        SQLERRM = 'not_authorized_to_proxy_confirm',
        SQLERRM,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C04 Old add+confirm composition is blocked', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- C05 Old organizer manual-confirm composition on existing row is blocked without explicit proxy binding
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '11:30'::time, 90,
      'tr_v2_C05_composed_manual_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('C05 Old organizer manual-confirm composition is blocked', false, 'expected not_authorized_to_proxy_confirm', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _v2_results VALUES (
        'C05 Old organizer manual-confirm composition is blocked',
        SQLERRM = 'not_authorized_to_proxy_confirm',
        SQLERRM,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('C05 Old organizer manual-confirm composition is blocked', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- D. Participant exit: remove / withdraw
  -- =========================================================

  -- D01 Remove pending nominated logs reject_nomination
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '11:45'::time, 90,
      'tr_v2_D01_remove_pending_nominated', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    IF v_mp.removed_at IS NOT NULL THEN
      SELECT count(*) INTO v_cnt
      FROM public.match_participant_actions a
      WHERE a.match_participant_id = v_mp.id
        AND a.action_type::text = 'reject_nomination';

      IF v_cnt >= 1 THEN
        INSERT INTO _v2_results VALUES ('D01 Remove pending nominated logs reject_nomination', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('D01 Remove pending nominated logs reject_nomination', false, 'missing action log', v_mid);
      END IF;
    ELSE
      INSERT INTO _v2_results VALUES ('D01 Remove pending nominated logs reject_nomination', false, 'removed_at is NULL', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('D01 Remove pending nominated logs reject_nomination', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- D02 Remove pending requested logs reject_request
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '12:00'::time, 90,
      'tr_v2_D02_remove_pending_requested', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_request_join(v_mid);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    IF v_mp.removed_at IS NOT NULL THEN
      SELECT count(*) INTO v_cnt
      FROM public.match_participant_actions a
      WHERE a.match_participant_id = v_mp.id
        AND a.action_type::text = 'reject_request';

      IF v_cnt >= 1 THEN
        INSERT INTO _v2_results VALUES ('D02 Remove pending requested logs reject_request', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('D02 Remove pending requested logs reject_request', false, 'missing action log', v_mid);
      END IF;
    ELSE
      INSERT INTO _v2_results VALUES ('D02 Remove pending requested logs reject_request', false, 'removed_at is NULL', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('D02 Remove pending requested logs reject_request', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- D03 Withdraw confirmed logs withdraw
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '12:15'::time, 90,
      'tr_v2_D03_withdraw_confirmed', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_accept_invite(v_mid);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_user_withdraw(v_mid);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id
      AND a.action_type::text = 'withdraw';

    IF v_mp.removed_at IS NOT NULL AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('D03 Withdraw confirmed logs withdraw', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('D03 Withdraw confirmed logs withdraw', false, 'missing removed_at or action log', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('D03 Withdraw confirmed logs withdraw', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- E. Deprecated / dropped RPCs (must not succeed)
  -- Accepts: deprecated stub error OR function does not exist (dropped)
  -- =========================================================

  -- E01 manual_confirm deprecated or dropped
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '12:30'::time, 90,
      'tr_v2_E01_manual_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    BEGIN
      PERFORM public.rpc_match_manual_confirm(v_mp.id, NULL);
      INSERT INTO _v2_results VALUES ('E01 manual_confirm deprecated', false, 'expected exception, got success', v_mid);
    EXCEPTION WHEN OTHERS THEN
      IF position('deprecated' in SQLERRM) > 0
         OR position('does not exist' in SQLERRM) > 0
         OR position('could not find' in SQLERRM) > 0
      THEN
        INSERT INTO _v2_results VALUES ('E01 manual_confirm deprecated', true, 'ok (stub or dropped)', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('E01 manual_confirm deprecated', false, 'unexpected: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('E01 manual_confirm deprecated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- E02 manual_confirm_user deprecated or dropped
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '12:45'::time, 90,
      'tr_v2_E02_manual_confirm_user', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_manual_confirm_user(v_mid, REAL_UID);
      INSERT INTO _v2_results VALUES ('E02 manual_confirm_user deprecated', false, 'expected exception, got success', v_mid);
    EXCEPTION WHEN OTHERS THEN
      IF position('deprecated' in SQLERRM) > 0
         OR position('does not exist' in SQLERRM) > 0
         OR position('could not find' in SQLERRM) > 0
      THEN
        INSERT INTO _v2_results VALUES ('E02 manual_confirm_user deprecated', true, 'ok (stub or dropped)', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('E02 manual_confirm_user deprecated', false, 'unexpected: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('E02 manual_confirm_user deprecated', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- F. Integrity checks
  -- =========================================================

  -- F01 Confirmed requires both timestamps
  BEGIN
    IF EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_participants mp ON mp.match_id = m.id
      WHERE m.game_type LIKE 'tr_v2_%'
        AND m.match_date = current_date
        AND mp.status::text = 'confirmed'
        AND (mp.org_approved_at IS NULL OR mp.participant_accepted_at IS NULL)
    ) THEN
      INSERT INTO _v2_results VALUES ('F01 Confirmed requires both timestamps', false, 'found confirmed row missing required timestamps', NULL);
    ELSE
      INSERT INTO _v2_results VALUES ('F01 Confirmed requires both timestamps', true, 'ok', NULL);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('F01 Confirmed requires both timestamps', false, 'exception: '||SQLERRM, NULL);
  END;

  -- =========================================================
  -- G. Permission negative
  -- =========================================================

  -- G01 Non-organizer cannot org_approve
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '13:00'::time, 90,
      'tr_v2_G01_non_org_approve', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    BEGIN
      PERFORM public.rpc_match_org_approve_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('G01 Non-organizer cannot org_approve', false, 'expected exception, got success', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _v2_results VALUES ('G01 Non-organizer cannot org_approve', true, 'ok', v_mid);
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('G01 Non-organizer cannot org_approve', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- G02 User not in scope cannot request_join
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '13:15'::time, 90,
      'tr_v2_G02_empty_scope', 4,
      '{}'::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_request_join(v_mid);
      INSERT INTO _v2_results VALUES ('G02 User not in scope cannot request_join', false, 'expected exception, got success', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _v2_results VALUES ('G02 User not in scope cannot request_join', true, 'ok', v_mid);
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('G02 User not in scope cannot request_join', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- H. Idempotency & repeat calls
  -- =========================================================

  -- H01 Duplicate request_join: second fails or idempotent, no new active row, no duplicate action log
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '14:00'::time, 90,
      'tr_v2_H01_dup_request_join', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp FROM public.rpc_match_request_join(v_mid);

    BEGIN
      PERFORM public.rpc_match_request_join(v_mid);
      v_msg := 'second succeeded (idempotent)';
    EXCEPTION WHEN OTHERS THEN
      v_msg := 'second failed: '||SQLERRM;
    END;

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID AND mp.removed_at IS NULL;

    IF v_cnt = 1 AND (SELECT count(*) FROM public.match_participant_actions a WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'request_join') <= 1 THEN
      INSERT INTO _v2_results VALUES ('H01 Duplicate request_join idempotent', true, v_msg, v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H01 Duplicate request_join idempotent', false, 'active_rows='||v_cnt||' or duplicate action log', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H01 Duplicate request_join idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- H02 Duplicate nominate: no two parallel active nominated rows
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '14:15'::time, 90,
      'tr_v2_H02_dup_nominate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    BEGIN
      PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);
      v_msg := 'second succeeded (idempotent)';
    EXCEPTION WHEN OTHERS THEN
      v_msg := 'second failed: '||SQLERRM;
    END;

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID AND mp.removed_at IS NULL;

    IF v_cnt = 1 THEN
      INSERT INTO _v2_results VALUES ('H02 Duplicate nominate idempotent', true, v_msg, v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H02 Duplicate nominate idempotent', false, 'active nominated rows='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H02 Duplicate nominate idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- H03 Duplicate proxy_confirm: no duplicate participant acceptance action log
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '14:30'::time, 90,
      'tr_v2_H03_dup_proxy_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'proxy_confirm';

    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    IF v_cnt = 1 AND v_mp.participant_accepted_at IS NOT NULL THEN
      INSERT INTO _v2_results VALUES ('H03 Duplicate proxy_confirm idempotent', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H03 Duplicate proxy_confirm idempotent', false, 'proxy_confirm count='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H03 Duplicate proxy_confirm idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- H04 Duplicate org_approve: org_approved_at stable, no duplicate approval action log
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '14:45'::time, 90,
      'tr_v2_H04_dup_org_approve', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_accept_invite(v_mid);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_org_approve_participant(v_mp.id);
    PERFORM public.rpc_match_org_approve_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'approve';

    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    IF v_cnt = 1 AND v_mp.org_approved_at IS NOT NULL AND v_mp.status::text = 'confirmed' THEN
      INSERT INTO _v2_results VALUES ('H04 Duplicate org_approve idempotent', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H04 Duplicate org_approve idempotent', false, 'approve count='||v_cnt||' status='||coalesce(v_mp.status::text,'NULL'), v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H04 Duplicate org_approve idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- H05 Remove idempotent: second remove does not add action log, removed_at stable
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '15:00'::time, 90,
      'tr_v2_H05_dup_remove', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id;

    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    IF v_cnt = (SELECT count(*) FROM public.match_participant_actions a WHERE a.match_participant_id = v_mp.id) AND v_mp.removed_at IS NOT NULL THEN
      INSERT INTO _v2_results VALUES ('H05 Remove idempotent', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('H05 Remove idempotent', false, 'action_count changed or removed_at null', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('H05 Remove idempotent', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- I. Permission negatives
  -- =========================================================

  -- I01 Non-organizer / non-manager remove others fails
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '15:15'::time, 90,
      'tr_v2_I01_non_org_remove', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, false,
      now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_admit_user(v_mid, P_UID);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_accept_invite(v_mid);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_remove_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('I01 Non-organizer remove fails', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
      SELECT count(*) INTO v_cnt
      FROM public.match_participant_actions a
      WHERE a.match_participant_id = v_mp.id AND a.action_type::text IN ('remove_confirmed','revoke_invite','reject_nomination','reject_request');
      IF v_mp.removed_at IS NULL AND v_cnt = 0 THEN
        INSERT INTO _v2_results VALUES ('I01 Non-organizer remove fails', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I01 Non-organizer remove fails', false, 'removed_at or action written', v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I01 Non-organizer remove fails', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- I02 Non-proxy confirm against unrelated target fails
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '15:30'::time, 90,
      'tr_v2_I02_non_proxy_unrelated', 4,
      ARRAY[SCOPE_GID, 'c0000000-0000-0000-0000-000000000001'::uuid]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, OUTSIDER_UID);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('I02 Non-proxy confirm against unrelated target fails', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
      IF v_mp.participant_accepted_at IS NULL AND SQLERRM = 'not_authorized_to_proxy_confirm' THEN
        INSERT INTO _v2_results VALUES ('I02 Non-proxy confirm against unrelated target fails', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I02 Non-proxy confirm against unrelated target fails', false, 'accepted_at set or wrong error: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I02 Non-proxy confirm against unrelated target fails', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- I03 Non-proxy confirm on requested participant fails
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '15:45'::time, 90,
      'tr_v2_I03_non_proxy_requested', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    INSERT INTO public.match_participants (
      match_id, user_id, join_method, status,
      participant_accepted_at, participant_accepted_via,
      org_approved_at, nominated_by, created_by
    ) VALUES (
      v_mid, REAL_UID, 'requested', 'pending',
      NULL, NULL,
      NULL, NULL, REAL_UID
    )
    RETURNING * INTO v_mp;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );

    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID
      AND scope = 'manage_match_participation'
      AND revoked_at IS NULL;

    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('I03 Non-proxy confirm on requested participant fails', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
      IF SQLERRM = 'not_authorized_to_proxy_confirm'
         AND v_mp.participant_accepted_at IS NULL THEN
        INSERT INTO _v2_results VALUES ('I03 Non-proxy confirm on requested participant fails', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I03 Non-proxy confirm on requested participant fails', false, 'accepted_at set or wrong error: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I03 Non-proxy confirm on requested participant fails', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- I04 Outsider nominate fails (not in scope, not match-associated)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '16:00'::time, 90,
      'tr_v2_I04_outsider_nominate', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', OUTSIDER_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);
      INSERT INTO _v2_results VALUES ('I04 Outsider nominate fails', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT count(*) INTO v_cnt
      FROM public.match_participants mp
      WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID;
      IF v_cnt = 0 THEN
        INSERT INTO _v2_results VALUES ('I04 Outsider nominate fails', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I04 Outsider nominate fails', false, 'participant row created', v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I04 Outsider nominate fails', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- I05 Non-participant cannot withdraw (rpc_match_user_withdraw: no user participant row)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '16:15'::time, 90,
      'tr_v2_I05_non_participant_withdraw', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', OUTSIDER_UID::text, 'role', 'authenticated')::text,
      true
    );

    BEGIN
      PERFORM public.rpc_match_user_withdraw(v_mid);
      INSERT INTO _v2_results VALUES ('I05 Non-participant cannot withdraw', false, 'expected exception', v_mid);
    EXCEPTION WHEN OTHERS THEN
      IF position('not a participant' in SQLERRM) > 0 OR position('You are not' in SQLERRM) > 0 THEN
        INSERT INTO _v2_results VALUES ('I05 Non-participant cannot withdraw', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v2_results VALUES ('I05 Non-participant cannot withdraw', false, 'wrong error: '||SQLERRM, v_mid);
      END IF;
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('I05 Non-participant cannot withdraw', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- J. Participant-exit matrix
  -- =========================================================

  -- J01 Remove pending invited => revoke_invite
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '16:30'::time, 90,
      'tr_v2_J01_remove_invited', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'revoke_invite';

    IF v_mp.removed_at IS NOT NULL AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('J01 Remove pending invited => revoke_invite', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('J01 Remove pending invited => revoke_invite', false, 'action_type or removed_at', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('J01 Remove pending invited => revoke_invite', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- J02 Remove confirmed => remove_confirmed
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '16:45'::time, 90,
      'tr_v2_J02_remove_confirmed', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_accept_invite(v_mid);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'remove_confirmed';

    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    IF v_mp.removed_at IS NOT NULL AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('J02 Remove confirmed => remove_confirmed', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('J02 Remove confirmed => remove_confirmed', false, 'removed_at='||coalesce(v_mp.removed_at::text,'NULL')||' remove_confirmed_cnt='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('J02 Remove confirmed => remove_confirmed', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- J03 Withdraw pending nominated => decline
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '17:00'::time, 90,
      'tr_v2_J03_withdraw_nominated', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_user_withdraw(v_mid);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'decline';

    IF v_mp.removed_at IS NOT NULL AND v_mp.removed_by = REAL_UID AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('J03 Withdraw pending nominated => decline', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('J03 Withdraw pending nominated => decline', false, 'action or removed_by', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('J03 Withdraw pending nominated => decline', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- J04 Withdraw confirmed => withdraw (stronger)
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[],
      current_date, '17:15'::time, 90,
      'tr_v2_J04_withdraw_confirmed', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    )
    RETURNING id INTO v_mid;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_accept_invite(v_mid);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_user_withdraw(v_mid);

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions a
    WHERE a.match_participant_id = v_mp.id AND a.action_type::text = 'withdraw';

    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    IF v_mp.removed_at IS NOT NULL AND v_mp.removed_by = REAL_UID AND v_cnt >= 1 THEN
      INSERT INTO _v2_results VALUES ('J04 Withdraw confirmed => withdraw', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('J04 Withdraw confirmed => withdraw', false, 'removed_at='||coalesce(v_mp.removed_at::text,'NULL')||' withdraw_cnt='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('J04 Withdraw confirmed => withdraw', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- =========================================================
  -- K. Re-entry / removed then re-enter
  -- =========================================================

  -- K01 Removed user readmit does not silently reactivate a removed row
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT id INTO v_mid FROM public.rpc_match_create(
      4, 'tr_v2_K01_readmit', current_date, '17:30'::time, 90,
      CLUB_ID, '{}'::uuid[], ARRAY[SCOPE_GID]::uuid[],
      true, true, true
    );

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY mp.created_at DESC
    LIMIT 1;

    IF v_mp.removed_at IS NOT NULL AND v_mp.status::text = 'removed' THEN
      INSERT INTO _v2_results VALUES ('K01 Removed user re-admit leaves row removed', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('K01 Removed user re-admit leaves row removed', false, 'status='||coalesce(v_mp.status::text,'NULL')||' removed_at='||coalesce(v_mp.removed_at::text,'NULL'), v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('K01 Removed user re-admit leaves row removed', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- K02 Removed user re-request_join does not recreate an active row automatically
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT id INTO v_mid FROM public.rpc_match_create(
      4, 'tr_v2_K02_rerequest', current_date, '17:45'::time, 90,
      CLUB_ID, '{}'::uuid[], ARRAY[SCOPE_GID]::uuid[],
      true, true, true
    );

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_request_join(v_mid);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_remove_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_mp FROM public.rpc_match_request_join(v_mid);

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID AND mp.removed_at IS NULL;

    IF v_cnt = 0 THEN
      INSERT INTO _v2_results VALUES ('K02 Removed user re-request_join leaves no active row', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v2_results VALUES ('K02 Removed user re-request_join leaves no active row', false, 'active_rows='||v_cnt, v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('K02 Removed user re-request_join leaves no active row', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- K03 Re-entry without an explicit Match Proxy binding remains blocked
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT id INTO v_mid FROM public.rpc_match_create(
      4, 'tr_v2_K03_reentry_proxy', current_date, '18:00'::time, 90,
      CLUB_ID, '{}'::uuid[], ARRAY[SCOPE_GID]::uuid[],
      true, true, true
    );

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_remove_participant(v_mp.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_nominate_user(v_mid, REAL_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY created_at DESC
    LIMIT 1;

    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _v2_results VALUES ('K03 Re-entry proxy confirm without binding is blocked', false, 'expected proxy-only failure', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _v2_results VALUES (
        'K03 Re-entry proxy confirm without binding is blocked',
        SQLERRM IN ('not_authorized_to_proxy_confirm', 'participant_not_pending_or_already_confirmed', 'participant_removed'),
        'exception: '||SQLERRM,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v2_results VALUES ('K03 Re-entry proxy confirm without binding is blocked', false, 'exception: '||SQLERRM, v_mid);
  END;

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details, r.match_id
  FROM _v2_results r
  ORDER BY r.test_name;
END;
$$;


ALTER FUNCTION "public"."test_runner_match_regression_v2"() OWNER TO "postgres";

--
-- Name: test_runner_participant_controls_template(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."test_runner_participant_controls_template"() RETURNS TABLE("test_name" "text", "ok" boolean, "details" "text", "match_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  ORG_UID      uuid := '1bb09aac-908c-4746-b904-81c5ff302872';
  P_UID        uuid := '37c9e087-5b62-43e8-add6-893dec015efd';
  REAL_UID     uuid := 'a3631e91-27e4-4db1-a64b-4162d86a4a44';
  SCOPE_GID    uuid := '17ed4074-6afa-47c7-b9c1-5e110db5859f';
  CLUB_ID      uuid := '3802862a-db80-40e5-bed0-c76e8a631fa8';

  v_mid uuid;
  v_mp public.match_participants%rowtype;
  v_guest public.guests%rowtype;
  v_inv public.email_invitations%rowtype;
  v_binding public.person_match_proxies%rowtype;
  v_cnt integer;
  v_person_id uuid;
  v_real_email text;
  v_org_approved_at timestamptz;
  v_cnt_2 integer;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _participant_controls_results(
    test_name text,
    ok boolean,
    details text,
    match_id uuid
  ) ON COMMIT DROP;

  -- =========================================================
  -- A. Match-associated semantics
  -- =========================================================

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '08:00'::time, 90,
      'tr_tpl_A01_self_withdraw_associated', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(match_id, user_id, status, join_method, removed_at, removed_by, created_by)
    VALUES (v_mid, REAL_UID, 'removed', 'requested', now(), REAL_UID, REAL_UID);

    INSERT INTO _participant_controls_results
    VALUES (
      'A01 Self-withdraw remains associated',
      public.is_user_match_associated(v_mid, REAL_UID) IS TRUE,
      CASE WHEN public.is_user_match_associated(v_mid, REAL_UID) IS TRUE THEN 'ok' ELSE 'expected true' END,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('A01 Self-withdraw remains associated', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '08:15'::time, 90,
      'tr_tpl_A02_org_removed_excluded', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(match_id, user_id, status, join_method, removed_at, removed_by, created_by)
    VALUES (v_mid, REAL_UID, 'removed', 'invited', now(), ORG_UID, ORG_UID);

    INSERT INTO _participant_controls_results
    VALUES (
      'A02 Organizer-remove excludes associated',
      public.is_user_match_associated(v_mid, REAL_UID) IS FALSE,
      CASE WHEN public.is_user_match_associated(v_mid, REAL_UID) IS FALSE THEN 'ok' ELSE 'expected false' END,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('A02 Organizer-remove excludes associated', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '08:30'::time, 90,
      'tr_tpl_A03_self_withdraw_can_nominate', 4, '{}'::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(match_id, user_id, status, join_method, removed_at, removed_by, created_by)
    VALUES (v_mid, REAL_UID, 'removed', 'requested', now(), REAL_UID, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_nominate_user(v_mid, P_UID);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = P_UID
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO _participant_controls_results
    VALUES (
      'A03 Self-withdraw actor can nominate via associated fallback',
      FOUND AND v_mp.join_method::text = 'nominated',
      CASE WHEN FOUND THEN 'join_method=' || coalesce(v_mp.join_method::text, 'NULL') ELSE 'no row created' END,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('A03 Self-withdraw actor can nominate via associated fallback', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '08:45'::time, 90,
      'tr_tpl_A04_org_removed_cannot_nominate', 4, '{}'::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    INSERT INTO public.match_participants(match_id, user_id, status, join_method, removed_at, removed_by, created_by)
    VALUES (v_mid, REAL_UID, 'removed', 'invited', now(), ORG_UID, ORG_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);

    BEGIN
      PERFORM public.rpc_match_nominate_user(v_mid, P_UID);
      INSERT INTO _participant_controls_results VALUES ('A04 Organizer-removed actor cannot nominate via associated fallback', false, 'expected authorization failure', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _participant_controls_results
      VALUES (
        'A04 Organizer-removed actor cannot nominate via associated fallback',
        SQLERRM LIKE '%not authorized%',
        SQLERRM,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('A04 Organizer-removed actor cannot nominate via associated fallback', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- B. User explicit Match Proxy lifecycle
  -- =========================================================

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '09:00'::time, 90,
      'tr_tpl_B01_user_proxy_pending', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO _participant_controls_results
    VALUES (
      'B01 Self-requested Match Proxy binding stays pending until email verification',
      v_binding.status = 'pending'
      AND v_binding.confirmed_at IS NULL
      AND v_binding.invited_via = 'principal_email_verification'
      AND v_inv.id IS NOT NULL
      AND v_inv.status = 'pending'
      AND lower(trim(v_inv.target_email)) = lower(trim(v_binding.invited_to)),
      'status=' || coalesce(v_binding.status::text, 'NULL')
      || ', invited_via=' || coalesce(v_binding.invited_via, 'NULL')
      || ', invited_to=' || coalesce(v_binding.invited_to, 'NULL')
      || ', invitation_id=' || coalesce(v_inv.id::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B01 Self-requested Match Proxy binding stays pending until email verification', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '09:15'::time, 90,
      'tr_tpl_B02_user_proxy_active_manageable', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);
    SELECT * INTO v_binding FROM public.person_match_proxies WHERE binding_id = v_binding.binding_id;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_cnt
    FROM public.rpc_match_proxy_manageable_participants(v_mid) t
    WHERE t.match_participant_id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'B02 Confirmed Match Proxy binding exposes manageable participant scope',
      v_binding.status = 'active'
      AND v_binding.confirmed_at IS NOT NULL
      AND v_cnt = 1,
      'status=' || coalesce(v_binding.status::text, 'NULL')
      || ', manageable_count=' || v_cnt::text,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B02 Confirmed Match Proxy binding exposes manageable participant scope', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '09:30'::time, 90,
      'tr_tpl_B03_user_proxy_confirm_participant', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'B03 Active Match Proxy can confirm invited user principal',
      v_mp.status::text = 'confirmed'
      AND v_mp.org_approved_at IS NOT NULL
      AND v_mp.participant_accepted_via = 'proxy'
      AND v_mp.manual_confirmed_by = P_UID,
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', via=' || coalesce(v_mp.participant_accepted_via, 'NULL')
      || ', actor=' || coalesce(v_mp.manual_confirmed_by::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B03 Active Match Proxy can confirm invited user principal', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '09:45'::time, 90,
      'tr_tpl_B04_user_proxy_rejected', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_decline(v_inv.id);
    SELECT * INTO v_binding FROM public.person_match_proxies WHERE binding_id = v_binding.binding_id;

    INSERT INTO _participant_controls_results
    VALUES (
      'B04 Principal can reject pending Match Proxy binding',
      v_binding.status = 'rejected'
      AND v_binding.rejected_at IS NOT NULL
      AND v_binding.confirmed_at IS NULL,
      'status=' || coalesce(v_binding.status::text, 'NULL')
      || ', rejected_at=' || coalesce(v_binding.rejected_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B04 Principal can reject pending Match Proxy binding', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '10:00'::time, 90,
      'tr_tpl_B05_user_proxy_revoked', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_revoke_self(v_binding.binding_id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _participant_controls_results VALUES ('B05 Revoked Match Proxy binding immediately blocks future proxy confirm', false, 'expected not_authorized_to_proxy_confirm', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
      INSERT INTO _participant_controls_results
      VALUES (
        'B05 Revoked Match Proxy binding immediately blocks future proxy confirm',
        SQLERRM = 'not_authorized_to_proxy_confirm'
        AND v_binding.status = 'revoked'
        AND v_binding.revoked_at IS NOT NULL
        AND v_mp.participant_accepted_at IS NULL,
        'exception=' || SQLERRM
        || ', binding_status=' || coalesce(v_binding.status::text, 'NULL')
        || ', participant_accepted_at=' || coalesce(v_mp.participant_accepted_at::text, 'NULL'),
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('B05 Revoked Match Proxy binding immediately blocks future proxy confirm', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- C. Contact Player explicit Match Proxy lifecycle
  -- =========================================================

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '10:00'::time, 90,
      'tr_tpl_C01_guest_org_only_pending', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C01 guest', NULL, NULL, 'participant-controls-template');
    SELECT * INTO v_mp FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    INSERT INTO _participant_controls_results
    VALUES (
      'C01 Organizer-approved Contact Player stays pending until participant confirmation',
      v_mp.status::text = 'pending'
      AND v_mp.org_approved_at IS NOT NULL
      AND v_mp.participant_accepted_at IS NULL,
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL')
      || ', participant_accepted_at=' || coalesce(v_mp.participant_accepted_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C01 Organizer-approved Contact Player stays pending until participant confirmation', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '10:30'::time, 90,
      'tr_tpl_C02_contact_proxy_request_pending', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C02 guest', 'tr-c02@test.local', NULL, 'participant-controls-template');
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_contact_player(v_guest.id);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO _participant_controls_results
    VALUES (
      'C02 Contact Player proxy request creates pending binding and verification invitation',
      v_binding.status = 'pending'
      AND v_binding.invited_to = 'tr-c02@test.local'
      AND v_inv.id IS NOT NULL
      AND v_inv.status = 'pending'
      AND lower(trim(v_inv.target_email)) = 'tr-c02@test.local',
      'binding_status=' || coalesce(v_binding.status::text, 'NULL')
      || ', target_email=' || coalesce(v_inv.target_email, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C02 Contact Player proxy request creates pending binding and verification invitation', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '10:45'::time, 90,
      'tr_tpl_C03_contact_proxy_active_manageable', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C03 guest', 'tr-c03@test.local', NULL, 'participant-controls-template');
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_contact_player(v_guest.id);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_email_invitation_accept_as_guest(v_inv.id);
    SELECT * INTO v_binding FROM public.person_match_proxies WHERE binding_id = v_binding.binding_id;
    SELECT * INTO v_mp FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    SELECT count(*) INTO v_cnt
    FROM public.rpc_match_proxy_manageable_participants(v_mid) t
    WHERE t.match_participant_id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'C03 Guest verification accept activates Match Proxy binding and manageable scope',
      v_binding.status = 'active'
      AND v_binding.confirmed_at IS NOT NULL
      AND v_cnt = 1,
      'binding_status=' || coalesce(v_binding.status::text, 'NULL')
      || ', manageable_count=' || v_cnt::text,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C03 Guest verification accept activates Match Proxy binding and manageable scope', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:00'::time, 90,
      'tr_tpl_C04_contact_proxy_confirm_participant', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C04 guest', 'tr-c04@test.local', NULL, 'participant-controls-template');
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_contact_player(v_guest.id);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_email_invitation_accept_as_guest(v_inv.id);
    SELECT * INTO v_mp FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_org_approve_participant(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'C04 Active Match Proxy can confirm Contact Player principal',
      v_mp.status::text = 'confirmed'
      AND v_mp.participant_accepted_via = 'proxy'
      AND v_mp.manual_confirmed_by = P_UID
      AND v_mp.org_approved_at IS NOT NULL,
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', via=' || coalesce(v_mp.participant_accepted_via, 'NULL')
      || ', actor=' || coalesce(v_mp.manual_confirmed_by::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C04 Active Match Proxy can confirm Contact Player principal', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:15'::time, 90,
      'tr_tpl_C05_contact_proxy_rejected', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template C05 guest', 'tr-c05@test.local', NULL, 'participant-controls-template');
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_contact_player(v_guest.id);

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;

    PERFORM public.rpc_email_invitation_decline_as_guest(v_inv.id, ORG_UID);
    SELECT * INTO v_binding FROM public.person_match_proxies WHERE binding_id = v_binding.binding_id;
    SELECT * INTO v_mp FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    BEGIN
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
      INSERT INTO _participant_controls_results VALUES ('C05 Declined Contact Player Match Proxy request blocks future proxy confirm', false, 'expected not_authorized_to_proxy_confirm', v_mid);
    EXCEPTION WHEN OTHERS THEN
      SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;
      INSERT INTO _participant_controls_results
      VALUES (
        'C05 Declined Contact Player Match Proxy request blocks future proxy confirm',
        SQLERRM = 'not_authorized_to_proxy_confirm'
        AND v_binding.status = 'rejected'
        AND v_binding.rejected_at IS NOT NULL
        AND v_mp.participant_accepted_at IS NULL,
        'exception=' || SQLERRM
        || ', binding_status=' || coalesce(v_binding.status::text, 'NULL')
        || ', participant_accepted_at=' || coalesce(v_mp.participant_accepted_at::text, 'NULL'),
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('C05 Declined Contact Player Match Proxy request blocks future proxy confirm', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- D. Contact Player caller gate cleanup
  -- =========================================================

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:00'::time, 90,
      'tr_tpl_D01_contact_targets_follow_invite_gate', 4, ARRAY[SCOPE_GID]::uuid[],
      true, false, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template D01 guest', 'tr-d01@test.local', NULL, 'participant-controls-template');

    SELECT count(*) INTO v_cnt
    FROM public.rpc_match_admission_targets(v_mid) t
    WHERE t.target_kind = 'contact_player'
      AND t.target_id = v_guest.id
      AND t.action_kind = 'nominate_contact_player'
      AND t.can_admit IS TRUE;

    INSERT INTO _participant_controls_results
    VALUES (
      'D01 In-scope non-associated caller sees Contact Player targets when invite-users enabled',
      v_cnt = 1,
      'target_count=' || v_cnt::text,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('D01 In-scope non-associated caller sees Contact Player targets when invite-users enabled', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:15'::time, 90,
      'tr_tpl_D02_contact_nominate_ignores_legacy_guest_flag', 4, ARRAY[SCOPE_GID]::uuid[],
      true, false, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template D02 guest', 'tr-d02@test.local', NULL, 'participant-controls-template');
    SELECT * INTO v_mp FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    INSERT INTO _participant_controls_results
    VALUES (
      'D02 In-scope non-associated caller can nominate Contact Player when invite-users enabled',
      v_mp.join_method::text = 'nominated'
      AND v_mp.status::text = 'pending'
      AND v_mp.guest_id = v_guest.id
      AND v_mp.org_approved_at IS NULL,
      'join_method=' || coalesce(v_mp.join_method::text, 'NULL')
      || ', status=' || coalesce(v_mp.status::text, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('D02 In-scope non-associated caller can nominate Contact Player when invite-users enabled', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:30'::time, 90,
      'tr_tpl_D03_contact_nominate_requires_invite_flag', 4, ARRAY[SCOPE_GID]::uuid[],
      false, false, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template D03 guest', 'tr-d03@test.local', NULL, 'participant-controls-template');

    BEGIN
      PERFORM public.rpc_match_nominate_guest(v_mid, v_guest.id);
      INSERT INTO _participant_controls_results VALUES ('D03 Contact Player nominate still requires invite-users capability', false, 'expected not_authorized_to_nominate_guest', v_mid);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _participant_controls_results
      VALUES (
        'D03 Contact Player nominate still requires invite-users capability',
        SQLERRM = 'not_authorized_to_nominate_guest',
        'exception=' || SQLERRM,
        v_mid
      );
    END;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('D03 Contact Player nominate still requires invite-users capability', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- F. Proxy participant-side action surface
  -- =========================================================

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:40'::time, 90,
      'tr_tpl_F01_proxy_decline_pending_user', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_proxy_decline_participant(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    INSERT INTO _participant_controls_results
    VALUES (
      'F01 Active Match Proxy can decline invited user principal with provenance',
      v_mp.status::text = 'removed'
      AND v_mp.removed_by = P_UID
      AND coalesce(v_mp.removal_note, '') LIKE 'Proxy declined%',
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', removed_by=' || coalesce(v_mp.removed_by::text, 'NULL')
      || ', removal_note=' || coalesce(v_mp.removal_note, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('F01 Active Match Proxy can decline invited user principal with provenance', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    DELETE FROM public.person_match_proxies
    WHERE principal_person_id = public.resolve_person_id_for_user(REAL_UID)
      AND proxy_user_id = P_UID;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:42'::time, 90,
      'tr_tpl_F02_proxy_withdraw_confirmed_user', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_mp FROM public.rpc_match_admit_user(v_mid, REAL_UID);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);
    PERFORM public.rpc_match_proxy_withdraw_participant(v_mp.id);
    SELECT * INTO v_mp FROM public.match_participants WHERE id = v_mp.id;

    SELECT count(*) INTO v_cnt
    FROM public.match_participant_actions mpa
    WHERE mpa.match_participant_id = v_mp.id
      AND mpa.action_type = 'withdraw'
      AND mpa.created_by = P_UID;

    INSERT INTO _participant_controls_results
    VALUES (
      'F02 Active Match Proxy can withdraw confirmed user principal with provenance',
      v_mp.status::text = 'removed'
      AND v_mp.removed_by = P_UID
      AND coalesce(v_mp.removal_note, '') LIKE 'Proxy withdrew participation%'
      AND v_cnt >= 1,
      'status=' || coalesce(v_mp.status::text, 'NULL')
      || ', removed_by=' || coalesce(v_mp.removed_by::text, 'NULL')
      || ', removal_note=' || coalesce(v_mp.removal_note, 'NULL')
      || ', action_count=' || v_cnt::text,
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('F02 Active Match Proxy can withdraw confirmed user principal with provenance', false, 'exception: ' || SQLERRM, v_mid);
  END;

  -- =========================================================
  -- G. Contact Player public discovery hardening
  -- =========================================================

  BEGIN
    INSERT INTO _participant_controls_results
    VALUES (
      'G01 Contact Player public view is not directly selectable by anon or authenticated',
      NOT has_table_privilege('anon', 'public.contact_player_public', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.contact_player_public', 'SELECT')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'guests'
          AND policyname = 'guests_select_authenticated'
      ),
      'anon_select=' || has_table_privilege('anon', 'public.contact_player_public', 'SELECT')::text
      || ', authenticated_select=' || has_table_privilege('authenticated', 'public.contact_player_public', 'SELECT')::text,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('G01 Contact Player public view is not directly selectable by anon or authenticated', false, 'exception: ' || SQLERRM, NULL);
  END;

  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest FROM public.rpc_roster_guest_create('TR template G02 guest', 'tr-g02@test.local', NULL, 'participant-controls-template');

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_cnt
    FROM public.rpc_contact_player_lookup(ARRAY[v_guest.id]::uuid[]);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', P_UID::text, 'role', 'authenticated')::text, true);
    SELECT count(*) INTO v_cnt_2
    FROM public.rpc_contact_player_lookup(ARRAY[v_guest.id]::uuid[]);

    INSERT INTO _participant_controls_results
    VALUES (
      'G02 Scoped Contact Player lookup hides default discovery and still serves trusted owner',
      v_cnt = 0 AND v_cnt_2 = 1,
      'outsider_count=' || v_cnt::text || ', owner_count=' || v_cnt_2::text,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('G02 Scoped Contact Player lookup hides default discovery and still serves trusted owner', false, 'exception: ' || SQLERRM, NULL);
  END;

  BEGIN
    INSERT INTO _participant_controls_results
    VALUES (
      'G03 Canonical Match Proxy RPCs are not executable by anon',
      NOT has_function_privilege('anon', 'public.rpc_match_proxy_request_self(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_revoke_self(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_request_contact_player(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_confirm_participant(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_manageable_participants(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_decline_participant(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.rpc_match_proxy_withdraw_participant(uuid)', 'EXECUTE'),
      'proxy_request=' || has_function_privilege('anon', 'public.rpc_match_proxy_request_self(uuid)', 'EXECUTE')::text
      || ', proxy_confirm=' || has_function_privilege('anon', 'public.rpc_match_proxy_confirm_participant(uuid)', 'EXECUTE')::text
      || ', proxy_manageable=' || has_function_privilege('anon', 'public.rpc_match_proxy_manageable_participants(uuid)', 'EXECUTE')::text
      || ', proxy_withdraw=' || has_function_privilege('anon', 'public.rpc_match_proxy_withdraw_participant(uuid)', 'EXECUTE')::text,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('G03 Canonical Match Proxy RPCs are not executable by anon', false, 'exception: ' || SQLERRM, NULL);
  END;

  BEGIN
    INSERT INTO _participant_controls_results
    VALUES (
      'G04 Retired Match Proxy compatibility RPCs are removed',
      to_regprocedure('public.rpc_match_proxy_bind_self(uuid)') IS NULL
      AND to_regprocedure('public.rpc_match_proxy_confirm_self(uuid)') IS NULL
      AND to_regprocedure('public.rpc_match_proxy_reject_self(uuid)') IS NULL
      AND to_regprocedure('public.rpc_match_delegate_confirm_participant(uuid)') IS NULL
      AND to_regprocedure('public.rpc_match_revoke_delegate_confirm_participant(uuid)') IS NULL,
      'bind_self=' || coalesce(to_regprocedure('public.rpc_match_proxy_bind_self(uuid)')::text, 'NULL')
      || ', confirm_self=' || coalesce(to_regprocedure('public.rpc_match_proxy_confirm_self(uuid)')::text, 'NULL')
      || ', reject_self=' || coalesce(to_regprocedure('public.rpc_match_proxy_reject_self(uuid)')::text, 'NULL')
      || ', delegate_confirm=' || coalesce(to_regprocedure('public.rpc_match_delegate_confirm_participant(uuid)')::text, 'NULL')
      || ', revoke_delegate=' || coalesce(to_regprocedure('public.rpc_match_revoke_delegate_confirm_participant(uuid)')::text, 'NULL'),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('G04 Retired Match Proxy compatibility RPCs are removed', false, 'exception: ' || SQLERRM, NULL);
  END;

  -- =========================================================
  -- E. Email invitation acceptance canonicalization
  -- =========================================================

  BEGIN
    SELECT lower(trim(email::text)) INTO v_real_email
    FROM auth.users
    WHERE id = REAL_UID;

    IF v_real_email IS NULL THEN
      RAISE EXCEPTION 'real_email_not_found';
    END IF;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '11:45'::time, 90,
      'tr_tpl_E01_email_accept_reuses_guest_anchor', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_guest
    FROM public.rpc_roster_guest_create('TR template E01 linked guest', v_real_email, NULL, 'participant-controls-template');

    SELECT * INTO v_mp
    FROM public.rpc_match_nominate_guest(v_mid, v_guest.id);

    v_person_id := public.resolve_person_id_for_guest(v_guest.id);
    v_org_approved_at := v_mp.org_approved_at;

    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE match_participant_id = v_mp.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'email_invitation_not_created';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    SELECT * INTO v_mp
    FROM public.match_participants
    WHERE id = v_mp.id;

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    LEFT JOIN public.guests g ON g.id = mp.guest_id
    WHERE mp.match_id = v_mid
      AND mp.removed_at IS NULL
      AND (
        mp.user_id = REAL_UID
        OR g.person_id = v_person_id
      );

    INSERT INTO _participant_controls_results
    VALUES (
      'E01 Registered email accept reuses anchored Contact Player row',
      v_cnt = 1
      AND v_mp.guest_id = v_guest.id
      AND v_mp.user_id IS NULL
      AND v_mp.participant_accepted_at IS NOT NULL
      AND v_mp.participant_accepted_via = 'email_invitation'
      AND v_mp.org_approved_at = v_org_approved_at
      AND EXISTS (
        SELECT 1
        FROM public.identity_links il
        WHERE il.user_id = REAL_UID
          AND il.linked_type = 'guest_participant'
          AND il.linked_id = v_mp.id
      ),
      'active_rows=' || v_cnt
      || ', guest_id=' || coalesce(v_mp.guest_id::text, 'NULL')
      || ', user_id=' || coalesce(v_mp.user_id::text, 'NULL')
      || ', via=' || coalesce(v_mp.participant_accepted_via, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('E01 Registered email accept reuses anchored Contact Player row', false, 'exception: ' || SQLERRM, v_mid);
  END;

  BEGIN
    SELECT lower(trim(email::text)) INTO v_real_email
    FROM auth.users
    WHERE id = REAL_UID;

    IF v_real_email IS NULL THEN
      RAISE EXCEPTION 'real_email_not_found';
    END IF;

    INSERT INTO public.matches (
      organizer_id, status, venue_id, court_ids, match_date, start_time, duration_minutes,
      game_type, required_count, invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants, created_at
    ) VALUES (
      ORG_UID, 'active', CLUB_ID, '{}'::uuid[], current_date, '12:00'::time, 90,
      'tr_tpl_E02_email_accept_user_pending_only', 4, ARRAY[SCOPE_GID]::uuid[],
      true, true, true, now()
    ) RETURNING id INTO v_mid;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);
    SELECT * INTO v_inv
    FROM public.rpc_email_invitation_create(v_real_email, 'TR template E02', 'match', v_mid, NULL);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text, true);
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    SELECT * INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid
      AND mp.user_id = REAL_UID
      AND removed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT count(*) INTO v_cnt
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid
      AND mp.removed_at IS NULL;

    INSERT INTO _participant_controls_results
    VALUES (
      'E02 Registered email accept creates participant-side pending row only',
      FOUND
      AND v_cnt = 1
      AND v_mp.participant_accepted_at IS NOT NULL
      AND v_mp.participant_accepted_via = 'email_invitation'
      AND v_mp.org_approved_at IS NULL
      AND v_mp.status::text = 'pending',
      'active_rows=' || v_cnt
      || ', status=' || coalesce(v_mp.status::text, 'NULL')
      || ', via=' || coalesce(v_mp.participant_accepted_via, 'NULL')
      || ', org_approved_at=' || coalesce(v_mp.org_approved_at::text, 'NULL'),
      v_mid
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _participant_controls_results VALUES ('E02 Registered email accept creates participant-side pending row only', false, 'exception: ' || SQLERRM, v_mid);
  END;

  RETURN QUERY
  SELECT r.test_name, r.ok, r.details, r.match_id
  FROM _participant_controls_results r
  ORDER BY r.test_name;
END;
$$;


ALTER FUNCTION "public"."test_runner_participant_controls_template"() OWNER TO "postgres";

--
-- Name: test_runner_v161(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."test_runner_v161"() RETURNS TABLE("test_name" "text", "ok" boolean, "details" "text", "match_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  -- Fixed identities from your dataset
  ORG_UID  uuid := '1bb09aac-908c-4746-b904-81c5ff302872'; -- OldChai
  P_UID    uuid := '37c9e087-5b62-43e8-add6-893dec015efd'; -- U3
  REAL_UID uuid := 'a3631e91-27e4-4db1-a64b-4162d86a4a44'; -- Real

  -- Use orc2 as scope
  SCOPE_GID uuid := '17ed4074-6afa-47c7-b9c1-5e110db5859f'; -- orc2

  -- Real venue_id
  CLUB_ID uuid := '3802862a-db80-40e5-bed0-c76e8a631fa8'; -- Whiteoak Tennis Venue

  v_mid uuid;
  v_mp  public.match_participants%rowtype;
  v_binding public.person_match_proxies%rowtype;
  v_inv public.email_invitations%rowtype;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _v161_results(
    test_name text,
    ok boolean,
    details text,
    match_id uuid
  ) ON COMMIT DROP;

  DELETE FROM public.person_match_proxies
  WHERE principal_person_id IN (
    public.resolve_person_id_for_user(ORG_UID),
    public.resolve_person_id_for_user(P_UID),
    public.resolve_person_id_for_user(REAL_UID)
  );

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
      organizer_id, status,
      venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active',
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
  -- T02: Explicit Match Proxy can complete organizer-invite flow to confirmed
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status,
      venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active',
      CLUB_ID, '{}'::uuid[],
      current_date, '11:00'::time, 90,
      'v161_test_org_manual_confirm', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- organizer invites Real
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );

    SELECT * INTO v_mp FROM public.rpc_match_invite_user(v_mid, REAL_UID);

    -- Real explicitly binds organizer as Match Proxy for participant-side actions
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
      true
    );
    SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(ORG_UID);
    SELECT * INTO v_inv
    FROM public.email_invitations
    WHERE related_type = 'match_proxy_binding'
      AND related_id = v_binding.binding_id
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.rpc_email_invitation_accept(v_inv.id);

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);

    SELECT mp.* INTO v_mp
    FROM public.match_participants mp
    WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
    ORDER BY mp.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T02 Org add+confirm via composed flow', false, 'no match_participants row created', v_mid);
    ELSE
      IF v_mp.org_approved_at IS NOT NULL
         AND v_mp.participant_accepted_at IS NOT NULL
         AND v_mp.participant_accepted_via::text = 'proxy'
      THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T02 Org add+confirm via composed flow',
          true,
          'status='||coalesce(v_mp.status::text,'NULL')||', ok',
          v_mid
        );
      ELSE
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T02 Org add+confirm via composed flow',
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
    VALUES ('T02 Org add+confirm via composed flow', false, 'exception: '||SQLERRM, v_mid);
  END;

  -- ===========================================================================
  -- T03: Explicit Match Proxy confirm keeps nominated row pending until organizer approval
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status,
      venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active',
      CLUB_ID, '{}'::uuid[],
      current_date, '12:00'::time, 90,
      'v161_test_proxy_confirm_pending', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- U3 nominates Real
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
      VALUES ('T03 Proxy confirm keeps pending', false, 'no match_participants row after nominate', v_mid);
    ELSE
      PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', REAL_UID::text, 'role', 'authenticated')::text,
        true
      );
      SELECT * INTO v_binding FROM public.rpc_match_proxy_request_self(P_UID);
      SELECT * INTO v_inv
      FROM public.email_invitations
      WHERE related_type = 'match_proxy_binding'
        AND related_id = v_binding.binding_id
      ORDER BY created_at DESC
      LIMIT 1;
      PERFORM public.rpc_email_invitation_accept(v_inv.id);

      PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', P_UID::text, 'role', 'authenticated')::text,
        true
      );
      PERFORM public.rpc_match_proxy_confirm_participant(v_mp.id);

      SELECT mp.* INTO v_mp
      FROM public.match_participants mp
      WHERE mp.match_id = v_mid AND mp.user_id = REAL_UID
      ORDER BY mp.created_at DESC
      LIMIT 1;

      IF NOT FOUND THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES ('T03 Proxy confirm keeps pending', false, 'no match_participants row after proxy confirm', v_mid);
      ELSIF v_mp.participant_accepted_at IS NOT NULL
           AND v_mp.participant_accepted_via::text = 'proxy'
           AND v_mp.org_approved_at IS NULL
           AND v_mp.status::text = 'pending'
      THEN
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES ('T03 Proxy confirm keeps pending', true, 'ok', v_mid);
      ELSE
        INSERT INTO _v161_results(test_name, ok, details, match_id)
        VALUES (
          'T03 Proxy confirm keeps pending',
          false,
          'got status='||coalesce(v_mp.status::text,'NULL')
          ||', participant_accepted_at='||coalesce(v_mp.participant_accepted_at::text,'NULL')
          ||', participant_accepted_via='||coalesce(v_mp.participant_accepted_via::text,'NULL')
          ||', org_approved_at='||coalesce(v_mp.org_approved_at::text,'NULL'),
          v_mid
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T03 Proxy confirm keeps pending', false, 'sqlstate='||SQLSTATE||' err='||SQLERRM, v_mid);
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
  -- T05: Self-withdraw removed row remains match-associated
  -- - create a match, insert a self-withdraw removed row for REAL, verify helper returns true
  -- ===========================================================================
  BEGIN
    INSERT INTO public.matches (
      organizer_id, status,
      venue_id, court_ids,
      match_date, start_time, duration_minutes,
      game_type, required_count,
      invitation_scope_group_ids,
      can_participants_invite_users, can_participants_add_guests, can_participants_manage_participants,
      created_at
    ) VALUES (
      ORG_UID, 'active',
      CLUB_ID, '{}'::uuid[],
      current_date, '13:00'::time, 90,
      'v161_test_match_associated_any_row', 4,
      ARRAY[SCOPE_GID]::uuid[],
      true, true, true,
      now()
    )
    RETURNING public.matches.id INTO v_mid;

    -- insert a self-withdraw removed participant row for REAL
    INSERT INTO public.match_participants(
      match_id, user_id, status,
      join_method,
      removed_at, removed_by,
      created_by
    ) VALUES (
      v_mid, REAL_UID, 'removed',
      'invited',
      now(), REAL_UID,
      REAL_UID
    );

    IF public.is_user_match_associated(v_mid, REAL_UID) IS TRUE THEN
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T05 Self-withdraw removed remains associated', true, 'ok', v_mid);
    ELSE
      INSERT INTO _v161_results(test_name, ok, details, match_id)
      VALUES ('T05 Self-withdraw removed remains associated', false, 'expected self-withdraw row to remain associated', v_mid);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _v161_results(test_name, ok, details, match_id)
    VALUES ('T05 Self-withdraw removed remains associated', false, 'exception: '||SQLERRM, v_mid);
  END;

  RETURN QUERY
    SELECT r.test_name, r.ok, r.details, r.match_id
    FROM _v161_results r
    ORDER BY r.test_name;

END;
$$;


ALTER FUNCTION "public"."test_runner_v161"() OWNER TO "postgres";

--
-- Name: test_runner_v161_cleanup(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: test_runner_v161_cleanup("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: tg__set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."tg__set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."tg__set_updated_at"() OWNER TO "postgres";

--
-- Name: trg_email_invitation_anchor_consistency(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: trg_notify_delegator_on_mp_change(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: trg_notify_on_invite_nominate(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: trg_notify_on_match_cancelled(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: trg_set_formed_at_once(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: trg_set_removed_at_from_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

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

--
-- Name: validate_venue_handle("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."validate_venue_handle"("p_handle" "text") RETURNS "text"
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


ALTER FUNCTION "public"."validate_venue_handle"("p_handle" "text") OWNER TO "postgres";

--
-- Name: people; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."people" (
    "person_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "person_type" "text" DEFAULT 'limited_contact'::"text" NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_url" "text",
    "linked_user_id" "uuid",
    "primary_sport_id" smallint,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "people_person_type_check" CHECK (("person_type" = ANY (ARRAY['registered_user'::"text", 'limited_contact'::"text", 'linked_hybrid'::"text"]))),
    CONSTRAINT "people_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."people" OWNER TO "postgres";

--
-- Name: TABLE "people"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."people" IS 'Canonical shared person-node layer. Contact Player is a limited person node here; registered users also resolve here.';


--
-- Name: contact_player_public; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."contact_player_public" AS
 SELECT "g"."id" AS "guest_id",
    "g"."person_id",
    COALESCE(NULLIF(TRIM(BOTH FROM "p"."display_name"), ''::"text"), NULLIF(TRIM(BOTH FROM "g"."display_name"), ''::"text"), ("g"."id")::"text") AS "display_name",
    "p"."avatar_url",
    "p"."primary_sport_id"
   FROM ("public"."guests" "g"
     LEFT JOIN "public"."people" "p" ON (("p"."person_id" = "g"."person_id")))
  WHERE ("g"."status" = 'active'::"text");


ALTER VIEW "public"."contact_player_public" OWNER TO "postgres";

--
-- Name: VIEW "contact_player_public"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."contact_player_public" IS 'Internal Contact Player helper view. Public and broad authenticated discovery must use scoped RPCs, not direct view access.';


--
-- Name: contact_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."contact_records" (
    "contact_record_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "guest_id" "uuid",
    "raw_name" "text",
    "raw_phone" "text",
    "raw_email" "text",
    "owner_notes" "text",
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_records" OWNER TO "postgres";

--
-- Name: TABLE "contact_records"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."contact_records" IS 'Owner-private Contact Player records. Private phone/email/notes live here, not on the shared person node.';


--
-- Name: domain_events; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: TABLE "domain_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."domain_events" IS 'Immutable domain events for invitation/notification architecture. Processed by event processor.';


--
-- Name: email_invitation_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."email_invitation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invitation_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."email_invitation_events" OWNER TO "postgres";

--
-- Name: TABLE "email_invitation_events"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."email_invitation_events" IS 'Audit events for invitation lifecycle. event_type: invitation_created, email_delivery_requested, email_sent, email_failed, invitation_opened, invitation_verified_email, invitation_landed, invitation_accepted, invitation_declined, invitation_expired.';


--
-- Name: gear_images; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."gear_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "gear_item_id" "uuid",
    "image_kind" "text" DEFAULT 'item'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "public_url" "text" NOT NULL,
    "cutout_storage_path" "text",
    "cutout_public_url" "text",
    "caption" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_cover" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gear_images_item_required_for_item_kind" CHECK (((("image_kind" = 'item'::"text") AND ("gear_item_id" IS NOT NULL)) OR ("image_kind" = 'setup_photo'::"text"))),
    CONSTRAINT "gear_images_kind_check" CHECK (("image_kind" = ANY (ARRAY['item'::"text", 'setup_photo'::"text"])))
);


ALTER TABLE "public"."gear_images" OWNER TO "postgres";

--
-- Name: gear_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."gear_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "collection_type" "text" NOT NULL,
    "category" "text" NOT NULL,
    "item_name" "text" NOT NULL,
    "gear_type" "text",
    "current_status" "text",
    "purchase_date" "date",
    "purchase_price" numeric(10,2),
    "source_link" "text",
    "source_price" numeric(10,2),
    "bought_from" "text",
    "nickname" "text",
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "recognition_confidence" "text",
    "recognition_detected_text" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "visible_in_showcase" boolean DEFAULT false NOT NULL,
    "showcase_note" "text",
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gear_items_category_check" CHECK (("category" = ANY (ARRAY['rackets'::"text", 'shoes'::"text", 'apparel'::"text", 'strings'::"text", 'accessories'::"text", 'other'::"text"]))),
    CONSTRAINT "gear_items_collection_type_check" CHECK (("collection_type" = ANY (ARRAY['owned'::"text", 'wishlist'::"text"])))
);


ALTER TABLE "public"."gear_items" OWNER TO "postgres";

--
-- Name: gear_showcase_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."gear_showcase_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "gear_item_id" "uuid",
    "gear_image_id" "uuid",
    "is_visible" boolean DEFAULT true NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "is_cover" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "display_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gear_showcase_entries_source_target_check" CHECK (((("source_type" = ANY (ARRAY['owned_item'::"text", 'wishlist_item'::"text"])) AND ("gear_item_id" IS NOT NULL) AND ("gear_image_id" IS NULL)) OR (("source_type" = 'photo'::"text") AND ("gear_item_id" IS NULL) AND ("gear_image_id" IS NOT NULL)))),
    CONSTRAINT "gear_showcase_entries_source_type_check" CHECK (("source_type" = ANY (ARRAY['owned_item'::"text", 'wishlist_item'::"text", 'photo'::"text"])))
);


ALTER TABLE "public"."gear_showcase_entries" OWNER TO "postgres";

--
-- Name: gear_string_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."gear_string_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "gear_item_id" "uuid" NOT NULL,
    "strung_at" "date" NOT NULL,
    "string_name" "text",
    "string_brand" "text",
    "string_type" "text",
    "string_shape" "text",
    "gauge" "text",
    "tension_mains" numeric(5,2),
    "tension_crosses" numeric(5,2),
    "strung_by" "text",
    "cost" numeric(10,2),
    "first_impression" "text",
    "follow_up_feel" "text",
    "ended_at" "date",
    "ended_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."gear_string_jobs" OWNER TO "postgres";

--
-- Name: guest_sports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."guest_sports" (
    "guest_id" "uuid" NOT NULL,
    "sport_id" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."guest_sports" OWNER TO "postgres";

--
-- Name: identity_links; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: TABLE "identity_links"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."identity_links" IS 'Maps verified email to user_id and legacy rows (guest participants, invitations). Link-first: no in-place mutation of historical records.';


--
-- Name: match_counts; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."match_counts" AS
 SELECT "m"."id" AS "match_id",
    "m"."required_count",
    ("count"("mp"."id") FILTER (WHERE (("mp"."removed_at" IS NULL) AND (("mp"."status")::"text" = 'confirmed'::"text"))))::integer AS "confirmed_count",
    ("count"("mp"."id") FILTER (WHERE (("mp"."removed_at" IS NULL) AND (("mp"."status")::"text" = 'pending'::"text"))))::integer AS "pending_count",
    ("count"("mp"."id") FILTER (WHERE (("mp"."removed_at" IS NULL) AND (("mp"."status")::"text" = 'waiting_list'::"text"))))::integer AS "waiting_count"
   FROM ("public"."matches" "m"
     LEFT JOIN "public"."match_participants" "mp" ON (("mp"."match_id" = "m"."id")))
  GROUP BY "m"."id", "m"."required_count";


ALTER VIEW "public"."match_counts" OWNER TO "postgres";

--
-- Name: VIEW "match_counts"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."match_counts" IS 'Status-based participant counts per match. waiting_count excludes removed participants and keeps waiting-list players separate from pending confirmation.';


--
-- Name: match_courts; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: match_formed; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."match_formed" AS
 SELECT "match_id",
    "required_count",
    "confirmed_count",
    ("confirmed_count" >= "required_count") AS "is_formed",
    "pending_count",
    "waiting_count"
   FROM "public"."match_counts" "mc";


ALTER VIEW "public"."match_formed" OWNER TO "postgres";

--
-- Name: VIEW "match_formed"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."match_formed" IS 'Extends match_counts with is_formed while exposing pending_count and waiting_count.';


--
-- Name: match_participant_actions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."match_participant_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "match_id" "uuid" NOT NULL,
    "match_participant_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "note" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "match_participant_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['invite'::"text", 'nominate'::"text", 'request_join'::"text", 'reenter'::"text", 'accept'::"text", 'approve'::"text", 'withdraw'::"text", 'decline'::"text", 'reject_request'::"text", 'revoke_invite'::"text", 'reject_nomination'::"text", 'remove_confirmed'::"text", 'remove'::"text", 'add_guest_org'::"text", 'add_guest_participant'::"text", 'manual_confirm'::"text", 'invited'::"text", 'nominated'::"text", 'requested'::"text", 'accepted'::"text", 'approved'::"text", 'withdrawn'::"text", 'removed'::"text", 'guest_added'::"text", 'declined'::"text", 'delegate_manual_confirm'::"text", 'revoke_delegate_confirm'::"text", 'nominate_guest'::"text", 'proxy_confirm'::"text"])))
);


ALTER TABLE "public"."match_participant_actions" OWNER TO "postgres";

--
-- Name: TABLE "match_participant_actions"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."match_participant_actions" IS 'v1.6.1: Lifecycle event log for match participants. action_type values: reenter, invite, nominate, manual_confirm, delegate_manual_confirm, accept. Written only by SECURITY DEFINER RPCs. Direct insert by authenticated is not permitted.';


--
-- Name: notification_deliveries; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: TABLE "notification_deliveries"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."notification_deliveries" IS 'Delivery queue. Worker processes queued rows, sends via Resend, updates status.';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

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
    "primary_venue_id" "uuid",
    "secondary_venue_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_super_admin" boolean DEFAULT false NOT NULL,
    "contact_channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "contact_email" "text",
    "contact_phone" "text",
    "show_in_venue_member_discovery" boolean DEFAULT true NOT NULL,
    "allow_non_group_invites" boolean DEFAULT true NOT NULL,
    "auto_add_played_users_to_invite_circle" boolean DEFAULT false NOT NULL,
    "looking_to_play" "text",
    "preferred_play_times" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "profiles_contact_channel_check" CHECK (("contact_channel" = ANY (ARRAY['email'::"text", 'sms'::"text"]))),
    CONSTRAINT "profiles_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'unspecified'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";

--
-- Name: COLUMN "profiles"."contact_channel"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."profiles"."contact_channel" IS 'Preferred contact channel: email or sms';


--
-- Name: COLUMN "profiles"."contact_email"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."profiles"."contact_email" IS 'Contact email. NULL = use auth.users.email. User can override in profile.';


--
-- Name: COLUMN "profiles"."contact_phone"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."profiles"."contact_phone" IS 'Contact phone for SMS. Used when contact_channel=sms';


--
-- Name: COLUMN "profiles"."show_in_venue_member_discovery"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."profiles"."show_in_venue_member_discovery" IS 'Phase 1: Discoverability. Whether user appears in club member discovery. Distinct from invite permission.';


--
-- Name: COLUMN "profiles"."allow_non_group_invites"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."profiles"."allow_non_group_invites" IS 'Phase 1: Invite permission. Whether user may be invited via non-group direct path (Venue Members / Invite Circle). Distinct from discoverability.';


--
-- Name: COLUMN "profiles"."auto_add_played_users_to_invite_circle"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."profiles"."auto_add_played_users_to_invite_circle" IS 'Phase 1: Preference for future auto-add. When true, played-with users may be auto-added to Invite Circle. No logic implemented yet.';


--
-- Name: COLUMN "profiles"."looking_to_play"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."profiles"."looking_to_play" IS 'Lightweight openness signal for new games. UI label: Looking to play.';


--
-- Name: COLUMN "profiles"."preferred_play_times"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."profiles"."preferred_play_times" IS 'Lightweight time-window preferences. UI label: Preferred times.';


--
-- Name: profile_display; Type: VIEW; Schema: public; Owner: postgres
--

CREATE OR REPLACE VIEW "public"."profile_display" AS
 SELECT "id",
    "display_name",
    "avatar_url"
   FROM "public"."profiles";


ALTER VIEW "public"."profile_display" OWNER TO "postgres";

--
-- Name: user_personal_remarks; Type: TABLE; Schema: public; Owner: postgres
--

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

--
-- Name: TABLE "user_personal_remarks"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."user_personal_remarks" IS 'Identity v1.5: private remark labels (owner-only). Used for display priority in group context.';


--
-- Name: COLUMN "user_personal_remarks"."group_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_personal_remarks"."group_id" IS 'Optional scope. When set, remark applies within that group context.';


--
-- Name: user_roster_guests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_roster_guests" (
    "owner_user_id" "uuid" NOT NULL,
    "guest_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" NOT NULL
);


ALTER TABLE "public"."user_roster_guests" OWNER TO "postgres";

--
-- Name: user_sport_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_sport_profiles" (
    "user_id" "uuid" NOT NULL,
    "sport_id" smallint NOT NULL,
    "level" "text",
    "years_playing" smallint,
    "preferred_formats" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "current_frequency" "text",
    "play_style" "text",
    "competition_experience" "text",
    "teams_played_on" "text",
    "line_played" "text",
    "highlights" "text",
    "gear_primary" "text",
    "gear_secondary" "text",
    "gear_shoes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_sport_profiles_years_playing_check" CHECK ((("years_playing" IS NULL) OR (("years_playing" >= 0) AND ("years_playing" <= 80))))
);


ALTER TABLE "public"."user_sport_profiles" OWNER TO "postgres";

--
-- Name: TABLE "user_sport_profiles"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."user_sport_profiles" IS 'Per-sport social playing profile for a registered user. Keeps sport-specific trust and matchmaking details out of the shared profile layer.';


--
-- Name: COLUMN "user_sport_profiles"."level"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_sport_profiles"."level" IS 'Sport-specific level only. Keep line/teams in competition fields.';


--
-- Name: COLUMN "user_sport_profiles"."preferred_formats"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_sport_profiles"."preferred_formats" IS 'Sport-specific preferred formats such as singles, doubles, or mixed.';


--
-- Name: COLUMN "user_sport_profiles"."current_frequency"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_sport_profiles"."current_frequency" IS 'Lightweight frequency signal such as weekly or multiple_times_a_week.';


--
-- Name: COLUMN "user_sport_profiles"."play_style"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."user_sport_profiles"."play_style" IS 'Optional social/freeform playing style note.';


--
-- Name: user_sports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_sports" (
    "user_id" "uuid" NOT NULL,
    "sport_id" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_sports" OWNER TO "postgres";

--
-- Name: v_group_member_display; Type: VIEW; Schema: public; Owner: postgres
--

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

--
-- Name: VIEW "v_group_member_display"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW "public"."v_group_member_display" IS 'Identity v1.5: group-context display resolver. Priority: personal_remark > group_display_name > display_name.';


--
-- Name: venue_admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."venue_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "granted_by" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."venue_admins" OWNER TO "postgres";

--
-- Name: venue_identities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."venue_identities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "venue_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "venue_handle" "text" NOT NULL,
    "venue_handle_norm" "text" GENERATED ALWAYS AS ("lower"(TRIM(BOTH FROM "venue_handle"))) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "visible_in_venue_member_discovery" boolean,
    "accept_non_group_invites_in_venue" boolean,
    CONSTRAINT "chk_venue_handle_length" CHECK ((("length"("venue_handle") >= 2) AND ("length"("venue_handle") <= 30))),
    CONSTRAINT "chk_venue_handle_no_at" CHECK (("venue_handle" !~~ '%@%'::"text")),
    CONSTRAINT "chk_venue_handle_trimmed" CHECK (("venue_handle" = TRIM(BOTH FROM "venue_handle")))
);


ALTER TABLE "public"."venue_identities" OWNER TO "postgres";

--
-- Name: COLUMN "venue_identities"."visible_in_venue_member_discovery"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."venue_identities"."visible_in_venue_member_discovery" IS 'Layer 2: Venue-scoped override for discovery. NULL = no override (treat as true). Only applies when profiles.show_in_venue_member_discovery is ON.';


--
-- Name: COLUMN "venue_identities"."accept_non_group_invites_in_venue"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."venue_identities"."accept_non_group_invites_in_venue" IS 'Layer 2: Venue-scoped override for non-group invites. NULL = no override (treat as true). Only applies when profiles.allow_non_group_invites is ON.';


--
-- Name: venue_sports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."venue_sports" (
    "venue_id" "uuid" NOT NULL,
    "sport_id" smallint NOT NULL,
    "court_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "venue_sports_court_count_check" CHECK (("court_count" >= 0))
);


ALTER TABLE "public"."venue_sports" OWNER TO "postgres";

--
-- Name: contact_records contact_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."contact_records"
    ADD CONSTRAINT "contact_records_pkey" PRIMARY KEY ("contact_record_id");


--
-- Name: courts courts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."courts"
    ADD CONSTRAINT "courts_pkey" PRIMARY KEY ("id");


--
-- Name: courts courts_venue_id_sport_id_court_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."courts"
    ADD CONSTRAINT "courts_venue_id_sport_id_court_code_key" UNIQUE ("venue_id", "sport_id", "court_code");


--
-- Name: domain_events domain_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."domain_events"
    ADD CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id");


--
-- Name: email_invitation_events email_invitation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_invitation_events"
    ADD CONSTRAINT "email_invitation_events_pkey" PRIMARY KEY ("id");


--
-- Name: email_invitations email_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_invitations"
    ADD CONSTRAINT "email_invitations_pkey" PRIMARY KEY ("id");


--
-- Name: gear_images gear_images_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_images"
    ADD CONSTRAINT "gear_images_pkey" PRIMARY KEY ("id");


--
-- Name: gear_items gear_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_items"
    ADD CONSTRAINT "gear_items_pkey" PRIMARY KEY ("id");


--
-- Name: gear_showcase_entries gear_showcase_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_showcase_entries"
    ADD CONSTRAINT "gear_showcase_entries_pkey" PRIMARY KEY ("id");


--
-- Name: gear_string_jobs gear_string_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_string_jobs"
    ADD CONSTRAINT "gear_string_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: group_contacts group_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_contacts"
    ADD CONSTRAINT "group_contacts_pkey" PRIMARY KEY ("group_contact_id");


--
-- Name: group_members group_members_group_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_user_id_key" UNIQUE ("group_id", "user_id");


--
-- Name: group_members group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_pkey" PRIMARY KEY ("id");


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_pkey" PRIMARY KEY ("id");


--
-- Name: guest_sports guest_sports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."guest_sports"
    ADD CONSTRAINT "guest_sports_pkey" PRIMARY KEY ("guest_id", "sport_id");


--
-- Name: guests guests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."guests"
    ADD CONSTRAINT "guests_pkey" PRIMARY KEY ("id");


--
-- Name: identity_links identity_links_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id");


--
-- Name: identity_links identity_links_user_id_linked_type_linked_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "identity_links_user_id_linked_type_linked_id_key" UNIQUE ("user_id", "linked_type", "linked_id");


--
-- Name: match_courts match_courts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_courts"
    ADD CONSTRAINT "match_courts_pkey" PRIMARY KEY ("id");


--
-- Name: match_participant_actions match_participant_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_participant_actions"
    ADD CONSTRAINT "match_participant_actions_pkey" PRIMARY KEY ("id");


--
-- Name: match_participants match_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_pkey" PRIMARY KEY ("id");


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");


--
-- Name: notification_deliveries notification_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: people people_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("person_id");


--
-- Name: person_match_proxies person_match_proxies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."person_match_proxies"
    ADD CONSTRAINT "person_match_proxies_pkey" PRIMARY KEY ("binding_id");


--
-- Name: person_relationships person_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_pkey" PRIMARY KEY ("relationship_id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: sports sports_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sports"
    ADD CONSTRAINT "sports_code_key" UNIQUE ("code");


--
-- Name: sports sports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sports"
    ADD CONSTRAINT "sports_pkey" PRIMARY KEY ("id");


--
-- Name: venue_admins uq_club_admin; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_admins"
    ADD CONSTRAINT "uq_club_admin" UNIQUE ("user_id", "venue_id");


--
-- Name: match_courts uq_match_court_slot; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_courts"
    ADD CONSTRAINT "uq_match_court_slot" UNIQUE ("match_id", "slot_index");


--
-- Name: venue_identities uq_venue_identity_handle_norm; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_identities"
    ADD CONSTRAINT "uq_venue_identity_handle_norm" UNIQUE ("venue_id", "venue_handle_norm");


--
-- Name: venue_identities uq_venue_identity_user; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_identities"
    ADD CONSTRAINT "uq_venue_identity_user" UNIQUE ("venue_id", "user_id");


--
-- Name: user_invite_circle user_invite_circle_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_invite_circle"
    ADD CONSTRAINT "user_invite_circle_pkey" PRIMARY KEY ("id");


--
-- Name: user_invite_circle user_invite_circle_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_invite_circle"
    ADD CONSTRAINT "user_invite_circle_unique" UNIQUE ("owner_user_id", "target_user_id");


--
-- Name: user_personal_remarks user_personal_remarks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_pkey" PRIMARY KEY ("id");


--
-- Name: user_personal_remarks user_personal_remarks_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_unique" UNIQUE ("owner_id", "target_user_id", "group_id");


--
-- Name: user_roster_guests user_roster_guests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roster_guests"
    ADD CONSTRAINT "user_roster_guests_pkey" PRIMARY KEY ("owner_user_id", "guest_id");


--
-- Name: user_sport_profiles user_sport_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sport_profiles"
    ADD CONSTRAINT "user_sport_profiles_pkey" PRIMARY KEY ("user_id", "sport_id");


--
-- Name: user_sports user_sports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sports"
    ADD CONSTRAINT "user_sports_pkey" PRIMARY KEY ("user_id", "sport_id");


--
-- Name: venue_admins venue_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_admins"
    ADD CONSTRAINT "venue_admins_pkey" PRIMARY KEY ("id");


--
-- Name: venue_identities venue_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_identities"
    ADD CONSTRAINT "venue_identities_pkey" PRIMARY KEY ("id");


--
-- Name: venue_sports venue_sports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_sports"
    ADD CONSTRAINT "venue_sports_pkey" PRIMARY KEY ("venue_id", "sport_id");


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_pkey" PRIMARY KEY ("id");


--
-- Name: idx_contact_records_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_contact_records_owner" ON "public"."contact_records" USING "btree" ("owner_user_id", "created_at" DESC);


--
-- Name: idx_contact_records_person; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_contact_records_person" ON "public"."contact_records" USING "btree" ("person_id");


--
-- Name: idx_domain_events_aggregate; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_domain_events_aggregate" ON "public"."domain_events" USING "btree" ("aggregate_type", "aggregate_id");


--
-- Name: idx_domain_events_type_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_domain_events_type_created" ON "public"."domain_events" USING "btree" ("event_type", "created_at" DESC);


--
-- Name: idx_email_invitation_events_invitation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_email_invitation_events_invitation" ON "public"."email_invitation_events" USING "btree" ("invitation_id", "created_at");


--
-- Name: idx_email_invitations_match_participant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_email_invitations_match_participant_id" ON "public"."email_invitations" USING "btree" ("match_participant_id");


--
-- Name: idx_email_invitations_related; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_email_invitations_related" ON "public"."email_invitations" USING "btree" ("related_type", "related_id");


--
-- Name: idx_email_invitations_status_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_email_invitations_status_created" ON "public"."email_invitations" USING "btree" ("status", "created_at" DESC);


--
-- Name: idx_email_invitations_target_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_email_invitations_target_email" ON "public"."email_invitations" USING "btree" ("target_email");


--
-- Name: idx_gear_images_owner_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gear_images_owner_item" ON "public"."gear_images" USING "btree" ("owner_user_id", "gear_item_id", "sort_order", "created_at");


--
-- Name: idx_gear_items_owner_collection; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gear_items_owner_collection" ON "public"."gear_items" USING "btree" ("owner_user_id", "collection_type", "category", "created_at" DESC);


--
-- Name: idx_gear_items_owner_showcase; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gear_items_owner_showcase" ON "public"."gear_items" USING "btree" ("owner_user_id", "visible_in_showcase") WHERE ("archived_at" IS NULL);


--
-- Name: idx_gear_showcase_item_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_gear_showcase_item_unique" ON "public"."gear_showcase_entries" USING "btree" ("owner_user_id", "gear_item_id") WHERE ("gear_item_id" IS NOT NULL);


--
-- Name: idx_gear_showcase_owner_sort; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gear_showcase_owner_sort" ON "public"."gear_showcase_entries" USING "btree" ("owner_user_id", "sort_order", "created_at");


--
-- Name: idx_gear_showcase_photo_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_gear_showcase_photo_unique" ON "public"."gear_showcase_entries" USING "btree" ("owner_user_id", "gear_image_id") WHERE ("gear_image_id" IS NOT NULL);


--
-- Name: idx_gear_string_jobs_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_gear_string_jobs_item" ON "public"."gear_string_jobs" USING "btree" ("owner_user_id", "gear_item_id", "strung_at" DESC, "created_at" DESC);


--
-- Name: idx_groups_primary_sport_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_groups_primary_sport_id" ON "public"."groups" USING "btree" ("primary_sport_id");


--
-- Name: idx_guest_sports_guest; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_guest_sports_guest" ON "public"."guest_sports" USING "btree" ("guest_id");


--
-- Name: idx_guest_sports_sport; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_guest_sports_sport" ON "public"."guest_sports" USING "btree" ("sport_id");


--
-- Name: idx_identity_links_linked; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_identity_links_linked" ON "public"."identity_links" USING "btree" ("linked_type", "linked_id");


--
-- Name: idx_identity_links_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_identity_links_user_id" ON "public"."identity_links" USING "btree" ("user_id");


--
-- Name: idx_identity_links_verified_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_identity_links_verified_email" ON "public"."identity_links" USING "btree" ("lower"(TRIM(BOTH FROM "verified_email")));


--
-- Name: idx_matches_sport_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_matches_sport_id" ON "public"."matches" USING "btree" ("sport_id");


--
-- Name: idx_mpa_match; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_mpa_match" ON "public"."match_participant_actions" USING "btree" ("match_id");


--
-- Name: idx_mpa_participant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_mpa_participant" ON "public"."match_participant_actions" USING "btree" ("match_participant_id");


--
-- Name: idx_notification_deliveries_queued; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notification_deliveries_queued" ON "public"."notification_deliveries" USING "btree" ("delivery_status", "created_at") WHERE ("delivery_status" = 'queued'::"text");


--
-- Name: idx_notifications_recipient_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_recipient_created_at" ON "public"."notifications" USING "btree" ("recipient_user_id", "created_at" DESC);


--
-- Name: idx_person_match_proxies_proxy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_person_match_proxies_proxy" ON "public"."person_match_proxies" USING "btree" ("proxy_user_id", "status", "created_at" DESC);


--
-- Name: idx_person_relationships_actor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_person_relationships_actor" ON "public"."person_relationships" USING "btree" ("actor_user_id", "relationship_type", "created_at" DESC);


--
-- Name: idx_person_relationships_person; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_person_relationships_person" ON "public"."person_relationships" USING "btree" ("person_id", "relationship_type", "created_at" DESC);


--
-- Name: idx_user_invite_circle_owner_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_invite_circle_owner_created" ON "public"."user_invite_circle" USING "btree" ("owner_user_id", "created_at" DESC);


--
-- Name: idx_user_roster_guests_guest; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_roster_guests_guest" ON "public"."user_roster_guests" USING "btree" ("guest_id");


--
-- Name: idx_user_roster_guests_owner; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_roster_guests_owner" ON "public"."user_roster_guests" USING "btree" ("owner_user_id");


--
-- Name: idx_user_sport_profiles_sport; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sport_profiles_sport" ON "public"."user_sport_profiles" USING "btree" ("sport_id");


--
-- Name: idx_user_sport_profiles_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sport_profiles_user" ON "public"."user_sport_profiles" USING "btree" ("user_id");


--
-- Name: idx_user_sports_sport; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sports_sport" ON "public"."user_sports" USING "btree" ("sport_id");


--
-- Name: idx_user_sports_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_sports_user" ON "public"."user_sports" USING "btree" ("user_id");


--
-- Name: mpa_match_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "mpa_match_id_created_at_idx" ON "public"."match_participant_actions" USING "btree" ("match_id", "created_at" DESC);


--
-- Name: mpa_mp_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "mpa_mp_id_created_at_idx" ON "public"."match_participant_actions" USING "btree" ("match_participant_id", "created_at" DESC);


--
-- Name: uq_active_person_match_proxy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_active_person_match_proxy" ON "public"."person_match_proxies" USING "btree" ("principal_person_id", "proxy_user_id", "scope") WHERE ("status" = 'active'::"text");


--
-- Name: uq_group_contacts_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_group_contacts_active" ON "public"."group_contacts" USING "btree" ("group_id", "person_id") WHERE ("removed_at" IS NULL);


--
-- Name: uq_match_participants_active_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_match_participants_active_user" ON "public"."match_participants" USING "btree" ("match_id", "user_id") WHERE (("user_id" IS NOT NULL) AND ("status" <> 'removed'::"public"."match_participant_status"));


--
-- Name: uq_mp_active_guest; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_mp_active_guest" ON "public"."match_participants" USING "btree" ("match_id", "guest_id") WHERE (("guest_id" IS NOT NULL) AND ("status" <> 'removed'::"public"."match_participant_status"));


--
-- Name: uq_mp_active_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_mp_active_user" ON "public"."match_participants" USING "btree" ("match_id", "user_id") WHERE (("user_id" IS NOT NULL) AND ("status" <> 'removed'::"public"."match_participant_status"));


--
-- Name: uq_mpa_dedup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_mpa_dedup" ON "public"."match_participant_actions" USING "btree" ("match_participant_id", "action_type", "created_at");


--
-- Name: uq_people_linked_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_people_linked_user" ON "public"."people" USING "btree" ("linked_user_id") WHERE ("linked_user_id" IS NOT NULL);


--
-- Name: match_participants notify_delegator_on_mp_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "notify_delegator_on_mp_change" AFTER UPDATE OF "confirmed_at", "removed_at" ON "public"."match_participants" FOR EACH ROW WHEN ((("new"."confirmed_at" IS DISTINCT FROM "old"."confirmed_at") OR ("new"."removed_at" IS DISTINCT FROM "old"."removed_at"))) EXECUTE FUNCTION "public"."trg_notify_delegator_on_mp_change"();


--
-- Name: match_participants notify_on_invite_nominate; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "notify_on_invite_nominate" AFTER INSERT ON "public"."match_participants" FOR EACH ROW WHEN ((("new"."user_id" IS NOT NULL) AND ("new"."join_method" = ANY (ARRAY['invited'::"public"."match_join_method", 'nominated'::"public"."match_join_method"])))) EXECUTE FUNCTION "public"."trg_notify_on_invite_nominate"();


--
-- Name: matches notify_on_match_cancelled; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "notify_on_match_cancelled" AFTER UPDATE OF "status" ON "public"."matches" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."trg_notify_on_match_cancelled"();


--
-- Name: match_participants set_formed_at_once_on_mp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_formed_at_once_on_mp" AFTER INSERT OR UPDATE OF "status" ON "public"."match_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_formed_at_once"();


--
-- Name: gear_items set_updated_at__gear_items; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at__gear_items" BEFORE UPDATE ON "public"."gear_items" FOR EACH ROW EXECUTE FUNCTION "public"."tg__set_updated_at"();


--
-- Name: gear_showcase_entries set_updated_at__gear_showcase_entries; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at__gear_showcase_entries" BEFORE UPDATE ON "public"."gear_showcase_entries" FOR EACH ROW EXECUTE FUNCTION "public"."tg__set_updated_at"();


--
-- Name: gear_string_jobs set_updated_at__gear_string_jobs; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at__gear_string_jobs" BEFORE UPDATE ON "public"."gear_string_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."tg__set_updated_at"();


--
-- Name: user_personal_remarks set_updated_at__user_personal_remarks; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "set_updated_at__user_personal_remarks" BEFORE UPDATE ON "public"."user_personal_remarks" FOR EACH ROW EXECUTE FUNCTION "public"."tg__set_updated_at"();


--
-- Name: matches trg_compute_match_start_at_utc; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_compute_match_start_at_utc" BEFORE INSERT OR UPDATE OF "match_date", "start_time", "venue_id" ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."compute_match_start_at_utc"();


--
-- Name: email_invitations trg_email_invitation_anchor_consistency; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_email_invitation_anchor_consistency" BEFORE INSERT OR UPDATE OF "match_participant_id", "related_type", "related_id" ON "public"."email_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."trg_email_invitation_anchor_consistency"();


--
-- Name: matches trg_emit_match_formed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_emit_match_formed" AFTER UPDATE OF "formed_at" ON "public"."matches" FOR EACH ROW WHEN ((("old"."formed_at" IS NULL) AND ("new"."formed_at" IS NOT NULL))) EXECUTE FUNCTION "public"."fn_emit_match_formed_on_formed_at"();


--
-- Name: match_participants trg_guard_participant_state; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_guard_participant_state" BEFORE UPDATE ON "public"."match_participants" FOR EACH ROW EXECUTE FUNCTION "public"."fn_guard_participant_state"();


--
-- Name: matches trg_match_detail_change_reconfirm; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_match_detail_change_reconfirm" AFTER UPDATE OF "match_date", "start_time", "duration_minutes", "venue_id", "court_ids" ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."fn_match_detail_change_reconfirm"();


--
-- Name: match_participants trg_set_removed_at_from_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_set_removed_at_from_status" BEFORE UPDATE OF "status" ON "public"."match_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_removed_at_from_status"();


--
-- Name: contact_records contact_records_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."contact_records"
    ADD CONSTRAINT "contact_records_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE SET NULL;


--
-- Name: contact_records contact_records_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."contact_records"
    ADD CONSTRAINT "contact_records_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: contact_records contact_records_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."contact_records"
    ADD CONSTRAINT "contact_records_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("person_id") ON DELETE CASCADE;


--
-- Name: courts courts_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."courts"
    ADD CONSTRAINT "courts_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE RESTRICT;


--
-- Name: courts courts_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."courts"
    ADD CONSTRAINT "courts_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;


--
-- Name: domain_events domain_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."domain_events"
    ADD CONSTRAINT "domain_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: email_invitation_events email_invitation_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_invitation_events"
    ADD CONSTRAINT "email_invitation_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: email_invitation_events email_invitation_events_invitation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_invitation_events"
    ADD CONSTRAINT "email_invitation_events_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."email_invitations"("id") ON DELETE CASCADE;


--
-- Name: email_invitations email_invitations_accepted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_invitations"
    ADD CONSTRAINT "email_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: email_invitations email_invitations_inviter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_invitations"
    ADD CONSTRAINT "email_invitations_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: email_invitations email_invitations_match_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."email_invitations"
    ADD CONSTRAINT "email_invitations_match_participant_id_fkey" FOREIGN KEY ("match_participant_id") REFERENCES "public"."match_participants"("id") ON DELETE SET NULL;


--
-- Name: gear_images gear_images_gear_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_images"
    ADD CONSTRAINT "gear_images_gear_item_id_fkey" FOREIGN KEY ("gear_item_id") REFERENCES "public"."gear_items"("id") ON DELETE CASCADE;


--
-- Name: gear_images gear_images_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_images"
    ADD CONSTRAINT "gear_images_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: gear_items gear_items_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_items"
    ADD CONSTRAINT "gear_items_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: gear_showcase_entries gear_showcase_entries_gear_image_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_showcase_entries"
    ADD CONSTRAINT "gear_showcase_entries_gear_image_id_fkey" FOREIGN KEY ("gear_image_id") REFERENCES "public"."gear_images"("id") ON DELETE CASCADE;


--
-- Name: gear_showcase_entries gear_showcase_entries_gear_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_showcase_entries"
    ADD CONSTRAINT "gear_showcase_entries_gear_item_id_fkey" FOREIGN KEY ("gear_item_id") REFERENCES "public"."gear_items"("id") ON DELETE CASCADE;


--
-- Name: gear_showcase_entries gear_showcase_entries_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_showcase_entries"
    ADD CONSTRAINT "gear_showcase_entries_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: gear_string_jobs gear_string_jobs_gear_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_string_jobs"
    ADD CONSTRAINT "gear_string_jobs_gear_item_id_fkey" FOREIGN KEY ("gear_item_id") REFERENCES "public"."gear_items"("id") ON DELETE CASCADE;


--
-- Name: gear_string_jobs gear_string_jobs_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."gear_string_jobs"
    ADD CONSTRAINT "gear_string_jobs_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: group_contacts group_contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_contacts"
    ADD CONSTRAINT "group_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: group_contacts group_contacts_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_contacts"
    ADD CONSTRAINT "group_contacts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;


--
-- Name: group_contacts group_contacts_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_contacts"
    ADD CONSTRAINT "group_contacts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("person_id") ON DELETE CASCADE;


--
-- Name: group_members group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;


--
-- Name: group_members group_members_invited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: group_members group_members_removed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_removed_by_fkey" FOREIGN KEY ("removed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: group_members group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."group_members"
    ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: groups groups_boundary_keeper_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_boundary_keeper_id_fkey" FOREIGN KEY ("boundary_keeper_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: groups groups_primary_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."groups"
    ADD CONSTRAINT "groups_primary_sport_id_fkey" FOREIGN KEY ("primary_sport_id") REFERENCES "public"."sports"("id");


--
-- Name: guest_sports guest_sports_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."guest_sports"
    ADD CONSTRAINT "guest_sports_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE CASCADE;


--
-- Name: guest_sports guest_sports_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."guest_sports"
    ADD CONSTRAINT "guest_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id");


--
-- Name: guests guests_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."guests"
    ADD CONSTRAINT "guests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: guests guests_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."guests"
    ADD CONSTRAINT "guests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("person_id") ON DELETE SET NULL;


--
-- Name: identity_links identity_links_linked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "identity_links_linked_by_user_id_fkey" FOREIGN KEY ("linked_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: identity_links identity_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."identity_links"
    ADD CONSTRAINT "identity_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: match_courts match_courts_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_courts"
    ADD CONSTRAINT "match_courts_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;


--
-- Name: match_participant_actions match_participant_actions_match_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_participant_actions"
    ADD CONSTRAINT "match_participant_actions_match_participant_id_fkey" FOREIGN KEY ("match_participant_id") REFERENCES "public"."match_participants"("id") ON DELETE CASCADE;


--
-- Name: match_participants match_participants_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: match_participants match_participants_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE CASCADE;


--
-- Name: match_participants match_participants_manual_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_manual_confirmed_by_fkey" FOREIGN KEY ("manual_confirmed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: match_participants match_participants_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;


--
-- Name: match_participants match_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: matches matches_finalized_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_finalized_by_user_id_fkey" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;


--
-- Name: matches matches_organizer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: matches matches_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id");


--
-- Name: matches matches_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;


--
-- Name: notification_deliveries notification_deliveries_email_invitation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_email_invitation_id_fkey" FOREIGN KEY ("email_invitation_id") REFERENCES "public"."email_invitations"("id") ON DELETE SET NULL;


--
-- Name: notification_deliveries notification_deliveries_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notification_deliveries"
    ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE SET NULL;


--
-- Name: people people_linked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: people people_primary_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_primary_sport_id_fkey" FOREIGN KEY ("primary_sport_id") REFERENCES "public"."sports"("id") ON DELETE SET NULL;


--
-- Name: person_match_proxies person_match_proxies_principal_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."person_match_proxies"
    ADD CONSTRAINT "person_match_proxies_principal_person_id_fkey" FOREIGN KEY ("principal_person_id") REFERENCES "public"."people"("person_id") ON DELETE CASCADE;


--
-- Name: person_match_proxies person_match_proxies_proxy_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."person_match_proxies"
    ADD CONSTRAINT "person_match_proxies_proxy_user_id_fkey" FOREIGN KEY ("proxy_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: person_match_proxies person_match_proxies_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."person_match_proxies"
    ADD CONSTRAINT "person_match_proxies_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: person_relationships person_relationships_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: person_relationships person_relationships_person_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."people"("person_id") ON DELETE CASCADE;


--
-- Name: person_relationships person_relationships_source_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_source_group_id_fkey" FOREIGN KEY ("source_group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;


--
-- Name: person_relationships person_relationships_source_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_source_match_id_fkey" FOREIGN KEY ("source_match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_primary_club_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_primary_club_fk" FOREIGN KEY ("primary_venue_id") REFERENCES "public"."venues"("id") ON DELETE SET NULL;


--
-- Name: user_invite_circle user_invite_circle_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_invite_circle"
    ADD CONSTRAINT "user_invite_circle_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: user_invite_circle user_invite_circle_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_invite_circle"
    ADD CONSTRAINT "user_invite_circle_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: user_personal_remarks user_personal_remarks_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE CASCADE;


--
-- Name: user_personal_remarks user_personal_remarks_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_personal_remarks user_personal_remarks_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_roster_guests user_roster_guests_guest_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roster_guests"
    ADD CONSTRAINT "user_roster_guests_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE CASCADE;


--
-- Name: user_sport_profiles user_sport_profiles_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sport_profiles"
    ADD CONSTRAINT "user_sport_profiles_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE CASCADE;


--
-- Name: user_sport_profiles user_sport_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sport_profiles"
    ADD CONSTRAINT "user_sport_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_sports user_sports_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sports"
    ADD CONSTRAINT "user_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id");


--
-- Name: user_sports user_sports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_sports"
    ADD CONSTRAINT "user_sports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: venue_admins venue_admins_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_admins"
    ADD CONSTRAINT "venue_admins_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id");


--
-- Name: venue_admins venue_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_admins"
    ADD CONSTRAINT "venue_admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: venue_admins venue_admins_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_admins"
    ADD CONSTRAINT "venue_admins_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;


--
-- Name: venue_identities venue_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_identities"
    ADD CONSTRAINT "venue_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;


--
-- Name: venue_identities venue_identities_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_identities"
    ADD CONSTRAINT "venue_identities_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;


--
-- Name: venue_sports venue_sports_sport_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_sports"
    ADD CONSTRAINT "venue_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "public"."sports"("id") ON DELETE RESTRICT;


--
-- Name: venue_sports venue_sports_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."venue_sports"
    ADD CONSTRAINT "venue_sports_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE CASCADE;


--
-- Name: contact_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."contact_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_records contact_records_select_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "contact_records_select_owner" ON "public"."contact_records" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: courts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."courts" ENABLE ROW LEVEL SECURITY;

--
-- Name: courts courts_select_auth; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "courts_select_auth" ON "public"."courts" FOR SELECT TO "authenticated" USING (true);


--
-- Name: domain_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."domain_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: domain_events domain_events_no_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "domain_events_no_select" ON "public"."domain_events" FOR SELECT TO "authenticated" USING (false);


--
-- Name: domain_events domain_events_service_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "domain_events_service_insert" ON "public"."domain_events" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: email_invitation_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."email_invitation_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_invitation_events email_invitation_events_internal; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "email_invitation_events_internal" ON "public"."email_invitation_events" TO "authenticated" USING (false) WITH CHECK (false);


--
-- Name: email_invitations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."email_invitations" ENABLE ROW LEVEL SECURITY;

--
-- Name: email_invitations email_invitations_insert_inviter; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "email_invitations_insert_inviter" ON "public"."email_invitations" FOR INSERT TO "authenticated" WITH CHECK (("inviter_user_id" = "auth"."uid"()));


--
-- Name: email_invitations email_invitations_no_direct_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "email_invitations_no_direct_select" ON "public"."email_invitations" FOR SELECT TO "authenticated" USING (false);


--
-- Name: email_invitations email_invitations_no_direct_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "email_invitations_no_direct_update" ON "public"."email_invitations" FOR UPDATE TO "authenticated" USING (false);


--
-- Name: gear_images; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."gear_images" ENABLE ROW LEVEL SECURITY;

--
-- Name: gear_images gear_images_owner_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_images_owner_delete" ON "public"."gear_images" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_images gear_images_owner_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_images_owner_insert" ON "public"."gear_images" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_images gear_images_owner_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_images_owner_select" ON "public"."gear_images" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_images gear_images_owner_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_images_owner_update" ON "public"."gear_images" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."gear_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: gear_items gear_items_owner_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_items_owner_delete" ON "public"."gear_items" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_items gear_items_owner_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_items_owner_insert" ON "public"."gear_items" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_items gear_items_owner_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_items_owner_select" ON "public"."gear_items" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_items gear_items_owner_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_items_owner_update" ON "public"."gear_items" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_showcase_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."gear_showcase_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: gear_showcase_entries gear_showcase_entries_owner_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_showcase_entries_owner_delete" ON "public"."gear_showcase_entries" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_showcase_entries gear_showcase_entries_owner_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_showcase_entries_owner_insert" ON "public"."gear_showcase_entries" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_showcase_entries gear_showcase_entries_owner_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_showcase_entries_owner_select" ON "public"."gear_showcase_entries" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_showcase_entries gear_showcase_entries_owner_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_showcase_entries_owner_update" ON "public"."gear_showcase_entries" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_string_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."gear_string_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: gear_string_jobs gear_string_jobs_owner_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_string_jobs_owner_delete" ON "public"."gear_string_jobs" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_string_jobs gear_string_jobs_owner_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_string_jobs_owner_insert" ON "public"."gear_string_jobs" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_string_jobs gear_string_jobs_owner_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_string_jobs_owner_select" ON "public"."gear_string_jobs" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: gear_string_jobs gear_string_jobs_owner_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "gear_string_jobs_owner_update" ON "public"."gear_string_jobs" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: group_contacts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."group_contacts" ENABLE ROW LEVEL SECURITY;

--
-- Name: group_contacts group_contacts_select_group_members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_contacts_select_group_members" ON "public"."group_contacts" FOR SELECT TO "authenticated" USING ((("removed_at" IS NULL) AND ("public"."is_group_active_member"("group_id", "auth"."uid"()) OR ("public"."group_boundary_keeper_id"("group_id") = "auth"."uid"()))));


--
-- Name: group_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."group_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: group_members group_members_insert_bk; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_members_insert_bk" ON "public"."group_members" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND ("g"."boundary_keeper_id" = "auth"."uid"())))) AND ("invited_by" = "auth"."uid"())));


--
-- Name: group_members group_members_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_members_select" ON "public"."group_members" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND ("g"."boundary_keeper_id" = "auth"."uid"())))) OR (("status" = 'active'::"public"."group_member_status") AND "public"."is_group_active_member"("group_id", "auth"."uid"())) OR ("user_id" = "auth"."uid"())));


--
-- Name: group_members group_members_select_active_roster_for_active_members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_members_select_active_roster_for_active_members" ON "public"."group_members" FOR SELECT TO "authenticated" USING ((("status" = 'active'::"public"."group_member_status") AND "public"."is_group_member_any"("group_id", "auth"."uid"())));


--
-- Name: group_members group_members_select_bk; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_members_select_bk" ON "public"."group_members" FOR SELECT TO "authenticated" USING (("public"."group_boundary_keeper_id"("group_id") = "auth"."uid"()));


--
-- Name: group_members group_members_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_members_select_self" ON "public"."group_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: group_members group_members_update_bk; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_members_update_bk" ON "public"."group_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND ("g"."boundary_keeper_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."groups" "g"
  WHERE (("g"."id" = "group_members"."group_id") AND ("g"."boundary_keeper_id" = "auth"."uid"())))));


--
-- Name: group_members group_members_update_self_accept; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "group_members_update_self_accept" ON "public"."group_members" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("status" = 'pending'::"public"."group_member_status"))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'active'::"public"."group_member_status")));


--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."groups" ENABLE ROW LEVEL SECURITY;

--
-- Name: groups groups_insert_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "groups_insert_self" ON "public"."groups" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ("boundary_keeper_id" = "auth"."uid"())));


--
-- Name: groups groups_select_member; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "groups_select_member" ON "public"."groups" FOR SELECT TO "authenticated" USING ("public"."is_group_member_any"("id", "auth"."uid"()));


--
-- Name: groups groups_update_bk; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "groups_update_bk" ON "public"."groups" FOR UPDATE TO "authenticated" USING (("boundary_keeper_id" = "auth"."uid"())) WITH CHECK (("boundary_keeper_id" = "auth"."uid"()));


--
-- Name: guest_sports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."guest_sports" ENABLE ROW LEVEL SECURITY;

--
-- Name: guest_sports guest_sports_delete_by_creator; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guest_sports_delete_by_creator" ON "public"."guest_sports" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."guests" "g"
  WHERE (("g"."id" = "guest_sports"."guest_id") AND ("g"."created_by" = "auth"."uid"())))));


--
-- Name: guest_sports guest_sports_select_all_auth; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guest_sports_select_all_auth" ON "public"."guest_sports" FOR SELECT TO "authenticated" USING (true);


--
-- Name: guest_sports guest_sports_write_by_creator; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guest_sports_write_by_creator" ON "public"."guest_sports" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."guests" "g"
  WHERE (("g"."id" = "guest_sports"."guest_id") AND ("g"."created_by" = "auth"."uid"())))));


--
-- Name: guests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."guests" ENABLE ROW LEVEL SECURITY;

--
-- Name: guests guests_insert_auth; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guests_insert_auth" ON "public"."guests" FOR INSERT TO "authenticated" WITH CHECK (("created_by" = "auth"."uid"()));


--
-- Name: guests guests_select_owner_private; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guests_select_owner_private" ON "public"."guests" FOR SELECT TO "authenticated" USING ((("created_by" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."user_roster_guests" "urg"
  WHERE (("urg"."guest_id" = "guests"."id") AND ("urg"."owner_user_id" = "auth"."uid"()))))));


--
-- Name: guests guests_write_none; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "guests_write_none" ON "public"."guests" TO "authenticated" USING (false) WITH CHECK (false);


--
-- Name: identity_links; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."identity_links" ENABLE ROW LEVEL SECURITY;

--
-- Name: identity_links identity_links_insert_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "identity_links_insert_service" ON "public"."identity_links" FOR INSERT TO "authenticated" WITH CHECK (true);


--
-- Name: identity_links identity_links_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "identity_links_select_own" ON "public"."identity_links" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: notifications insert_internal_notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "insert_internal_notifications" ON "public"."notifications" FOR INSERT WITH CHECK (true);


--
-- Name: match_courts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."match_courts" ENABLE ROW LEVEL SECURITY;

--
-- Name: match_courts match_courts_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_courts_delete" ON "public"."match_courts" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."matches"
  WHERE (("matches"."id" = "match_courts"."match_id") AND ("matches"."organizer_id" = "auth"."uid"())))));


--
-- Name: match_courts match_courts_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_courts_insert" ON "public"."match_courts" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."matches"
  WHERE (("matches"."id" = "match_courts"."match_id") AND ("matches"."organizer_id" = "auth"."uid"()))))));


--
-- Name: match_courts match_courts_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_courts_select" ON "public"."match_courts" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."matches" "m"
  WHERE (("m"."id" = "match_courts"."match_id") AND ("m"."organizer_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."match_id" = "match_courts"."match_id") AND ("mp"."user_id" = "auth"."uid"()) AND ("mp"."status" = ANY (ARRAY['pending'::"public"."match_participant_status", 'confirmed'::"public"."match_participant_status"])))))));


--
-- Name: match_courts match_courts_select_proxy_participation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_courts_select_proxy_participation" ON "public"."match_courts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."match_id" = "match_courts"."match_id") AND "public"."is_active_match_proxy_for_participant"("mp"."id", "auth"."uid"())))));


--
-- Name: match_courts match_courts_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_courts_update" ON "public"."match_courts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."matches"
  WHERE (("matches"."id" = "match_courts"."match_id") AND ("matches"."organizer_id" = "auth"."uid"())))));


--
-- Name: match_participant_actions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."match_participant_actions" ENABLE ROW LEVEL SECURITY;

--
-- Name: match_participant_actions match_participant_actions_select_organizer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participant_actions_select_organizer" ON "public"."match_participant_actions" FOR SELECT TO "authenticated" USING ("public"."is_match_organizer"("match_id", "auth"."uid"()));


--
-- Name: match_participant_actions match_participant_actions_select_proxy_binding; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participant_actions_select_proxy_binding" ON "public"."match_participant_actions" FOR SELECT TO "authenticated" USING ("public"."is_active_match_proxy_for_participant"("match_participant_id", "auth"."uid"()));


--
-- Name: match_participants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."match_participants" ENABLE ROW LEVEL SECURITY;

--
-- Name: match_participants match_participants_insert_invite_by_org; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_insert_invite_by_org" ON "public"."match_participants" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_invite_users"("match_id", "auth"."uid"()) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("status" = 'pending'::"public"."match_participant_status") AND ("created_by" = "auth"."uid"()) AND ("user_id" IS NOT NULL) AND ("guest_id" IS NULL)));


--
-- Name: match_participants match_participants_insert_request; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_insert_request" ON "public"."match_participants" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND ("join_method" = 'requested'::"public"."match_join_method") AND ("status" = 'pending'::"public"."match_participant_status") AND ("created_by" = "auth"."uid"()) AND "public"."is_user_in_match_scope"("match_id", "auth"."uid"())));


--
-- Name: match_participants match_participants_select_identity_linked; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_select_identity_linked" ON "public"."match_participants" FOR SELECT TO "authenticated" USING ((("guest_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."identity_links" "il"
  WHERE (("il"."linked_type" = 'guest_participant'::"text") AND ("il"."linked_id" = "match_participants"."id") AND ("il"."user_id" = "auth"."uid"()))))));


--
-- Name: match_participants match_participants_select_pending_guest; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_select_pending_guest" ON "public"."match_participants" FOR SELECT TO "authenticated" USING ((("status" = 'pending'::"public"."match_participant_status") AND ("guest_id" IS NOT NULL) AND ("removed_at" IS NULL) AND "public"."is_caller_confirmed_in_match"("match_id") AND ("public"."is_caller_in_match_scope"("match_id") OR "public"."is_caller_match_associated"("match_id"))));


--
-- Name: match_participants match_participants_select_pending_invited; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_select_pending_invited" ON "public"."match_participants" FOR SELECT TO "authenticated" USING ((("status" = 'pending'::"public"."match_participant_status") AND ("user_id" IS NOT NULL) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("participant_accepted_at" IS NULL) AND ("removed_at" IS NULL) AND "public"."sharegroup_exists"("auth"."uid"(), "user_id") AND "public"."is_caller_confirmed_in_match"("match_id") AND ("public"."is_caller_in_match_scope"("match_id") OR "public"."is_caller_match_associated"("match_id"))));


--
-- Name: match_participants match_participants_select_pending_nominated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_select_pending_nominated" ON "public"."match_participants" FOR SELECT TO "authenticated" USING ((("status" = 'pending'::"public"."match_participant_status") AND ("user_id" IS NOT NULL) AND ("join_method" = 'nominated'::"public"."match_join_method") AND ("participant_accepted_at" IS NULL) AND ("removed_at" IS NULL) AND ("public"."is_caller_in_match_scope"("match_id") OR "public"."is_caller_match_associated"("match_id")) AND (("nominated_by" = "auth"."uid"()) OR "public"."sharegroup_exists"("auth"."uid"(), "user_id"))));


--
-- Name: match_participants match_participants_select_proxy_binding; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_select_proxy_binding" ON "public"."match_participants" FOR SELECT TO "authenticated" USING ("public"."is_active_match_proxy_for_participant"("id", "auth"."uid"()));


--
-- Name: match_participants match_participants_select_v1_6_1; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_select_v1_6_1" ON "public"."match_participants" FOR SELECT TO "authenticated" USING (("public"."is_match_organizer"("match_id", "auth"."uid"()) OR ("user_id" = "auth"."uid"()) OR (("status" = 'confirmed'::"public"."match_participant_status") AND ("public"."is_caller_in_match_scope"("match_id") OR "public"."sharegroup_exists"("auth"."uid"(), "public"."match_organizer_id"("match_id")) OR "public"."is_caller_match_associated"("match_id")))));


--
-- Name: match_participants match_participants_update_org_only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_update_org_only" ON "public"."match_participants" FOR UPDATE TO "authenticated" USING ("public"."is_match_organizer"("match_id", "auth"."uid"())) WITH CHECK ("public"."is_match_organizer"("match_id", "auth"."uid"()));


--
-- Name: match_participants match_participants_update_self_invite; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_update_self_invite" ON "public"."match_participants" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("status" = 'pending'::"public"."match_participant_status"))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("status" = ANY (ARRAY['confirmed'::"public"."match_participant_status", 'removed'::"public"."match_participant_status"]))));


--
-- Name: match_participants match_participants_update_self_leave; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "match_participants_update_self_leave" ON "public"."match_participants" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"public"."match_participant_status", 'confirmed'::"public"."match_participant_status"])))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'removed'::"public"."match_participant_status")));


--
-- Name: matches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;

--
-- Name: matches matches_insert_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "matches_insert_self" ON "public"."matches" FOR INSERT TO "authenticated" WITH CHECK (("organizer_id" = "auth"."uid"()));


--
-- Name: matches matches_select_proxy_participation; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "matches_select_proxy_participation" ON "public"."matches" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."match_id" = "matches"."id") AND "public"."is_active_match_proxy_for_participant"("mp"."id", "auth"."uid"())))));


--
-- Name: matches matches_select_visibility; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "matches_select_visibility" ON "public"."matches" FOR SELECT TO "authenticated" USING ((("organizer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."match_id" = "matches"."id") AND ("mp"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."match_participants" "mp"
     JOIN "public"."identity_links" "il" ON ((("il"."linked_type" = 'guest_participant'::"text") AND ("il"."linked_id" = "mp"."id") AND ("il"."user_id" = "auth"."uid"()))))
  WHERE ("mp"."match_id" = "matches"."id"))) OR "public"."is_caller_in_match_scope"("id")));


--
-- Name: matches matches_update_organizer; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "matches_update_organizer" ON "public"."matches" FOR UPDATE TO "authenticated" USING (("organizer_id" = "auth"."uid"())) WITH CHECK (("organizer_id" = "auth"."uid"()));


--
-- Name: match_participant_actions mpa_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mpa_select" ON "public"."match_participant_actions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."id" = "match_participant_actions"."match_participant_id") AND (("mp"."user_id" = "auth"."uid"()) OR "public"."is_match_organizer"("mp"."match_id", "auth"."uid"()))))));


--
-- Name: match_participant_actions mpa_select_in_scope; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mpa_select_in_scope" ON "public"."match_participant_actions" FOR SELECT TO "authenticated" USING (("public"."is_caller_in_match_scope"("match_id") OR "public"."is_caller_match_associated"("match_id")));


--
-- Name: notification_deliveries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notification_deliveries" ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_deliveries notification_deliveries_internal; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "notification_deliveries_internal" ON "public"."notification_deliveries" TO "authenticated" USING (false) WITH CHECK (false);


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: person_match_proxies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."person_match_proxies" ENABLE ROW LEVEL SECURITY;

--
-- Name: person_match_proxies person_match_proxies_select_party; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "person_match_proxies_select_party" ON "public"."person_match_proxies" FOR SELECT TO "authenticated" USING ((("proxy_user_id" = "auth"."uid"()) OR ("principal_person_id" = "public"."resolve_person_id_for_user"("auth"."uid"()))));


--
-- Name: person_relationships; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."person_relationships" ENABLE ROW LEVEL SECURITY;

--
-- Name: person_relationships person_relationships_select_actor; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "person_relationships_select_actor" ON "public"."person_relationships" FOR SELECT TO "authenticated" USING (("actor_user_id" = "auth"."uid"()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_insert_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = "auth"."uid"()) AND (("display_name" IS NULL) OR ("display_name" = ''::"text")) AND (("first_name" IS NULL) OR ("first_name" = ''::"text")) AND (("last_name" IS NULL) OR ("last_name" = ''::"text"))));


--
-- Name: profiles profiles_select_authenticated; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);


--
-- Name: profiles profiles_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));


--
-- Name: notifications select_own_notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "select_own_notifications" ON "public"."notifications" FOR SELECT USING (("recipient_user_id" = "auth"."uid"()));


--
-- Name: user_invite_circle uic_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "uic_delete_own" ON "public"."user_invite_circle" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: user_invite_circle uic_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "uic_insert_own" ON "public"."user_invite_circle" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: user_invite_circle uic_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "uic_select_own" ON "public"."user_invite_circle" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: notifications update_own_notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "update_own_notifications" ON "public"."notifications" FOR UPDATE USING (("recipient_user_id" = "auth"."uid"())) WITH CHECK (("recipient_user_id" = "auth"."uid"()));


--
-- Name: user_personal_remarks upr_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "upr_delete_own" ON "public"."user_personal_remarks" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));


--
-- Name: user_personal_remarks upr_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "upr_insert_own" ON "public"."user_personal_remarks" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));


--
-- Name: user_personal_remarks upr_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "upr_select_own" ON "public"."user_personal_remarks" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));


--
-- Name: user_personal_remarks upr_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "upr_update_own" ON "public"."user_personal_remarks" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));


--
-- Name: user_invite_circle; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_invite_circle" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_personal_remarks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_personal_remarks" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roster_guests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_roster_guests" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roster_guests user_roster_guests_select_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_roster_guests_select_owner" ON "public"."user_roster_guests" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: user_roster_guests user_roster_guests_write_none; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_roster_guests_write_none" ON "public"."user_roster_guests" TO "authenticated" USING (false) WITH CHECK (false);


--
-- Name: user_sport_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_sport_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_sport_profiles user_sport_profiles_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_sport_profiles_delete_own" ON "public"."user_sport_profiles" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: user_sport_profiles user_sport_profiles_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_sport_profiles_insert_own" ON "public"."user_sport_profiles" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: user_sport_profiles user_sport_profiles_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_sport_profiles_select_own" ON "public"."user_sport_profiles" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: user_sport_profiles user_sport_profiles_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_sport_profiles_update_own" ON "public"."user_sport_profiles" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: user_sports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_sports" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_sports user_sports_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_sports_delete_own" ON "public"."user_sports" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: user_sports user_sports_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_sports_select_own" ON "public"."user_sports" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: user_sports user_sports_write_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_sports_write_own" ON "public"."user_sports" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: venue_admins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."venue_admins" ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_admins venue_admins_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "venue_admins_select" ON "public"."venue_admins" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."is_super_admin" = true))))));


--
-- Name: venue_identities; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."venue_identities" ENABLE ROW LEVEL SECURITY;

--
-- Name: venue_identities venue_identities_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "venue_identities_select" ON "public"."venue_identities" FOR SELECT TO "authenticated" USING (true);


--
-- Name: venues; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."venues" ENABLE ROW LEVEL SECURITY;

--
-- Name: venues venues_select_auth; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "venues_select_auth" ON "public"."venues" FOR SELECT TO "authenticated" USING (true);


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: TABLE "person_match_proxies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."person_match_proxies" TO "anon";
GRANT ALL ON TABLE "public"."person_match_proxies" TO "authenticated";
GRANT ALL ON TABLE "public"."person_match_proxies" TO "service_role";


--
-- Name: FUNCTION "activate_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."activate_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") TO "service_role";


--
-- Name: FUNCTION "apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_participant_acceptance"("p_mp_id" "uuid", "p_actor_id" "uuid", "p_is_self" boolean, "p_action_type" "text") TO "service_role";


--
-- Name: TABLE "match_participants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."match_participants" TO "anon";
GRANT ALL ON TABLE "public"."match_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."match_participants" TO "service_role";


--
-- Name: FUNCTION "apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_participant_admission"("p_match_id" "uuid", "p_target_user_id" "uuid", "p_actor_id" "uuid", "p_admission_kind" "text") TO "service_role";


--
-- Name: FUNCTION "apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_participant_exit"("p_match_participant_id" "uuid", "p_actor_id" "uuid", "p_exit_kind" "text", "p_removal_note" "text") TO "service_role";


--
-- Name: FUNCTION "can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_admit_user_to_match"("p_match_id" "uuid", "p_actor_id" "uuid", "p_target_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "can_invite_users"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."can_invite_users"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_invite_users"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_invite_users"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "can_manage_participants"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."can_manage_participants"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_participants"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_participants"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "can_user_request_match_proxy_for_guest"("p_guest_id" "uuid", "p_actor_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."can_user_request_match_proxy_for_guest"("p_guest_id" "uuid", "p_actor_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_user_request_match_proxy_for_guest"("p_guest_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_user_request_match_proxy_for_guest"("p_guest_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "can_user_view_contact_player"("p_guest_id" "uuid", "p_actor_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."can_user_view_contact_player"("p_guest_id" "uuid", "p_actor_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_user_view_contact_player"("p_guest_id" "uuid", "p_actor_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_user_view_contact_player"("p_guest_id" "uuid", "p_actor_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "compute_match_start_at_utc"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."compute_match_start_at_utc"() TO "anon";
GRANT ALL ON FUNCTION "public"."compute_match_start_at_utc"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_match_start_at_utc"() TO "service_role";


--
-- Name: FUNCTION "do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."do_users_share_group"("p_user_a" "uuid", "p_user_b" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_emit_match_formed_on_formed_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_emit_match_formed_on_formed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_emit_match_formed_on_formed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_emit_match_formed_on_formed_at"() TO "service_role";


--
-- Name: FUNCTION "fn_guard_participant_state"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_guard_participant_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_guard_participant_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_guard_participant_state"() TO "service_role";


--
-- Name: FUNCTION "fn_match_detail_change_reconfirm"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_match_detail_change_reconfirm"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_match_detail_change_reconfirm"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_match_detail_change_reconfirm"() TO "service_role";


--
-- Name: FUNCTION "group_boundary_keeper_id"("p_group_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."group_boundary_keeper_id"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."group_boundary_keeper_id"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."group_boundary_keeper_id"("p_group_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "is_active_match_proxy_for_participant"("p_match_participant_id" "uuid", "p_proxy_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_active_match_proxy_for_participant"("p_match_participant_id" "uuid", "p_proxy_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_match_proxy_for_participant"("p_match_participant_id" "uuid", "p_proxy_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_match_proxy_for_participant"("p_match_participant_id" "uuid", "p_proxy_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_active_match_proxy_for_person"("p_principal_person_id" "uuid", "p_proxy_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_active_match_proxy_for_person"("p_principal_person_id" "uuid", "p_proxy_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_match_proxy_for_person"("p_principal_person_id" "uuid", "p_proxy_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_match_proxy_for_person"("p_principal_person_id" "uuid", "p_proxy_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_caller_confirmed_in_match"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_caller_confirmed_in_match"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_caller_in_match_scope"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_caller_in_match_scope"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_caller_match_associated"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_caller_match_associated"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_group_active_member"("p_group_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_group_active_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_active_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_active_member"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_group_active_member_any"("p_group_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_group_active_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_active_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_active_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_group_member_any"("p_group_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_group_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_member_any"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_guest_in_any_group_roster"("p_guest_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_guest_in_any_group_roster"("p_guest_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_match_court_helper_eligible"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_match_court_helper_eligible"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_match_court_helper_eligible"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_match_court_helper_eligible"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_match_organizer"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_match_organizer"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_match_organizer"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_match_organizer"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_match_participant_active"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_match_participant_active"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_match_participant_active"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_match_participant_active"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_match_participant_confirmed"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_match_participant_confirmed"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_match_participant_confirmed"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_match_participant_confirmed"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_user_in_match_scope"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_user_in_match_scope"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_in_match_scope"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_in_match_scope"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_in_scope_groups"("p_scope_group_ids" "uuid"[], "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_venue_admin"("p_venue_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_venue_admin"("p_venue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_venue_admin"("p_venue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_venue_admin"("p_venue_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "log_participant_action"("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text", "p_created_by" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."log_participant_action"("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text", "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."log_participant_action"("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_participant_action"("p_match_participant_id" "uuid", "p_action_type" "text", "p_note" "text", "p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "match_organizer_id"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."match_organizer_id"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_organizer_id"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_organizer_id"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "match_participant_reconcile_status"("p_mp_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "match_proxy_verification_email"("p_principal_person_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."match_proxy_verification_email"("p_principal_person_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."match_proxy_verification_email"("p_principal_person_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_proxy_verification_email"("p_principal_person_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "reject_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."reject_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") TO "service_role";


--
-- Name: FUNCTION "resolve_person_id_for_guest"("p_guest_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."resolve_person_id_for_guest"("p_guest_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_person_id_for_guest"("p_guest_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_person_id_for_guest"("p_guest_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "resolve_person_id_for_user"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."resolve_person_id_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_person_id_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_person_id_for_user"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "revoke_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."revoke_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_match_proxy_binding"("p_binding_id" "uuid", "p_invited_via" "text", "p_invited_to" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_admin_user_search"("p_query" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_admin_user_search"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_admin_user_search"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_admin_user_search"("p_query" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_contact_player_lookup"("p_guest_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_contact_player_lookup"("p_guest_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_contact_player_lookup"("p_guest_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_contact_player_lookup"("p_guest_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "rpc_contact_player_resolution"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_contact_player_resolution"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_contact_player_resolution"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_contact_player_resolution"() TO "service_role";


--
-- Name: TABLE "person_relationships"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."person_relationships" TO "anon";
GRANT ALL ON TABLE "public"."person_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."person_relationships" TO "service_role";


--
-- Name: FUNCTION "rpc_contact_player_save"("p_guest_id" "uuid", "p_source" "text", "p_group_id" "uuid", "p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_contact_player_save"("p_guest_id" "uuid", "p_source" "text", "p_group_id" "uuid", "p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_contact_player_save"("p_guest_id" "uuid", "p_source" "text", "p_group_id" "uuid", "p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_contact_player_save"("p_guest_id" "uuid", "p_source" "text", "p_group_id" "uuid", "p_match_id" "uuid") TO "service_role";


--
-- Name: TABLE "courts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."courts" TO "anon";
GRANT ALL ON TABLE "public"."courts" TO "authenticated";
GRANT ALL ON TABLE "public"."courts" TO "service_role";


--
-- Name: FUNCTION "rpc_court_create"("p_venue_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_court_create"("p_venue_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_court_create"("p_venue_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_court_create"("p_venue_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_court_delete"("p_court_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_court_delete"("p_court_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_court_update"("p_court_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_court_update"("p_court_id" "uuid", "p_sport_id" integer, "p_court_code" "text", "p_surface" "text", "p_notes" "text") TO "service_role";


--
-- Name: TABLE "email_invitations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."email_invitations" TO "anon";
GRANT ALL ON TABLE "public"."email_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."email_invitations" TO "service_role";


--
-- Name: FUNCTION "rpc_email_invitation_accept"("p_invitation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept"("p_invitation_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_accept_as_guest"("p_invitation_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_email_invitation_create"("p_target_email" "text", "p_target_name" "text", "p_related_type" "text", "p_related_id" "uuid", "p_expires_at" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_email_invitation_create"("p_target_email" "text", "p_target_name" "text", "p_related_type" "text", "p_related_id" "uuid", "p_expires_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_create"("p_target_email" "text", "p_target_name" "text", "p_related_type" "text", "p_related_id" "uuid", "p_expires_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_create"("p_target_email" "text", "p_target_name" "text", "p_related_type" "text", "p_related_id" "uuid", "p_expires_at" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "rpc_email_invitation_decline"("p_invitation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline"("p_invitation_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_decline_as_guest"("p_invitation_id" "uuid", "p_system_actor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_email_invitation_get"("p_invitation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_email_invitation_get"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_get"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_email_invitation_get"("p_invitation_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_get_queued_deliveries"("p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_get_queued_deliveries"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_get_queued_deliveries"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_get_queued_deliveries"("p_limit" integer) TO "service_role";


--
-- Name: TABLE "group_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."group_members" TO "anon";
GRANT ALL ON TABLE "public"."group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."group_members" TO "service_role";


--
-- Name: FUNCTION "rpc_group_accept_invite"("p_group_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_group_accept_invite"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_accept_invite"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_accept_invite"("p_group_id" "uuid") TO "service_role";


--
-- Name: TABLE "group_contacts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."group_contacts" TO "anon";
GRANT ALL ON TABLE "public"."group_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."group_contacts" TO "service_role";


--
-- Name: FUNCTION "rpc_group_add_contact_player"("p_group_id" "uuid", "p_guest_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_group_add_contact_player"("p_group_id" "uuid", "p_guest_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_add_contact_player"("p_group_id" "uuid", "p_guest_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_add_contact_player"("p_group_id" "uuid", "p_guest_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_group_contact_list"("p_group_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_group_contact_list"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_contact_list"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_contact_list"("p_group_id" "uuid") TO "service_role";


--
-- Name: TABLE "groups"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."groups" TO "anon";
GRANT ALL ON TABLE "public"."groups" TO "authenticated";
GRANT ALL ON TABLE "public"."groups" TO "service_role";


--
-- Name: FUNCTION "rpc_group_create"("p_name" "text", "p_description" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_group_create"("p_name" "text", "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_create"("p_name" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_create"("p_name" "text", "p_description" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_group_leave"("p_group_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_leave"("p_group_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_group_reject_invite"("p_group_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_reject_invite"("p_group_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_update"("p_group_id" "uuid", "p_name" "text", "p_description" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) TO "service_role";


--
-- Name: FUNCTION "rpc_invite_circle_list"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_invite_circle_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_list"() TO "service_role";


--
-- Name: FUNCTION "rpc_invite_circle_remove_user"("p_target_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_remove_user"("p_target_user_id" "uuid") TO "service_role";


--
-- Name: TABLE "user_invite_circle"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_invite_circle" TO "anon";
GRANT ALL ON TABLE "public"."user_invite_circle" TO "authenticated";
GRANT ALL ON TABLE "public"."user_invite_circle" TO "service_role";


--
-- Name: FUNCTION "rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_invite_circle_save_user"("p_target_user_id" "uuid", "p_source" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_email_invitation"("p_match_id" "uuid", "p_user_id" "uuid", "p_invitation_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_accept_invite"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_admission_targets"("p_match_id" "uuid", "p_search" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_admit_user"("p_match_id" "uuid", "p_target_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_confirmed_participant_emails"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_confirmed_participant_emails"("p_match_id" "uuid") TO "service_role";


--
-- Name: TABLE "matches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";


--
-- Name: FUNCTION "rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_venue_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_venue_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_venue_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_venue_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) TO "service_role";


--
-- Name: FUNCTION "rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_guest"("p_match_id" "uuid", "p_guest_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_org_approve_participant"("p_match_participant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_display_names"("p_match_id" "uuid", "p_participant_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "rpc_match_participant_email"("p_match_participant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_email"("p_match_participant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_participant_emails_for_notification"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_participant_emails_for_notification"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_proxy_confirm_participant"("p_match_participant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rpc_match_proxy_confirm_participant"("p_match_participant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_confirm_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_confirm_participant"("p_match_participant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_proxy_decline_participant"("p_match_participant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rpc_match_proxy_decline_participant"("p_match_participant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_decline_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_decline_participant"("p_match_participant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_proxy_manageable_participants"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rpc_match_proxy_manageable_participants"("p_match_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_manageable_participants"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_manageable_participants"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_proxy_request_contact_player"("p_guest_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rpc_match_proxy_request_contact_player"("p_guest_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_request_contact_player"("p_guest_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_request_contact_player"("p_guest_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_proxy_request_self"("p_proxy_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rpc_match_proxy_request_self"("p_proxy_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_request_self"("p_proxy_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_request_self"("p_proxy_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_proxy_revoke_self"("p_binding_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rpc_match_proxy_revoke_self"("p_binding_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_revoke_self"("p_binding_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_revoke_self"("p_binding_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_proxy_withdraw_participant"("p_match_participant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rpc_match_proxy_withdraw_participant"("p_match_participant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_withdraw_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_proxy_withdraw_participant"("p_match_participant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_rebalance_roster"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_rebalance_roster"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_rebalance_roster"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_rebalance_roster"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_remove_participant"("p_match_participant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_request_join"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_match_user_withdraw"("p_match_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_player_profile_get"("p_target_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_player_profile_get"("p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_player_profile_get"("p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_player_profile_get"("p_target_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_process_domain_event"("p_event_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_process_domain_event"("p_event_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_process_domain_event"("p_event_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_process_domain_event"("p_event_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_profile_set_avatar_url"("p_avatar_url" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_avatar_url"("p_avatar_url" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_profile_set_display_name"("p_display_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_profile_set_primary_venue"("p_venue_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_profile_set_primary_venue"("p_venue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_primary_venue"("p_venue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_primary_venue"("p_venue_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_venue_member_discovery" boolean, "p_allow_non_group_invites" boolean, "p_looking_to_play" "text", "p_preferred_play_times" "text"[], "p_gender" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_venue_member_discovery" boolean, "p_allow_non_group_invites" boolean, "p_looking_to_play" "text", "p_preferred_play_times" "text"[], "p_gender" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_venue_member_discovery" boolean, "p_allow_non_group_invites" boolean, "p_looking_to_play" "text", "p_preferred_play_times" "text"[], "p_gender" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text", "p_contact_channel" "text", "p_contact_email" "text", "p_contact_phone" "text", "p_show_in_venue_member_discovery" boolean, "p_allow_non_group_invites" boolean, "p_looking_to_play" "text", "p_preferred_play_times" "text"[], "p_gender" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_after_magic_link"("p_user_id" "uuid", "p_verified_email" "text", "p_invitation_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_reconcile_identity_guest_participants"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_guest_participants"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_guest_participants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_reconcile_identity_guest_participants"() TO "service_role";


--
-- Name: FUNCTION "rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_contact_links"("p_guest_ids" "uuid"[]) TO "service_role";


--
-- Name: TABLE "guests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."guests" TO "anon";
GRANT ALL ON TABLE "public"."guests" TO "authenticated";
GRANT ALL ON TABLE "public"."guests" TO "service_role";


--
-- Name: FUNCTION "rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_roster_guest_list"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_roster_guest_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_list"() TO "service_role";


--
-- Name: TABLE "sports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sports" TO "anon";
GRANT ALL ON TABLE "public"."sports" TO "authenticated";
GRANT ALL ON TABLE "public"."sports" TO "service_role";


--
-- Name: FUNCTION "rpc_sports_list"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_sports_list"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_sports_list"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_sports_list"() TO "service_role";


--
-- Name: FUNCTION "rpc_update_delivery_result"("p_delivery_id" "uuid", "p_status" "text", "p_provider_message_id" "text", "p_error_message" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_update_delivery_result"("p_delivery_id" "uuid", "p_status" "text", "p_provider_message_id" "text", "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_update_delivery_result"("p_delivery_id" "uuid", "p_status" "text", "p_provider_message_id" "text", "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_update_delivery_result"("p_delivery_id" "uuid", "p_status" "text", "p_provider_message_id" "text", "p_error_message" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_user_sport_profile_upsert"("p_sport_id" smallint, "p_level" "text", "p_years_playing" smallint, "p_preferred_formats" "text"[], "p_current_frequency" "text", "p_play_style" "text", "p_competition_experience" "text", "p_teams_played_on" "text", "p_line_played" "text", "p_highlights" "text", "p_gear_primary" "text", "p_gear_secondary" "text", "p_gear_shoes" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_user_sport_profile_upsert"("p_sport_id" smallint, "p_level" "text", "p_years_playing" smallint, "p_preferred_formats" "text"[], "p_current_frequency" "text", "p_play_style" "text", "p_competition_experience" "text", "p_teams_played_on" "text", "p_line_played" "text", "p_highlights" "text", "p_gear_primary" "text", "p_gear_secondary" "text", "p_gear_shoes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_user_sport_profile_upsert"("p_sport_id" smallint, "p_level" "text", "p_years_playing" smallint, "p_preferred_formats" "text"[], "p_current_frequency" "text", "p_play_style" "text", "p_competition_experience" "text", "p_teams_played_on" "text", "p_line_played" "text", "p_highlights" "text", "p_gear_primary" "text", "p_gear_secondary" "text", "p_gear_shoes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_user_sport_profile_upsert"("p_sport_id" smallint, "p_level" "text", "p_years_playing" smallint, "p_preferred_formats" "text"[], "p_current_frequency" "text", "p_play_style" "text", "p_competition_experience" "text", "p_teams_played_on" "text", "p_line_played" "text", "p_highlights" "text", "p_gear_primary" "text", "p_gear_secondary" "text", "p_gear_shoes" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_user_sports_set"("p_sport_codes" "text"[]); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_user_sports_set"("p_sport_codes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_user_sports_set"("p_sport_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_user_sports_set"("p_sport_codes" "text"[]) TO "service_role";


--
-- Name: FUNCTION "rpc_venue_admin_grant"("p_user_id" "uuid", "p_venue_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_admin_grant"("p_user_id" "uuid", "p_venue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_admin_grant"("p_user_id" "uuid", "p_venue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_admin_grant"("p_user_id" "uuid", "p_venue_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_venue_admin_revoke"("p_user_id" "uuid", "p_venue_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_admin_revoke"("p_user_id" "uuid", "p_venue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_admin_revoke"("p_user_id" "uuid", "p_venue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_admin_revoke"("p_user_id" "uuid", "p_venue_id" "uuid") TO "service_role";


--
-- Name: TABLE "venues"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."venues" TO "anon";
GRANT ALL ON TABLE "public"."venues" TO "authenticated";
GRANT ALL ON TABLE "public"."venues" TO "service_role";


--
-- Name: FUNCTION "rpc_venue_create"("p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_create"("p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_create"("p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_create"("p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_venue_handle_check"("p_venue_id" "uuid", "p_handle" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_handle_check"("p_venue_id" "uuid", "p_handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_handle_check"("p_venue_id" "uuid", "p_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_handle_check"("p_venue_id" "uuid", "p_handle" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_venue_handle_set"("p_venue_id" "uuid", "p_new_handle" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_handle_set"("p_venue_id" "uuid", "p_new_handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_handle_set"("p_venue_id" "uuid", "p_new_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_handle_set"("p_venue_id" "uuid", "p_new_handle" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_venue_identity_set_preferences"("p_venue_id" "uuid", "p_visible_in_venue_member_discovery" "text", "p_accept_non_group_invites_in_venue" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_identity_set_preferences"("p_venue_id" "uuid", "p_visible_in_venue_member_discovery" "text", "p_accept_non_group_invites_in_venue" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_identity_set_preferences"("p_venue_id" "uuid", "p_visible_in_venue_member_discovery" "text", "p_accept_non_group_invites_in_venue" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_identity_set_preferences"("p_venue_id" "uuid", "p_visible_in_venue_member_discovery" "text", "p_accept_non_group_invites_in_venue" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_venue_join"("p_venue_id" "uuid", "p_handle" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_join"("p_venue_id" "uuid", "p_handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_join"("p_venue_id" "uuid", "p_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_join"("p_venue_id" "uuid", "p_handle" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_venue_leave"("p_venue_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_leave"("p_venue_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_leave"("p_venue_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_leave"("p_venue_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_venue_members_discovery"("p_venue_id" "uuid", "p_search" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_members_discovery"("p_venue_id" "uuid", "p_search" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_members_discovery"("p_venue_id" "uuid", "p_search" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_members_discovery"("p_venue_id" "uuid", "p_search" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_venue_update"("p_venue_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."rpc_venue_update"("p_venue_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_venue_update"("p_venue_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_venue_update"("p_venue_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text", "p_venue_kind" "text", "p_access_type" "text") TO "service_role";


--
-- Name: FUNCTION "sharegroup_exists"("p_user_a" "uuid", "p_user_b" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sharegroup_exists"("p_user_a" "uuid", "p_user_b" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sharegroup_exists"("p_user_a" "uuid", "p_user_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sharegroup_exists"("p_user_a" "uuid", "p_user_b" "uuid") TO "service_role";


--
-- Name: FUNCTION "test_runner_match_regression_v2"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."test_runner_match_regression_v2"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_runner_match_regression_v2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_runner_match_regression_v2"() TO "service_role";


--
-- Name: FUNCTION "test_runner_participant_controls_template"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."test_runner_participant_controls_template"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_runner_participant_controls_template"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_runner_participant_controls_template"() TO "service_role";


--
-- Name: FUNCTION "test_runner_v161"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."test_runner_v161"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_runner_v161"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_runner_v161"() TO "service_role";


--
-- Name: FUNCTION "test_runner_v161_cleanup"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"() TO "service_role";


--
-- Name: FUNCTION "test_runner_v161_cleanup"("p_run_suffix" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"("p_run_suffix" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"("p_run_suffix" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_runner_v161_cleanup"("p_run_suffix" "text") TO "service_role";


--
-- Name: FUNCTION "tg__set_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."tg__set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg__set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg__set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "trg_email_invitation_anchor_consistency"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_email_invitation_anchor_consistency"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_email_invitation_anchor_consistency"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_email_invitation_anchor_consistency"() TO "service_role";


--
-- Name: FUNCTION "trg_notify_delegator_on_mp_change"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_notify_delegator_on_mp_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_delegator_on_mp_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_delegator_on_mp_change"() TO "service_role";


--
-- Name: FUNCTION "trg_notify_on_invite_nominate"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_notify_on_invite_nominate"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_on_invite_nominate"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_on_invite_nominate"() TO "service_role";


--
-- Name: FUNCTION "trg_notify_on_match_cancelled"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_notify_on_match_cancelled"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_on_match_cancelled"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_on_match_cancelled"() TO "service_role";


--
-- Name: FUNCTION "trg_set_formed_at_once"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_set_formed_at_once"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_formed_at_once"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_formed_at_once"() TO "service_role";


--
-- Name: FUNCTION "trg_set_removed_at_from_status"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trg_set_removed_at_from_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_set_removed_at_from_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_set_removed_at_from_status"() TO "service_role";


--
-- Name: FUNCTION "validate_venue_handle"("p_handle" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."validate_venue_handle"("p_handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_venue_handle"("p_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_venue_handle"("p_handle" "text") TO "service_role";


--
-- Name: TABLE "people"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."people" TO "anon";
GRANT ALL ON TABLE "public"."people" TO "authenticated";
GRANT ALL ON TABLE "public"."people" TO "service_role";


--
-- Name: TABLE "contact_player_public"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."contact_player_public" TO "service_role";


--
-- Name: TABLE "contact_records"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."contact_records" TO "anon";
GRANT ALL ON TABLE "public"."contact_records" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_records" TO "service_role";


--
-- Name: TABLE "domain_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."domain_events" TO "anon";
GRANT ALL ON TABLE "public"."domain_events" TO "authenticated";
GRANT ALL ON TABLE "public"."domain_events" TO "service_role";


--
-- Name: TABLE "email_invitation_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."email_invitation_events" TO "anon";
GRANT ALL ON TABLE "public"."email_invitation_events" TO "authenticated";
GRANT ALL ON TABLE "public"."email_invitation_events" TO "service_role";


--
-- Name: TABLE "gear_images"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gear_images" TO "anon";
GRANT ALL ON TABLE "public"."gear_images" TO "authenticated";
GRANT ALL ON TABLE "public"."gear_images" TO "service_role";


--
-- Name: TABLE "gear_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gear_items" TO "anon";
GRANT ALL ON TABLE "public"."gear_items" TO "authenticated";
GRANT ALL ON TABLE "public"."gear_items" TO "service_role";


--
-- Name: TABLE "gear_showcase_entries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gear_showcase_entries" TO "anon";
GRANT ALL ON TABLE "public"."gear_showcase_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."gear_showcase_entries" TO "service_role";


--
-- Name: TABLE "gear_string_jobs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."gear_string_jobs" TO "anon";
GRANT ALL ON TABLE "public"."gear_string_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."gear_string_jobs" TO "service_role";


--
-- Name: TABLE "guest_sports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."guest_sports" TO "anon";
GRANT ALL ON TABLE "public"."guest_sports" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_sports" TO "service_role";


--
-- Name: TABLE "identity_links"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."identity_links" TO "anon";
GRANT ALL ON TABLE "public"."identity_links" TO "authenticated";
GRANT ALL ON TABLE "public"."identity_links" TO "service_role";


--
-- Name: TABLE "match_counts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."match_counts" TO "anon";
GRANT ALL ON TABLE "public"."match_counts" TO "authenticated";
GRANT ALL ON TABLE "public"."match_counts" TO "service_role";


--
-- Name: TABLE "match_courts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."match_courts" TO "anon";
GRANT ALL ON TABLE "public"."match_courts" TO "authenticated";
GRANT ALL ON TABLE "public"."match_courts" TO "service_role";


--
-- Name: TABLE "match_formed"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."match_formed" TO "anon";
GRANT ALL ON TABLE "public"."match_formed" TO "authenticated";
GRANT ALL ON TABLE "public"."match_formed" TO "service_role";


--
-- Name: TABLE "match_participant_actions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."match_participant_actions" TO "anon";
GRANT ALL ON TABLE "public"."match_participant_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."match_participant_actions" TO "service_role";


--
-- Name: TABLE "notification_deliveries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notification_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."notification_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_deliveries" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: TABLE "profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";


--
-- Name: TABLE "profile_display"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."profile_display" TO "anon";
GRANT ALL ON TABLE "public"."profile_display" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_display" TO "service_role";


--
-- Name: TABLE "user_personal_remarks"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_personal_remarks" TO "anon";
GRANT ALL ON TABLE "public"."user_personal_remarks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_personal_remarks" TO "service_role";


--
-- Name: TABLE "user_roster_guests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_roster_guests" TO "anon";
GRANT ALL ON TABLE "public"."user_roster_guests" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roster_guests" TO "service_role";


--
-- Name: TABLE "user_sport_profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_sport_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_sport_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sport_profiles" TO "service_role";


--
-- Name: TABLE "user_sports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_sports" TO "anon";
GRANT ALL ON TABLE "public"."user_sports" TO "authenticated";
GRANT ALL ON TABLE "public"."user_sports" TO "service_role";


--
-- Name: TABLE "v_group_member_display"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."v_group_member_display" TO "anon";
GRANT ALL ON TABLE "public"."v_group_member_display" TO "authenticated";
GRANT ALL ON TABLE "public"."v_group_member_display" TO "service_role";


--
-- Name: TABLE "venue_admins"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."venue_admins" TO "anon";
GRANT ALL ON TABLE "public"."venue_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."venue_admins" TO "service_role";


--
-- Name: TABLE "venue_identities"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."venue_identities" TO "anon";
GRANT ALL ON TABLE "public"."venue_identities" TO "authenticated";
GRANT ALL ON TABLE "public"."venue_identities" TO "service_role";


--
-- Name: TABLE "venue_sports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."venue_sports" TO "anon";
GRANT ALL ON TABLE "public"."venue_sports" TO "authenticated";
GRANT ALL ON TABLE "public"."venue_sports" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict YC0Z542C1T0FPIJ3NJgYG78Ssx2PORPmPtj5O5efnkanMfUHuw7pqaqZykmd5NI
