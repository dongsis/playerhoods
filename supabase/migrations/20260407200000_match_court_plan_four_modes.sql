UPDATE public.matches
SET court_plan_mode = 'self_book_later'
WHERE court_plan_mode = 'other';

ALTER TABLE public.matches
  ALTER COLUMN court_plan_mode SET DEFAULT 'self_book_later';

ALTER TABLE public.matches
  DROP CONSTRAINT IF EXISTS matches_court_plan_mode_check;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_court_plan_mode_check
  CHECK (court_plan_mode IN ('secured', 'walk_in', 'self_book_later', 'needs_help_booking'));
