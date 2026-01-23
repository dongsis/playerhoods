-- 为已存在的用户补建 user_settings 记录
-- 这样邮件通知才能正常发送

-- 首先确保 user_settings 表存在
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 为已存在的用户补建 user_settings 记录（如果缺失）
INSERT INTO public.user_settings (user_id, email)
SELECT
  au.id,
  au.email
FROM auth.users au
LEFT JOIN public.user_settings us ON us.user_id = au.id
WHERE us.user_id IS NULL;

-- 更新已有记录但 email 为空的情况
UPDATE public.user_settings us
SET email = au.email
FROM auth.users au
WHERE us.user_id = au.id
  AND us.email IS NULL
  AND au.email IS NOT NULL;
