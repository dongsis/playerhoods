


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


ALTER FUNCTION "public"."fn_match_detail_change_reconfirm"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."fn_match_detail_change_reconfirm"() IS 'v1.5 (fixed): Resets non-organizer user participants to pending when match scheduling changes (date/time/duration). status=pending is consistent with reconcile rule (accepted_at cleared → pending). org_approved_at preserved so re-accept immediately re-confirms. Organizer and guests exempt.';



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
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id AND mp.user_id = p_user_id
  );
END;
$$;


ALTER FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_user_match_associated"("p_match_id" "uuid", "p_user_id" "uuid") IS 'v1.6.1: Returns true if user has a pending or confirmed participant row. Conservative: removed participants are NOT match-associated. SECURITY DEFINER. NOT granted to authenticated — internal RPC use only.';



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


ALTER FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_participant_reconcile_status"("p_mp_id" "uuid") IS 'v1.5 transition: Derives participant status from timestamps. Uses COALESCE(participant_accepted_at, user_accepted_at) to honour both old and new columns. Writes confirmed_at (canonical) and status (backward compat for RLS). confirmed_at is the only confirmation field this function may set.';



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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Get group
  SELECT * INTO v_group FROM groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  -- Only boundary keeper can invite
  IF v_group.boundary_keeper_id != v_caller_id THEN
    RAISE EXCEPTION 'Only boundary keeper can invite users';
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


COMMENT ON FUNCTION "public"."rpc_group_invite_user"("p_group_id" "uuid", "p_user_id" "uuid") IS 'Boundary keeper invites user to group. Handles re-invite of removed members.';



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
    CONSTRAINT "chk_participant_accepted_via" CHECK ((("participant_accepted_via" IS NULL) OR ("participant_accepted_via" = ANY (ARRAY['in_app'::"text", 'manual'::"text", 'delegate_manual'::"text"])))),
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



CREATE OR REPLACE FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") IS 'v1.5 (fixed): User accepts invitation, nomination, or re-confirms after match schedule change. Requires match.status=active. Sets participant_accepted_at + user_accepted_at (legacy sync). Works for: invited, nominated (v1.5), legacy requested+nominated_by, and self-requested when participant_accepted_at IS NULL (cleared by match edit). Blocks self-requesters when already accepted. Writes action log (action_type=accept) only on real state change. Reconcile transitions to confirmed when org_approved_at also set.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text" DEFAULT NULL::"text") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") IS 'v1.5: ORG adds a guest. join_method=manual. participant_accepted_at=now() + via=manual + org_approved_at=now(). Reconcile confirms guest immediately (both sides satisfied).';



CREATE OR REPLACE FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text" DEFAULT NULL::"text") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") IS 'v1.5: Non-removed participant adds a guest. join_method=manual. participant_accepted_at=now() + via=manual. org_approved_at=NULL (pending ORG approval). Permission: non-removed participant (pending or confirmed) + can_participants_add_guests.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    match_id, guest_id, join_method, status,
    org_approved_at, created_by
  ) VALUES (
    p_match_id, v_new_guest_id, 'guest_add', 'pending',
    NULL, auth.uid()
  )
  RETURNING * INTO v_new_mp;

  PERFORM match_participant_reconcile_status(v_new_mp.id);
  PERFORM log_participant_action(v_new_mp.id, 'add_guest_participant', p_note);

  SELECT * INTO v_new_mp FROM match_participants WHERE id = v_new_mp.id;
  RETURN v_new_mp;
END;
$$;


ALTER FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text", "p_note" "text") OWNER TO "postgres";


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



