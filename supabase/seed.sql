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
  CINDY_UID   uuid := '7b9d5f3d-6fd9-4f17-b8a2-1f5a4d3c9e10';
  LEO_UID     uuid := '8c4d0a92-7f5e-4321-a2bc-6de6b47f28f1';
  LINDA_UID   uuid := '9d8a1c7e-4f30-4dd7-90a0-12d4bfa3e7c2';
  v_pw        text := crypt('Test123!', gen_salt('bf'));
BEGIN
  -- auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  VALUES
    (ORG_UID,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oldchai@test.local',   v_pw, now(), '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (P_UID,        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u3@test.local',         v_pw, now(), '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (REAL_UID,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'real@test.local',       v_pw, now(), '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (OUTSIDER_UID, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@test.local',   v_pw, now(), '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (CINDY_UID,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cindy@test.local',      v_pw, now(), '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (LEO_UID,      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leo@test.local',        v_pw, now(), '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (LINDA_UID,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'linda@test.local',      v_pw, now(), '', '', '', '', '', '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- auth.identities
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES
    (ORG_UID,      ORG_UID,      format('{"sub":"%s","email":"oldchai@test.local"}', ORG_UID)::jsonb,      'email', ORG_UID::text,      now(), now(), now()),
    (P_UID,        P_UID,        format('{"sub":"%s","email":"u3@test.local"}', P_UID)::jsonb,            'email', P_UID::text,        now(), now(), now()),
    (REAL_UID,     REAL_UID,     format('{"sub":"%s","email":"real@test.local"}', REAL_UID)::jsonb,      'email', REAL_UID::text,     now(), now(), now()),
    (OUTSIDER_UID, OUTSIDER_UID, format('{"sub":"%s","email":"outsider@test.local"}', OUTSIDER_UID)::jsonb, 'email', OUTSIDER_UID::text, now(), now(), now()),
    (CINDY_UID,    CINDY_UID,    format('{"sub":"%s","email":"cindy@test.local"}', CINDY_UID)::jsonb,    'email', CINDY_UID::text,    now(), now(), now()),
    (LEO_UID,      LEO_UID,      format('{"sub":"%s","email":"leo@test.local"}', LEO_UID)::jsonb,        'email', LEO_UID::text,      now(), now(), now()),
    (LINDA_UID,    LINDA_UID,    format('{"sub":"%s","email":"linda@test.local"}', LINDA_UID)::jsonb,    'email', LINDA_UID::text,    now(), now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- profiles (handle_new_user creates on insert; backfill if missing)
  INSERT INTO public.profiles (id, display_name)
  VALUES
    (ORG_UID,      'OldChai'),
    (P_UID,        'U3'),
    (REAL_UID,     'Real'),
    (OUTSIDER_UID, 'Outsider'),
    (CINDY_UID,    'Cindy'),
    (LEO_UID,      'Leo'),
    (LINDA_UID,    'Linda')
  ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;
END $$;

-- -----------------------------------------------------------------------------
-- Sports (must exist before sport-scoped courts are seeded)
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
-- Venue: Whiteoak Tennis Club (fixed id for test runners, timezone Toronto)
-- -----------------------------------------------------------------------------
INSERT INTO public.venues (id, name, abbreviation, location_text, timezone, notes)
SELECT '3802862a-db80-40e5-bed0-c76e8a631fa8', 'Whiteoak Tennis Club', 'wtc', 'Toronto, ON', 'America/Toronto', 'Test club for regression'
WHERE NOT EXISTS (SELECT 1 FROM public.venues WHERE id = '3802862a-db80-40e5-bed0-c76e8a631fa8');

-- Courts for Whiteoak
WITH club AS (SELECT id FROM public.venues WHERE id = '3802862a-db80-40e5-bed0-c76e8a631fa8')
INSERT INTO public.courts (venue_id, sport_id, court_code, surface, notes)
SELECT club.id, 1, v.court_code, NULL, NULL
FROM club
CROSS JOIN (VALUES ('Court 1'), ('Court 2'), ('Court 3'), ('Court 4')) AS v(court_code)
WHERE NOT EXISTS (
  SELECT 1 FROM public.courts c
  WHERE c.venue_id = club.id AND c.sport_id = 1 AND c.court_code = v.court_code
);

-- Venue sports for Whiteoak
WITH club AS (SELECT id FROM public.venues WHERE id = '3802862a-db80-40e5-bed0-c76e8a631fa8'),
tennis AS (SELECT id FROM public.sports WHERE code='tennis' LIMIT 1)
INSERT INTO public.venue_sports (venue_id, sport_id, court_count)
SELECT club.id, tennis.id, 4 FROM club, tennis
WHERE NOT EXISTS (
  SELECT 1 FROM public.venue_sports cs WHERE cs.venue_id=club.id AND cs.sport_id=tennis.id
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
-- Helper pattern: insert club if missing, then select its id
-- -----------------------------------------------------------------------------
-- Venue 1: Ontario Racquet Club
WITH ins AS (
  INSERT INTO public.venues (name, abbreviation, location_text, timezone, notes)
  SELECT 'Ontario Racquet Club', 'orc', 'Oakville, ON', 'America/Toronto', NULL
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.venues
    WHERE name IN ('Ontario Racquet Club', 'Ontario Racquet Venue')
  )
  RETURNING id
),
club AS (
  SELECT id FROM ins
  UNION ALL
  SELECT existing.id
  FROM (
    SELECT id
    FROM public.venues
    WHERE name IN ('Ontario Racquet Club', 'Ontario Racquet Venue')
    ORDER BY CASE WHEN name = 'Ontario Racquet Club' THEN 0 ELSE 1 END, created_at
    LIMIT 1
  ) AS existing
)
-- 3 courts
INSERT INTO public.courts (venue_id, sport_id, court_code, surface, notes)
SELECT club.id, 1, v.court_code, NULL, NULL
FROM club
CROSS JOIN (VALUES ('Court 1'), ('Court 2'), ('Court 3')) AS v(court_code)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.courts c
  WHERE c.venue_id = club.id AND c.sport_id = 1 AND c.court_code = v.court_code
);

-- Venue sports + court_count (optional but you asked venue sports/courts)
WITH club AS (
  SELECT id
  FROM public.venues
  WHERE name IN ('Ontario Racquet Club', 'Ontario Racquet Venue')
  ORDER BY CASE WHEN name = 'Ontario Racquet Club' THEN 0 ELSE 1 END, created_at
  LIMIT 1
),
tennis AS (SELECT id FROM public.sports WHERE code='tennis' LIMIT 1),
pickle AS (SELECT id FROM public.sports WHERE code='pickleball' LIMIT 1)
INSERT INTO public.venue_sports (venue_id, sport_id, court_count)
SELECT club.id, tennis.id, 3 FROM club, tennis
WHERE NOT EXISTS (
  SELECT 1 FROM public.venue_sports cs WHERE cs.venue_id=club.id AND cs.sport_id=tennis.id
);
WITH club AS (
  SELECT id
  FROM public.venues
  WHERE name IN ('Ontario Racquet Club', 'Ontario Racquet Venue')
  ORDER BY CASE WHEN name = 'Ontario Racquet Club' THEN 0 ELSE 1 END, created_at
  LIMIT 1
),
pickle AS (SELECT id FROM public.sports WHERE code='pickleball' LIMIT 1)
INSERT INTO public.venue_sports (venue_id, sport_id, court_count)
SELECT club.id, pickle.id, 0 FROM club, pickle
WHERE NOT EXISTS (
  SELECT 1 FROM public.venue_sports cs WHERE cs.venue_id=club.id AND cs.sport_id=pickle.id
);

-- Ontario Racquet Club sandbox data:
-- oldchai belongs to the venue, has Contact Players C1/C2/C3,
-- fire group contains oldchai + Cindy, and C1/C2 are added to fire.
-- Leo and Linda are venue-only members with discovery/invite switches enabled.
DO $$
DECLARE
  ORG_UID   uuid := '1bb09aac-908c-4746-b904-81c5ff302872';
  CINDY_UID uuid := '7b9d5f3d-6fd9-4f17-b8a2-1f5a4d3c9e10';
  LEO_UID   uuid := '8c4d0a92-7f5e-4321-a2bc-6de6b47f28f1';
  LINDA_UID uuid := '9d8a1c7e-4f30-4dd7-90a0-12d4bfa3e7c2';
  FIRE_GID  uuid := '5b2d0b61-9dd5-43c7-853d-2d537f6be1a4';
  v_ontario_id uuid;
  v_c1_guest_id uuid;
  v_c2_guest_id uuid;
BEGIN
  SELECT id
  INTO v_ontario_id
  FROM public.venues
  WHERE name IN ('Ontario Racquet Venue', 'Ontario Racquet Club')
  ORDER BY CASE WHEN name = 'Ontario Racquet Club' THEN 0 ELSE 1 END, created_at
  LIMIT 1;

  IF v_ontario_id IS NULL THEN
    RAISE EXCEPTION 'Ontario venue seed row not found';
  END IF;

  INSERT INTO public.venue_identities (
    venue_id,
    user_id,
    visible_in_venue_member_discovery,
    accept_non_group_invites_in_venue
  )
  SELECT
    v_ontario_id,
    seeded.user_id,
    seeded.visible_in_discovery,
    seeded.accept_non_group_invites
  FROM (
    VALUES
      (ORG_UID,   true, true),
      (CINDY_UID, true, true),
      (LEO_UID,   true, true),
      (LINDA_UID, true, true)
  ) AS seeded(user_id, visible_in_discovery, accept_non_group_invites)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.venue_identities vi
    WHERE vi.venue_id = v_ontario_id
      AND vi.user_id = seeded.user_id
  );

  UPDATE public.venue_identities
  SET
    visible_in_venue_member_discovery = true,
    accept_non_group_invites_in_venue = true
  WHERE venue_id = v_ontario_id
    AND user_id IN (ORG_UID, CINDY_UID, LEO_UID, LINDA_UID);

  UPDATE public.profiles
  SET
    primary_venue_id = COALESCE(primary_venue_id, v_ontario_id),
    show_in_venue_member_discovery = true,
    allow_non_group_invites = true
  WHERE id IN (ORG_UID, CINDY_UID, LEO_UID, LINDA_UID);

  INSERT INTO public.user_sports (user_id, sport_id)
  SELECT seeded.user_id, 1
  FROM (
    VALUES
      (ORG_UID),
      (CINDY_UID),
      (LEO_UID),
      (LINDA_UID)
  ) AS seeded(user_id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.user_sports us
    WHERE us.user_id = seeded.user_id
      AND us.sport_id = 1
  );

  INSERT INTO public.groups (id, name, description, boundary_keeper_id, created_by, group_kind)
  SELECT FIRE_GID, 'fire', 'Ontario Racquet fire group', ORG_UID, ORG_UID, 'friend'
  WHERE NOT EXISTS (SELECT 1 FROM public.groups WHERE id = FIRE_GID);

  INSERT INTO public.group_members (group_id, user_id, status, join_method, invited_by, accepted_at)
  SELECT FIRE_GID, seeded.user_id, 'active', seeded.join_method, seeded.invited_by, now()
  FROM (
    VALUES
      (ORG_UID, 'created'::text, ORG_UID),
      (CINDY_UID, 'invited'::text, ORG_UID)
  ) AS seeded(user_id, join_method, invited_by)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = FIRE_GID
      AND gm.user_id = seeded.user_id
  );

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ORG_UID::text, 'role', 'authenticated')::text, true);

  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.created_by = ORG_UID
      AND g.display_name = 'C1'
      AND COALESCE(g.notes, '') = 'Ontario seed contact player'
  ) THEN
    PERFORM public.rpc_roster_guest_create('C1', NULL, NULL, 'Ontario seed contact player');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.created_by = ORG_UID
      AND g.display_name = 'C2'
      AND COALESCE(g.notes, '') = 'Ontario seed contact player'
  ) THEN
    PERFORM public.rpc_roster_guest_create('C2', NULL, NULL, 'Ontario seed contact player');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guests g
    WHERE g.created_by = ORG_UID
      AND g.display_name = 'C3'
      AND COALESCE(g.notes, '') = 'Ontario seed contact player'
  ) THEN
    PERFORM public.rpc_roster_guest_create('C3', NULL, NULL, 'Ontario seed contact player');
  END IF;

  SELECT g.id INTO v_c1_guest_id
  FROM public.guests g
  WHERE g.created_by = ORG_UID
    AND g.display_name = 'C1'
    AND COALESCE(g.notes, '') = 'Ontario seed contact player'
  ORDER BY g.created_at
  LIMIT 1;

  SELECT g.id INTO v_c2_guest_id
  FROM public.guests g
  WHERE g.created_by = ORG_UID
    AND g.display_name = 'C2'
    AND COALESCE(g.notes, '') = 'Ontario seed contact player'
  ORDER BY g.created_at
  LIMIT 1;

  IF v_c1_guest_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.group_contacts gc
       JOIN public.guests g
         ON g.person_id = gc.person_id
       WHERE gc.group_id = FIRE_GID
         AND gc.removed_at IS NULL
         AND g.id = v_c1_guest_id
     ) THEN
    PERFORM public.rpc_group_add_contact_player(FIRE_GID, v_c1_guest_id);
  END IF;

  IF v_c2_guest_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.group_contacts gc
       JOIN public.guests g
         ON g.person_id = gc.person_id
       WHERE gc.group_id = FIRE_GID
         AND gc.removed_at IS NULL
         AND g.id = v_c2_guest_id
     ) THEN
    PERFORM public.rpc_group_add_contact_player(FIRE_GID, v_c2_guest_id);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Venue 2: Wallace Park Tennis Club
