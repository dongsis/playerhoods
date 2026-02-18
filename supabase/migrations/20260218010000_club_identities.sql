-- ============================================================================
-- Club Identities: per-club handle system
-- club_identities(club_id, user_id, club_handle) — unique per club, case-insensitive
-- profiles.display_name = primary club's handle (invariant enforced by RPCs)
-- All profile identity writes go through SECURITY DEFINER RPCs only
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Ensure primary_club_id exists on profiles (idempotent; already in slice 1)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS primary_club_id uuid
    REFERENCES public.clubs(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 1. Table: club_identities
--    club_handle_norm is GENERATED ALWAYS AS (lower(club_handle)) STORED
--    This guarantees the norm column is ALWAYS in sync with the handle —
--    no write path can forget to update it.
-- ---------------------------------------------------------------------------
CREATE TABLE public.club_identities (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id          uuid        NOT NULL REFERENCES public.clubs(id)    ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  club_handle      text        NOT NULL,
  club_handle_norm text        GENERATED ALWAYS AS (lower(trim(club_handle))) STORED,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_club_identity_user        UNIQUE (club_id, user_id),
  CONSTRAINT uq_club_identity_handle_norm UNIQUE (club_id, club_handle_norm),
  CONSTRAINT chk_club_handle_length   CHECK (length(club_handle) BETWEEN 2 AND 30),
  CONSTRAINT chk_club_handle_no_at    CHECK (club_handle NOT LIKE '%@%'),
  CONSTRAINT chk_club_handle_trimmed  CHECK (club_handle = trim(club_handle))
);

ALTER TABLE public.club_identities ENABLE ROW LEVEL SECURITY;

-- SELECT only — handles are public within the platform
CREATE POLICY club_identities_select ON public.club_identities
  FOR SELECT TO authenticated USING (true);
-- No INSERT / UPDATE / DELETE policies — all writes via SECURITY DEFINER RPCs

-- ---------------------------------------------------------------------------
-- 2. Lock down profiles — drop ALL UPDATE policies AND revoke table privilege
--    SECURITY DEFINER RPCs still work (run as postgres/owner, not as role)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_upsert_self ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
-- profiles_select_authenticated (USING true) was added in 20260217235900_profile_rls.sql

-- Revoke table-level UPDATE: belt-and-suspenders above the RLS layer
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;

-- Tighten INSERT: only own row, identity fields must be blank
-- (trigger auto-creates the row on signup; this is purely defensive)
DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    id = auth.uid()
    AND (display_name IS NULL OR display_name = '')
    AND (first_name   IS NULL OR first_name   = '')
    AND (last_name    IS NULL OR last_name    = '')
  );

-- ---------------------------------------------------------------------------
-- 3. Helper: validate_club_handle(p_handle text) → trimmed handle
--    Pure string validation; IMMUTABLE (no DB access).
--    Granted to authenticated so SECURITY INVOKER rpc_club_handle_check can call it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_club_handle(p_handle text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
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

REVOKE ALL  ON FUNCTION public.validate_club_handle(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_club_handle(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC: rpc_profile_init(p_display_name, p_first_name, p_last_name)
--    First-time onboarding: sets display_name + name fields.
--    Fails with 'already_initialized' if display_name is already set.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_profile_init(
  p_display_name text,
  p_first_name   text DEFAULT NULL,
  p_last_name    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_profile_init FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_profile_init TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPC: rpc_profile_update(p_first_name, p_last_name)
--    Updates non-identity fields only.  Never touches display_name.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_profile_update(
  p_first_name text DEFAULT NULL,
  p_last_name  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_profile_update FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_profile_update TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC: rpc_club_handle_check(p_club_id, p_handle)
--    Returns (available, suggestions[]).  Read-only; SECURITY INVOKER + STABLE.
--    Suggestions preserve user input case; availability checked via norm.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_club_handle_check(
  p_club_id uuid,
  p_handle  text
)
RETURNS TABLE(available boolean, suggestions text[])
LANGUAGE plpgsql
STABLE   -- read-only; consistent within a transaction
-- SECURITY INVOKER (default) — caller is authenticated; RLS SELECT policy applies
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

REVOKE ALL  ON FUNCTION public.rpc_club_handle_check FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_club_handle_check TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPC: rpc_club_join(p_club_id, p_handle)
--    Joins a club with the given handle.
--    If first club: sets primary_club_id + display_name.
--    club_handle_norm is GENERATED — INSERT only specifies club_handle.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_club_join(
  p_club_id uuid,
  p_handle  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_club_join FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_club_join TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC: rpc_club_handle_set(p_club_id, p_new_handle)
--    Renames handle in a club.  If primary club: syncs display_name.
--    Only updates club_handle; norm is auto-computed (GENERATED STORED).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_club_handle_set(
  p_club_id    uuid,
  p_new_handle text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trimmed      text;
  v_norm         text;
  v_old_handle   text;
  v_old_norm     text;
  v_primary_club uuid;
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
  -- If only case changed (v_norm = v_old_norm), we own the slot — no conflict.
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

  -- Sync display_name if this is the primary club
  SELECT primary_club_id INTO v_primary_club
  FROM public.profiles WHERE id = auth.uid();

  IF v_primary_club = p_club_id THEN
    UPDATE public.profiles
    SET display_name = v_trimmed
    WHERE id = auth.uid();
  END IF;
END;
$$;

REVOKE ALL  ON FUNCTION public.rpc_club_handle_set FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_club_handle_set TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. RPC: rpc_profile_set_primary_club(p_club_id)
--    Changes primary club; syncs display_name to that club's handle.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_profile_set_primary_club(
  p_club_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_profile_set_primary_club FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_profile_set_primary_club TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_count int;
BEGIN
  -- (a) No UPDATE policy on profiles
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'UPDATE';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'profiles still has % UPDATE policy/policies — migration incomplete', v_count;
  END IF;

  -- (b) unique constraint: (club_id, user_id)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.club_identities'::regclass
      AND contype = 'u' AND conname = 'uq_club_identity_user'
  ) THEN
    RAISE EXCEPTION 'Missing unique constraint uq_club_identity_user';
  END IF;

  -- (c) unique constraint: (club_id, club_handle_norm)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.club_identities'::regclass
      AND contype = 'u' AND conname = 'uq_club_identity_handle_norm'
  ) THEN
    RAISE EXCEPTION 'Missing unique constraint uq_club_identity_handle_norm';
  END IF;

  -- (d) club_handle_norm is a GENERATED ALWAYS column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'club_identities'
      AND column_name  = 'club_handle_norm'
      AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION 'club_handle_norm must be GENERATED ALWAYS (generated stored column)';
  END IF;

  -- (e) All RPCs exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_profile_init') THEN
    RAISE EXCEPTION 'RPC rpc_profile_init not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_profile_update') THEN
    RAISE EXCEPTION 'RPC rpc_profile_update not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_club_handle_check') THEN
    RAISE EXCEPTION 'RPC rpc_club_handle_check not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_club_join') THEN
    RAISE EXCEPTION 'RPC rpc_club_join not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_club_handle_set') THEN
    RAISE EXCEPTION 'RPC rpc_club_handle_set not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rpc_profile_set_primary_club') THEN
    RAISE EXCEPTION 'RPC rpc_profile_set_primary_club not found';
  END IF;

  RAISE NOTICE 'club_identities migration verification PASSED';
END $$;
