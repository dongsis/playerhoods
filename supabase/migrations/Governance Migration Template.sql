-- ============================================================================
-- Governance Migration Template (治理级迁移模板)
-- ============================================================================
--
-- 适用范围：
-- - Group / group_members / group_details
-- - Invite Set（未来）
-- - Session Governance（未来）
-- - 任何涉及 RLS 策略的表
-- - 任何涉及稳定视图（stable view）的变更
--
-- 使用说明：
-- 1. 复制此模板为新的迁移文件（如 009_xxx.sql）
-- 2. 填写 [META] 部分
-- 3. 按顺序填写每个部分，删除不需要的部分（保留注释结构）
-- 4. 填写 [ROLLBACK] 部分（必填！）
-- 5. 运行 [ASSERT] 验证
-- 6. 删除此说明块
--
-- 强制执行顺序：
-- [0] META - 元信息声明
-- [1] ASSERT PRE - 前置断言（依赖检查）
-- [2] SCHEMA - 表/列/约束变更
-- [3] FUNCTION - 函数定义
-- [4] TRIGGER - 触发器
-- [5] VIEW - 视图重建（必须 DROP + CREATE）
-- [6] RLS - RLS 策略
-- [7] COMMENT - 注释
-- [8] ASSERT POST - 后置断言（验证变更）
-- [9] ROLLBACK - 回滚脚本（注释块，必填）
--
-- 关键规则：
-- ✓ ADD COLUMN → 必须 IF NOT EXISTS
-- ✓ ADD CONSTRAINT → 必须包装在 DO $$ IF NOT EXISTS
-- ✓ CREATE POLICY → 前置 DROP POLICY IF EXISTS
-- ✓ 视图变更 → 必须 DROP VIEW IF EXISTS + CREATE VIEW（禁用 REPLACE）
-- ✓ 注释 → 必须在被注释对象创建之后
-- ✓ 回滚脚本 → 必须提供，即使是空操作
--
-- Depends on:
--   - docs/constitution.md (Claude Group Constitution)
--   - docs/specs/group_contract_v_1.md (Contract v1)
--
-- 本迁移遵循 Contract v1，不引入新的 enum 值。
-- ============================================================================

-- ============================================================================
-- [0] META - 元信息声明（必填）
-- ============================================================================
-- 迁移名称: <填写>
-- 影响范围: <填写: groups / group_members / group_details / RLS / 其他>
-- 是否可回滚: <填写: YES / NO / PARTIAL>
-- 风险等级: <填写: LOW / MEDIUM / HIGH>
-- 前置迁移: <填写: 007_create_groups.sql, 008_xxx.sql>

-- ============================================================================
-- [1] ASSERT PRE - 前置断言（依赖检查）
-- ============================================================================
-- 确认本迁移依赖的表/视图/约束已存在
-- 如果断言失败，迁移将中止

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

  -- 检查必要的列存在（示例）
  -- IF NOT EXISTS (
  --   SELECT 1 FROM information_schema.columns
  --   WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'some_column'
  -- ) THEN
  --   v_error_messages := array_append(v_error_messages, 'Column public.groups.some_column does not exist');
  -- END IF;

  -- 检查必要的约束存在（示例）
  -- IF NOT EXISTS (
  --   SELECT 1 FROM pg_constraint
  --   WHERE conname = 'some_constraint' AND conrelid = 'public.groups'::regclass
  -- ) THEN
  --   v_error_messages := array_append(v_error_messages, 'Constraint some_constraint does not exist');
  -- END IF;

  -- 如果有错误，抛出异常
  IF array_length(v_error_messages, 1) > 0 THEN
    RAISE EXCEPTION E'PRE-ASSERTION FAILED:\n%', array_to_string(v_error_messages, E'\n');
  END IF;

  RAISE NOTICE 'PRE-ASSERTION PASSED: All dependencies verified';
END $$;

