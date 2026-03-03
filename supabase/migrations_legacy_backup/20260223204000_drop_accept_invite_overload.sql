-- Migration: 20260223204000_drop_accept_invite_overload
--
-- Drops the orphan 2-param overload of rpc_match_accept_invite(uuid, text)
-- that was added directly to the DB (not via migration), causing:
--   "Could not choose the best candidate function between
--    rpc_match_accept_invite(p_match_id => uuid) and
--    rpc_match_accept_invite(p_match_id => uuid, p_note => text)"
--
-- The canonical 1-param version rpc_match_accept_invite(uuid) was already
-- replaced by migration 20260223203000. This migration only removes the orphan.

DROP FUNCTION IF EXISTS public.rpc_match_accept_invite(uuid, text);

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'rpc_match_accept_invite'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 1 THEN
    RAISE NOTICE '20260223204000: rpc_match_accept_invite overload resolved — 1 signature remains';
  ELSIF v_count = 0 THEN
    RAISE EXCEPTION '20260223204000: rpc_match_accept_invite not found after drop — check migration 203000 applied';
  ELSE
    RAISE EXCEPTION '20260223204000: rpc_match_accept_invite still has % overloads', v_count;
  END IF;
END $$;
