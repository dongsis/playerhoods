-- ============================================================================
-- 切片 1：Group 数据库与 RLS 基础
-- ============================================================================
--
-- 本实现遵循 Claude Group Constitution (docs/constitution.md)
--
-- 核心原则（宪法约束）：
-- §1 Group 是唯一的人群概念，是 access boundary + action boundary
-- §2 Group 不是聊天室、Feed、好友容器或隐式关系
-- §3 所有关系必须通过 invite + accept 显式建立
-- §4 Direct Group (2-4人) 只能使用 invite_only 策略
-- §5 Organizer 是边界责任人，不是管理员或裁判
-- §6 Match 使用 Group 但不改变 Group
-- §9 边界规则必须在数据库层面可执行
-- §11 禁止：Friends, Followers, Likes, Scores, Ratings, Chat
--
-- 规则：
-- - group_size ≤ 4 = Direct Group（对等，无治理需求）
-- - group_size ≥ 5 = Organized Group（需要 boundary keeper）
-- ============================================================================

-- ============================================================================
-- 1. groups 表
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 类型：direct（2-4人直约）或 organized（≥5人，需要边界守护者）
  group_type TEXT NOT NULL CHECK (group_type IN ('direct', 'organized')),

  -- 名称（organized 必填，direct 可选）
  name TEXT,

  -- 可见性
  -- private: 仅成员可见（默认）
  -- discoverable: 符合条件的用户可发现，需申请加入
  -- link_accessible: 不公开展示，仅通过链接/邀请码访问
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'discoverable', 'link_accessible')),

  -- 准入策略 (Contract v1: §2.2)
  -- invite_only: 仅通过邀请加入（direct group 唯一选项）
  -- organizer_approval: 新人需 boundary keeper 确认（organized group 默认）
  -- auto_join: 符合条件的用户自动加入（仅 organized group）
  join_policy TEXT NOT NULL DEFAULT 'invite_only'
    CHECK (join_policy IN ('invite_only', 'organizer_approval', 'auto_join')),

  -- 创建者（技术记录，不等于管理权限）
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 边界守护者（仅 organized group 必填）
  -- 注意：这不是"管理员"，而是"边界责任人"
  -- boundary keeper 的权力是边界责任，不是个人权威
  boundary_keeper_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 邀请链接/码（可选，用于 link_accessible 或 auto_join_via_link）
  invite_code TEXT UNIQUE,
  invite_code_expires_at TIMESTAMPTZ,
  invite_code_max_uses INTEGER,
  invite_code_uses INTEGER DEFAULT 0,

  -- 可选元数据 (Contract v1: optional metadata fields)
  club TEXT,  -- 俱乐部/场地上下文
  skill_level TEXT,  -- 技术水平描述（自由文本）

  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 约束：organized group 必须有 boundary keeper
  CONSTRAINT organized_must_have_boundary_keeper
    CHECK (group_type = 'direct' OR boundary_keeper_user_id IS NOT NULL),

  -- 约束：organized group 必须有名称
  CONSTRAINT organized_must_have_name
    CHECK (group_type = 'direct' OR name IS NOT NULL),

  -- 约束：direct group 只能使用 invite_only 策略（宪法 §4）
  -- Direct Group 无审批流程，只能通过邀请加入
  -- 注意：由于 join_policy 没有 'invite_only' 值，direct group 使用 'organizer_approval' 作为默认值
  -- 但实际语义是：direct group 不需要审批，邀请即可
  -- 为保持一致性，增加 'invite_only' 选项
  CONSTRAINT direct_group_invite_only
    CHECK (group_type = 'organized' OR join_policy = 'invite_only')
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON public.groups(created_by);
CREATE INDEX IF NOT EXISTS idx_groups_boundary_keeper ON public.groups(boundary_keeper_user_id);
CREATE INDEX IF NOT EXISTS idx_groups_invite_code ON public.groups(invite_code) WHERE invite_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_groups_visibility ON public.groups(visibility) WHERE visibility = 'discoverable';

-- ============================================================================
-- 2. group_members 表
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 成员状态
  -- pending: 等待确认（申请加入或被邀请但未接受）
  -- active: 正式成员
  -- removed: 已移除（保留记录用于审计）
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'removed')),

  -- 邀请/加入方式
  -- invited: 被邀请加入
  -- applied: 主动申请加入
  -- link: 通过链接加入
  -- founder: 创建时加入
  join_method TEXT NOT NULL DEFAULT 'invited'
    CHECK (join_method IN ('invited', 'applied', 'link', 'founder')),

  -- 谁邀请的（如果是被邀请）
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 时间戳
  joined_at TIMESTAMPTZ,  -- 正式加入时间（status 变为 active 时）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 唯一约束：一个用户在一个 group 中只能有一条记录
  UNIQUE(group_id, user_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_status ON public.group_members(status) WHERE status = 'active';

-- ============================================================================
-- 3. 启用 RLS
-- ============================================================================

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. groups 表 RLS 策略
-- ============================================================================

-- 4.1 SELECT: 成员可读本 group
DROP POLICY IF EXISTS "group_members_can_read_group" ON public.groups;
CREATE POLICY "group_members_can_read_group"
  ON public.groups
  FOR SELECT
  USING (
    -- 是该 group 的活跃成员
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id
        AND gm.user_id = auth.uid()
        AND gm.status = 'active'
    )
    OR
    -- 是创建者（即使不是成员，也能看到自己创建的）
    created_by = auth.uid()
    OR
    -- 是 discoverable 的 group（任何登录用户可发现）
    visibility = 'discoverable'
  );

