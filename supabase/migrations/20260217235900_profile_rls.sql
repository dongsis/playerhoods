-- ============================================================================
-- Profile onboarding foundation
-- ① Auto-create profiles row on signup (trigger)
-- ② Backfill existing auth.users with no profiles row
-- ③ Open profiles SELECT to all authenticated users
--    (required for user_id → display_name resolution in match/participant lists)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Trigger: auto-create empty profiles row on new user signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: some auth providers may fire with NULL id
  IF NEW.id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Backfill: create profiles rows for existing users who don't have one
--    Uses LEFT JOIN (not NOT IN) to avoid NULL-matching edge cases.
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. RLS: open profiles SELECT to all authenticated users
--    Necessary for user_id → display_name resolution across the app
--    (match participant lists, group member lists, etc.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- Keep profiles_select_self: self-only reads of the full row remain valid
-- (it is now a subset of the above, but having it explicit is harmless)

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- (a) Trigger exists and is NOT an internal trigger
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Trigger on_auth_user_created not found on auth.users';
  END IF;

  -- (b) No orphaned auth.users (profiles row must exist for every auth user)
  IF EXISTS (
    SELECT 1
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Backfill incomplete: some auth.users have no profiles row';
  END IF;

  -- (c) profiles_select_authenticated SELECT policy exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'profiles'
      AND policyname  = 'profiles_select_authenticated'
      AND cmd         = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Missing profiles_select_authenticated SELECT policy on profiles';
  END IF;

  RAISE NOTICE 'profile_rls migration verification PASSED';
END $$;
