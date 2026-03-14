-- supabase/seed.sql
-- Idempotent seed (no temp tables, no ON CONFLICT requirements)
-- Test env: Whiteoak Tennis Club, orc2 group, OldChai/U3/Real/Outsider for test_runner_v161 & test_runner_match_regression_v2

SET search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- Test users (auth.users + auth.identities + profiles)
-- ORG_UID=OldChai, P_UID=U3, REAL_UID=Real, OUTSIDER_UID=Outsider (not in orc2, for I02/I04)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  ORG_UID     uuid := '1bb09aac-908c-4746-b904-81c5ff302872';
  P_UID       uuid := '37c9e087-5b62-43e8-add6-893dec015efd';
  REAL_UID    uuid := 'a3631e91-27e4-4db1-a64b-4162d86a4a44';
  OUTSIDER_UID uuid := 'b0000000-0000-0000-0000-000000000001';
  v_pw        text := crypt('Test123!', gen_salt('bf'));
BEGIN
  -- auth.users
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (ORG_UID,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oldchai@test.local',   v_pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (P_UID,        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u3@test.local',         v_pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (REAL_UID,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'real@test.local',       v_pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (OUTSIDER_UID, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@test.local',   v_pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- auth.identities
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES
    (ORG_UID,      ORG_UID,      format('{"sub":"%s","email":"oldchai@test.local"}', ORG_UID)::jsonb,      'email', ORG_UID::text,      now(), now(), now()),
    (P_UID,        P_UID,        format('{"sub":"%s","email":"u3@test.local"}', P_UID)::jsonb,            'email', P_UID::text,        now(), now(), now()),
    (REAL_UID,     REAL_UID,     format('{"sub":"%s","email":"real@test.local"}', REAL_UID)::jsonb,      'email', REAL_UID::text,     now(), now(), now()),
    (OUTSIDER_UID, OUTSIDER_UID, format('{"sub":"%s","email":"outsider@test.local"}', OUTSIDER_UID)::jsonb, 'email', OUTSIDER_UID::text, now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- profiles (handle_new_user creates on insert; backfill if missing)
  INSERT INTO public.profiles (id, display_name)
  VALUES
    (ORG_UID,      'OldChai'),
    (P_UID,        'U3'),
    (REAL_UID,     'Real'),
    (OUTSIDER_UID, 'Outsider')
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
END $$;

-- -----------------------------------------------------------------------------
-- Club: Whiteoak Tennis Club (fixed id for test runners, timezone Toronto)
-- -----------------------------------------------------------------------------
INSERT INTO public.clubs (id, name, location_text, timezone, notes)
SELECT '3802862a-db80-40e5-bed0-c76e8a631fa8', 'Whiteoak Tennis Club', 'Toronto, ON', 'America/Toronto', 'Test club for regression'
WHERE NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = '3802862a-db80-40e5-bed0-c76e8a631fa8');

-- Courts for Whiteoak
WITH club AS (SELECT id FROM public.clubs WHERE id = '3802862a-db80-40e5-bed0-c76e8a631fa8')
INSERT INTO public.courts (club_id, court_code, surface, notes)
SELECT club.id, v.court_code, NULL, NULL
FROM club
CROSS JOIN (VALUES ('Court 1'), ('Court 2'), ('Court 3'), ('Court 4')) AS v(court_code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.courts c
  WHERE c.club_id = club.id AND c.court_code = v.court_code
);

-- Club sports for Whiteoak
WITH club AS (SELECT id FROM public.clubs WHERE id = '3802862a-db80-40e5-bed0-c76e8a631fa8'),
tennis AS (SELECT id FROM public.sports WHERE code='tennis' LIMIT 1)
INSERT INTO public.club_sports (club_id, sport_id, court_count)
SELECT club.id, tennis.id, 4 FROM club, tennis
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_sports cs WHERE cs.club_id=club.id AND cs.sport_id=tennis.id
);

-- -----------------------------------------------------------------------------
-- Group: orc2 (fixed id for scope, friend group for ShareGroup)
-- -----------------------------------------------------------------------------
INSERT INTO public.groups (id, name, description, boundary_keeper_id, created_by, group_kind)
SELECT '17ed4074-6afa-47c7-b9c1-5e110db5859f', 'orc2', 'Test scope group', '1bb09aac-908c-4746-b904-81c5ff302872', '1bb09aac-908c-4746-b904-81c5ff302872', 'friend'
WHERE NOT EXISTS (SELECT 1 FROM public.groups WHERE id = '17ed4074-6afa-47c7-b9c1-5e110db5859f');

-- Group members: OldChai (creator), U3, Real — all active for do_users_share_group(U3, Real)
INSERT INTO public.group_members (group_id, user_id, status, join_method, invited_by, accepted_at)
SELECT g.id, m.user_id, 'active', m.join_method, CASE WHEN m.join_method = 'created' THEN m.user_id ELSE '1bb09aac-908c-4746-b904-81c5ff302872'::uuid END, now()
FROM public.groups g
CROSS JOIN (
  VALUES
    ('1bb09aac-908c-4746-b904-81c5ff302872'::uuid, 'created'),
    ('37c9e087-5b62-43e8-add6-893dec015efd'::uuid, 'invited'),
    ('a3631e91-27e4-4db1-a64b-4162d86a4a44'::uuid, 'invited')
) AS m(user_id, join_method)
WHERE g.id = '17ed4074-6afa-47c7-b9c1-5e110db5859f'
  AND NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = g.id AND gm.user_id = m.user_id);

-- Group: outsider_grp (Outsider only, for I02 no-share-group delegate_confirm test)
INSERT INTO public.groups (id, name, description, boundary_keeper_id, created_by, group_kind)
SELECT 'c0000000-0000-0000-0000-000000000001', 'outsider_grp', 'Outsider-only group', 'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'friend'
WHERE NOT EXISTS (SELECT 1 FROM public.groups WHERE id = 'c0000000-0000-0000-0000-000000000001');
INSERT INTO public.group_members (group_id, user_id, status, join_method, invited_by, accepted_at)
SELECT g.id, 'b0000000-0000-0000-0000-000000000001'::uuid, 'active', 'created', 'b0000000-0000-0000-0000-000000000001'::uuid, now()
FROM public.groups g
WHERE g.id = 'c0000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (SELECT 1 FROM public.group_members gm WHERE gm.group_id = g.id AND gm.user_id = 'b0000000-0000-0000-0000-000000000001'::uuid);

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