CREATE OR REPLACE FUNCTION "public"."rpc_match_delegate_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_delegate_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_delegate_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") IS 'v1.6.1: Non-org delegate-confirms a user from shared groups. Caller: non-org + (InScope OR MatchAssociated). No can_participants_invite_users. Target: ShareGroup(target, caller) only — no InScope for target. join_method=nominated (reconcile compat), via=delegate_manual (distinguishes). Sets participant_accepted_at but NOT org_approved_at -> pending until ORG approves. Re-entry: created_by preserved; writes reenter + delegate_manual_confirm logs.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_delegate_manual_confirm_targets"("p_match_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;

  -- Gate: non-org + match active + (InScope OR MatchAssociated)
  IF v_match.status <> 'active' THEN
    RETURN; -- UI-friendly: empty
  END IF;

  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RETURN; -- non-org only
  END IF;

  IF NOT public.is_user_in_scope_groups(v_match.invitation_scope_group_ids, v_uid)
     AND NOT public.is_user_match_associated(p_match_id, v_uid) THEN
    RETURN; -- UI-friendly: empty
  END IF;

  RETURN QUERY
  WITH already_active AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id IS NOT NULL
      AND mp.status IN ('pending','confirmed')
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
    FROM public.group_members gm_caller
    JOIN public.group_members gm_other
      ON gm_caller.group_id = gm_other.group_id
    JOIN public.groups g
      ON g.id = gm_caller.group_id
    WHERE gm_caller.user_id = v_uid
      AND gm_caller.status = 'active'
      AND gm_other.status = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_uid
      AND g.group_kind = 'friend'
  )
  SELECT
    sgm.user_id,
    pd.display_name
  FROM shared_group_members sgm
  JOIN public.profile_display pd ON pd.id = sgm.user_id
  WHERE sgm.user_id NOT IN (SELECT user_id FROM already_active)
  ORDER BY pd.display_name;
END;
$$;


ALTER FUNCTION "public"."rpc_match_delegate_manual_confirm_targets"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_delegate_manual_confirm_targets"("p_match_id" "uuid") IS 'v1.6.3: Friend-group-only targets for delegate manual confirm. Caller: non-org + (InScope OR MatchAssociated). Returns empty when ineligible.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_invite_guest_from_roster"("p_match_id" "uuid", "p_guest_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match public.matches;
  v_mp    public.match_participants;
BEGIN
  -- ------------------------------------------------------------
  -- 1. Auth check
  -- ------------------------------------------------------------
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- ------------------------------------------------------------
  -- 2. Match existence
  -- ------------------------------------------------------------
  SELECT *
  INTO v_match
  FROM public.matches
  WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- ------------------------------------------------------------
  -- 3. Match must be active
  -- ------------------------------------------------------------
  IF v_match.status <> 'active'::public.match_status THEN
    RAISE EXCEPTION 'match_not_active';
  END IF;

  -- ------------------------------------------------------------
  -- 4. Organizer-only invite
  -- ------------------------------------------------------------
  IF v_match.organizer_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_organizer';
  END IF;

  -- ------------------------------------------------------------
  -- 5. Guest must be in caller's personal roster
  -- ------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roster_guests urg
    WHERE urg.owner_user_id = auth.uid()
      AND urg.guest_id      = p_guest_id
  ) THEN
    RAISE EXCEPTION 'guest_not_in_my_roster';
  END IF;

  -- ------------------------------------------------------------
  -- 6. Guest must exist and be active
  -- ------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.id = p_guest_id
      AND g.status = 'active'
  ) THEN
    RAISE EXCEPTION 'guest_not_found_or_inactive';
  END IF;

  -- ------------------------------------------------------------
  -- 7. Insert participant row
  -- ------------------------------------------------------------
  INSERT INTO public.match_participants(
    match_id,
    status,
    join_method,
    guest_id,
    created_by,
    created_at,
    org_approved_at,
    org_approved_by,
    participant_accepted_at,
    participant_accepted_via,
    confirmed_at
  )
  VALUES (
    p_match_id,
    'pending'::public.match_participant_status,
    'invited'::public.match_join_method,
    p_guest_id,
    auth.uid(),
    now(),
    now(),          -- organizer auto-approves invite
    auth.uid(),
    NULL,           -- guest has not accepted
    NULL,
    NULL
  )
  RETURNING * INTO v_mp;

  -- ------------------------------------------------------------
  -- 8. Reconcile (if function exists)
  -- ------------------------------------------------------------
  BEGIN
    PERFORM public.match_participant_reconcile_status(v_mp.id);
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;

  RETURN v_mp;
