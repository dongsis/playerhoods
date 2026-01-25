-- ============================================================================
-- Governance Migration: 010_invite_flow_rls
-- ============================================================================
--
-- 迁移名称: 010_invite_flow_rls
-- 影响范围: group_members (RLS INSERT policies)
-- 是否可回滚: YES
-- 风险等级: MEDIUM (replaces 007 INSERT policy to remove invited branch)
-- 前置迁移: 007_create_groups.sql, 008_group_creation_semantics.sql, 009_group_details_view_alignment.sql
--
-- Depends on:
--   - docs/constitution/Group Constitution.md
--   - docs/specs/GroupContract_v1.md
--   - docs/governance/Group Governance – Technical Appendix.md
--
-- Purpose:
--   Enforce explicit invite semantics for group_members INSERT where join_method='invited'.
--   NOTE: This Postgres version does NOT support AS RESTRICTIVE policies.
--   Therefore, we must remove/disable the invited path from 007 policy and introduce a strict invited policy.
--
-- Scope:
--   - invited → pending ONLY (strict)
--   - applied/link/founder remain allowed via can_add_group_member (007-compatible)
--
-- Key Rules (Slice 2.2):
--   - join_method='invited' must be status='pending'
--   - invited_by must equal auth.uid()
--   - inviter must be active member of the target group
--   - reject organized + auto_join for invited inserts
--   - no duplicates for (group_id,user_id) regardless of status
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- [1] ASSERT PRE
-- ============================================================================

DO $$
DECLARE
  v_error_messages TEXT[] := '{}';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='groups'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Table public.groups does not exist');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='group_members'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Table public.group_members does not exist');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='group_members' AND column_name='invited_by'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Column public.group_members.invited_by does not exist');
  END IF;

  -- 007 policy must exist so we can replace it deterministically
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='group_members'
      AND policyname='can_add_group_member' AND cmd='INSERT'
  ) THEN
    v_error_messages := array_append(v_error_messages, 'Expected 007 policy can_add_group_member (INSERT) is missing');
  END IF;

  IF array_length(v_error_messages, 1) > 0 THEN
    RAISE EXCEPTION E'PRE-ASSERTION FAILED:\n%', array_to_string(v_error_messages, E'\n');
  END IF;

  RAISE NOTICE 'PRE-ASSERTION PASSED';
END $$;

-- ============================================================================
-- [6] RLS - Replace 007 INSERT policy to remove invited path
-- ============================================================================
-- Why replace?
-- - Policies are permissive (OR). Adding a stricter invited policy cannot tighten access
--   if an older permissive policy still allows invited inserts.
-- - So we remove invited handling from can_add_group_member and create a dedicated strict invited policy.

DROP POLICY IF EXISTS "can_add_group_member" ON public.group_members;

-- Recreate can_add_group_member (applied/link/founder ONLY)
-- IMPORTANT: We intentionally EXCLUDE join_method='invited' here.
CREATE POLICY "can_add_group_member"
  ON public.group_members
  FOR INSERT
  WITH CHECK (
    -- Self-joins (applied/link) are handled as in 007 baseline intent:
    -- user can insert their own row for applied/link
    (
      user_id = auth.uid()
      AND join_method IN ('applied', 'link')
    )
    OR
    -- founder is typically inserted by trigger; keep as fallback (007 did)
    (
      user_id = auth.uid()
      AND join_method = 'founder'
    )
  );

COMMENT ON POLICY "can_add_group_member" ON public.group_members IS
  '007 baseline INSERT policy (modified by 010): allows applied/link/founder only. '
  'Invited inserts are intentionally excluded and must satisfy can_invite_group_member (Slice 2.2).';

-- ============================================================================
-- [6b] RLS - Add strict invited policy (invited → pending only)
-- ============================================================================

DROP POLICY IF EXISTS "can_invite_group_member" ON public.group_members;

CREATE POLICY "can_invite_group_member"
  ON public.group_members
  FOR INSERT
  WITH CHECK (
    join_method = 'invited'
    AND status = 'pending'
    AND auth.uid() IS NOT NULL

    -- inviter must be the current user
    AND invited_by = auth.uid()

    -- no self-invite
    AND user_id <> auth.uid()

    -- prevent duplicates (any status)
    AND NOT EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id  = group_members.user_id
    )

    -- inviter must be active member of the group
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id  = auth.uid()
        AND gm.status   = 'active'
    )

    -- group rules: allow invites for direct/invite_only; organized/(invite_only|organizer_approval)
    -- reject organized/auto_join
    AND EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
        AND (
          (g.group_type = 'direct' AND g.join_policy = 'invite_only')
          OR
          (g.group_type = 'organized' AND g.join_policy IN ('invite_only', 'organizer_approval'))
        )
        AND NOT (g.group_type = 'organized' AND g.join_policy = 'auto_join')
    )
  );

COMMENT ON POLICY "can_invite_group_member" ON public.group_members IS
  'Slice 2.2: Strict invited → pending semantics. '
  'Requires invited_by=auth.uid(), inviter active, no duplicates, no self-invite, rejects organized+auto_join.';

-- ============================================================================
-- [8] ASSERT POST
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='group_members'
      AND policyname='can_add_group_member' AND cmd='INSERT'
  ) THEN
    RAISE EXCEPTION 'POST-ASSERTION FAILED: can_add_group_member (INSERT) missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='group_members'
      AND policyname='can_invite_group_member' AND cmd='INSERT'
  ) THEN
    RAISE EXCEPTION 'POST-ASSERTION FAILED: can_invite_group_member (INSERT) missing';
  END IF;

  RAISE NOTICE 'POST-ASSERTION PASSED: can_add_group_member + can_invite_group_member are active';
END $$;

COMMIT;

-- ============================================================================
-- [9] ROLLBACK (manual)
-- ============================================================================
-- WARNING:
-- - Rollback will remove strict invite semantics.
-- - Use only if you must revert quickly (non-prod strongly preferred).

/*
BEGIN;

DROP POLICY IF EXISTS "can_invite_group_member" ON public.group_members;

DROP POLICY IF EXISTS "can_add_group_member" ON public.group_members;

-- Restore a broad 007-like policy (NOTE: this is intentionally less strict)
CREATE POLICY "can_add_group_member"
  ON public.group_members
  FOR INSERT
  WITH CHECK (
    (user_id = auth.uid() AND join_method IN ('applied','link','founder'))
    OR
    (join_method = 'invited' AND invited_by = auth.uid())
  );

COMMIT;
*/