-- ============================================================================
-- [2] SCHEMA - 表/列/约束变更
-- ============================================================================
-- 顺序：列 → 约束
-- 规则：
--   - ADD COLUMN 必须用 IF NOT EXISTS
--   - ADD CONSTRAINT 必须包装在 DO $$ IF NOT EXISTS 中

-- 2.1 添加列（示例）
-- ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS new_column TEXT;

-- 2.2 添加约束（示例）
-- DO $$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM pg_constraint
--     WHERE conname = 'constraint_name'
--       AND conrelid = 'public.groups'::regclass
--   ) THEN
--     ALTER TABLE public.groups
--     ADD CONSTRAINT constraint_name
--     CHECK (/* condition */);
--
--     COMMENT ON CONSTRAINT constraint_name ON public.groups IS 'description';
--   END IF;
-- END $$;

-- ============================================================================
-- [3] FUNCTION - 函数定义
-- ============================================================================
-- 使用 CREATE OR REPLACE FUNCTION

-- CREATE OR REPLACE FUNCTION public.my_function()
-- RETURNS ...
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--   -- function body
-- END;
-- $$;
--
-- COMMENT ON FUNCTION public.my_function() IS 'description';

-- ============================================================================
-- [4] TRIGGER - 触发器
-- ============================================================================
-- 顺序：DROP IF EXISTS → CREATE TRIGGER

-- DROP TRIGGER IF EXISTS my_trigger ON public.groups;
-- CREATE TRIGGER my_trigger
--   AFTER INSERT ON public.groups
--   FOR EACH ROW
--   EXECUTE FUNCTION public.my_function();

-- ============================================================================
-- [5] VIEW - 视图重建（关键！）
-- ============================================================================
-- 规则：
--   - 如果视图依赖的表有新列，必须重建视图
--   - 必须用 DROP VIEW IF EXISTS + CREATE VIEW
--   - 禁止用 CREATE OR REPLACE VIEW（会报列顺序错误）

-- DROP VIEW IF EXISTS public.group_details;
--
-- CREATE VIEW public.group_details AS
-- SELECT
--   g.*,
--   (SELECT COUNT(*)::INTEGER FROM public.group_members gm WHERE gm.group_id = g.id AND gm.status = 'active') AS member_count,
--   (SELECT COUNT(*)::INTEGER FROM public.group_members gm WHERE gm.group_id = g.id AND gm.status = 'pending') AS pending_count,
--   (SELECT p.display_name FROM public.profiles p WHERE p.id = g.boundary_keeper_user_id) AS boundary_keeper_name
-- FROM public.groups g;

-- ============================================================================
-- [6] RLS - RLS 策略
-- ============================================================================
-- 规则：每个 CREATE POLICY 前必须有 DROP POLICY IF EXISTS

-- DROP POLICY IF EXISTS "policy_name" ON public.groups;
-- CREATE POLICY "policy_name"
--   ON public.groups
--   FOR SELECT
--   USING (/* condition */);

-- ============================================================================
-- [7] COMMENT - 注释（必须在对象存在之后）
-- ============================================================================

-- COMMENT ON COLUMN public.groups.new_column IS 'description';
-- COMMENT ON CONSTRAINT constraint_name ON public.groups IS 'description';

-- ============================================================================
-- [8] ASSERT POST - 后置断言（验证变更成功）
-- ============================================================================
-- 验证本迁移的所有变更都已正确应用
-- 如果断言失败，说明迁移有问题

DO $$
DECLARE
  v_error_messages TEXT[] := '{}';