END;
$$;


ALTER FUNCTION "public"."rpc_match_invite_guest_from_roster"("p_match_id" "uuid", "p_guest_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_match_invite_targets"("p_match_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
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

  -- Caller gate: organizer only (RAISE on failure — debug-friendly admin entry point)
  IF NOT public.is_match_organizer(p_match_id, v_uid) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  RETURN QUERY
  WITH already_active AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed')
      AND mp.user_id IS NOT NULL
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
    FROM public.group_members gm_org
    JOIN public.group_members gm_other
      ON gm_org.group_id = gm_other.group_id
    JOIN public.groups g
      ON g.id = gm_org.group_id
    WHERE gm_org.user_id = v_match.organizer_id
      AND gm_org.status  = 'active'
      AND gm_other.status = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_match.organizer_id
      AND g.group_kind = 'friend'
  ),
  eligible AS (
    SELECT sm.user_id FROM scope_members sm
    UNION
    SELECT sg.user_id FROM shared_group_members sg
  )
  SELECT e.user_id, pd.display_name
  FROM eligible e
  JOIN public.profile_display pd ON pd.id = e.user_id
  WHERE e.user_id NOT IN (SELECT aa.user_id FROM already_active aa)
    AND e.user_id <> v_uid
  ORDER BY pd.display_name NULLS LAST, e.user_id;
END;
$$;


ALTER FUNCTION "public"."rpc_match_invite_targets"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_invite_targets"("p_match_id" "uuid") IS 'v1.6.3: Eligible invite targets for organizer. Target set: InScope UNION ShareGroup(friend-only, organizer). Excludes self and already-active. RAISE on unauthorized caller.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match    public.matches%rowtype;
  v_existing match_participants;
  v_new_mp   match_participants;
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  -- Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Fetch match
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  -- Caller gate: organizer only
  IF NOT public.is_match_organizer(p_match_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the match organizer can perform this action';
  END IF;

  -- Match active gate
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  -- Cannot invite self (organizer)
  IF p_user_id = v_match.organizer_id THEN
    RAISE EXCEPTION 'Cannot invite yourself';
  END IF;

  -- Already active gate (status-based helper)
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Target gate: InScope(target) OR ShareGroup(target, organizer_id)
  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, p_user_id)
    OR public.do_users_share_group(p_user_id, v_match.organizer_id)
  ) THEN
    RAISE EXCEPTION 'Target user is not in scope or shared group';
  END IF;

  -- Re-entry: find most recent removed row (status-based)
  SELECT * INTO v_existing
  FROM public.match_participants
  WHERE match_id = p_match_id AND user_id = p_user_id AND status = 'removed'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Re-invite: clear removed + apply as fresh invite
    -- created_by NOT updated (audit integrity)
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

    INSERT INTO public.match_participant_actions
      (match_id, match_participant_id, action_type, note, created_by)
    VALUES
      (p_match_id, v_existing.id, 'reenter', NULL, auth.uid()),
      (p_match_id, v_existing.id, 'invite',  NULL, auth.uid());

    SELECT * INTO v_new_mp FROM public.match_participants WHERE id = v_existing.id;
    RETURN v_new_mp;
  END IF;

  -- Fresh invite: org side approved (user acceptance still needed)
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


