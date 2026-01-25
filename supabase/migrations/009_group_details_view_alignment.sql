-- ============================================================================
-- Governance Migration Template (治理级迁移模板)
-- ============================================================================
--
-- 迁移名称: 009_group_details_view_alignment
-- 影响范围: group_details (view)
-- 是否可回滚: YES
-- 风险等级: LOW
-- 前置迁移: 007_create_groups.sql, 008_group_creation_semantics.sql
--
-- Depends on:
--   - docs/constitution/Group Constitution.md
--   - docs/specs/GroupContract_v1.md
--   - docs/governance/Group Governance – Technical Appendix.md
--   - docs/playerhoods/supabase/migrations/Governance Migration Template.sql
--
-- Purpose:
--   Rewrite group_details view to be Contract-compliant:
--   - NO usage of table.* (禁止 g.*)
--   - Explicit column list required
--   - Column order (1-18) is locked for Contract v1
--   - Future new fields MUST append after position 18 only
--
-- NOTE: This migration uses DROP VIEW because the existing view (from 008)
-- uses g.* which produces a different column order. CREATE OR REPLACE VIEW
-- cannot change column order/names, so DROP is required for this one-time fix.
-- After this migration, the column order is locked and future migrations
-- can safely use CREATE OR REPLACE VIEW.
--
-- This migration does NOT:
--   - Change any enum values
--   - Change governance semantics
--   - Modify RLS policies
--   - Add/remove columns from groups table
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- [1] ASSERT PRE - 前置断言（依赖检查）
-- ============================================================================

DO $$
DECLARE
  v_error_messages TEXT[] := '{}';
BEGIN
  -- 检查 groups 表存在
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'groups'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Table public.groups does not exist');
  END IF;

  -- 检查 group_members 表存在
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'group_members'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Table public.group_members does not exist');
  END IF;

  -- 检查 profiles 表存在（用于 boundary_keeper_name）
  -- Contract v1 requires boundary_keeper_name (position 16), which depends on
  -- public.profiles.display_name; therefore profiles table is a required dependency.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Table public.profiles does not exist (required for boundary_keeper_name)');
  END IF;

  -- 检查 club 列存在
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'club'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Column public.groups.club does not exist');
  END IF;

  -- 检查 skill_level 列存在
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'skill_level'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Column public.groups.skill_level does not exist');
  END IF;

  -- 如果有错误，抛出异常
  IF array_length(v_error_messages, 1) > 0 THEN
    RAISE EXCEPTION E'PRE-ASSERTION FAILED:\n%', array_to_string(v_error_messages, E'\n');
  END IF;

  RAISE NOTICE 'PRE-ASSERTION PASSED: All dependencies verified';
END $$;

-- ============================================================================
-- [5] VIEW - 视图重建（Contract-compliant）
-- ============================================================================
-- 规则：
--   - 禁止使用 table.* (禁止 g.*)
--   - 必须使用显式列列表
--   - Contract v1 锁定列顺序 (1-18)
--   - 未来新字段必须追加在 position 18 之后
--
-- Locked column order for Contract v1 (positions 1-18):
--   1  id
--   2  group_type
--   3  name
--   4  visibility
--   5  join_policy
--   6  created_by
--   7  boundary_keeper_user_id
--   8  invite_code
--   9  invite_code_expires_at
--   10 invite_code_max_uses
--   11 invite_code_uses
--   12 created_at
--   13 updated_at
--   14 member_count (computed)
--   15 pending_count (computed)
--   16 boundary_keeper_name (computed)
--   17 club (weak field)
--   18 skill_level (weak field)
--
-- Future fields: append after 18 only
--
-- NOTE: DROP VIEW is required here because the existing view (from 008) uses g.*
-- which has a different column order. CREATE OR REPLACE cannot change column order.
-- This is a one-time migration to establish the correct Contract v1 column order.
-- Future migrations should use CREATE OR REPLACE VIEW.

DROP VIEW IF EXISTS public.group_details;

