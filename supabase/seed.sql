-- supabase/seed.sql
-- Idempotent seed (no temp tables, no ON CONFLICT requirements)

SET search_path = public;

-- -----------------------------------------------------------------------------
-- Sports (uses your actual columns: code, display_name)
-- -----------------------------------------------------------------------------
INSERT INTO public.sports (id, code, display_name, is_active)
SELECT v.id, v.code, v.display_name, true
FROM (
  VALUES
    (1::smallint, 'tennis'::text,     'Tennis'::text),
    (2::smallint, 'pickleball'::text, 'Pickleball'::text)
) AS v(id, code, display_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sports s WHERE s.id = v.id OR s.code = v.code
);

-- -----------------------------------------------------------------------------
-- Helper pattern: insert club if missing, then select its id
-- -----------------------------------------------------------------------------
-- Club 1: Ontario Racquet Club
WITH ins AS (
  INSERT INTO public.clubs (name, location_text, timezone, notes)
  SELECT 'Ontario Racquet Club', 'Oakville, ON', 'America/Toronto', NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.clubs WHERE name = 'Ontario Racquet Club')
  RETURNING id
),
club AS (
  SELECT id FROM ins
  UNION ALL
  SELECT id FROM public.clubs WHERE name = 'Ontario Racquet Club' LIMIT 1
)
-- 3 courts
INSERT INTO public.courts (club_id, court_code, surface, notes)
SELECT club.id, v.court_code, NULL, NULL
FROM club
CROSS JOIN (VALUES ('Court 1'), ('Court 2'), ('Court 3')) AS v(court_code)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.courts c
  WHERE c.club_id = club.id AND c.court_code = v.court_code
);

-- Club sports + court_count (optional but you asked venue sports/courts)
WITH club AS (
  SELECT id FROM public.clubs WHERE name = 'Ontario Racquet Club' LIMIT 1
),
tennis AS (SELECT id FROM public.sports WHERE code='tennis' LIMIT 1),
pickle AS (SELECT id FROM public.sports WHERE code='pickleball' LIMIT 1)
INSERT INTO public.club_sports (club_id, sport_id, court_count)
SELECT club.id, tennis.id, 3 FROM club, tennis
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_sports cs WHERE cs.club_id=club.id AND cs.sport_id=tennis.id
);
WITH club AS (
  SELECT id FROM public.clubs WHERE name = 'Ontario Racquet Club' LIMIT 1
),
pickle AS (SELECT id FROM public.sports WHERE code='pickleball' LIMIT 1)
INSERT INTO public.club_sports (club_id, sport_id, court_count)
SELECT club.id, pickle.id, 0 FROM club, pickle
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_sports cs WHERE cs.club_id=club.id AND cs.sport_id=pickle.id
);

-- -----------------------------------------------------------------------------
-- Club 2: Wallace Park Tennis Club
-- -----------------------------------------------------------------------------
WITH ins AS (
  INSERT INTO public.clubs (name, location_text, timezone, notes)
  SELECT 'Wallace Park Tennis Club', 'Toronto, ON', 'America/Toronto', NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.clubs WHERE name = 'Wallace Park Tennis Club')
  RETURNING id
),
club AS (
  SELECT id FROM ins
  UNION ALL
  SELECT id FROM public.clubs WHERE name = 'Wallace Park Tennis Club' LIMIT 1
)
INSERT INTO public.courts (club_id, court_code, surface, notes)
SELECT club.id, v.court_code, NULL, NULL
FROM club
CROSS JOIN (VALUES ('Court 1'), ('Court 2'), ('Court 3')) AS v(court_code)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.courts c
  WHERE c.club_id = club.id AND c.court_code = v.court_code
);

WITH club AS (
  SELECT id FROM public.clubs WHERE name = 'Wallace Park Tennis Club' LIMIT 1
),
tennis AS (SELECT id FROM public.sports WHERE code='tennis' LIMIT 1)
INSERT INTO public.club_sports (club_id, sport_id, court_count)
SELECT club.id, tennis.id, 3 FROM club, tennis
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_sports cs WHERE cs.club_id=club.id AND cs.sport_id=tennis.id
);