ALTER FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") IS 'v1.6.1: ORG-only invite. Target: InScope(target) OR ShareGroup(target, organizer_id). Empty scope does not block — ShareGroup alone sufficient. Status-based gates. Re-entry: created_by preserved; writes reenter + invite action logs. Sets org_approved_at; user acceptance required to confirm.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_manual_confirm"("p_match_participant_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_manual_confirm"("p_match_participant_id" "uuid", "p_note" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_manual_confirm"("p_match_participant_id" "uuid", "p_note" "text") IS 'v1.5: ORG manually confirms a user participant. Scope assert: scope must be non-empty + user must be in scope. Sets participant_accepted_at + via=manual + manual_confirmed_by + org_approved_at. Writes action log (action_type=manual_confirm, note=p_note). Reconcile transitions to confirmed.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_manual_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_manual_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_manual_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") IS 'v1.6.1: ORG manually confirms a user. Target: InScope(target) OR ShareGroup(target, organizer_id). Sets participant_accepted_at + via=manual + org_approved_at -> confirmed immediately. Re-entry: created_by preserved; writes reenter + manual_confirm action logs. Empty scope does not block — ShareGroup alone sufficient.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_nominate_targets"("p_match_id" "uuid") RETURNS TABLE("user_id" "uuid", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_match public.matches%rowtype;
  v_uid   uuid := auth.uid();
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

  -- Caller gate: return empty on failure (UI-friendly, no exception)
  IF public.is_match_organizer(p_match_id, v_uid) THEN
    RETURN;
  END IF;

  IF NOT v_match.can_participants_invite_users THEN
    RETURN;
  END IF;

  IF NOT (
    public.is_user_in_scope_groups(v_scope_ids, v_uid)
    OR public.is_user_match_associated(p_match_id, v_uid)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH already_active AS (
    SELECT mp.user_id
    FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.status IN ('pending', 'confirmed')
      AND mp.user_id IS NOT NULL
  ),
  shared_group_members AS (
    SELECT DISTINCT gm_other.user_id
    FROM public.group_members gm_caller
    JOIN public.group_members gm_other
      ON gm_caller.group_id = gm_other.group_id
    JOIN public.groups g
      ON g.id = gm_caller.group_id
    WHERE gm_caller.user_id = v_uid
      AND gm_caller.status  = 'active'
      AND gm_other.status   = 'active'
      AND gm_other.user_id IS NOT NULL
      AND gm_other.user_id <> v_uid
      AND g.group_kind = 'friend'
  )
  SELECT sg.user_id, pd.display_name
  FROM shared_group_members sg
  JOIN public.profile_display pd ON pd.id = sg.user_id
  WHERE sg.user_id NOT IN (SELECT aa.user_id FROM already_active aa)
    AND sg.user_id <> v_match.organizer_id
  ORDER BY pd.display_name NULLS LAST, sg.user_id;
END;
$$;


ALTER FUNCTION "public"."rpc_match_nominate_targets"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_nominate_targets"("p_match_id" "uuid") IS 'v1.6.3: Eligible nomination targets for non-org participants. Caller gates preserved. Target set: ShareGroup(friend-only, caller). Excludes self, organizer, already-active. Returns empty on unauthorized.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_match     public.matches%rowtype;
  v_uid       uuid := auth.uid();
  v_existing  match_participants;
  v_new_mp    match_participants;
  v_scope_ids uuid[] := '{}'::uuid[];
BEGIN
  -- Auth
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Fetch match
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  v_scope_ids := COALESCE(v_match.invitation_scope_group_ids, '{}'::uuid[]);

  -- Match active gate
  IF v_match.status <> 'active' THEN
    RAISE EXCEPTION 'Match is not active (status: %)', v_match.status;
  END IF;

  -- Caller gate: non-org + can_participants_invite_users + (InScope OR MatchAssociated)
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

  -- Target != caller
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot nominate yourself';
  END IF;

  -- Already active gate (status-based helper)
  IF public.is_user_match_associated(p_match_id, p_user_id) THEN
    RAISE EXCEPTION 'User is already a participant in this match';
  END IF;

  -- Target gate: ShareGroup(target, caller)
  IF NOT public.do_users_share_group(p_user_id, v_uid) THEN
    RAISE EXCEPTION 'Target user is not in your shared groups';
  END IF;

  -- Re-entry: find most recent removed row (status-based)
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
      user_accepted_at         = NULL,
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

  -- Fresh nomination (both user accept + ORG approve needed)
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


ALTER FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") IS 'v1.6.1: Non-org nominates a user from shared groups. Caller: non-org + can_participants_invite_users + (InScope OR MatchAssociated). Target: ShareGroup(target, caller). Status-based gates. Re-entry: created_by preserved; writes reenter + nominate action logs. Requires user acceptance + org approval to confirm.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") IS 'v1.5: ORG approves a pending participant. Sets org_approved_at. Does NOT write status directly — reconcile derives status from timestamps. Idempotent (confirmed_at IS NOT NULL check).';



CREATE OR REPLACE FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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
    ELSE 'Removed (join_method=' || COALESCE(v_mp.join_method::text, 'unknown') || ')'
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


ALTER FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") IS 'v1.5: ORG (or authorized participant) removes a participant. Sets removed_at + removed_by. Reconcile sets status=removed and clears confirmed_at. No direct status write.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") IS 'v1.5: User requests to join. Scope required: requester must be in invitation_scope_group_ids. Empty scope → rejected. Removed users can re-request (clears removed fields, fresh request). Re-entry: created_by preserved; writes action_type=reenter log. Sets participant_accepted_at=now() + via=in_app. ORG approval needed to confirm.';



