-- ============================================================================
-- Governance Migration: 010_invite_flow_rls
-- ============================================================================
--
-- 迁移名称: 010_invite_flow_rls
-- 影响范围: group_members (RLS INSERT policy)
-- 是否可回滚: YES
-- 风险等级: MEDIUM (replaces existing RLS policy)
-- 前置迁移: 007_create_groups.sql, 008_group_creation_semantics.sql, 009_group_details_view_alignment.sql
--
-- Depends on:
--   - docs/constitution/Group Constitution.md
--   - docs/specs/GroupContract_v1.md
--   - docs/Group Governance – Technical Appendix.md
--
-- Purpose:
--   Implement explicit invite semantics for group_members INSERT.
--   This slice handles: invited → pending (the INSERT only).
--   It does NOT implement acceptance (pending → active).
--
-- Key Rules (from Slice 2.2 spec):
--   - All "adding people" must be explicit invites
--   - No implicit relationships may be created
--   - invited_by must equal auth.uid() for join_method='invited'
--   - Inviter must be an active member of the target group
--   - For organized + auto_join: invite INSERT is rejected (use auto-join logic)
--
-- This migration does NOT:
--   - Change any enum values
--   - Implement accept/approve flow (pending → active)
--   - Add implicit relationships
--   - Bypass RLS
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

  -- 检查 invited_by 列存在
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'group_members' AND column_name = 'invited_by'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Column public.group_members.invited_by does not exist');
  END IF;

  -- 如果有错误，抛出异常
  IF array_length(v_error_messages, 1) > 0 THEN
    RAISE EXCEPTION E'PRE-ASSERTION FAILED:\n%', array_to_string(v_error_messages, E'\n');
  END IF;

  RAISE NOTICE 'PRE-ASSERTION PASSED: All dependencies verified';
END $$;

-- ============================================================================
-- [6] RLS - 替换 group_members INSERT 策略
-- ============================================================================
-- 完全替换 007 中的 can_add_group_member policy
-- 原因：policies 是 permissive (OR)，无法通过添加额外 policy 来收紧访问
--
-- 新策略覆盖四种 join_method:
--   1. founder: 由 trigger 处理（SECURITY DEFINER），不走 RLS
--   2. invited: 本 slice 的核心，显式邀请语义
--   3. applied: 用户自己申请加入（discoverable groups）
--   4. link: 用户通过链接加入

DROP POLICY IF EXISTS "can_add_group_member" ON public.group_members;

CREATE POLICY "can_add_group_member"
  ON public.group_members
  FOR INSERT
  WITH CHECK (
    -- ========================================
    -- 情况 1: 自己申请加入 (applied)
    -- ========================================
    (
      NEW.join_method = 'applied'
      AND NEW.user_id = auth.uid()
      AND NEW.status = 'pending'
      AND NEW.invited_by IS NULL
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = NEW.group_id
          AND g.visibility = 'discoverable'
          -- applied 只允许 organizer_approval 策略
          AND g.join_policy = 'organizer_approval'
      )
      -- 不能重复申请
      AND NOT EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = NEW.group_id AND gm.user_id = NEW.user_id
      )
    )

    OR

    -- ========================================
    -- 情况 2: 通过链接加入 (link)
    -- ========================================
    (
      NEW.join_method = 'link'
      AND NEW.user_id = auth.uid()
      AND NEW.invited_by IS NULL
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = NEW.group_id
          AND g.visibility = 'link_accessible'
          AND g.invite_code IS NOT NULL
          -- link 加入可以是 pending 或根据 join_policy 决定
          -- 对于 auto_join，直接变成 active；否则是 pending
          AND (
            (g.join_policy = 'auto_join' AND NEW.status = 'active')
            OR (g.join_policy != 'auto_join' AND NEW.status = 'pending')
          )
      )
      -- 不能重复加入
      AND NOT EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = NEW.group_id AND gm.user_id = NEW.user_id
      )
    )

    OR

    -- ========================================
    -- 情况 3: 被邀请加入 (invited) - 核心逻辑
    -- ========================================
    (
      NEW.join_method = 'invited'
      AND NEW.status = 'pending'
      -- 邀请者必须是当前用户
      AND NEW.invited_by = auth.uid()
      AND auth.uid() IS NOT NULL
      -- 不能邀请自己
      AND NEW.user_id != auth.uid()
      -- 不能重复邀请
      AND NOT EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = NEW.group_id AND gm.user_id = NEW.user_id
      )
      -- 邀请者必须是该 group 的 active 成员
      AND EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = NEW.group_id
          AND gm.user_id = auth.uid()
          AND gm.status = 'active'
      )
      -- 检查 group 的邀请权限
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = NEW.group_id
          AND (
            -- direct group: 任何 active 成员可邀请 (peer-based)
            -- Contract v1 §2.2: direct 只能用 invite_only
            (g.group_type = 'direct' AND g.join_policy = 'invite_only')
            OR
            -- organized + invite_only: 任何 active 成员可邀请 (confirmed Q2)
            (g.group_type = 'organized' AND g.join_policy = 'invite_only')
            OR
            -- organized + organizer_approval: 任何 active 成员可邀请
            -- (approval 在 accept flow 中处理，不在本 slice)
            (g.group_type = 'organized' AND g.join_policy = 'organizer_approval')
            -- organized + auto_join: 不允许 invited INSERT
            -- (用户应通过 auto-join 逻辑加入，不在本 slice)
          )
      )
    )

    -- ========================================
    -- 情况 4: founder
    -- ========================================
    -- founder 由 create_founder_membership() trigger 处理
    -- trigger 使用 SECURITY DEFINER，绕过 RLS
    -- 这里不需要处理 founder
  );

