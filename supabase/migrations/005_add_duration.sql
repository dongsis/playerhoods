-- 添加球局时长字段
-- 单打默认60分钟，双打默认90分钟

ALTER TABLE public.matches
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 90;

-- 为已有数据设置默认值
UPDATE public.matches
SET duration_minutes = CASE
  WHEN game_type = 'singles' THEN 60
  ELSE 90
END
WHERE duration_minutes IS NULL;

-- 更新视图以包含 duration_minutes
DROP VIEW IF EXISTS public.match_details;

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