-- -----------------------------------------------------------------------------
WITH ins AS (
  INSERT INTO public.venues (name, abbreviation, location_text, timezone, notes)
  SELECT 'Wallace Park Tennis Club', 'wptc', 'Toronto, ON', 'America/Toronto', NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM public.venues WHERE name IN ('Wallace Park Tennis Club', 'Wallace Park Tennis Venue')
  )
  RETURNING id
),
club AS (
  SELECT id, 'Wallace Park Tennis Club'::text AS venue_name, now() AS created_at FROM ins
  UNION ALL
  SELECT id, name AS venue_name, created_at
  FROM public.venues
  WHERE name IN ('Wallace Park Tennis Club', 'Wallace Park Tennis Venue')
)
INSERT INTO public.courts (venue_id, sport_id, court_code, surface, notes)
SELECT club.id, 1, v.court_code, NULL, NULL
FROM (
  SELECT id
  FROM club
  ORDER BY CASE WHEN venue_name = 'Wallace Park Tennis Club' THEN 0 ELSE 1 END, created_at
  LIMIT 1
) AS club
CROSS JOIN (VALUES ('Court 1'), ('Court 2'), ('Court 3')) AS v(court_code)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.courts c
  WHERE c.venue_id = club.id AND c.sport_id = 1 AND c.court_code = v.court_code
);

WITH club AS (
  SELECT id
  FROM public.venues
  WHERE name IN ('Wallace Park Tennis Club', 'Wallace Park Tennis Venue')
  ORDER BY CASE WHEN name = 'Wallace Park Tennis Club' THEN 0 ELSE 1 END, created_at
  LIMIT 1
),
tennis AS (SELECT id FROM public.sports WHERE code='tennis' LIMIT 1)
INSERT INTO public.venue_sports (venue_id, sport_id, court_count)
SELECT club.id, tennis.id, 3 FROM club, tennis
WHERE NOT EXISTS (
  SELECT 1 FROM public.venue_sports cs WHERE cs.venue_id=club.id AND cs.sport_id=tennis.id
);