-- 4.2 INSERT: 任何登录用户可创建 group
DROP POLICY IF EXISTS "authenticated_can_create_group" ON public.groups;
CREATE POLICY "authenticated_can_create_group"
  ON public.groups
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
  );

-- 4.3 UPDATE: 仅 boundary keeper 可更新 organized group 设置
--            direct group 任何成员可更新（对等处理）
DROP POLICY IF EXISTS "boundary_keeper_or_members_can_update_group" ON public.groups;
CREATE POLICY "boundary_keeper_or_members_can_update_group"
  ON public.groups
  FOR UPDATE
  USING (
    CASE
      WHEN group_type = 'organized' THEN
        -- organized group: 仅 boundary keeper 可更新
        boundary_keeper_user_id = auth.uid()
      ELSE
        -- direct group: 任何活跃成员可更新
        EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = groups.id
            AND gm.user_id = auth.uid()
            AND gm.status = 'active'
        )
    END
  )
  WITH CHECK (
    CASE
      WHEN group_type = 'organized' THEN
        boundary_keeper_user_id = auth.uid()
      ELSE
        EXISTS (
          SELECT 1 FROM public.group_members gm
          WHERE gm.group_id = groups.id
            AND gm.user_id = auth.uid()
            AND gm.status = 'active'
        )
    END
  );

-- 4.4 DELETE: 仅 boundary keeper 可删除 organized group
--             direct group 仅技术 owner (created_by) 可删除（兜底）
DROP POLICY IF EXISTS "boundary_keeper_or_owner_can_delete_group" ON public.groups;
CREATE POLICY "boundary_keeper_or_owner_can_delete_group"
  ON public.groups
  FOR DELETE
  USING (
    CASE
      WHEN group_type = 'organized' THEN
        boundary_keeper_user_id = auth.uid()
      ELSE
        -- direct group: 仅创建者可删除（技术兜底，不是管理者）
        created_by = auth.uid()
    END
  );

-- ============================================================================
-- 5. group_members 表 RLS 策略
-- ============================================================================

-- 5.1 SELECT: 成员可读本 group 的所有成员
DROP POLICY IF EXISTS "group_members_can_read_members" ON public.group_members;
CREATE POLICY "group_members_can_read_members"
  ON public.group_members
  FOR SELECT
  USING (
    -- 是该 group 的活跃成员
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.status = 'active'
    )
    OR
    -- 是 boundary keeper
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
        AND g.boundary_keeper_user_id = auth.uid()
    )
    OR
    -- 查看自己的记录
    user_id = auth.uid()
  );

-- 5.2 INSERT:
--   - organized group: boundary keeper 或有权限的成员可邀请
--   - direct group: 任何活跃成员可邀请
--   - 自己可以申请加入（对于 discoverable 或 link_accessible）
DROP POLICY IF EXISTS "can_add_group_member" ON public.group_members;
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
      AND (
        -- organized group: 检查邀请权限
        EXISTS (
          SELECT 1 FROM public.groups g
          WHERE g.id = group_members.group_id
            AND g.group_type = 'organized'
            AND (
              -- boundary keeper 可邀请
              g.boundary_keeper_user_id = auth.uid()
              OR
              -- 如果是 member_invite_auto_join 策略，成员也可邀请
              (
                g.join_policy = 'member_invite_auto_join'
                AND EXISTS (
                  SELECT 1 FROM public.group_members gm
                  WHERE gm.group_id = g.id
                    AND gm.user_id = auth.uid()
                    AND gm.status = 'active'
                )
              )
            )
        )
        OR
        -- direct group: 任何活跃成员可邀请
        EXISTS (
          SELECT 1 FROM public.groups g
          JOIN public.group_members gm ON gm.group_id = g.id
          WHERE g.id = group_members.group_id
            AND g.group_type = 'direct'
            AND gm.user_id = auth.uid()
            AND gm.status = 'active'
        )
      )
    )
    OR
    -- 情况3: 创建 group 时作为 founder 加入
    (
      join_method = 'founder'
      AND user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = group_members.group_id
          AND g.created_by = auth.uid()
      )
    )
  );

