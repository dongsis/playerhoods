-- ============================================================================
-- 切片 2.1：Group Creation Semantics
-- ============================================================================
--
-- Depends on:
--   - docs/constitution.md (Claude Group Constitution)
--   - docs/specs/group_contract_v_1.md (Contract v1)
--   - 007_create_groups.sql (Slice 1)
--
-- Changes:
--   1. Add constraint: direct group boundary_keeper_user_id must be NULL
--   2. Add trigger: auto-create founder membership on group creation
--   3. Add optional fields: club, skill_level
--
-- 执行顺序：[0] 依赖检查 → [1] Schema → [2] 函数 → [3] 触发器 → [4] 视图 → [6] 注释 → [7] 验证
-- Note: Patch-style migration - does not recreate tables
-- ============================================================================

-- ============================================================================
-- [0] 依赖检查
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'groups') THEN
    RAISE EXCEPTION 'Dependency not met: public.groups table does not exist. Run 007_create_groups.sql first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'group_members') THEN
    RAISE EXCEPTION 'Dependency not met: public.group_members table does not exist. Run 007_create_groups.sql first.';
  END IF;
END $$;

-- ============================================================================
-- [1] Schema: Direct group boundary_keeper_user_id must be NULL
-- ============================================================================
-- Current constraint only enforces: organized MUST have boundary keeper
-- This adds: direct MUST NOT have boundary keeper

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'direct_group_no_boundary_keeper'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
    ADD CONSTRAINT direct_group_no_boundary_keeper
    CHECK (group_type = 'organized' OR boundary_keeper_user_id IS NULL);

    COMMENT ON CONSTRAINT direct_group_no_boundary_keeper ON public.groups IS
      'Direct group (group_type = direct) must not have a boundary keeper. Contract v1: §2.1';
  END IF;
END $$;

-- ============================================================================
-- [2] 函数: Auto-create founder membership on group creation
-- ============================================================================
-- When a group is created, automatically create a group_member record for the creator
-- with join_method = 'founder' and status = 'active'

CREATE OR REPLACE FUNCTION public.create_founder_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert the founder as an active member
  INSERT INTO public.group_members (
    group_id,
    user_id,
    status,
    join_method,
    joined_at,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.created_by,
    'active',
    'founder',
    NOW(),
    NOW(),
    NOW()
  );

  RETURN NEW;
END;
$$;

-- Drop if exists to allow re-running migration
DROP TRIGGER IF EXISTS create_founder_on_group_insert ON public.groups;

-- Create trigger that fires AFTER INSERT on groups
-- Using AFTER because we need the group record to exist first
CREATE TRIGGER create_founder_on_group_insert
  AFTER INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.create_founder_membership();

COMMENT ON FUNCTION public.create_founder_membership() IS
  'Automatically creates a founder membership when a group is created. Constitution: §3 (explicit relationship)';

-- ============================================================================
-- [1] Schema: Add optional metadata fields (non-breaking)
-- ============================================================================
-- These fields are nullable and have no constraints beyond data type

-- club: Optional reference to a club/venue context
ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS club TEXT;

COMMENT ON COLUMN public.groups.club IS
  'Optional club/venue context for the group. No referential integrity in v1.';

-- skill_level: Optional skill level indicator
ALTER TABLE public.groups
ADD COLUMN IF NOT EXISTS skill_level TEXT;

COMMENT ON COLUMN public.groups.skill_level IS
  'Optional skill level description. Free-form text, no enum in v1.';

-- ============================================================================
-- [4] 视图重建: group_details（必须 DROP + CREATE，不能 REPLACE）
-- ============================================================================
-- 规则：视图依赖的表有新列时，必须重建视图

DROP VIEW IF EXISTS public.group_details;

CREATE VIEW public.group_details AS
SELECT
  g.*,
  (
    SELECT COUNT(*)::INTEGER
    FROM public.group_members gm
    WHERE gm.group_id = g.id AND gm.status = 'active'
  ) AS member_count,
  (
    SELECT COUNT(*)::INTEGER
    FROM public.group_members gm
    WHERE gm.group_id = g.id AND gm.status = 'pending'
  ) AS pending_count,
  -- boundary keeper 的显示名称
  (
    SELECT p.display_name
    FROM public.profiles p
    WHERE p.id = g.boundary_keeper_user_id
  ) AS boundary_keeper_name
FROM public.groups g;

-- ============================================================================
-- [7] 验证 SQL (run after migration to verify correctness)
-- ============================================================================
/*
-- 1. Verify constraints exist
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.groups'::regclass
  AND conname IN ('direct_group_no_boundary_keeper', 'organized_must_have_boundary_keeper');

-- 2. Verify trigger exists
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.groups'::regclass
  AND tgname = 'create_founder_on_group_insert';

-- 3. Verify new columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'groups'
  AND column_name IN ('club', 'skill_level');

-- 4. Test: Try to create a direct group with boundary_keeper (should fail)
-- INSERT INTO public.groups (group_type, created_by, boundary_keeper_user_id)
-- VALUES ('direct', auth.uid(), auth.uid());
-- Expected: ERROR: new row violates check constraint "direct_group_no_boundary_keeper"

-- 5. Test: Create a valid direct group and verify founder membership
-- INSERT INTO public.groups (group_type, name, created_by)
-- VALUES ('direct', 'Test Direct', auth.uid())
-- RETURNING id;
-- Then check:
-- SELECT * FROM public.group_members WHERE group_id = '<returned_id>';
-- Expected: One row with join_method = 'founder', status = 'active'
*/
