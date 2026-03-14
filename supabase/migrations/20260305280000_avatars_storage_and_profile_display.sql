-- v1.8: Avatar upload. Add avatars bucket, extend profile_display with avatar_url, RPC to set avatar.

-- 1. Create avatars bucket (public, 1MB limit, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  1048576,  -- 1MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS: users can upload/update/delete their own avatar only
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Public read for avatars bucket
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- 3. Extend profile_display view to include avatar_url
CREATE OR REPLACE VIEW public.profile_display AS
  SELECT id, display_name, avatar_url
  FROM public.profiles;

-- 4. RPC to set avatar_url (SECURITY DEFINER, updates own profile only)
CREATE OR REPLACE FUNCTION public.rpc_profile_set_avatar_url(p_avatar_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE public.profiles
  SET avatar_url = NULLIF(trim(p_avatar_url), ''),
      updated_at = now()
  WHERE id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.rpc_profile_set_avatar_url(text) IS
  'v1.8: Set the current user avatar URL (from storage). NULL to clear.';