-- 5.3 UPDATE:
--   - organized group: boundary keeper 可更新成员状态
--   - direct group: 成员只能更新自己的状态（接受邀请/退出）
--   - 自己可以接受邀请或退出
DROP POLICY IF EXISTS "can_update_group_member" ON public.group_members;
CREATE POLICY "can_update_group_member"
  ON public.group_members
  FOR UPDATE
  USING (
    -- 自己的记录可以更新（接受邀请、退出等）
    user_id = auth.uid()
    OR
    -- organized group: boundary keeper 可更新
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
        AND g.group_type = 'organized'
        AND g.boundary_keeper_user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
        AND g.group_type = 'organized'
        AND g.boundary_keeper_user_id = auth.uid()
    )
  );

-- 5.4 DELETE:
--   - organized group: 仅 boundary keeper 可删除成员记录
--   - direct group: 成员只能删除自己的记录（退出）
DROP POLICY IF EXISTS "can_delete_group_member" ON public.group_members;
CREATE POLICY "can_delete_group_member"
  ON public.group_members
  FOR DELETE
  USING (
    -- 自己可以退出
    user_id = auth.uid()
    OR
    -- organized group: boundary keeper 可移除
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
        AND g.group_type = 'organized'
        AND g.boundary_keeper_user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. 辅助函数：检查 group 成员数量约束
-- ============================================================================

-- 函数：获取 group 的活跃成员数量
CREATE OR REPLACE FUNCTION public.get_group_member_count(p_group_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.group_members
  WHERE group_id = p_group_id
    AND status = 'active';
$$;

-- 函数：验证 group 类型与成员数量是否匹配
-- direct group: 2-4 人
-- organized group: ≥ 5 人（但创建时可以少于5人，逐步邀请）
CREATE OR REPLACE FUNCTION public.validate_group_size()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_group_type TEXT;
  v_member_count INTEGER;
BEGIN
  -- 获取 group 类型
  SELECT group_type INTO v_group_type
  FROM public.groups
  WHERE id = COALESCE(NEW.group_id, OLD.group_id);

  -- 获取当前成员数（包括即将添加的）
  SELECT COUNT(*) INTO v_member_count
  FROM public.group_members
  WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
    AND status = 'active';

  -- 如果是添加新成员
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
    v_member_count := v_member_count + 1;
  END IF;

  -- 如果是更新状态为 active
  IF TG_OP = 'UPDATE' AND NEW.status = 'active' AND OLD.status != 'active' THEN
    v_member_count := v_member_count + 1;
  END IF;

  -- 验证 direct group 不能超过 4 人
  IF v_group_type = 'direct' AND v_member_count > 4 THEN
    RAISE EXCEPTION 'Direct group cannot have more than 4 members. Current: %, trying to add 1', v_member_count - 1;
  END IF;

  RETURN NEW;
END;
$$;

-- 创建触发器
DROP TRIGGER IF EXISTS check_group_size ON public.group_members;
CREATE TRIGGER check_group_size
  BEFORE INSERT OR UPDATE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_group_size();

-- ============================================================================
-- 7. 更新时间戳触发器
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS groups_updated_at ON public.groups;
CREATE TRIGGER groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS group_members_updated_at ON public.group_members;
CREATE TRIGGER group_members_updated_at
  BEFORE UPDATE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- 8. 视图：group_details（包含成员数量等派生信息）
-- ============================================================================

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
  -- boundary keeper 的显示名称
  (
    SELECT p.display_name
    FROM public.profiles p
    WHERE p.id = g.boundary_keeper_user_id
  ) AS boundary_keeper_name
FROM public.groups g;

-- 视图的 RLS（继承 groups 表的策略）
-- 注意：视图默认使用底层表的 RLS

-- ============================================================================
-- 9. 添加可选元数据字段（如果不存在）
-- ============================================================================
-- 用于处理表已存在但缺少新字段的情况

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS club TEXT;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS skill_level TEXT;

-- ============================================================================
-- 注释
-- ============================================================================

COMMENT ON TABLE public.groups IS 'Group 是唯一的人群概念，是 access boundary + action boundary。不是社交网络、不是聊天群。';
COMMENT ON COLUMN public.groups.group_type IS 'direct: 2-4人直约，对等无治理; organized: ≥5人，需要 boundary keeper';
COMMENT ON COLUMN public.groups.boundary_keeper_user_id IS '边界守护者，不是管理员。权力是边界责任，不是个人权威。仅 organized group 需要。';
COMMENT ON COLUMN public.groups.visibility IS 'private: 仅成员可见; discoverable: 可被发现; link_accessible: 仅链接可访问';
COMMENT ON COLUMN public.groups.join_policy IS '准入策略，仅对 organized group 有意义';
COMMENT ON COLUMN public.groups.club IS '可选：俱乐部/场地上下文。自由文本，v1 无引用完整性约束。';
COMMENT ON COLUMN public.groups.skill_level IS '可选：技术水平描述。自由文本，v1 无枚举约束。';

COMMENT ON TABLE public.group_members IS 'Group 成员关系。关系只能通过邀请+接受显式成立。';
COMMENT ON COLUMN public.group_members.status IS 'pending: 等待确认; active: 正式成员; removed: 已移除';
COMMENT ON COLUMN public.group_members.join_method IS '加入方式：invited 被邀请, applied 申请, link 链接, founder 创建者';
