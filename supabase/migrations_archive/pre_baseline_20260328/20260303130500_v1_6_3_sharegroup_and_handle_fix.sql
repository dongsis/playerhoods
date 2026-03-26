-- v1.6.3 alignment: ShareGroup boundary (friend-only) + club handle independence
-- 1) Add groups.group_kind and constrain ShareGroup to friend groups only
-- 2) Update do_users_share_group and RPC shared-group queries
-- 3) Decouple profiles.display_name from club handle in rpc_club_handle_set

BEGIN;

SET check_function_bodies = false;
SET search_path = public;

-- =============================================================================
-- 1) groups.group_kind: add + backfill + default + not null + check constraint
--    (NO IF [NOT] EXISTS; portable across PostgreSQL versions)
-- =============================================================================
DO $$
BEGIN
  -- Add column if missing
  IF to_regclass('public.groups') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'groups'
        AND column_name  = 'group_kind'
    ) THEN
      ALTER TABLE public.groups
        ADD COLUMN group_kind text;
    END IF;

    -- Backfill NULLs to 'friend' (safe to re-run)
    UPDATE public.groups
    SET group_kind = 'friend'
    WHERE group_kind IS NULL;

    -- Ensure DEFAULT is set (idempotent)
    -- We check for any default; if you want to ensure it's exactly 'friend', we can harden further.
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attrdef d
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      WHERE d.adrelid = 'public.groups'::regclass
        AND a.attname = 'group_kind'
    ) THEN
      ALTER TABLE public.groups
        ALTER COLUMN group_kind SET DEFAULT 'friend';
    END IF;

    -- Ensure NOT NULL is set (idempotent)
    IF EXISTS (
      SELECT 1
      FROM pg_attribute a
      WHERE a.attrelid = 'public.groups'::regclass
        AND a.attname  = 'group_kind'
        AND a.attnotnull = false
    ) THEN
      ALTER TABLE public.groups
        ALTER COLUMN group_kind SET NOT NULL;
    END IF;

    -- Ensure CHECK constraint exists (by name + table)
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname  = 'chk_groups_group_kind'
        AND conrelid = 'public.groups'::regclass
    ) THEN
      ALTER TABLE public.groups
        ADD CONSTRAINT chk_groups_group_kind
        CHECK (group_kind IN ('friend','club'));
    END IF;
  END IF;
END$$;

-- =============================================================================
-- 2) Predicate: friend-only ShareGroup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.do_users_share_group(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
SET row_security = off
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

COMMENT ON FUNCTION public.do_users_share_group(p_user_a uuid, p_user_b uuid)
IS 'v1.6.3: Returns true if both users are active members of at least one common friend group (group_kind=friend). SECURITY DEFINER. Not granted to authenticated directly.';

-- =============================================================================
-- 2.a) Update shared-group filters in organizer invite targets (friend-only)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_match_invite_targets(p_match_id uuid)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.rpc_match_invite_targets(p_match_id uuid)
IS 'v1.6.3: Eligible invite targets for organizer. Target set: InScope UNION ShareGroup(friend-only, organizer). Excludes self and already-active. RAISE on unauthorized caller.';

-- =============================================================================
-- 2.b) Update shared-group filters in nominate targets (friend-only)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_match_nominate_targets(p_match_id uuid)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.rpc_match_nominate_targets(p_match_id uuid)
IS 'v1.6.3: Eligible nomination targets for non-org participants. Caller gates preserved. Target set: ShareGroup(friend-only, caller). Excludes self, organizer, already-active. Returns empty on unauthorized.';

-- =============================================================================
-- 2.c) Update shared-group filters in delegate-manual-confirm targets (friend-only)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_match_delegate_manual_confirm_targets(p_match_id uuid)
RETURNS TABLE(user_id uuid, display_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.rpc_match_delegate_manual_confirm_targets(p_match_id uuid)
IS 'v1.6.3: Friend-group-only targets for delegate manual confirm. Caller: non-org + (InScope OR MatchAssociated). Returns empty when ineligible.';

-- =============================================================================
-- 3) Club handle independence: stop syncing profiles.display_name in rpc_club_handle_set
-- =============================================================================
CREATE OR REPLACE FUNCTION public.rpc_club_handle_set(p_club_id uuid, p_new_handle text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.rpc_club_handle_set(p_club_id uuid, p_new_handle text)
IS 'v1.6.3: Set club-scoped handle for current user. No longer mutates global profiles.display_name. Enforces per-club uniqueness on normalized handle.';

COMMIT;