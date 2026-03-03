BEGIN;

-- Optional but recommended for migrations
SET search_path = public;

-- ============================================================================
-- 1) sports dictionary table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.sports (
  id           smallint PRIMARY KEY,
  code         text    NOT NULL UNIQUE,
  display_name text    NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed: fixed IDs for stable foreign keys
INSERT INTO public.sports (id, code, display_name)
VALUES
  (1, 'tennis',     'Tennis'),
  (2, 'pickleball', 'Pickleball')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2) matches.sport_id (NOT NULL)
--    Default/backfill to tennis (id=1)
-- ============================================================================
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS sport_id smallint;

UPDATE public.matches
SET sport_id = 1
WHERE sport_id IS NULL;

ALTER TABLE public.matches
  ALTER COLUMN sport_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_sport_id_fkey'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_sport_id_fkey
      FOREIGN KEY (sport_id) REFERENCES public.sports(id);
  END IF;
END $$;

-- Safe default for new matches created before UI is updated
ALTER TABLE public.matches
  ALTER COLUMN sport_id SET DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_matches_sport_id
  ON public.matches(sport_id);

-- ============================================================================
-- 3) groups.primary_sport_id (nullable)
--    - friend groups should set it in UI
--    - club groups may keep NULL (multi-sport)
-- ============================================================================
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS primary_sport_id smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'groups_primary_sport_id_fkey'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_primary_sport_id_fkey
      FOREIGN KEY (primary_sport_id) REFERENCES public.sports(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_groups_primary_sport_id
  ON public.groups(primary_sport_id);

-- ============================================================================
-- 4) Grants (tables)
-- ============================================================================
GRANT SELECT ON public.sports TO authenticated;

COMMIT;