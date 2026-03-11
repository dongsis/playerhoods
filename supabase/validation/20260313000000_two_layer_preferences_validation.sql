-- =============================================================================
-- Validation: Two-layer preferences minimal slice
-- Run after migration 20260313000000_two_layer_preferences_minimal.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Schema: club_identities columns exist
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_identities'
      AND column_name = 'visible_in_club_member_discovery'
  ) THEN
    RAISE EXCEPTION 'club_identities.visible_in_club_member_discovery missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'club_identities'
      AND column_name = 'accept_non_group_invites_in_club'
  ) THEN
    RAISE EXCEPTION 'club_identities.accept_non_group_invites_in_club missing';
  END IF;
  RAISE NOTICE 'Schema: club_identities preference columns exist';
END $$;

-- -----------------------------------------------------------------------------
-- 2) rpc_club_members_discovery: two-layer filter in function body
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_ok  boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_club_members_discovery';
  v_ok := v_def LIKE '%show_in_club_member_discovery = true%'
      AND v_def LIKE '%COALESCE(ci.visible_in_club_member_discovery, true)%';
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'rpc_club_members_discovery must use two-layer discovery filter';
  END IF;
  RAISE NOTICE 'Discovery: two-layer filter present';
END $$;

-- -----------------------------------------------------------------------------
-- 3–6) Discovery behavior (manual setup required)
-- Manual: create club C, users U1–U4 with club_identities. Set:
--   U1: global=true, club=NULL  → discoverable
--   U2: global=true, club=true  → discoverable
--   U3: global=false            → not discoverable
--   U4: global=true, club=false → not discoverable
-- Call rpc_club_members_discovery(C) as club member; verify U1,U2 in; U3,U4 out.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 7) can_admit_user_to_match: Path B two-layer in function body
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_ok  boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'can_admit_user_to_match';
  v_ok := v_def LIKE '%allow_non_group_invites = true%'
      AND v_def LIKE '%accept_non_group_invites_in_club%';
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'can_admit_user_to_match Path B must use two-layer logic';
  END IF;
  RAISE NOTICE 'Admission: can_admit Path B two-layer present';
END $$;

-- -----------------------------------------------------------------------------
-- 8–9) Admission permission (manual)
-- Manual: setup match M, target T. T: global invite on/off, club override on/off.
-- Verify allow/deny per two-layer matrix.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 10) rpc_match_admission_targets: club_members_src two-layer
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_def text;
  v_ok  boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'rpc_match_admission_targets';
  v_ok := v_def LIKE '%show_in_club_member_discovery = true%'
      AND v_def LIKE '%visible_in_club_member_discovery%';
  IF NOT COALESCE(v_ok, false) THEN
    RAISE EXCEPTION 'rpc_match_admission_targets club_members_src must use two-layer discovery';
  END IF;
  RAISE NOTICE 'Admission read model: club_members two-layer present';
END $$;

-- -----------------------------------------------------------------------------
-- 11) can_admit aligned with rpc_match_admission_targets
-- Both use can_admit_user_to_match for eligible. Structural check only.
-- Manual: run rpc_match_admission_targets; verify eligible matches can_admit for sample rows.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 12) Design note exists (documentation check — manual)
-- Verify docs/specs mention: no sport-scoped permission; tennis/racket/pickleball unified.
-- -----------------------------------------------------------------------------
