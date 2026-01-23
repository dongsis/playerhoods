-- 修复 RLS 策略，确保：
-- 1. 用户可以向 participants 表插入自己的记录
-- 2. 组织者可以更新自己创建的 matches 记录

-- ==========================================
-- 修复 participants 表的 RLS 策略
-- ==========================================

-- 确保 RLS 已启用
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- 删除可能冲突的旧策略
DROP POLICY IF EXISTS "Users can insert their own participation" ON public.participants;
DROP POLICY IF EXISTS "Users can view participants of any match" ON public.participants;
DROP POLICY IF EXISTS "Users can update their own participation" ON public.participants;
DROP POLICY IF EXISTS "Organizers can manage participants" ON public.participants;
DROP POLICY IF EXISTS "participants_insert_policy" ON public.participants;
DROP POLICY IF EXISTS "participants_select_policy" ON public.participants;
DROP POLICY IF EXISTS "participants_update_policy" ON public.participants;

-- 允许所有已登录用户查看所有参与者
CREATE POLICY "participants_select_policy"
  ON public.participants
  FOR SELECT
  TO authenticated
  USING (true);

-- 允许用户插入自己的参与记录
CREATE POLICY "participants_insert_policy"
  ON public.participants
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 允许用户更新自己的参与记录 或 组织者更新任何参与者
CREATE POLICY "participants_update_policy"
  ON public.participants
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM public.matches
      WHERE matches.id = participants.match_id
      AND matches.organizer_id = auth.uid()
    )
  );

-- ==========================================
-- 修复 matches 表的 RLS 策略
-- ==========================================

-- 确保 RLS 已启用
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- 删除可能冲突的旧策略
DROP POLICY IF EXISTS "Anyone can view active matches" ON public.matches;
DROP POLICY IF EXISTS "Users can create matches" ON public.matches;
DROP POLICY IF EXISTS "Organizers can update their matches" ON public.matches;
DROP POLICY IF EXISTS "matches_select_policy" ON public.matches;
DROP POLICY IF EXISTS "matches_insert_policy" ON public.matches;
DROP POLICY IF EXISTS "matches_update_policy" ON public.matches;

-- 允许所有已登录用户查看所有球局
CREATE POLICY "matches_select_policy"
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (true);

-- 允许已登录用户创建球局
CREATE POLICY "matches_insert_policy"
  ON public.matches
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = organizer_id);

-- 允许组织者更新自己的球局
CREATE POLICY "matches_update_policy"
  ON public.matches
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = organizer_id);

-- ==========================================
-- 修复 profiles 表的 RLS 策略（如果需要）
-- ==========================================

-- 确保 RLS 已启用
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 删除可能冲突的旧策略
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- 允许所有已登录用户查看所有资料
CREATE POLICY "profiles_select_policy"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- 允许用户更新自己的资料
CREATE POLICY "profiles_update_policy"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ==========================================
-- 为已存在的球局补建组织者参与者记录
-- ==========================================

-- 为所有球局添加组织者作为 confirmed 参与者（如果还没有）
INSERT INTO public.participants (match_id, user_id, state)
SELECT m.id, m.organizer_id, 'confirmed'
FROM public.matches m
LEFT JOIN public.participants p ON p.match_id = m.id AND p.user_id = m.organizer_id
WHERE p.id IS NULL;

-- ==========================================
-- 更新 match_details 视图，添加 is_formed 字段
-- ==========================================

-- 删除旧视图
DROP VIEW IF EXISTS public.match_details;

-- 创建新视图，包含 is_formed 字段
-- is_formed = 人数达标 AND 时间确定 AND 地点确定
CREATE OR REPLACE VIEW public.match_details AS
SELECT
  m.*,
  COALESCE(p.confirmed_count, 0) AS confirmed_count,
  COALESCE(p.confirmed_count, 0) >= m.required_count AS is_full,
  m.time_status = 'finalized' AND m.venue_status = 'finalized' AS is_finalized,
  COALESCE(p.confirmed_count, 0) >= m.required_count
    AND m.time_status = 'finalized'
    AND m.venue_status = 'finalized' AS is_formed,
  pr.display_name AS organizer_name
FROM public.matches m
LEFT JOIN (
  SELECT match_id, COUNT(*) AS confirmed_count
  FROM public.participants
  WHERE state = 'confirmed'
  GROUP BY match_id
) p ON p.match_id = m.id
LEFT JOIN public.profiles pr ON pr.id = m.organizer_id;

-- ==========================================
-- 创建参与者状态变更历史表
-- ==========================================

CREATE TABLE IF NOT EXISTS public.participant_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  old_state TEXT,
  new_state TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID REFERENCES auth.users(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_participant_history_participant_id ON public.participant_history(participant_id);
CREATE INDEX IF NOT EXISTS idx_participant_history_changed_at ON public.participant_history(changed_at);

-- 启用 RLS
ALTER TABLE public.participant_history ENABLE ROW LEVEL SECURITY;

-- RLS 策略：允许已登录用户查看所有历史记录
DROP POLICY IF EXISTS "participant_history_select_policy" ON public.participant_history;
CREATE POLICY "participant_history_select_policy"
  ON public.participant_history
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS 策略：允许已登录用户插入历史记录
DROP POLICY IF EXISTS "participant_history_insert_policy" ON public.participant_history;
CREATE POLICY "participant_history_insert_policy"
  ON public.participant_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ==========================================
-- 创建触发器函数：自动记录参与者状态变更
-- ==========================================

CREATE OR REPLACE FUNCTION public.log_participant_state_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 插入时记录
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.participant_history (participant_id, old_state, new_state, changed_by)
    VALUES (NEW.id, NULL, NEW.state, auth.uid());
    RETURN NEW;
  END IF;

  -- 更新时，如果状态变化了才记录
  IF TG_OP = 'UPDATE' AND OLD.state IS DISTINCT FROM NEW.state THEN
    INSERT INTO public.participant_history (participant_id, old_state, new_state, changed_by)
    VALUES (NEW.id, OLD.state, NEW.state, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

-- 删除旧触发器（如果存在）
DROP TRIGGER IF EXISTS on_participant_state_change ON public.participants;

-- 创建触发器
CREATE TRIGGER on_participant_state_change
  AFTER INSERT OR UPDATE ON public.participants
  FOR EACH ROW
  EXECUTE FUNCTION public.log_participant_state_change();