CREATE VIEW public.group_details AS
SELECT
  -- ========================================
  -- Locked columns (1-13): from groups table
  -- DO NOT REORDER
  -- ========================================
  g.id,                           -- 1
  g.group_type,                   -- 2
  g.name,                         -- 3
  g.visibility,                   -- 4
  g.join_policy,                  -- 5
  g.created_by,                   -- 6
  g.boundary_keeper_user_id,      -- 7
  g.invite_code,                  -- 8
  g.invite_code_expires_at,       -- 9
  g.invite_code_max_uses,         -- 10
  g.invite_code_uses,             -- 11
  g.created_at,                   -- 12
  g.updated_at,                   -- 13

  -- ========================================
  -- Locked computed columns (14-15)
  -- DO NOT REORDER
  -- ========================================
  (
    SELECT COUNT(*)::INTEGER
    FROM public.group_members gm
    WHERE gm.group_id = g.id AND gm.status = 'active'
  ) AS member_count,              -- 14

  (
    SELECT COUNT(*)::INTEGER
    FROM public.group_members gm
    WHERE gm.group_id = g.id AND gm.status = 'pending'
  ) AS pending_count,             -- 15

  -- ========================================
  -- Locked appended columns (16-18)
  -- DO NOT REORDER
  -- ========================================
  (
    SELECT p.display_name
    FROM public.profiles p
    WHERE p.id = g.boundary_keeper_user_id
  ) AS boundary_keeper_name,      -- 16

  g.club,                         -- 17 (weak field, optional)
  g.skill_level                   -- 18 (weak field, optional)

  -- ========================================
  -- Future columns: append here (19+)
  -- ========================================

FROM public.groups g;

COMMENT ON VIEW public.group_details IS
  'Contract-level view for Group with computed fields. Column order (1-18) is locked for Contract v1. Future fields append after 18 only.';

-- ============================================================================
-- [8] ASSERT POST - 后置断言（验证变更成功）
-- ============================================================================
-- 验证视图列顺序正确（关键！）
-- 使用数组对比替代 FOR loop，更短更硬，更少可变点

DO $$
DECLARE
  v_expected TEXT[] := ARRAY[
    'id', 'group_type', 'name', 'visibility', 'join_policy',
    'created_by', 'boundary_keeper_user_id', 'invite_code',
    'invite_code_expires_at', 'invite_code_max_uses', 'invite_code_uses',
    'created_at', 'updated_at', 'member_count', 'pending_count',
    'boundary_keeper_name', 'club', 'skill_level'
  ];
  v_actual TEXT[];
BEGIN
  -- 验证视图存在
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'group_details'
  ) THEN
    RAISE EXCEPTION 'POST-ASSERTION FAILED: View public.group_details was not created';
  END IF;

  -- 获取实际列顺序（按 ordinal_position 聚合）
  SELECT array_agg(column_name ORDER BY ordinal_position)
  INTO v_actual
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'group_details'
    AND ordinal_position <= 18;

  -- 直接对比数组
  IF v_actual IS NULL THEN
    RAISE EXCEPTION 'POST-ASSERTION FAILED: View has no columns';
  ELSIF v_actual != v_expected THEN
    RAISE EXCEPTION E'POST-ASSERTION FAILED: Column order mismatch\nExpected: %\nActual:   %',
      v_expected, v_actual;
  END IF;

  RAISE NOTICE 'POST-ASSERTION PASSED: View group_details is Contract-compliant';
  RAISE NOTICE 'Column order verified: all 18 positions locked for Contract v1';
END $$;

COMMIT;

-- ============================================================================
-- [9] ROLLBACK - 回滚脚本
-- ============================================================================
-- WARNING: Rollback violates Contract v1; only for emergency debugging in non-prod.
-- 风险提示: 回滚会恢复使用 g.* 的旧视图，违反 Contract 要求
-- 执行前提: 无数据丢失风险

/*
-- ============================================================================
-- ROLLBACK SCRIPT FOR: 009_group_details_view_alignment
-- ============================================================================
-- WARNING: This rollback violates Contract v1 (uses g.*).
-- Only use for emergency debugging in non-production environments.

BEGIN;

-- 恢复旧版视图（使用 g.*，违反 Contract 但功能等价）
CREATE OR REPLACE VIEW public.group_details AS
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
  (
    SELECT p.display_name
    FROM public.profiles p
    WHERE p.id = g.boundary_keeper_user_id
  ) AS boundary_keeper_name
FROM public.groups g;

COMMIT;

-- ============================================================================
-- END ROLLBACK SCRIPT
-- ============================================================================
*/

-- ============================================================================
-- 手动验证查询（可选）
-- ============================================================================
/*
-- 验证视图列顺序
SELECT column_name, ordinal_position, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'group_details'
ORDER BY ordinal_position;

-- 预期输出:
-- 1  id                       uuid
-- 2  group_type               text
-- 3  name                     text
-- 4  visibility               text
-- 5  join_policy              text
-- 6  created_by               uuid
-- 7  boundary_keeper_user_id  uuid
-- 8  invite_code              text
-- 9  invite_code_expires_at   timestamp with time zone
-- 10 invite_code_max_uses     integer
-- 11 invite_code_uses         integer
-- 12 created_at               timestamp with time zone
-- 13 updated_at               timestamp with time zone
-- 14 member_count             integer
-- 15 pending_count            integer
-- 16 boundary_keeper_name     text
-- 17 club                     text
-- 18 skill_level              text

-- 测试视图查询
SELECT * FROM public.group_details LIMIT 1;
*/
