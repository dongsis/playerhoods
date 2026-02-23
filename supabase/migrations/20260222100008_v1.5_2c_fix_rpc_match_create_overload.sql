-- Migration: v1.5 2c — Drop old rpc_match_create overload (10-param, no p_court_ids)
--
-- Problem: v1.5 Phase 2 added p_court_ids to rpc_match_create (11 params).
-- CREATE OR REPLACE only replaces an exact signature match.
-- Since the signature changed, Postgres created a new overload instead of replacing,
-- leaving two versions:
--   OLD (10 params, from 20260217250000): rpc_match_create(int,text,date,time,int,uuid,uuid[],bool,bool,bool)
--   NEW (11 params, from 20260222100006): rpc_match_create(int,text,date,time,int,uuid,uuid[],uuid[],bool,bool,bool)
-- Postgres cannot resolve which to call when p_court_ids is omitted (both match via defaults).
-- Fix: drop the old 10-param overload.

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_match_create(
  int, text, date, time, int, uuid, uuid[], boolean, boolean, boolean
);

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'rpc_match_create'
    AND pronamespace = 'public'::regnamespace;

  IF v_count = 1 THEN
    RAISE NOTICE 'v1.5-2c: rpc_match_create overload resolved — exactly 1 signature remains';
  ELSIF v_count = 0 THEN
    RAISE EXCEPTION 'v1.5-2c: rpc_match_create not found after drop — something went wrong';
  ELSE
    RAISE EXCEPTION 'v1.5-2c: rpc_match_create still has % overloads — manual intervention needed', v_count;
  END IF;
END $$;

COMMIT;