CREATE OR REPLACE FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") RETURNS "public"."match_participants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") IS 'v1.5: User withdraws (decline invite or leave). Sets removed_at + removed_by. Reconcile sets status=removed and clears confirmed_at. No direct status write.';



CREATE OR REPLACE FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_trimmed      text;
  v_current_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trimmed := trim(p_display_name);
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RAISE EXCEPTION 'display_name must not be empty';
  END IF;

  SELECT display_name INTO v_current_name
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_current_name IS NOT NULL AND v_current_name <> '' THEN
    RAISE EXCEPTION 'already_initialized';
  END IF;

  UPDATE public.profiles
  SET
    display_name = v_trimmed,
    first_name   = NULLIF(trim(coalesce(p_first_name, '')), ''),
    last_name    = NULLIF(trim(coalesce(p_last_name,  '')), '')
  WHERE id = auth.uid();
END;
$$;


ALTER FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."trg_notify_delegator_on_mp_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_delegator uuid;
  v_kind text;
  v_actor uuid := auth.uid();
BEGIN
  -- Only act on meaningful transitions
  IF (NEW.removed_at IS DISTINCT FROM OLD.removed_at) AND NEW.removed_at IS NOT NULL THEN
    v_kind := 'delegate_target_removed';
  ELSIF (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at) AND NEW.confirmed_at IS NOT NULL THEN
    v_kind := 'delegate_target_confirmed';
  ELSE
    RETURN NEW;
  END IF;

  -- Determine delegator by precedence
  IF NEW.user_id IS NOT NULL AND NEW.manual_confirmed_by IS NOT NULL THEN
    v_delegator := NEW.manual_confirmed_by;
  ELSIF NEW.user_id IS NOT NULL AND NEW.nominated_by IS NOT NULL THEN
    v_delegator := NEW.nominated_by;
  ELSIF NEW.guest_id IS NOT NULL THEN
    SELECT organizer_id INTO v_delegator
    FROM public.matches
    WHERE id = NEW.match_id;
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


ALTER FUNCTION "public"."trg_notify_delegator_on_mp_change"() OWNER TO "postgres";


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
    CONSTRAINT "chk_club_handle_length" CHECK ((("length"("club_handle") >= 2) AND ("length"("club_handle") <= 30))),
    CONSTRAINT "chk_club_handle_no_at" CHECK (("club_handle" !~~ '%@%'::"text")),
    CONSTRAINT "chk_club_handle_trimmed" CHECK (("club_handle" = TRIM(BOTH FROM "club_handle")))
);


