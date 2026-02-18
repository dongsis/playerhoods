-- ============================================================================
-- v1.3 — Profile onboarding: auto-create profile on signup + backfill + RLS
-- ============================================================================

-- 1. Trigger: auto-create empty profiles row on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: skip if id is null (defensive against edge-case auth providers)
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

-- 2. Backfill: create profiles for existing auth users who don't have one
-- Use LEFT JOIN instead of NOT IN to avoid NULL semantics issues
INSERT INTO public.profiles (id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 3. RLS: replace self-only SELECT with a public display view approach
-- Keep profiles_select_self as-is (real name fields stay private).
-- Create a view exposing only display_name for authenticated users.

CREATE OR REPLACE VIEW public.profile_display AS
SELECT id, display_name
FROM public.profiles;

GRANT SELECT ON public.profile_display TO authenticated;

-- Keep existing policies unchanged:
-- profiles_select_self (self-only read of full profile)
-- profiles_update_self
-- profiles_upsert_self

-- 4. Verification
DO $$
BEGIN
  -- Check trigger exists (exclude internal triggers)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'on_auth_user_created trigger not created';
  END IF;

  -- Check no auth users without profiles
  IF EXISTS (
    SELECT 1
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Some auth users still have no profile row';
  END IF;

  -- Check profile_display view exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'profile_display'
  ) THEN
    RAISE EXCEPTION 'profile_display view not created';
  END IF;

  RAISE NOTICE 'Profile onboarding migration complete.';
END $$;
