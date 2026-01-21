-- 自动为新注册用户创建 profile 记录
-- 使用 SECURITY DEFINER 绕开 RLS

-- 创建触发器函数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 插入 profile 记录
  INSERT INTO public.profiles (id, display_name, gender)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', '用户'),
    'unspecified'
  );

  -- 插入 user_settings 记录（如果表存在）
  INSERT INTO public.user_settings (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 删除已存在的触发器（如果有）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 在 auth.users 表上创建触发器
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 为已存在的用户补建 profile（如果缺失）
INSERT INTO public.profiles (id, display_name, gender)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'display_name', '用户'),
  'unspecified'
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;