ALTER TABLE "public"."club_identities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."club_sports" (
    "club_id" "uuid" NOT NULL,
    "sport_id" smallint NOT NULL,
    "court_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "club_sports_court_count_check" CHECK (("court_count" >= 0))
);


ALTER TABLE "public"."club_sports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_sports" (
    "guest_id" "uuid" NOT NULL,
    "sport_id" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."guest_sports" OWNER TO "postgres";


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
    CONSTRAINT "match_participant_actions_action_type_chk" CHECK (("action_type" = ANY (ARRAY['invite'::"text", 'nominate'::"text", 'request_join'::"text", 'reenter'::"text", 'accept'::"text", 'approve'::"text", 'withdraw'::"text", 'decline'::"text", 'reject_request'::"text", 'revoke_invite'::"text", 'reject_nomination'::"text", 'remove_confirmed'::"text", 'remove'::"text", 'add_guest_org'::"text", 'add_guest_participant'::"text", 'manual_confirm'::"text", 'invited'::"text", 'nominated'::"text", 'requested'::"text", 'accepted'::"text", 'approved'::"text", 'withdrawn'::"text", 'removed'::"text", 'guest_added'::"text", 'declined'::"text", 'delegate_manual_confirm'::"text"])))
);


ALTER TABLE "public"."match_participant_actions" OWNER TO "postgres";


COMMENT ON TABLE "public"."match_participant_actions" IS 'v1.6.1: Lifecycle event log for match participants. action_type values: reenter, invite, nominate, manual_confirm, delegate_manual_confirm, accept. Written only by SECURITY DEFINER RPCs. Direct insert by authenticated is not permitted.';



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
    "is_super_admin" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."profile_display" AS
 SELECT "id",
    "display_name"
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



ALTER TABLE ONLY "public"."match_courts"
    ADD CONSTRAINT "match_courts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_participant_actions"
    ADD CONSTRAINT "match_participant_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_participants"
    ADD CONSTRAINT "match_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_personal_remarks"
    ADD CONSTRAINT "user_personal_remarks_unique" UNIQUE ("owner_id", "target_user_id", "group_id");



ALTER TABLE ONLY "public"."user_roster_guests"
    ADD CONSTRAINT "user_roster_guests_pkey" PRIMARY KEY ("owner_user_id", "guest_id");



ALTER TABLE ONLY "public"."user_sports"
    ADD CONSTRAINT "user_sports_pkey" PRIMARY KEY ("user_id", "sport_id");



CREATE INDEX "idx_groups_primary_sport_id" ON "public"."groups" USING "btree" ("primary_sport_id");



CREATE INDEX "idx_guest_sports_guest" ON "public"."guest_sports" USING "btree" ("guest_id");



CREATE INDEX "idx_guest_sports_sport" ON "public"."guest_sports" USING "btree" ("sport_id");



CREATE INDEX "idx_matches_sport_id" ON "public"."matches" USING "btree" ("sport_id");



CREATE INDEX "idx_mpa_match" ON "public"."match_participant_actions" USING "btree" ("match_id");



CREATE INDEX "idx_mpa_participant" ON "public"."match_participant_actions" USING "btree" ("match_participant_id");



CREATE INDEX "idx_notifications_recipient_created_at" ON "public"."notifications" USING "btree" ("recipient_user_id", "created_at" DESC);



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



CREATE OR REPLACE TRIGGER "set_formed_at_once_on_mp" AFTER INSERT OR UPDATE OF "status" ON "public"."match_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_set_formed_at_once"();



CREATE OR REPLACE TRIGGER "set_updated_at__user_personal_remarks" BEFORE UPDATE ON "public"."user_personal_remarks" FOR EACH ROW EXECUTE FUNCTION "public"."tg__set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_compute_match_start_at_utc" BEFORE INSERT OR UPDATE OF "match_date", "start_time", "club_id" ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."compute_match_start_at_utc"();



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



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_primary_club_fk" FOREIGN KEY ("primary_club_id") REFERENCES "public"."clubs"("id") ON DELETE SET NULL;



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



