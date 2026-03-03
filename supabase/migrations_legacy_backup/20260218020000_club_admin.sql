-- Migration: Club Admin role
-- Adds is_super_admin flag, club_admins junction table, and all club/court management RPCs.
-- All writes are RPC-only (SECURITY DEFINER). Authenticated users have no direct DML on clubs/courts/club_admins.

-- ============================================================================
-- 1. Add is_super_admin to profiles
-- ============================================================================
-- Note: This flag must ONLY be set via service role SQL (e.g. supabase SQL editor).
-- Direct UPDATEs by authenticated users are blocked at two layers:
--   • No UPDATE RLS policy on profiles (dropped in 20260218010000_club_identities.sql)
--   • REVOKE UPDATE ON profiles FROM authenticated (same migration)
-- Authenticated RPCs in this file never expose or modify is_super_admin.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- ============================================================================
-- 2. Create club_admins junction table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.club_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_club_admin UNIQUE (user_id, club_id)
);

ALTER TABLE public.club_admins ENABLE ROW LEVEL SECURITY;

-- SELECT: self (see your own club assignments) or super admin (see all)
CREATE POLICY club_admins_select ON public.club_admins
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

-- NO INSERT / UPDATE / DELETE policies — all writes via SECURITY DEFINER RPCs only.

-- Explicit table privilege: authenticated can SELECT; DML is belt-and-suspenders blocked
-- even without a permissive policy (belt-and-suspenders for direct-insert attempts).
GRANT SELECT ON public.club_admins TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.club_admins FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.club_admins FROM anon;

-- ============================================================================
-- 3. clubs/courts: confirm no direct DML for authenticated
-- ============================================================================
-- RLS is already enabled on clubs and courts (from migration 001).
-- Existing policies only cover SELECT (clubs_select_auth, courts_select_auth).
-- No DML policies exist → authenticated users cannot write directly.
-- RPCs run as SECURITY DEFINER and bypass RLS entirely.

-- ============================================================================
-- 4. Helper: is_club_admin(p_club_id)
-- ============================================================================
-- Reusable inline check used by RPCs below.
-- Returns true if caller is super_admin OR is a club_admin for the given club.

CREATE OR REPLACE FUNCTION public.is_club_admin(p_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true)
      OR EXISTS (SELECT 1 FROM public.club_admins WHERE club_id = p_club_id AND user_id = auth.uid())
$$;

REVOKE ALL  ON FUNCTION public.is_club_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_club_admin(uuid) TO authenticated;

-- ============================================================================
-- 5. Super-admin RPCs
-- ============================================================================

-- 5A. Search users by display_name or email (for admin assignment UI)
CREATE OR REPLACE FUNCTION public.rpc_admin_user_search(p_query text)
RETURNS TABLE (user_id uuid, display_name text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_admin_user_search(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_user_search(text) TO authenticated;

-- 5B. Grant club admin
CREATE OR REPLACE FUNCTION public.rpc_club_admin_grant(p_user_id uuid, p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_club_admin_grant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_club_admin_grant(uuid, uuid) TO authenticated;

-- 5C. Revoke club admin
CREATE OR REPLACE FUNCTION public.rpc_club_admin_revoke(p_user_id uuid, p_club_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = true) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  DELETE FROM public.club_admins
  WHERE user_id = p_user_id AND club_id = p_club_id;
END;
$$;

REVOKE ALL  ON FUNCTION public.rpc_club_admin_revoke(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_club_admin_revoke(uuid, uuid) TO authenticated;

-- 5D. Create club (super admin only)
CREATE OR REPLACE FUNCTION public.rpc_club_create(
  p_name text,
  p_location_text text DEFAULT NULL,
  p_timezone text DEFAULT 'America/Toronto',
  p_notes text DEFAULT NULL
)
RETURNS public.clubs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_club_create(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_club_create(text, text, text, text) TO authenticated;

-- ============================================================================
-- 6. Club admin RPCs (super_admin OR club_admin for that club)
-- ============================================================================

-- 6A. Update club info
CREATE OR REPLACE FUNCTION public.rpc_club_update(
  p_club_id uuid,
  p_name text DEFAULT NULL,
  p_location_text text DEFAULT NULL,
  p_timezone text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_club_update(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_club_update(uuid, text, text, text, text) TO authenticated;

-- 6B. Create court
CREATE OR REPLACE FUNCTION public.rpc_court_create(
  p_club_id uuid,
  p_court_code text,
  p_surface text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.courts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_court_create(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_court_create(uuid, text, text, text) TO authenticated;

-- 6C. Update court
CREATE OR REPLACE FUNCTION public.rpc_court_update(
  p_court_id uuid,
  p_court_code text DEFAULT NULL,
  p_surface text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_court_update(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_court_update(uuid, text, text, text) TO authenticated;

-- 6D. Delete court
CREATE OR REPLACE FUNCTION public.rpc_court_delete(p_court_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL  ON FUNCTION public.rpc_court_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_court_delete(uuid) TO authenticated;

-- ============================================================================
-- 7. Verification
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_super_admin'
  ) THEN
    RAISE EXCEPTION 'is_super_admin column not added to profiles';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'club_admins'
  ) THEN
    RAISE EXCEPTION 'club_admins table not created';
  END IF;

  RAISE NOTICE 'Club admin migration complete.';
END $$;
