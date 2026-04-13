-- =============================================================================
-- Validation SQL for 20260312000000_play_network_core_invite_circle_schema
-- Run manually after migration. Structure + constraint failure + RLS failure tests.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Structure validation
-- -----------------------------------------------------------------------------

-- 1a) user_invite_circle exists with expected columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_invite_circle'
ORDER BY ordinal_position;
-- Expected: id, owner_user_id, target_user_id, source, created_at

-- 1b) profiles new columns: MUST be boolean NOT NULL (not nullable)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN ('show_in_venue_member_discovery', 'allow_non_group_invites', 'auto_add_played_users_to_invite_circle');
-- Expected: 3 rows, is_nullable = 'NO', data_type = 'boolean'

-- 1c) Assert: all 3 profile columns are NOT NULL (predicate logic must not handle nulls)
DO $$
DECLARE
  v_nullable_count int;
BEGIN
  SELECT COUNT(*) INTO v_nullable_count
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name IN ('show_in_venue_member_discovery', 'allow_non_group_invites', 'auto_add_played_users_to_invite_circle')
    AND is_nullable = 'YES';
  IF v_nullable_count > 0 THEN
    RAISE EXCEPTION 'FAIL: profiles new columns must be NOT NULL, found % nullable', v_nullable_count;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2) Constraint FAILURE tests (must actually fail)
-- -----------------------------------------------------------------------------

-- 2a) Duplicate (owner_user_id, target_user_id) MUST fail
DO $$
DECLARE
  v_owner uuid;
  v_target uuid;
BEGIN
  SELECT p1.id, p2.id INTO v_owner, v_target
  FROM public.profiles p1, public.profiles p2
  WHERE p1.id <> p2.id LIMIT 1;
  IF v_owner IS NULL OR v_target IS NULL THEN
    RAISE NOTICE 'Skip: need at least 2 profiles for duplicate test';
    RETURN;
  END IF;
  INSERT INTO public.user_invite_circle (owner_user_id, target_user_id) VALUES (v_owner, v_target);
  BEGIN
    INSERT INTO public.user_invite_circle (owner_user_id, target_user_id) VALUES (v_owner, v_target);
    RAISE EXCEPTION 'FAIL: duplicate (owner,target) should have been rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;
  DELETE FROM public.user_invite_circle WHERE owner_user_id = v_owner AND target_user_id = v_target;
END;
$$;

-- 2b) owner_user_id = target_user_id MUST fail
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.profiles LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'Skip: need at least 1 profile for self-ref test';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.user_invite_circle (owner_user_id, target_user_id) VALUES (v_id, v_id);
    RAISE EXCEPTION 'FAIL: owner=target should have been rejected';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;
END;
$$;

-- 2c) Invalid source MUST fail
DO $$
DECLARE
  v_owner uuid;
  v_target uuid;
BEGIN
  SELECT p1.id, p2.id INTO v_owner, v_target
  FROM public.profiles p1, public.profiles p2
  WHERE p1.id <> p2.id LIMIT 1;
  IF v_owner IS NULL OR v_target IS NULL THEN
    RAISE NOTICE 'Skip: need at least 2 profiles for source test';
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.user_invite_circle (owner_user_id, target_user_id, source)
    VALUES (v_owner, v_target, 'invalid');
    RAISE EXCEPTION 'FAIL: invalid source should have been rejected';
  EXCEPTION WHEN check_violation THEN
    NULL; -- expected
  END;
END;
$$;

-- 2d) Verify constraints exist
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.user_invite_circle'::regclass;
-- Expected: pkey, fkey x2, check x2, unique

-- -----------------------------------------------------------------------------
-- 3) RLS validation
-- -----------------------------------------------------------------------------

-- 3a) RLS enabled, policies exist, NO update policy
SELECT schemaname, tablename, rowsecurity
FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_invite_circle';
-- Expected: rowsecurity = true

SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_invite_circle';
-- Expected: uic_select_own (r), uic_insert_own (a), uic_delete_own (d). NO update.

-- 3a2) Assert: NO UPDATE policy exists
DO $$
DECLARE
  v_update_count int;
BEGIN
  SELECT COUNT(*) INTO v_update_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'user_invite_circle' AND cmd = 'UPDATE';
  IF v_update_count > 0 THEN
    RAISE EXCEPTION 'FAIL: user_invite_circle must have NO update policy, found %', v_update_count;
  END IF;
END;
$$;

-- 3b) INSERT policy MUST have WITH CHECK (owner_user_id = auth.uid())
SELECT policyname, cmd, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_invite_circle' AND cmd = 'INSERT';
-- Expected: uic_insert_own, with_check contains owner_user_id = auth.uid()

-- 3c) Manual RLS failure tests (run via Supabase client with 2 different users)
-- These cannot run in psql (auth.uid() is NULL; postgres bypasses RLS).
--
-- As user A (auth.uid() = A):
--   INSERT INTO user_invite_circle (owner_user_id, target_user_id) VALUES (B, C);
--   → MUST fail (cannot insert as owner B when caller is A)
--
-- As user A:
--   SELECT * FROM user_invite_circle WHERE owner_user_id = B;
--   → MUST return 0 rows (cannot see B's rows)
