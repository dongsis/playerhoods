-- Migration: v1.5 2d — Drop orphan RPC overloads
--
-- Several RPCs were modified in v1.5 Phase 2 with changed signatures.
-- CREATE OR REPLACE only replaces an exact signature match; differing signatures
-- create new overloads, leaving both versions in the DB.
--
-- Known orphan overload found in production:
--   rpc_match_invite_user(uuid, uuid, text)  ← added directly to DB (not via migration)
--     Phase 2 replaced it with (uuid, uuid)  ← 2-param, no p_note
--
-- Defensively also drop any other RPC functions that could have had extra params
-- added manually, checking against the expected v1.5 canonical signatures.

BEGIN;

-- Drop the 3-param orphan (with p_note)
DROP FUNCTION IF EXISTS public.rpc_match_invite_user(uuid, uuid, text);

-- Defensive: drop any other potential orphans from manual edits
-- (these are no-ops if the functions don't exist with these signatures)
DROP FUNCTION IF EXISTS public.rpc_match_nominate_user(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.rpc_match_request_join(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_match_org_approve_participant(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_match_remove_participant(uuid, text);

DO $$
DECLARE
  v_count int;
BEGIN
  -- rpc_match_invite_user should have exactly 1 overload (2 params)
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'rpc_match_invite_user'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 1 THEN
    RAISE NOTICE 'v1.5-2d: rpc_match_invite_user overload resolved — 1 signature remains';
  ELSIF v_count = 0 THEN
    RAISE EXCEPTION 'v1.5-2d: rpc_match_invite_user not found after drop';
  ELSE
    RAISE EXCEPTION 'v1.5-2d: rpc_match_invite_user still has % overloads', v_count;
  END IF;

  RAISE NOTICE 'v1.5-2d complete: orphan RPC overloads dropped';
END $$;

COMMIT;
