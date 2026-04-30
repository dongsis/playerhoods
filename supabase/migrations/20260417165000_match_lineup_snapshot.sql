ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS lineup_snapshot jsonb;

COMMENT ON COLUMN public.matches.lineup_snapshot
  IS 'Host-generated lineup snapshot for the current confirmed roster. Visible to players after the host generates it.';
