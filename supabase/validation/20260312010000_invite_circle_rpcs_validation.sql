-- =============================================================================
-- Validation SQL for 20260312010000_invite_circle_rpcs
-- Run manually after migration. Requires at least 2 profiles.
-- Note: DO blocks use set_config('request.jwt.claim.sub', ...) to simulate auth.
-- If you get not_authenticated, run 2a-3 via Supabase client as authenticated user.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Save success + idempotency
-- -----------------------------------------------------------------------------

-- 1a) Save: insert new row, verify returned
-- Run as authenticated user A. Replace :uid_a, :uid_b with real profile ids.
/*
SELECT * FROM public.rpc_invite_circle_save_user(
  (SELECT id FROM public.profiles WHERE id <> auth.uid() LIMIT 1),
  'manual'
);
-- Expected: 1 row, owner_user_id = auth.uid(), source = 'manual'
*/

-- 1b) Idempotency: save same target again, verify same row (no duplicate)
/*
DO $$
DECLARE
  v_owner uuid;
  v_target uuid;
  v_first  public.user_invite_circle;
  v_second public.user_invite_circle;
  v_count  int;
BEGIN
  SELECT p1.id, p2.id INTO v_owner, v_target
  FROM public.profiles p1, public.profiles p2
  WHERE p1.id <> p2.id LIMIT 1;
  IF v_owner IS NULL OR v_target IS NULL THEN
    RAISE NOTICE 'Skip: need 2 profiles';
    RETURN;
  END IF;
  -- Simulate caller = v_owner
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  v_first := public.rpc_invite_circle_save_user(v_target, 'manual');
  v_second := public.rpc_invite_circle_save_user(v_target, 'manual');
  IF v_first.id <> v_second.id THEN
    RAISE EXCEPTION 'FAIL: idempotent save should return same row, got different ids';
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.user_invite_circle
  WHERE owner_user_id = v_owner AND target_user_id = v_target;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: duplicate row created, count=%', v_count;
  END IF;
  DELETE FROM public.user_invite_circle WHERE owner_user_id = v_owner AND target_user_id = v_target;
  RAISE NOTICE 'Idempotency OK';
END;
$$;
*/

-- 1c) Simpler: verify function exists and has correct signature
SELECT p.proname, pg_get_function_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_invite_circle_save_user';
-- Expected: (p_target_user_id uuid, p_source text DEFAULT 'manual'::text)

-- -----------------------------------------------------------------------------
-- 2) Self-save rejection / invalid target rejection
-- -----------------------------------------------------------------------------

-- 2a) Self-save must fail
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM public.profiles LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'Skip: need 1 profile';
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
  BEGIN
    PERFORM public.rpc_invite_circle_save_user(v_uid, 'manual');
    RAISE EXCEPTION 'FAIL: self-save should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%cannot_save_self%' THEN
      RAISE EXCEPTION 'FAIL: expected cannot_save_self, got: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'Self-save rejection OK';
END;
$$;

-- 2b) Invalid source must fail
DO $$
DECLARE
  v_owner uuid;
  v_target uuid;
BEGIN
  SELECT p1.id, p2.id INTO v_owner, v_target
  FROM public.profiles p1, public.profiles p2
  WHERE p1.id <> p2.id LIMIT 1;
  IF v_owner IS NULL OR v_target IS NULL THEN
    RAISE NOTICE 'Skip: need 2 profiles';
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  BEGIN
    PERFORM public.rpc_invite_circle_save_user(v_target, 'invalid');
    RAISE EXCEPTION 'FAIL: invalid source should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%invalid_source%' THEN
      RAISE EXCEPTION 'FAIL: expected invalid_source, got: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'Invalid source rejection OK';
END;
$$;

-- 2c) Non-existent target must fail
DO $$
DECLARE
  v_owner uuid;
  v_fake  uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  SELECT id INTO v_owner FROM public.profiles LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE NOTICE 'Skip: need 1 profile';
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  BEGIN
    PERFORM public.rpc_invite_circle_save_user(v_fake, 'manual');
    RAISE EXCEPTION 'FAIL: non-existent target should have been rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%target_not_found%' AND SQLERRM NOT LIKE '%violates foreign key%' THEN
      RAISE EXCEPTION 'FAIL: expected target_not_found or FK violation, got: %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'Target not found rejection OK';
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Remove idempotency
-- -----------------------------------------------------------------------------

-- 3a) Remove existing: returns removed=true
-- 3b) Remove non-existing: returns removed=false, no error
DO $$
DECLARE
  v_owner uuid;
  v_target uuid;
  v_removed boolean;
BEGIN
  SELECT p1.id, p2.id INTO v_owner, v_target
  FROM public.profiles p1, public.profiles p2
  WHERE p1.id <> p2.id LIMIT 1;
  IF v_owner IS NULL OR v_target IS NULL THEN
    RAISE NOTICE 'Skip: need 2 profiles';
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  -- Ensure row exists
  PERFORM public.rpc_invite_circle_save_user(v_target, 'manual');
  -- Remove: should return true
  SELECT removed INTO v_removed FROM public.rpc_invite_circle_remove_user(v_target);
  IF NOT v_removed THEN
    RAISE EXCEPTION 'FAIL: remove existing should return removed=true';
  END IF;
  -- Remove again (idempotent): should return false, no error
  SELECT removed INTO v_removed FROM public.rpc_invite_circle_remove_user(v_target);
  IF v_removed THEN
    RAISE EXCEPTION 'FAIL: remove non-existing should return removed=false';
  END IF;
  RAISE NOTICE 'Remove idempotency OK';
END;
$$;

-- -----------------------------------------------------------------------------
-- 4) List returns owner-only rows
-- -----------------------------------------------------------------------------

-- 4a) Verify list function exists
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'rpc_invite_circle_list';

-- 4b) List returns only caller's rows (requires auth context)
-- Run via Supabase client as user A:
--   SELECT * FROM rpc_invite_circle_list();
-- Expected: only rows where owner_user_id = auth.uid()
-- Create row as user B, then list as user A → should not see B's row

-- 4c) Grant check
SELECT grantee, privilege
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('rpc_invite_circle_save_user', 'rpc_invite_circle_remove_user', 'rpc_invite_circle_list');
-- Expected: authenticated has EXECUTE on all 3