CREATE POLICY "match_participants_select_v1_6_1" ON "public"."match_participants" FOR SELECT TO "authenticated" USING (("public"."is_match_organizer"("match_id", "auth"."uid"()) OR ("user_id" = "auth"."uid"()) OR (("status" = 'confirmed'::"public"."match_participant_status") AND ("public"."is_caller_in_match_scope"("match_id") OR "public"."sharegroup_exists"("auth"."uid"(), "public"."match_organizer_id"("match_id")) OR "public"."is_caller_match_associated"("match_id")))));



CREATE POLICY "match_participants_update_org_only" ON "public"."match_participants" FOR UPDATE TO "authenticated" USING ("public"."is_match_organizer"("match_id", "auth"."uid"())) WITH CHECK ("public"."is_match_organizer"("match_id", "auth"."uid"()));



CREATE POLICY "match_participants_update_self_invite" ON "public"."match_participants" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("status" = 'pending'::"public"."match_participant_status"))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("join_method" = 'invited'::"public"."match_join_method") AND ("status" = ANY (ARRAY['confirmed'::"public"."match_participant_status", 'removed'::"public"."match_participant_status"]))));



CREATE POLICY "match_participants_update_self_leave" ON "public"."match_participants" FOR UPDATE TO "authenticated" USING ((("user_id" = "auth"."uid"()) AND ("status" = ANY (ARRAY['pending'::"public"."match_participant_status", 'confirmed'::"public"."match_participant_status"])))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("status" = 'removed'::"public"."match_participant_status")));



ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matches_insert_self" ON "public"."matches" FOR INSERT TO "authenticated" WITH CHECK (("organizer_id" = "auth"."uid"()));