COMMENT ON POLICY "can_add_group_member" ON public.group_members IS
  'Explicit invite semantics for group membership. Slice 2.2: invited → pending only. '
  'Applied: user self-applies to discoverable group. '
  'Link: user joins via invite link. '
  'Invited: explicit invite by active member (invited_by = auth.uid()). '
  'Founder: handled by trigger (SECURITY DEFINER).';

-- ============================================================================
-- [8] ASSERT POST - 后置断言（验证变更成功）
-- ============================================================================

DO $$
BEGIN
  -- 验证 policy 存在
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'group_members'
      AND policyname = 'can_add_group_member'
      AND cmd = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'POST-ASSERTION FAILED: Policy can_add_group_member was not created';
  END IF;

  RAISE NOTICE 'POST-ASSERTION PASSED: Policy can_add_group_member is active';
END $$;

COMMIT;

-- ============================================================================
-- [9] ROLLBACK - 回滚脚本
-- ============================================================================
-- WARNING: Rollback restores the less strict 007 policy.
-- 风险提示: 回滚会恢复 007 中较宽松的策略

/*
-- ============================================================================
-- ROLLBACK SCRIPT FOR: 010_invite_flow_rls
-- ============================================================================
-- WARNING: This rollback restores the original 007 policy which has less
-- strict invite semantics.

BEGIN;

DROP POLICY IF EXISTS "can_add_group_member" ON public.group_members;

-- Restore original 007 policy (simplified version)
CREATE POLICY "can_add_group_member"
  ON public.group_members
  FOR INSERT
  WITH CHECK (
    -- 情况1: 自己申请加入
    (user_id = auth.uid() AND join_method IN ('applied', 'link'))
    OR
    -- 情况2: 被邀请（需要邀请者有权限）
    (
      join_method = 'invited'
      AND invited_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = group_members.group_id
          AND gm.user_id = auth.uid()
          AND gm.status = 'active'
      )
    )
  );

COMMIT;

-- ============================================================================
-- END ROLLBACK SCRIPT
-- ============================================================================
*/

-- ============================================================================
-- INVITE FLOW SEMANTICS (Slice 2.2 Documentation)
-- ============================================================================
/*

## What counts as an invite (媒介说明)

An invite is a single explicit INSERT into public.group_members with:
- join_method = 'invited'
- status = 'pending'
- invited_by = auth.uid() (the inviter must be the current user)

This slice only handles: invited → pending (the INSERT).
It does NOT implement acceptance (pending → active).


## Legal Flows (合法流程)

### Example 1: Direct group peer invitation
- User A creates a direct group (becomes founder, active)
- User A invites User B:
  INSERT INTO group_members (group_id, user_id, status, join_method, invited_by)
  VALUES (group_id, user_b_id, 'pending', 'invited', user_a_id)
- Result: User B is pending, must accept to become active

### Example 2: Organized group (invite_only) member invitation
- Organized group with join_policy = 'invite_only'
- Any active member can invite new people
- Inviter must be active member, invited_by = auth.uid()
- New member starts as pending

### Example 3: Organized group (organizer_approval) invitation
- Organized group with join_policy = 'organizer_approval'
- Any active member can invite new people into pending
- Acceptance/approval handled in separate slice (not here)


## Illegal Flows (非法流程)

### Example 1: Self-invite
- User tries to invite themselves
- Blocked: NEW.user_id != auth.uid() is required for invited

### Example 2: Invite without being active member
- User is pending in group, tries to invite someone
- Blocked: inviter must be active member

### Example 3: Invite to auto_join group
- Organized group with join_policy = 'auto_join'
- Invite INSERT is rejected
- Users should use auto-join logic instead

### Example 4: Invite with wrong invited_by
- User A tries to INSERT with invited_by = User B
- Blocked: invited_by must equal auth.uid()

### Example 5: Duplicate invite
- User already has a row in group_members (any status)
- Blocked: NOT EXISTS check prevents duplicates

### Example 6: Direct INSERT as active
- User tries to INSERT with status = 'active' via invited
- Blocked: invited must have status = 'pending'

*/