BEGIN
  -- 验证新列存在（示例）
  -- IF NOT EXISTS (
  --   SELECT 1 FROM information_schema.columns
  --   WHERE table_schema = 'public' AND table_name = 'groups' AND column_name = 'new_column'
  -- ) THEN
  --   v_error_messages := array_append(v_error_messages, 'Column public.groups.new_column was not created');
  -- END IF;

  -- 验证约束存在（示例）
  -- IF NOT EXISTS (
  --   SELECT 1 FROM pg_constraint
  --   WHERE conname = 'constraint_name' AND conrelid = 'public.groups'::regclass
  -- ) THEN
  --   v_error_messages := array_append(v_error_messages, 'Constraint constraint_name was not created');
  -- END IF;

  -- 验证触发器存在（示例）
  -- IF NOT EXISTS (
  --   SELECT 1 FROM pg_trigger
  --   WHERE tgrelid = 'public.groups'::regclass AND tgname = 'my_trigger'
  -- ) THEN
  --   v_error_messages := array_append(v_error_messages, 'Trigger my_trigger was not created');
  -- END IF;

  -- 验证视图存在且包含期望的列（示例）
  -- IF NOT EXISTS (
  --   SELECT 1 FROM information_schema.columns
  --   WHERE table_schema = 'public' AND table_name = 'group_details' AND column_name = 'member_count'
  -- ) THEN
  --   v_error_messages := array_append(v_error_messages, 'View public.group_details missing column member_count');
  -- END IF;

  -- 验证 RLS 策略存在（示例）
  -- IF NOT EXISTS (
  --   SELECT 1 FROM pg_policies
  --   WHERE schemaname = 'public' AND tablename = 'groups' AND policyname = 'policy_name'
  -- ) THEN
  --   v_error_messages := array_append(v_error_messages, 'RLS policy policy_name was not created');
  -- END IF;

  -- 如果有错误，抛出异常
  IF array_length(v_error_messages, 1) > 0 THEN
    RAISE EXCEPTION E'POST-ASSERTION FAILED:\n%', array_to_string(v_error_messages, E'\n');
  END IF;

  RAISE NOTICE 'POST-ASSERTION PASSED: All changes verified';
END $$;

-- ============================================================================
-- [9] ROLLBACK - 回滚脚本（必填！）
-- ============================================================================
-- 此部分必须填写，即使是 "不可回滚" 也要说明原因
-- 回滚脚本应该能够撤销本迁移的所有变更
-- 注意：某些操作（如删除列）可能导致数据丢失，需要标注

/*
-- ============================================================================
-- ROLLBACK SCRIPT FOR: <迁移名称>
-- ============================================================================
-- 风险提示: <如果有数据丢失风险，在此说明>
-- 执行前提: <如果需要备份，在此说明>

-- 1. 回滚 RLS 策略
-- DROP POLICY IF EXISTS "policy_name" ON public.groups;
-- （如需恢复旧策略，在此添加 CREATE POLICY）

-- 2. 回滚视图
-- DROP VIEW IF EXISTS public.group_details;
-- （如需恢复旧视图，在此添加 CREATE VIEW）

-- 3. 回滚触发器
-- DROP TRIGGER IF EXISTS my_trigger ON public.groups;

-- 4. 回滚函数
-- DROP FUNCTION IF EXISTS public.my_function();

-- 5. 回滚约束
-- ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS constraint_name;

-- 6. 回滚列（警告：会丢失数据！）
-- ALTER TABLE public.groups DROP COLUMN IF EXISTS new_column;

-- ============================================================================
-- END ROLLBACK SCRIPT
-- ============================================================================
*/

-- ============================================================================
-- 手动验证查询（可选，用于人工检查）
-- ============================================================================
/*
-- 查看所有 groups 表的列
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'groups'
ORDER BY ordinal_position;

-- 查看所有 groups 表的约束
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.groups'::regclass;

-- 查看所有 groups 表的触发器
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.groups'::regclass
  AND NOT tgisinternal;

-- 查看 group_details 视图的列
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'group_details'
ORDER BY ordinal_position;

-- 查看 groups 表的 RLS 策略
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'groups';

-- 查看 group_members 表的 RLS 策略
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'group_members';
*/