CREATE POLICY "matches_select_visibility" ON "public"."matches" FOR SELECT TO "authenticated" USING ((("organizer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."match_id" = "matches"."id") AND ("mp"."user_id" = "auth"."uid"())))) OR "public"."is_caller_in_match_scope"("id")));



COMMENT ON POLICY "matches_select_visibility" ON "public"."matches" IS 'v1.5: Organizer, any participant, or scope member can see the match. Uses is_caller_in_match_scope (self-only) to prevent user enumeration.';



CREATE POLICY "matches_update_organizer" ON "public"."matches" FOR UPDATE TO "authenticated" USING (("organizer_id" = "auth"."uid"())) WITH CHECK (("organizer_id" = "auth"."uid"()));



CREATE POLICY "mpa_select" ON "public"."match_participant_actions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."match_participants" "mp"
  WHERE (("mp"."id" = "match_participant_actions"."match_participant_id") AND (("mp"."user_id" = "auth"."uid"()) OR "public"."is_match_organizer"("mp"."match_id", "auth"."uid"()))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = "auth"."uid"()) AND (("display_name" IS NULL) OR ("display_name" = ''::"text")) AND (("first_name" IS NULL) OR ("first_name" = ''::"text")) AND (("last_name" IS NULL) OR ("last_name" = ''::"text"))));



CREATE POLICY "profiles_select_authenticated" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "select_own_notifications" ON "public"."notifications" FOR SELECT USING (("recipient_user_id" = "auth"."uid"()));



CREATE POLICY "update_own_notifications" ON "public"."notifications" FOR UPDATE USING (("recipient_user_id" = "auth"."uid"())) WITH CHECK (("recipient_user_id" = "auth"."uid"()));



CREATE POLICY "upr_delete_own" ON "public"."user_personal_remarks" FOR DELETE TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "upr_insert_own" ON "public"."user_personal_remarks" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "upr_select_own" ON "public"."user_personal_remarks" FOR SELECT TO "authenticated" USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "upr_update_own" ON "public"."user_personal_remarks" FOR UPDATE TO "authenticated" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



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



GRANT ALL ON FUNCTION "public"."can_add_guests"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_add_guests"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_add_guests"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."rpc_club_admin_grant"("p_user_id" "uuid", "p_club_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_admin_grant"("p_user_id" "uuid", "p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_admin_grant"("p_user_id" "uuid", "p_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_admin_revoke"("p_user_id" "uuid", "p_club_id" "uuid") TO "anon";
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



GRANT ALL ON FUNCTION "public"."rpc_club_handle_set"("p_club_id" "uuid", "p_new_handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_handle_set"("p_club_id" "uuid", "p_new_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_handle_set"("p_club_id" "uuid", "p_new_handle" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_join"("p_club_id" "uuid", "p_handle" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_join"("p_club_id" "uuid", "p_handle" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_join"("p_club_id" "uuid", "p_handle" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_club_update"("p_club_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_club_update"("p_club_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_club_update"("p_club_id" "uuid", "p_name" "text", "p_location_text" "text", "p_timezone" "text", "p_notes" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_group_set_display_name"("p_group_id" "uuid", "p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_guest_sports_set"("p_guest_id" "uuid", "p_sport_codes" "text"[]) TO "service_role";



GRANT ALL ON TABLE "public"."match_participants" TO "anon";
GRANT ALL ON TABLE "public"."match_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."match_participants" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_accept_invite"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_org"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_add_guest_participant"("p_match_id" "uuid", "p_guest_display_name" "text", "p_guest_notes" "text", "p_note" "text") TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_club_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_club_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_create"("p_required_count" integer, "p_game_type" "text", "p_match_date" "date", "p_start_time" time without time zone, "p_duration_minutes" integer, "p_club_id" "uuid", "p_court_ids" "uuid"[], "p_invitation_scope_group_ids" "uuid"[], "p_can_participants_invite_users" boolean, "p_can_participants_add_guests" boolean, "p_can_participants_manage_participants" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_delegate_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_delegate_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_delegate_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_delegate_manual_confirm_targets"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_delegate_manual_confirm_targets"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_delegate_manual_confirm_targets"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_invite_guest_from_roster"("p_match_id" "uuid", "p_guest_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_invite_guest_from_roster"("p_match_id" "uuid", "p_guest_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_invite_guest_from_roster"("p_match_id" "uuid", "p_guest_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_invite_targets"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_invite_targets"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_invite_targets"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_invite_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_manual_confirm"("p_match_participant_id" "uuid", "p_note" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_manual_confirm"("p_match_participant_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_manual_confirm"("p_match_participant_id" "uuid", "p_note" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_manual_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_manual_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_manual_confirm_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_nominate_targets"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_targets"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_targets"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_nominate_user"("p_match_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_org_approve_participant"("p_match_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_remove_participant"("p_match_participant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_request_join"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_match_user_withdraw"("p_match_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_init"("p_display_name" "text", "p_first_name" "text", "p_last_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_display_name"("p_display_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_set_primary_club"("p_club_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_primary_club"("p_club_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_set_primary_club"("p_club_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_profile_update"("p_first_name" "text", "p_last_name" "text") TO "service_role";



GRANT ALL ON TABLE "public"."guests" TO "anon";
GRANT ALL ON TABLE "public"."guests" TO "authenticated";
GRANT ALL ON TABLE "public"."guests" TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rpc_roster_guest_create"("p_display_name" "text", "p_email" "text", "p_phone" "text", "p_notes" "text") TO "anon";
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



GRANT ALL ON FUNCTION "public"."trg_notify_delegator_on_mp_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_notify_delegator_on_mp_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_notify_delegator_on_mp_change"() TO "service_role";



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



GRANT ALL ON TABLE "public"."guest_sports" TO "anon";
GRANT ALL ON TABLE "public"."guest_sports" TO "authenticated";
GRANT ALL ON TABLE "public"."guest_sports" TO "service_role";



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







