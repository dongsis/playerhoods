ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS organizer_note text;
