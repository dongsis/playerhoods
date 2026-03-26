-- Baseline required seed layer
-- Freeze source commit: 03522d7
-- This file must contain only runtime-required rows.

BEGIN;

-- Required system actor profile for anonymous guest decline audit path.
-- Keep this UUID aligned with env var GUEST_INVITATION_SYSTEM_ACTOR_ID.
INSERT INTO auth.users (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'System Actor')
ON CONFLICT (id) DO UPDATE
SET display_name = EXCLUDED.display_name,
    updated_at = now();

COMMIT;
